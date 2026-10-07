import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Cloud sync end to end: a real S3 server with authentication (moto, see
 * scripts/s3-test-server.py) and an OpenCanvas server set up like a local
 * install (OPENCANVAS_HOME). Needs `pip install "moto[server]"` and a build.
 *
 *   pnpm --filter @opencanvas/web exec playwright test -c playwright.cloud.config.ts
 */
const port = Number(process.env.E2E_CLOUD_PORT ?? 3101);
const s3Port = Number(process.env.E2E_S3_PORT ?? 5055);
const home = process.env.E2E_CLOUD_HOME ?? mkdtempSync(path.join(tmpdir(), 'opencanvas-cloud-'));
process.env.E2E_CLOUD_HOME = home;
process.env.E2E_S3_INFO = path.join(home, 's3.json');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'cloud.spec.ts',
  outputDir: './test-results/cloud',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: `${process.env.S3_TEST_PYTHON ?? 'python3'} ../../scripts/s3-test-server.py ${s3Port}`,
      env: { S3_TEST_OUT: process.env.E2E_S3_INFO },
      // moto answers its own dashboard once it is up.
      url: `http://127.0.0.1:${s3Port}/moto-api/`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `node node_modules/next/dist/bin/next start --port ${port}`,
      env: { OPENCANVAS_HOME: home },
      url: `http://localhost:${port}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
