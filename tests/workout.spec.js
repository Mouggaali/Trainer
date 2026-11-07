// The core loop: start a template, check a set (rest timer), finish, see it in Historie.
import { test, expect, chooseInSheet } from './fixtures.js';

test('training starten, set afvinken, afronden en terugzien', async ({ page }) => {
  await page.goto('/#/workout');
  await page.locator('[data-action="tpl-preview"]', { hasText: 'Maandag' }).click();
  await page.getByRole('button', { name: 'Start training' }).click();

  await expect(page.locator('.title-input')).toHaveValue('Maandag');
  const first = page.locator('.set-row', { has: page.locator('[data-action="wo-check"]') }).first();
  await first.locator('[data-field="kg"]').fill('20');
  await first.locator('[data-field="reps"]').fill('10');
  await first.locator('[data-action="wo-check"]').click();

  await expect(first).toHaveClass(/done/);
  await expect(page.locator('#rest-bar')).not.toBeEmpty(); // rest timer started
  await expect(page.locator('[data-action="wo-rir"]').first()).toBeVisible(); // "Reps over?" chips

  await page.getByRole('button', { name: 'Klaar' }).click();
  await chooseInSheet(page, 'Niet-afgevinkte sets weglaten');
  await chooseInSheet(page, 'Niet bijwerken');
  // FireRed gains dialog (EXP / badges): skip it
  const skip = page.locator('.dialog-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.goto('/#/history');
  await expect(page.locator('#view')).toContainText('Maandag');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('trainer.v1')).workouts);
  expect(saved).toHaveLength(1);
  expect(saved[0].exercises[0].sets).toEqual([expect.objectContaining({ kg: 20, reps: 10, done: true })]);
});

test('training annuleren slaat niets op', async ({ page }) => {
  await page.goto('/#/workout');
  await page.locator('[data-action="tpl-preview"]', { hasText: 'Woensdag' }).click();
  await page.getByRole('button', { name: 'Start training' }).click();
  await page.locator('[data-action="wo-cancel"]').first().click();
  await chooseInSheet(page, 'Ja, annuleren');
  await expect(page).toHaveURL(/#\/workout$/);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('trainer.v1')));
  expect(state.active).toBeNull();
  expect(state.workouts).toHaveLength(0);
});
