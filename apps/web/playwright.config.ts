import { defineConfig, devices } from '@playwright/test';

// E2E_PORT: another port when something else (a dev server) already listens on 3100.
const PORT = Number(process.env.E2E_PORT ?? 3100);

/** End-to-end tests of the editor against a simulated pedal (e2e/fixtures.ts); no hardware. */
export default defineConfig({
  testDir: 'e2e',
  // The offline app runs against the static export: playwright.pwa.config.ts.
  testIgnore: 'pwa.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'en-US', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build:worker && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_TONE3000_CLIENT_ID: 'e2e-mock-client' }, // a made-up app id: specs mock the TONE3000 API
    timeout: 120_000,
  },
});
