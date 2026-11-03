import { expect, test } from '@playwright/test';

// Parcours réel au format téléphone : nécessite l'API (npm run api) et une base migrée.
// Un compte neuf est créé à chaque exécution : aucune donnée de démo n'est touchée.
test('inscription, objectif, tâche du jour, cochage', async ({ page }) => {
  const email = `e2e-${Date.now()}@objectiva.test`;

  await page.goto('/connexion');
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Camille');
  await page.locator('ion-input[type=email] input').fill(email);
  await page.locator('ion-input[type=password] input').fill('motdepasse-e2e');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  // Première utilisation : l'écran Objectifs accueille et guide.
  await expect(page).toHaveURL(/\/app\/objectifs\?bienvenue=1/);
  await expect(page.getByRole('heading', { name: 'Bienvenue !' })).toBeVisible();

  await page.getByRole('button', { name: 'Créer mon premier objectif' }).click();
  const goalForm = page.locator('app-goal-form');
  await goalForm.locator('ion-input[name=title] input').fill('Réussir ma certification');
  await goalForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(page.locator('app-goals').getByText('Réussir ma certification')).toBeVisible();

  // Une tâche pour aujourd'hui, depuis la feuille « Ajouter ».
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  const today = page.locator('app-today');
  await expect(today.getByRole('heading', { name: /Bonjour|Bonsoir|Bon après-midi/ })).toContainText('Camille');
  await today.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: /Une tâche/ }).click();
  const taskForm = page.locator('app-task-form');
  await taskForm.locator('ion-input[name=title] input').fill('Réviser le chapitre 1');
  await taskForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(today.getByText('Réviser le chapitre 1')).toBeVisible();

  // Cocher : toast encourageant avec « Annuler », puis la tâche passe dans « Terminées ».
  await today.locator('ion-checkbox').first().click();
  await expect(page.getByText('Bravo, tâche terminée !')).toBeVisible();
  await expect(today.getByText('Journée accomplie !')).toBeVisible();

  // Aucun défilement horizontal à 360 px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
