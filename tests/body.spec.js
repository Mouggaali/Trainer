// Lichaam tab: food logging (search, barcode, ml) + goal, BMI and body-fat estimate.
import { test, expect, seedState, chooseInSheet } from './fixtures.js';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('voedingsdoel instellen en kwark zoeken en toevoegen', async ({ page }) => {
  await page.goto('/#/body/food');
  await page.getByRole('button', { name: 'Doel instellen' }).click();
  const form = page.locator('#ns-form');
  await form.locator('[name="birthYear"]').fill('1998');
  await form.locator('[name="heightCm"]').fill('180');
  await form.locator('[name="kg"]').fill('80');
  await chooseInSheet(page, 'Opslaan');
  await expect(page.locator('.macro-kcal')).toContainText('/3080'); // 2770 kcal TDEE + lean bulk

  await page.getByRole('button', { name: 'Ontbijt toevoegen' }).click();
  await page.locator('#food-q').fill('kwark');
  await page.getByRole('button', { name: 'Zoek' }).click();
  await page.locator('[data-src="off"]', { hasText: 'AH Magere Franse kwark' }).click();
  await page.locator('#amt-g').fill('250');
  await expect(page.locator('#amt-prev')).toContainText('130 kcal');
  await chooseInSheet(page, 'Toevoegen');

  await expect(page).toHaveURL(/#\/body\/food$/);
  await expect(page.locator('.food-row')).toContainText('250 g');
  await expect(page.locator('.macro-kcal')).toContainText('130/3080');
});

test('melk via barcode wordt in ml gelogd', async ({ page }) => {
  await page.goto('/#/food-add/ontbijt');
  await page.getByRole('button', { name: 'Barcode intypen' }).click();
  await page.locator('#code-in').fill('8710400000001');
  await chooseInSheet(page, 'Opzoeken');
  await expect(page.locator('.sheet-title')).toHaveText('Halfvolle melk');
  await expect(page.locator('.unit-toggle .on')).toHaveText('ml');
  await expect(page.locator('.sheet')).toContainText('1 portie (200 ml)');
  await chooseInSheet(page, 'Toevoegen');
  await expect(page.locator('.food-row')).toContainText('200 ml');
});

test.describe('lichaamsdata', () => {
  test.use({
    seed: seedState({
      profile: { name: '', monsterNames: {}, body: { sex: 'm', heightCm: 180 } },
      bodyweight: [{ id: 'b1', date: today(), kg: 80 }],
      measurements: [{ id: 'm1', date: today(), values: { waist: 84, neck: 38 } }],
    }),
  });

  test('BMI en vetpercentage worden berekend', async ({ page }) => {
    await page.goto('/#/body/weight');
    const bmi = page.locator('.card', { has: page.getByRole('heading', { name: 'BMI', exact: true }) });
    await expect(bmi).toContainText('24.7');
    await expect(bmi).toContainText('Gezond gewicht');
    await expect(bmi).toContainText('0.47'); // waist / height
    const fat = page.locator('.card', { has: page.getByRole('heading', { name: 'Vetpercentage' }) });
    await expect(fat).toContainText('15.3%');
    await expect(fat).toContainText('Fit');
  });
});
