import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Spec 007 (changement d'époque) : le serveur est remplacé par une base qui ne connaît plus le compte
// (base gratuite expirée, recréée). Le téléphone garde tout ; l'utilisateur recrée son compte avec le
// même e-mail et ses données sont renvoyées au serveur. Nécessite l'API (npm run api) et la base Docker
// locale (conteneur objectiva-postgres), dont on supprime réellement le compte de test.

const API = 'http://localhost:3100/api';
const pill = (page: Page) => page.locator('app-sync-status button').last();

async function waitSynced(page: Page): Promise<void> {
  await expect(pill(page)).toHaveAttribute('aria-label', /^Synchronisé/, { timeout: 30_000 });
}

function sql(statement: string): void {
  execFileSync('docker', ['exec', 'objectiva-postgres', 'psql', '-U', 'objectiva', '-d', 'objectiva', '-c', statement]);
}

async function addTask(page: Page, title: string): Promise<void> {
  await page.locator('app-today').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: /Une tâche/ }).click();
  const form = page.locator('app-task-form');
  await form.locator('ion-input[name=title] input').fill(title);
  await form.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(page.locator('app-today').getByText(title)).toBeVisible();
}

test('serveur remplacé : le compte est recréé avec le même e-mail et le téléphone y renvoie tout', async ({ page }) => {
  const email = `e2e-remplace-${Date.now()}@objectiva.test`;

  // --- Utilisation normale.
  await page.goto('/connexion');
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Awa');
  await page.locator('ion-input[type=email] input').fill(email);
  await page.locator('ion-input[type=password] input').fill('motdepasse-e2e');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue !' })).toBeVisible();
  await waitSynced(page);

  await page.getByRole('button', { name: 'Créer mon premier objectif' }).click();
  const goalForm = page.locator('app-goal-form');
  await goalForm.locator('ion-input[name=title] input').fill('Lancer EcoleSaaS');
  await goalForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(page.locator('app-goals').getByText('Lancer EcoleSaaS')).toBeVisible();
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  await addTask(page, 'Appeler le directeur');
  await addTask(page, 'Préparer la démonstration');
  await page.locator('app-today ion-checkbox').first().click();
  await expect(page.getByText('Bravo, tâche terminée !')).toBeVisible();
  await waitSynced(page);
  const oldUser = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('CapacitorStorage.objectiva.user'))) ?? '{}',
  ) as { id: string };
  expect(oldUser.id).toBeTruthy();

  // --- Le serveur est remplacé : il ne connaît plus ce compte, et son époque a changé.
  sql(`DELETE FROM users WHERE email = '${email}'`);
  sql('UPDATE server_meta SET epoch = gen_random_uuid() WHERE id = 1');

  // Le téléphone s'en aperçoit à la synchronisation suivante, sans rien perdre.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const banner = page.getByRole('button', { name: /Ta session a expiré/ }).last();
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('app-today').getByText('Préparer la démonstration')).toBeVisible();

  // --- Il recrée son compte avec le même e-mail (mot de passe au choix).
  await banner.click();
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Awa');
  await page.locator('ion-input[type=email] input').fill(email);
  await page.locator('ion-input[type=password] input').fill('nouveau-motdepasse');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await waitSynced(page);

  // --- Le nouveau serveur contient tout, sous le même identifiant.
  const token = await page.evaluate(() => localStorage.getItem('CapacitorStorage.objectiva.token'));
  const headers = { Authorization: `Bearer ${token}` };
  const me = await (await page.request.get(`${API}/auth/me`, { headers })).json();
  expect(me.data.id).toBe(oldUser.id);
  const goals = await (await page.request.get(`${API}/goals`, { headers })).json();
  expect(goals.data.map((g: { title: string }) => g.title)).toEqual(['Lancer EcoleSaaS']);
  const tasks = await (await page.request.get(`${API}/tasks`, { headers })).json();
  const byTitle = Object.fromEntries(
    tasks.data.items.map((t: { title: string; status: string }) => [t.title, t.status]),
  );
  expect(byTitle).toEqual({ 'Appeler le directeur': 'DONE', 'Préparer la démonstration': 'TODO' });

  // Rien n'a été refusé ni n'attend.
  await pill(page).click();
  await expect(page.getByText(/les données de ce téléphone y ont été renvoyées/)).toBeVisible();
  await expect(page.getByText(/refusée/)).toHaveCount(0);
});
