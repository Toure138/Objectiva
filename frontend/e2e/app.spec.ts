import { expect, test } from '@playwright/test';

// Sans session, l'application redirige vers l'écran de connexion.
test("redirige vers la connexion quand on n'est pas connecté", async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole('heading', { name: 'Objectiva' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});
