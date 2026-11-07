// Smoke tests: the app starts, the login gate + privacy page work, and the security rules hold.
import { test, expect } from './fixtures.js';

test('start: Training-scherm met 5 tabs', async ({ page }) => {
  await page.goto('/');
  const tabs = page.locator('#tabbar .tab');
  await expect(tabs).toHaveCount(5);
  await expect(tabs).toHaveText(['Team', 'Historie', 'Training', 'Oefeningen', 'Lichaam']);
  await expect(page.locator('#tabbar .tab.on')).toHaveText('Training');
});

test('alle tabs openen zonder fouten', async ({ page }) => {
  await page.goto('/');
  for (const [tab, text] of [['Team', 'Sets per spiergroep'], ['Historie', 'Geschiedenis'], ['Oefeningen', 'Oefeningen'], ['Lichaam', 'Lichaam']]) {
    await page.locator('#tabbar .tab', { hasText: tab }).click();
    await expect(page.locator('#view')).toContainText(text);
  }
  await page.goto('/#/settings');
  await expect(page.locator('#view')).toContainText('Instellingen');
});

test('geen horizontale scroll op de hoofdschermen', async ({ page }) => {
  for (const hash of ['#/workout', '#/profile', '#/history', '#/exercises', '#/body/food', '#/body/weight', '#/settings']) {
    await page.goto(`/${hash}`);
    await expect(page.locator('#view')).not.toBeEmpty();
    const overflow = await page.locator('#view').evaluate((v) => v.scrollWidth - v.clientWidth);
    expect(overflow, `horizontaal scrollen op ${hash}`).toBeLessThanOrEqual(1);
  }
});

test('niets wordt van een CDN of Google geladen', async ({ page }) => {
  const external = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).host;
    if (host && host !== '127.0.0.1:5173') external.push(host);
  });
  await page.goto('/#/profile');
  await expect(page.locator('#view')).toContainText('Team');
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
});

test.describe('met inlogscherm', () => {
  test.use({ loginGate: true });

  test('inlogscherm en privacyverklaring zonder in te loggen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#tabbar')).toBeEmpty();
    await page.getByRole('link', { name: 'privacyverklaring' }).click();
    await expect(page.getByRole('heading', { name: 'Wat bewaart Trainer?' })).toBeVisible();
    await expect(page.locator('.prose')).toContainText('EU (Ierland)');
  });

  test('zwak wachtwoord wordt geweigerd bij account aanmaken', async ({ page }) => {
    await page.goto('/');
    await page.locator('#login-email').fill('test@example.com');
    await page.locator('#login-pw').fill('abcdefgh');
    await page.getByRole('button', { name: 'Account aanmaken' }).click();
    await expect(page.locator('#toast')).toHaveText('Kies een wachtwoord van minstens 8 tekens met letters en cijfers');
  });
});

test('barcodescanner laadt van de eigen site en leest een EAN-13', async ({ page }) => {
  await page.goto('/');
  const found = await page.evaluate(async () => {
    const lib = await import('/js/vendor/barcode-detector.js');
    lib.prepareZXingModule({ overrides: { locateFile: (p, pre) => (p.endsWith('.wasm') ? '/js/vendor/zxing_reader.wasm' : pre + p) } });
    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const G = L.map((p) => [...p].map((b) => (b === '0' ? '1' : '0')).reverse().join(''));
    const R = L.map((p) => [...p].map((b) => (b === '0' ? '1' : '0')).join(''));
    const P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const d = [...'8718796113935'].map(Number);
    let bits = '101';
    for (let k = 1; k <= 6; k++) bits += (P[d[0]][k - 1] === 'L' ? L : G)[d[k]];
    bits += '01010';
    for (let k = 7; k <= 12; k++) bits += R[d[k]];
    bits += '101';
    const c = document.createElement('canvas');
    c.width = (bits.length + 20) * 3; c.height = 120;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
    [...bits].forEach((b, k) => { if (b === '1') x.fillRect((k + 10) * 3, 10, 3, 100); });
    const det = new lib.BarcodeDetector({ formats: ['ean_13'] });
    return (await det.detect(c)).map((f) => f.rawValue);
  });
  expect(found).toEqual(['8718796113935']);
});
