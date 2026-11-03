import { expect, test } from '@playwright/test';

// Spec 006 : scénario EcoleSaaS côté interface, au format téléphone (360×740).
// Nécessite l'API (npm run api). Un compte neuf est créé à chaque exécution.
test('EcoleSaaS : objectif mesuré, réunion, préparation, budget, relevé', async ({ page }) => {
  const email = `e2e-ecole-${Date.now()}@objectiva.test`;

  // Inscription : l'écran Objectifs accueille.
  await page.goto('/connexion');
  await page.getByRole('radio', { name: 'Inscription' }).click();
  await page.locator('ion-input[name=displayName] input').fill('Aminata');
  await page.locator('ion-input[type=email] input').fill(email);
  await page.locator('ion-input[type=password] input').fill('motdepasse-e2e');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue !' })).toBeVisible();

  // 1. Objectif en progression mesurée : 0 → 3 démonstrations.
  await page.getByRole('button', { name: 'Créer mon premier objectif' }).click();
  const goalForm = page.locator('app-goal-form');
  await goalForm.locator('ion-input[name=title] input').fill('Présenter EcoleSaaS à trois établissements');
  await goalForm.getByRole('radio', { name: 'Mesurée' }).click();
  await goalForm.locator('ion-input[name=measureUnit] input').fill('démonstrations');
  await goalForm.locator('ion-input[name=targetValue] input').fill('3');
  await goalForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(page.locator('app-goals').getByText('0 sur 3 démonstrations')).toBeVisible();

  // 2. La réunion du jour, puis sa tâche de préparation.
  await page.getByRole('tab', { name: /Aujourd/ }).click();
  const today = page.locator('app-today');
  await today.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: /Un événement/ }).click();
  const eventForm = page.locator('app-event-form');
  await eventForm.locator('ion-input[name=title] input').fill('Démonstration au collège Les Palmiers');
  await eventForm.locator('ion-input[name=location] input').fill('Collège Les Palmiers, Cocody');
  await eventForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(today.getByText('Rendez-vous du jour')).toBeVisible();
  await today.locator('app-event-item a').first().click();

  const detail = page.locator('app-event-detail');
  await detail.getByRole('button', { name: 'Préparation' }).click();
  await expect(detail.getByText('Préparer : Démonstration au collège Les Palmiers')).toBeVisible();
  await detail.getByRole('button', { name: 'Marquer comme réalisé' }).click();
  await page.locator('ion-alert textarea').fill('Pilote validé pour janvier.');
  await page.getByRole('button', { name: 'Réalisé', exact: true }).click();
  await expect(detail.getByText('Pilote validé pour janvier.')).toBeVisible();

  // 3. Le budget : démarrage, prévision de 15 000, règlement en deux fois, solde avec économie.
  await page.getByRole('tab', { name: /Budget/ }).click();
  await page.getByRole('button', { name: 'Démarrer mon budget' }).click();
  const budget = page.locator('app-budget');
  await budget.getByRole('button', { name: 'Ajouter une dépense ou un revenu' }).click();
  const moneyForm = page.locator('app-money-form');
  await moneyForm.getByRole('radio', { name: 'À venir' }).click();
  await moneyForm.locator('ion-input[name=label] input').fill('Transport et impression');
  await moneyForm.locator('ion-input[name=amount] input').fill('15000');
  await moneyForm.getByRole('button', { name: 'Enregistrer' }).last().click();
  await expect(budget.getByText('Transport et impression')).toBeVisible();

  await budget.getByRole('button', { name: 'Régler : Transport et impression' }).click();
  const settle = page.locator('app-settle-form');
  await settle.locator('ion-input[name=amount] input').fill('9000');
  await settle.getByRole('button', { name: 'Enregistrer le paiement' }).click();
  await expect(budget.getByText('Partielle')).toBeVisible();

  await budget.getByRole('button', { name: 'Régler : Transport et impression' }).click();
  await settle.locator('ion-input[name=amount] input').fill('3000');
  await settle.locator('ion-checkbox').click();
  await settle.getByRole('button', { name: 'Enregistrer le paiement' }).click();
  await expect(budget.getByText('Soldée')).toBeVisible();
  await expect(budget.locator('app-operation-item').getByText(/Économie.3.?000/)).toBeVisible();

  // 4. Le relevé : 1 démonstration sur 3.
  await page.getByRole('tab', { name: /Objectifs/ }).click();
  await page.locator('app-goals a.goal').first().click();
  await page.getByRole('button', { name: 'Relevé' }).click();
  await page.locator('ion-alert input[type=number]').fill('1');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('app-goal-detail').getByText('1 sur 3 démonstrations')).toBeVisible();

  // Aucun défilement horizontal à 360 px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
