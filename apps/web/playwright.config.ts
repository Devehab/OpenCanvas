import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * End-to-end tests run against a production build (`pnpm build` first).
 *
 * - `E2E_BASE_URL` points the tests at an already running server instead.
 * - `E2E_BROWSERS=all` adds Firefox, WebKit and mobile projects (CI matrix).
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const allBrowsers = process.env.E2E_BROWSERS === 'all';
const desktop = { viewport: { width: 1440, height: 900 } };

const projects: Project[] = [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...desktop } }];
if (allBrowsers) {
  projects.push(
    // Pixel baselines and performance budgets are Chromium-only.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...desktop }, grepInvert: /@visual|@perf/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...desktop }, grepInvert: /@visual|@perf/ },
    { name: 'mobile-chrome', use: devices['Pixel 7'], grep: /@smoke/ },
    { name: 'mobile-safari', use: devices['iPhone 15'], grep: /@smoke/ },
  );
}

export default defineConfig({
  testDir: './e2e',
  // Needs an S3 server: run with playwright.cloud.config.ts.
  testIgnore: 'cloud.spec.ts',
  outputDir: './test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects,
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `node node_modules/next/dist/bin/next start --port ${port}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
