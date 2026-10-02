import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * One Vitest project per package. Run everything with `pnpm test`, or a single
 * package with `pnpm test --project core`.
 */
const pkg = (name: string, environment: 'node' | 'jsdom' = 'node') => ({
  test: {
    name,
    root: `packages/${name}`,
    environment,
    include: ['test/**/*.test.ts'],
    benchmark: { include: ['test/**/*.bench.ts'] },
  },
});

/** Pure library code of the web app (UI flows are covered by Playwright). */
const web = {
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } },
  test: { name: 'web', root: 'apps/web', environment: 'node' as const, include: ['test/**/*.test.ts'] },
};

export default defineConfig({
  test: {
    projects: [pkg('core'), pkg('renderer'), pkg('export'), pkg('editor'), web],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/web/src/lib/**/*.ts'],
      reporter: ['text-summary', 'html'],
    },
  },
});
