# Testing

OpenCanvas treats "it worked once on my machine" as not done. Everything below runs in CI on every pull request.

```bash
pnpm lint                 # Biome (lint + format)
pnpm typecheck            # TypeScript in every package
pnpm test                 # Vitest: unit, property and golden-image tests
pnpm build && pnpm test:e2e   # Playwright against the production build
```

## Unit, property and golden-image tests (Vitest)

One Vitest project per package (`pnpm test --project core`, `renderer`, `export`, `editor`, `web`).

| Package | Covers |
| --- | --- |
| core | Ids and fractional indexing, color parsing/conversion, matrices and transforms, hit-testing and bounds, schema validation and limits, store transactions/rollback/finalizers, history (batches, coalescing, cancel), all commands, grouping, alignment, distribution, snapping, text layout (line breaking, bidi, lists, auto-fit), serialization round trips, migrations and integrity repair, command tool definitions |
| core (property-based) | `fast-check` generates random editing sessions; after every session the store invariants hold, serialization is deterministic, undoing everything restores the exact initial document and redoing restores the exact final one |
| renderer | Golden images rendered in Node with Skia: shapes, gradients, strokes, shadows, blend modes, group opacity, frames/clipping, images and adjustments, Arabic and mixed-direction text, lists, text effects |
| export | PNG/JPEG DPI metadata, SVG structure and fidelity, PDF structure (optionally rasterized with poppler and compared), `.opencanvas` round trips, package security (size limits, path traversal, hash mismatch), upload validation |
| editor | Selection, tools, move/resize/rotate gestures with snapping, marquee, keyboard shortcuts, clipboard, text editing sessions, rich text ↔ DOM conversion, font loading |
| web | Locale-aware number parsing (Arabic-Indic digits), Arabic-aware search folding, font embedding helpers |

Golden images live next to the tests (`test/__goldens__`). After an intended rendering change, regenerate and review them:

```bash
pnpm test:visual:update   # then inspect the changed PNGs before committing
```

## End-to-end tests (Playwright)

`apps/web/e2e` runs against `next start` (build first). Specs:

| Spec | Covers |
| --- | --- |
| `dashboard` | Formats and custom sizes (mm), recent designs, rename/duplicate/trash/restore/delete, Arabic-aware search, language switch to Arabic (RTL), health endpoint and security headers |
| `editor` | Inserting every element type, drag-move with exact undo/redo, resize handles, keyboard shortcuts, marquee and shift selection, drawing tools, inspector edits persisted across reload, layers panel, context menu, clipboard, pages |
| `text` | In-place editing with a single undo step, Arabic and mixed-direction typing, partial bold, inspector font/size/alignment with re-measuring, Arabic presets, pasting text, text stays text after reload |
| `persistence` | Exact document after reload, Ctrl+S, offline saving, edits right before reload/close survive, conflicting journals become a recovered copy, idle tab follows another tab, concurrent edits keep both versions, missing designs |
| `uploads` | Upload + reload, content-hash deduplication, rejecting disguised files, SVG sanitizing, drop into a frame (cover crop, one undo step), adjustments never touch the original |
| `export` | PNG 1×/2× with DPI, transparency, JPEG/WebP, SVG self-contained (fonts embedded) and pixel-compared with PNG, PDF/print PDF page count and size, multi-page ZIP, `.opencanvas` round trip through "Open file" |
| `a11y` | axe WCAG 2.1 A/AA scans of every page, panel and dialog in English and Arabic; keyboard-only editing |
| `visual` | Reviewed baselines of the live canvas and PNG export: Arabic typography, bidi, lists, text effects; shapes, gradients, strokes, shadows, blend modes; frames and group opacity |
| `performance` | Frame budgets while dragging 100/300/500/1000 elements, 4K PNG export, a 100-page document (open, switch, PDF), a 10 MB photo |

Useful commands:

```bash
pnpm --filter @opencanvas/web exec playwright test e2e/text.spec.ts   # one spec
pnpm test:e2e --grep @smoke                                           # smoke subset
pnpm --filter @opencanvas/web test:e2e:update                         # refresh visual baselines (review them!)
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e                      # against a running server
E2E_BROWSERS=all pnpm test:e2e                                        # + Firefox, WebKit, mobile
PERF_BUDGET_SCALE=1.5 pnpm test:e2e --grep @perf                      # slower machine
```

Visual baselines are Chromium/Linux (the CI platform). Performance specs run with tracing disabled, and every timed frame includes rasterization, so the numbers reflect what users see.

## How the spec's test plan maps to the suites

| Spec requirement | Where |
| --- | --- |
| Unit: transforms, text measurement, layer ordering, (de)serialization, undo/redo, grouping, snapping, export settings, color conversion | `packages/*/test` |
| Integration: create → add image → add text → resize → save → reload → exact result | `e2e/persistence.spec.ts`, `e2e/editor.spec.ts` |
| E2E flows (create, upload, edit text, move, pages, undo/redo, save, reload, export PNG/PDF) | `e2e/*` |
| E2E flows needing accounts (sign up, log in, share, open shared link) | Phase 2 |
| Visual regression | `e2e/visual.spec.ts`, renderer/export golden tests |
| Performance (100 → 60 FPS, 300 smooth, 500+ usable, 4K PNG, multi-page PDF, 100 pages, 1000 elements, 10 MB image) | `e2e/performance.spec.ts` |
| Performance: 100 MB video | Phase 3 |
| Collaboration stress (4 browsers) | Phase 4; two-tab safety today in `e2e/persistence.spec.ts` |
| Security: upload validation, SVG sanitization, XSS (plain-text paste, CSP), malicious packages | `e2e/uploads.spec.ts`, `e2e/dashboard.spec.ts`, `packages/export/test` |
| Security: authentication, authorization, CSRF, rate limiting, SQL injection, signed URLs, tenant isolation | Phase 2 (with the backend) |
| Accessibility | `e2e/a11y.spec.ts` |
| Browser matrix | CI `browsers` job (weekly and on demand): Chromium, Firefox, WebKit, Pixel 7, iPhone 15 |
