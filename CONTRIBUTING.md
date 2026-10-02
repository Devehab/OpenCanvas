# Contributing to OpenCanvas

Thank you for helping build an open-source visual creation platform. This guide gets you from clone to pull request.

## Setup

Requirements: Node.js 22+ and pnpm 10 (`corepack enable` installs the version pinned in `package.json`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

The repository is a pnpm workspace:

```
packages/core       document model, commands, history, text layout, serialization
packages/renderer   Canvas2D renderer (browser + Node)
packages/export     raster/SVG/PDF export, .opencanvas packages, upload checks
packages/editor     interaction layer and DOM canvas view
apps/web            Next.js dashboard and editor
docs/               specification, architecture, format, roadmap
```

Read [docs/architecture.md](docs/architecture.md) before changing the engine. The most important rule: **design state lives in the document model and changes only through commands**, never in React state.

## Before you open a pull request

```bash
pnpm lint           # Biome; `pnpm lint:fix` formats
pnpm typecheck
pnpm test           # unit, property and golden-image tests
pnpm build && pnpm test:e2e
```

- Follow the [Definition of Done](docs/definition-of-done.md): persisted, undoable, reload-safe, exported correctly, accessible, tested.
- Bug fixes start with a failing test that reproduces the bug.
- If you change rendering on purpose, regenerate the golden images (`pnpm test:visual:update`, and `pnpm --filter @opencanvas/web test:e2e:update` for browser baselines) and **look at every changed image** before committing.
- New user-facing text goes into both `apps/web/src/i18n/en.ts` and `ar.ts` (Modern Standard Arabic). Check the Arabic interface (right-to-left) for every UI change.
- Use logical CSS properties (`ms-`, `pe-`, `start-`, `end-`) so layouts mirror correctly.
- Keep commits focused, with messages that explain *why*.

## Adding a feature to the engine

1. Model it: add fields to the record schema (with defaults and limits) in `packages/core/src/model`.
2. Implement the behavior as an operation and expose it through a command (`packages/core/src/commands`), so it is validated, undoable and available to AI agents.
3. Render it in `packages/renderer` and export it in `packages/export` (SVG too).
4. Add UI in `apps/web` that dispatches the command.
5. Test each layer (unit → golden image → E2E).

## Reporting issues

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

By contributing you agree that your contributions are licensed under the project's [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
