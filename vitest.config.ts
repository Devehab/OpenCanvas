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

export default defineConfig({
  test: {
    projects: [pkg('core'), pkg('renderer'), pkg('export'), pkg('editor')],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reporter: ['text-summary', 'html'],
    },
  },
});
