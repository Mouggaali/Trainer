// Shared test setup. Every test runs the real app (node server.js) in a fresh browser profile with:
//  - js/config.js replaced: by default "not configured" → no login gate, data only in localStorage
//    (`loginGate: true` serves a fake Supabase config instead, to test the login screen; no real calls are made);
//  - Open Food Facts mocked with fixed products, so tests never depend on the internet;
//  - a check that the page logged no errors and broke no Content-Security-Policy rule.
import { test as base, expect } from '@playwright/test';

export const PRODUCTS = {
  '8718796113935': {
    code: '8718796113935', product_name: 'AH Magere Franse kwark', brands: 'Albert Heijn',
    nutriments: { 'energy-kcal_100g': 52, proteins_100g: 9, carbohydrates_100g: 3.6, fat_100g: 0.1 },
    serving_quantity: 150, serving_size: '150 g', quantity: '500 g', product_quantity_unit: 'g',
  },
  '8710400000001': {
    code: '8710400000001', product_name: 'Halfvolle melk', brands: 'Testmerk',
    nutriments: { 'energy-kcal_100g': 46, proteins_100g: 3.5, carbohydrates_100g: 4.7, fat_100g: 1.5 },
    serving_quantity: 200, serving_size: '200 ml', quantity: '1 l', product_quantity_unit: 'ml',
  },
};

/** Minimal valid saved state; tests spread extra fields over it. */
export function seedState(extra = {}) {
  return { version: 1, modifiedAt: Date.now(), workouts: [], bodyweight: [], measurements: [], foodLog: [], foods: [], meals: [], ...extra };
}

export const test = base.extend({
  loginGate: [false, { option: true }],
  seed: [null, { option: true }],

  page: async ({ page, loginGate, seed }, use) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // expected: config.js is "missing" in local mode; OFF 404 for unknown barcodes
      if (/Failed to load resource.*404/.test(t)) return;
      problems.push(`console: ${t}`);
    });

    await page.route('**/js/config.js', (route) => (loginGate
      ? route.fulfill({
        contentType: 'text/javascript',
        body: "export const SUPABASE_URL = 'https://test-project.supabase.co';\nexport const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';\nexport const VAPID_PUBLIC_KEY = '';\n",
      })
      : route.fulfill({ status: 404, body: '' })));
    // Never talk to a real Supabase project from tests.
    await page.route('https://*.supabase.co/**', (route) => route.fulfill({ status: 503, body: '{}' }));

    await page.route('https://world.openfoodfacts.org/api/v2/product/**', (route) => {
      const code = new URL(route.request().url()).pathname.split('/').pop().replace('.json', '');
      const p = PRODUCTS[code];
      return route.fulfill({ status: p ? 200 : 404, json: p ? { status: 1, product: p } : { status: 0 } });
    });
    await page.route('https://nl.openfoodfacts.org/cgi/search.pl**', (route) => {
      const q = (new URL(route.request().url()).searchParams.get('search_terms') || '').toLowerCase();
      const hits = Object.values(PRODUCTS).filter((p) => p.product_name.toLowerCase().includes(q.split(' ')[0]));
      return route.fulfill({ json: { products: hits } });
    });

    await page.addInitScript((state) => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
      if (state && !sessionStorage.getItem('seeded')) {
        localStorage.setItem('trainer.v1', JSON.stringify(state));
        sessionStorage.setItem('seeded', '1');
      }
    }, seed);

    await use(page);

    const csp = await page.evaluate(() => window.__csp || []).catch(() => []);
    expect(csp, 'Content-Security-Policy violations').toEqual([]);
    expect(problems, 'errors in the browser console').toEqual([]);
  },
});

export { expect };

/** Clicks the button in the open bottom sheet / choose() dialog with this text. */
export async function chooseInSheet(page, name) {
  await page.locator('.sheet').getByRole('button', { name, exact: true }).click();
}
