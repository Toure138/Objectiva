import { expect, test, type Page } from '@playwright/test';

// Spec 007, phase 1 : l'application continue de fonctionner quand le serveur ou la base sont
// arrêtés, y compris après un redémarrage de l'application, puis se synchronise au retour du serveur.
// Nécessite l'API (npm run api). Un compte neuf est créé à chaque exécution.

const API = 'http://localhost:3100/api';
const pill = (page: Page) => page.locator('app-sync-status button').last();

/** Données locales prêtes et rien en attente : la pastille annonce « Synchronisé ». */
async function waitSynced(page: Page): Promise<void> {
  await expect(pill(page)).toHaveAttribute('aria-label', /^Synchronisé/, { timeout: 30_000 });
}

/** Serveur et base « arrêtés » : toute requête vers l'API échoue comme si personne ne répondait. */
async function stopServer(page: Page): Promise<void> {
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
}

async function startServer(page: Page): Promise<void> {
  await page.unroute('**/api/**');
  // Le système annonce le retour du réseau.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

async function addTask(page: Page, title: string): Promise<void> {
  await page.locator('app-today').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: /Une tâche/ }).click();
  const form = page.locator('app-task-form');
  await form.locator('ion-input[name=title] input').fill(title);
  await form.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(page.locator('app-today').getByText(title)).toBeVisible();
}

test('hors connexion : tout fonctionne serveur arrêté, même après redémarrage, puis tout se synchronise', async ({
  page,
  browser,
}) => {
  const email = `e2e-offline-${Date.now()}@objectiva.test`;
  const password = 'motdepasse-e2e';

  // --- Inscription : les données sont téléchargées une première fois, puis tout devient local.
  await page.goto('/connexion');
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Camille');
  await page.locator('ion-input[type=email] input').fill(email);
  await page.locator('ion-input[type=password] input').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue !' })).toBeVisible();
  await waitSynced(page);

  await page.getByRole('button', { name: 'Créer mon premier objectif' }).click();
  const goalForm = page.locator('app-goal-form');
  await goalForm.locator('ion-input[name=title] input').fill('Réussir ma certification');
  await goalForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(page.locator('app-goals').getByText('Réussir ma certification')).toBeVisible();
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  await waitSynced(page);

  // --- Le serveur s'arrête : tout continue sur le téléphone.
  await stopServer(page);
  await addTask(page, 'Appeler le directeur');
  await addTask(page, 'Préparer la démonstration');
  await page.locator('app-today ion-checkbox').first().click();
  await expect(page.getByText('Bravo, tâche terminée !')).toBeVisible();

  await page.getByRole('tab', { name: /Objectifs/ }).click();
  await page.getByRole('button', { name: 'Nouvel objectif' }).click();
  await goalForm.locator('ion-input[name=title] input').fill('Courir 10 km');
  await goalForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(page.locator('app-goals').getByText('Courir 10 km')).toBeVisible();

  await page.getByRole('tab', { name: /Bilan/ }).click();
  await expect(page.locator('app-review .hero')).toBeVisible();

  // L'indicateur le dit clairement, sans alarme : on est hors connexion, des modifications attendent.
  await expect(pill(page)).toContainText('Hors ligne', { timeout: 15_000 });

  // --- Redémarrage de l'application, serveur toujours arrêté : les données sont là.
  await page.reload();
  await expect(page.locator('app-tabs')).toBeVisible();
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  await expect(page.locator('app-today').getByText('Préparer la démonstration')).toBeVisible();
  await page.getByRole('tab', { name: /Objectifs/ }).click();
  await expect(page.locator('app-goals').getByText('Courir 10 km')).toBeVisible();
  await expect(page.locator('app-goals').getByText('Réussir ma certification')).toBeVisible();

  // --- Le serveur revient : la synchronisation se fait seule.
  await startServer(page);
  await waitSynced(page);

  const token = await page.evaluate(() => localStorage.getItem('CapacitorStorage.objectiva.token'));
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const tasks = await (await page.request.get(`${API}/tasks`, { headers })).json();
  const byTitle = Object.fromEntries(
    tasks.data.items.map((t: { title: string; status: string }) => [t.title, t.status]),
  );
  expect(byTitle).toMatchObject({ 'Appeler le directeur': 'DONE', 'Préparer la démonstration': 'TODO' });
  const goals = await (await page.request.get(`${API}/goals`, { headers })).json();
  expect(goals.data.map((g: { title: string }) => g.title).sort()).toEqual([
    'Courir 10 km',
    'Réussir ma certification',
  ]);

  // --- Un second appareil retrouve tout, sans rien avoir saisi.
  const second = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const other = await second.newPage();
  await other.goto('/connexion');
  await other.locator('ion-input[type=email] input').fill(email);
  await other.locator('ion-input[type=password] input').fill(password);
  await other.getByRole('button', { name: 'Se connecter' }).click();
  await expect(other.locator('app-today')).toBeVisible();
  await waitSynced(other);
  await expect(other.locator('app-today').getByText('Préparer la démonstration')).toBeVisible();
  await second.close();

  // Aucun défilement horizontal à 360 px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
