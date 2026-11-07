// End-to-end tests (Playwright). Run: npm test  (first time: npm ci && npx playwright install webkit chromium)
// "iphone" = WebKit, the engine of Safari on iOS — closest to how the app runs on the user's phone.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3, // node server.js is a tiny single-process dev server
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block', // the network-first SW would only get in the way of request mocks
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
