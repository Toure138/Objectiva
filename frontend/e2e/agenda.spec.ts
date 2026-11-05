import { expect, test, type Page } from '@playwright/test';

// Spec 009 : réunions récurrentes, portée des modifications, agenda du jour avec chevauchements, le tout
// sur le téléphone (y compris serveur coupé), puis synchronisé. Nécessite l'API (npm run api).

const API = 'http://localhost:3100/api';
const SHOTS = process.env['E2E_SHOTS'];
const pill = (page: Page) => page.locator('app-sync-status button').last();

async function waitSynced(page: Page): Promise<void> {
  await expect(pill(page)).toHaveAttribute('aria-label', /^Synchronisé/, { timeout: 30_000 });
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface NewEvent {
  title: string;
  date?: string;
  start?: string;
  end?: string;
  repeat?: string;
}

async function addEvent(page: Page, e: NewEvent): Promise<void> {
  await page.locator('app-today').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: /Un événement/ }).click();
  const form = page.locator('app-event-form');
  await form.locator('ion-input[name=title] input').fill(e.title);
  if (e.date) await form.locator('ion-input[name=date] input').fill(e.date);
  if (e.start) await form.locator('ion-input[name=startTime] input').fill(e.start);
  if (e.end) await form.locator('ion-input[name=endTime] input').fill(e.end);
  if (e.repeat) {
    await form.locator('ion-select[name=repeatMode]').click();
    await page.locator('ion-action-sheet').getByRole('radio', { name: e.repeat }).click();
    await expect(page.locator('ion-action-sheet')).toBeHidden();
  }
  await form.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(form).toBeHidden();
}

test('réunions récurrentes et agenda du jour : portée, chevauchements, hors connexion', async ({ page }) => {
  const email = `e2e-agenda-${Date.now()}@objectiva.test`;
  const today = isoDay(0);
  const tomorrow = isoDay(1);

  await page.goto('/connexion');
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Awa');
  await page.locator('ion-input[type=email] input').fill(email);
  await page.locator('ion-input[type=password] input').fill('motdepasse-e2e');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue !' })).toBeVisible();
  await waitSynced(page);
  await page.getByRole('tab', { name: /Aujourd/ }).click();

  // --- Une réunion chaque jour à 9 h, et un rendez-vous qui la chevauche.
  await addEvent(page, { title: 'Point quotidien', start: '09:00', end: '10:00', repeat: 'Chaque jour' });
  await addEvent(page, { title: 'Banque', start: '09:30', end: '10:30' });
  const todayPage = page.locator('app-today');
  await expect(todayPage.getByText('Rendez-vous du jour')).toBeVisible();
  await expect(todayPage.locator('app-event-item').filter({ hasText: 'Point quotidien' }).getByText('Chaque jour')).toBeVisible();

  // --- L'agenda du jour signale le chevauchement en toutes lettres.
  await todayPage.getByRole('link', { name: 'Heure par heure' }).click();
  const agenda = page.locator('app-agenda');
  await expect(agenda.getByText('2 rendez-vous se gênent', { exact: false })).toBeVisible();
  await expect(agenda.getByText('« Point quotidien » (09:00) chevauche « Banque » (09:30).')).toBeVisible();
  await expect(agenda.getByRole('link', { name: /Banque, de 09:30 à 10:30.*chevauche Point quotidien/ })).toBeVisible();
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/agenda-conflit.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: `${SHOTS}/agenda-conflit-sombre.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // --- Modifier la suite : renommer à partir d'aujourd'hui.
  await agenda.getByRole('link', { name: /^Point quotidien, de 09:00/ }).click();
  const detail = page.locator('app-event-detail');
  await expect(detail.getByText('Chaque jour')).toBeVisible();
  await detail.getByRole('button', { name: 'Modifier l’événement' }).click();
  await page.getByRole('button', { name: 'Cette occurrence et les suivantes' }).click();
  const form = page.locator('app-event-form');
  await expect(form.getByText('Modifier la suite')).toBeVisible();
  await form.locator('ion-input[name=title] input').fill('Point d’équipe');
  await form.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(detail.getByRole('heading', { name: 'Point d’équipe' })).toBeVisible();

  // Le jour suivant est renommé aussi.
  await page.goto(`/app/agenda/${tomorrow}`);
  await expect(page.locator('app-agenda').getByRole('link', { name: /^Point d’équipe, de 09:00/ })).toBeVisible();

  // --- Serveur coupé : nouvelle réunion hebdomadaire, annulation d'une seule fois, tout reste sur le téléphone.
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  await addEvent(page, { title: 'Revue hebdo', date: tomorrow, start: '14:00', end: '15:00', repeat: 'Chaque semaine' });
  await page.goto(`/app/agenda/${tomorrow}`);
  const offlineAgenda = page.locator('app-agenda');
  await expect(offlineAgenda.getByText('Aucun chevauchement')).toBeVisible();
  await offlineAgenda.getByRole('link', { name: /^Revue hebdo, de 14:00/ }).click();
  await expect(detail.getByText(/^Chaque /)).toBeVisible();
  await detail.getByRole('button', { name: 'Supprimer l’événement' }).click();
  await page.getByRole('button', { name: 'Annuler cette fois' }).click();
  await expect(detail.getByText('Annulé', { exact: true })).toBeVisible();
  await expect(pill(page)).toContainText('Hors ligne', { timeout: 15_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/agenda-detail-annule.png`, fullPage: true });

  // --- Retour du serveur : tout part.
  await page.unroute('**/api/**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSynced(page);
  const token = await page.evaluate(() => localStorage.getItem('CapacitorStorage.objectiva.token'));
  const headers = { Authorization: `Bearer ${token}` };
  const events = (await (await page.request.get(`${API}/events?from=${today}&to=${isoDay(8)}`, { headers })).json())
    .data as { title: string; date: string; status: string; repeat: unknown }[];
  const hebdo = events.filter((e) => e.title === 'Revue hebdo');
  expect(hebdo.length).toBeGreaterThanOrEqual(2);
  expect(hebdo.find((e) => e.date === tomorrow)?.status).toBe('ANNULE');
  expect(hebdo.filter((e) => e.date !== tomorrow).every((e) => e.status === 'PREVU')).toBe(true);
  expect(events.filter((e) => e.title === 'Point d’équipe').length).toBeGreaterThanOrEqual(8);
  expect(events.some((e) => e.title === 'Point quotidien')).toBe(false);

  // Aucun défilement horizontal à 360 px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
