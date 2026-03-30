import { test, expect } from '@playwright/test';

test('verify instructions and solution page', async ({ page }) => {
  // We can't really run a full game here without a real backend and OpenAI key
  // But we can check if the components render without crashing
  await page.goto('https://master-ui-instructions-check.onrender.com/instructions');
  // Check for the title
  await expect(page.locator('h1')).toContainText('Instruccions del Joc');

  await page.goto('https://master-ui-instructions-check.onrender.com/solution');
  await expect(page.locator('h1')).toContainText('Solució de la Partida');
});
