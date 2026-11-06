import { expect, test, type Page } from '@playwright/test';

// Spec 012 : habitudes créées, cochées, mises en pause hors connexion, puis synchronisées.
// Nécessite l'API (npm run api).

const API = 'http://localhost:3100/api';
const SHOTS = process.env['E2E_SHOTS'];
const pill = (page: Page) => page.locator('app-sync-status button').last();

async function addHabit(page: Page, title: string, frequency?: string, times?: string): Promise<void> {
  await page.locator('app-today').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: /Une habitude/ }).click();
  const form = page.locator('app-habit-form');
  await form.locator('ion-input[name=title] input').fill(title);
  if (frequency) {
    await form.locator('ion-select[name=mode]').click();
    await page.locator('ion-action-sheet').getByRole('radio', { name: frequency }).click();
    await expect(page.locator('ion-action-sheet')).toBeHidden();
  }
  if (times) {
    await form.locator('ion-select[name=times]').click();
    await page.locator('ion-action-sheet').getByRole('radio', { name: times }).click();
    await expect(page.locator('ion-action-sheet')).toBeHidden();
  }
  await form.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(form).toBeHidden();
}

test('habitudes : créer, cocher, suivre, mettre en pause hors connexion, puis synchroniser', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/connexion');
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Awa');
  await page.locator('ion-input[type=email] input').fill(`e2e-habitudes-${Date.now()}@objectiva.test`);
  await page.locator('ion-input[type=password] input').fill('motdepasse-e2e');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue !' })).toBeVisible();
  await expect(pill(page)).toHaveAttribute('aria-label', /^Synchronisé/, { timeout: 30_000 });

  // Tout se passe serveur coupé.
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  const today = page.locator('app-today');

  await addHabit(page, 'Lire 20 pages');
  await addHabit(page, 'Sport', 'Plusieurs fois par semaine', '3 fois par semaine');
  await expect(today.getByText('Habitudes du jour')).toBeVisible();
  await expect(
    today
      .locator('app-habit-check')
      .filter({ hasText: 'Sport' })
      .getByText(/^0 sur [1-3] cette semaine$/),
  ).toBeVisible();

  // Cocher depuis « Aujourd'hui » : la série démarre.
  await today.getByRole('button', { name: 'Marquer comme fait : Lire 20 pages' }).click();
  await expect(today.getByRole('button', { name: 'Annuler : Lire 20 pages' })).toHaveAttribute('aria-pressed', 'true');
  await expect(today.locator('app-habit-check').filter({ hasText: 'Lire 20 pages' }).getByText('1 jour')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/habitudes-jour.png` });

  // Liste puis fiche.
  await today.getByRole('link', { name: 'Toutes' }).click();
  const list = page.locator('app-habits');
  await expect(list.getByText('3 fois par semaine')).toBeVisible();
  await list.getByRole('link', { name: /Lire 20 pages/ }).click();
  const detail = page.locator('app-habit-detail');
  await expect(detail.getByRole('heading', { name: 'Lire 20 pages' })).toBeVisible();
  await expect(detail.getByText('Chaque jour')).toBeVisible();
  await expect(detail.getByRole('button', { name: /: fait\. Toucher pour annuler\./ })).toHaveCount(1);
  if (SHOTS) {
    // Laisser finir l'animation d'entrée de la page avant la capture.
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/habitude-fiche.png`, fullPage: true });
  }

  // Pause : l'habitude quitte « Aujourd'hui » ; reprise : elle revient.
  await detail.getByRole('button', { name: 'Faire une pause' }).click();
  await expect(detail.getByText('En pause', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  await expect(today.locator('app-habit-check').filter({ hasText: 'Lire 20 pages' })).toHaveCount(0);
  await today.locator('app-habit-check').filter({ hasText: 'Sport' }).getByRole('link').click();
  await page.goBack();
  await page.goto('/app/habitudes');
  await page
    .locator('app-habits')
    .getByRole('link', { name: /Lire 20 pages/ })
    .click();
  await detail.getByRole('button', { name: 'Reprendre' }).click();
  await expect(detail.getByRole('button', { name: 'Faire une pause' })).toBeVisible();

  // Bilan : la réussite des habitudes apparaît.
  await page.getByRole('tab', { name: /Bilan/ }).click();
  await expect(page.locator('app-review').getByRole('heading', { name: 'Habitudes' })).toBeVisible();

  // Retour du serveur : tout part.
  await page.unroute('**/api/**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(pill(page)).toHaveAttribute('aria-label', /^Synchronisé/, { timeout: 30_000 });
  const token = await page.evaluate(() => localStorage.getItem('CapacitorStorage.objectiva.token'));
  const habits = (
    await (await page.request.get(`${API}/habits`, { headers: { Authorization: `Bearer ${token}` } })).json()
  ).data as { title: string; doneToday: boolean; paused: boolean; kind: string; timesPerWeek: number | null }[];
  expect(habits.map((h) => h.title)).toEqual(['Lire 20 pages', 'Sport']);
  expect(habits[0]).toMatchObject({ doneToday: true, paused: false, kind: 'JOURS' });
  expect(habits[1]).toMatchObject({ kind: 'SEMAINE', timesPerWeek: 3 });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
