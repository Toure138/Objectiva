import { expect, test, type Page } from '@playwright/test';

// Spec 010 : vue d'ensemble des planifications (« À venir » qui continue, filtres, calendrier du mois,
// réunions récurrentes), hors connexion comprise. Nécessite l'API (npm run api).

const SHOTS = process.env['E2E_SHOTS'];
const pill = (page: Page) => page.locator('app-sync-status button').last();

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function openAdd(page: Page, what: RegExp): Promise<void> {
  await page.locator('app-today').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: what }).click();
}

test('vue d’ensemble : à venir, filtres, mois, réunions récurrentes', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Awa');
  await page.locator('ion-input[type=email] input').fill(`e2e-vue-${Date.now()}@objectiva.test`);
  await page.locator('ion-input[type=password] input').fill('motdepasse-e2e');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue !' })).toBeVisible();
  await expect(pill(page)).toHaveAttribute('aria-label', /^Synchronisé/, { timeout: 30_000 });

  // Tout se passe hors connexion.
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.getByRole('tab', { name: /Aujourd/ }).click();

  // Une réunion chaque semaine à partir de demain, une tâche dans 10 jours.
  await openAdd(page, /Un événement/);
  const form = page.locator('app-event-form');
  await form.locator('ion-input[name=title] input').fill('Atelier hebdo');
  await form.locator('ion-input[name=date] input').fill(isoDay(1));
  await form.locator('ion-input[name=startTime] input').fill('15:00');
  await form.locator('ion-input[name=endTime] input').fill('16:00');
  await form.locator('ion-select[name=repeatMode]').click();
  await page.locator('ion-action-sheet').getByRole('radio', { name: 'Chaque semaine' }).click();
  await expect(page.locator('ion-action-sheet')).toBeHidden();
  await form.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(form).toBeHidden();

  await openAdd(page, /Une tâche/);
  const taskForm = page.locator('app-task-form');
  await taskForm.locator('ion-input[name=title] input').fill('Déposer le dossier');
  await taskForm.locator('ion-input[name=workDate] input').fill(isoDay(10));
  await taskForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(taskForm).toBeHidden();

  // « À venir » : la semaine, puis la suivante.
  await page.getByRole('tab', { name: /Planifier/ }).click();
  const plan = page.locator('app-plan');
  await expect(plan.getByText('Atelier hebdo').first()).toBeVisible();
  await expect(plan.getByText('Déposer le dossier')).toHaveCount(0);
  await plan.getByRole('button', { name: 'Afficher la semaine suivante' }).click();
  await expect(plan.getByText('Déposer le dossier')).toBeVisible();
  await expect(plan.getByText('Atelier hebdo')).toHaveCount(2);

  // Filtres.
  await plan.getByRole('button', { name: 'Rendez-vous', exact: true }).click();
  await expect(plan.getByText('Déposer le dossier')).toHaveCount(0);
  await plan.getByRole('button', { name: 'Tâches', exact: true }).click();
  await expect(plan.getByText('Atelier hebdo')).toHaveCount(0);
  await expect(plan.getByText('Déposer le dossier')).toBeVisible();
  await plan.getByRole('button', { name: 'Tout', exact: true }).click();

  // Réunions récurrentes.
  await plan.getByRole('link', { name: /Réunions récurrentes/ }).click();
  const series = page.locator('app-series');
  await expect(series.getByRole('link', { name: /Atelier hebdo, Chaque .*, de 15:00 à 16:00, prochaine le/ })).toBeVisible();
  await page.goBack();

  // Mois : le jour de l'atelier annonce son rendez-vous ; le toucher montre le détail.
  await plan.getByRole('radio', { name: 'Mois' }).click();
  const target = isoDay(1);
  const day = plan.getByRole('button', { name: new RegExp(`^.* ${Number(target.slice(8))} .*: 1 rendez-vous`) });
  if (target.slice(0, 7) !== isoDay(0).slice(0, 7)) await plan.getByRole('button', { name: 'Mois suivant' }).click();
  await day.first().click();
  await expect(plan.locator('.ob-plan-day').getByText('Atelier hebdo')).toBeVisible();
  await expect(plan.locator('.ob-plan-day').getByRole('link', { name: 'Heure par heure' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/vue-mois.png`, fullPage: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
