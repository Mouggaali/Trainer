// End-to-end tests (Playwright). Run: npm test  (first time: npm ci && npx playwright install webkit chromium)
// "iphone" = WebKit, the engine of Safari on iOS — closest to how the app runs on the user's phone.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  // Locally one browser at a time: several WebKit instances on Windows stall each other's requests (20 s+ page loads).
  workers: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173', // not localhost: WebKit on Windows may try IPv6 (::1) first, the dev server is IPv4
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block', // the network-first SW would only get in the way of request mocks
    // The pixel-style sheets slide in with steps(): Playwright sees a still frame between steps, clicks, and the
    // button moves on (sometimes the click lands on the backdrop). Reduced motion turns the animations off.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
