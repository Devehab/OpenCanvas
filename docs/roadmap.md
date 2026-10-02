# Roadmap

OpenCanvas is built in phases, foundation first. Each phase ships only what meets the [Definition of Done](definition-of-done.md).

| Phase | Theme | Status |
| --- | --- | --- |
| 1 | Editor engine | ✅ Delivered |
| 2 | Design platform | Next |
| 3 | Video | Planned |
| 4 | Collaboration | Planned |
| 5 | AI | Planned |
| 6 | Visual suite | Planned |
| 7 | Open-source ecosystem | Planned (self-hosting delivered) |

## Phase 1 — Editor engine ✅

Scope from the spec: canvas, objects, text, images, layers, pages, undo/redo, save, load, export.

| Area | Delivered |
| --- | --- |
| Document engine | Flat record store with fractional ordering, atomic transactions with finalizers, zod schemas with hard limits, integrity repair, canonical serialization, migrations, semantic roles/slots |
| Commands & history | 27 validated commands (exportable as AI tool definitions), diff-based undo/redo with gesture batching, coalescing and selection restore |
| Canvas | Zoom (wheel, pinch, keyboard, fit, selection), pan (hand tool, Space+drag), selection, marquee, 8 resize handles, rotation, snapping with guides, nudging |
| Objects | 18 parametric shapes, lines with 5 arrowhead styles, 85 vector icons (searchable in English and Arabic), frames that clip to any shape, groups |
| Appearance | Solid and gradient fills, strokes (solid, dashed, dotted), corner radius, opacity, 16 blend modes, shadows, layer blur, flip |
| Text | Rich runs (font, size, weight, italic, underline, strikethrough, color, letter spacing, case), bullet and numbered lists, alignment incl. justify, line height, auto-width / auto-height / fixed with auto-fit, effects (outline, hollow, highlight, neon, echo); Arabic shaping, UAX #9 bidi, UAX #14 line breaking, 27 font families including 14 Arabic ones; in-place editing with native IME |
| Images | Upload (PNG, JPEG, WebP, GIF, AVIF, SVG) validated by content, SVG sanitizing, content-hash deduplication, crop, replace, 8 adjustments, drop into frames with cover crop |
| Layers & pages | Layers tree (reorder, rename, hide, lock, keyboard navigation), align/distribute, grouping, multiple pages with live thumbnails, duplicate/reorder/delete, resize design to another format |
| Save & load | Local-first IndexedDB autosave, crash journal (no edits lost on close), cross-tab follow/conflict handling, `.opencanvas` open/save, trash and restore |
| Export | PNG/JPEG/WebP with scale, DPI metadata and transparency; SVG with embedded fonts; PDF and print PDF; page ranges; multi-page ZIP |
| Interface | Dashboard with formats, custom sizes (px/mm/in), search and recent designs; English and Arabic with a fully mirrored RTL layout; keyboard shortcuts; context menu; accessible dialogs and controls |
| Quality | 216 unit, property and golden-image tests; 63 Playwright tests (functional, visual regression, WCAG 2.1 AA scans, keyboard-only use, performance budgets); CI; Docker image |

### Known limitations of Phase 1

- **PDF export is raster** (150 or 300 DPI images per page). It prints well but text is not selectable; a vector PDF writer with embedded fonts is planned for Phase 2.
- **Designs live in the browser** (IndexedDB) until accounts and server sync arrive in Phase 2. Use "Save as .opencanvas" to move designs between browsers.
- **Cross-browser coverage**: the end-to-end suite runs on Chromium on every change; the Firefox, WebKit and mobile matrix runs weekly in CI and has not yet been through a full triage.
- Very large pages (1000+ elements) drag at about 24 FPS in headless CI; layer caching is planned.

### Spec items not yet covered by Phase 1

These editor capabilities from the spec are scheduled into later phases:

- Objects: charts, tables, QR codes, stickers, patterns (Phase 2); video and audio (Phase 3).
- Transform and layout aids: skew, rulers, grid, margins, safe areas, user guides (Phase 2).
- Text: font upload (Phase 2), text on a path (Phase 2).
- Image tools: sharpness, duotone and filter presets (Phase 2); background removal/replacement, erase, magic expand, upscaling (Phase 5).
- Compression options beyond JPEG/WebP quality (Phase 2).

## Phase 2 — Design platform

- Accounts, projects and sharing (view/edit links) with a backend (Fastify or Next.js API, PostgreSQL + Prisma, S3-compatible storage behind a CDN).
- Server sync on top of local-first persistence: the revision-based save protocol already used between tabs becomes the client/server protocol; offline edits sync when the connection returns.
- Template engine: templates are designs with semantic slots; "replace all photos" and "apply my brand".
- Asset library (uploads, stock providers via adapters) and font upload.
- Brand kits: logos, colors, fonts, typography presets and rules.
- Vector PDF export with embedded font subsets; compression options.
- Remaining editor objects and aids listed above.
- Security tests for authentication, authorization, CSRF, rate limiting, signed URLs and tenant isolation.

## Phase 3 — Video

Timeline with video, audio and text tracks; trim, split, merge; transitions, animations and keyframes; captions; voice-over and music; speed, volume and fades; export to MP4, WebM and GIF through an export worker.

## Phase 4 — Collaboration

Real-time editing with Yjs (records map one-to-one onto a shared map; `remote` is already a change source), presence and live cursors, comments with mentions and resolution, version history with restore, permissions and approval workflows. A four-browser stress test verifies convergence without corruption.

## Phase 5 — AI

- Provider abstraction (OpenAI, Anthropic, Google, local LLMs and image models).
- Assistant that edits the open design through the command tool definitions, so every AI change is validated and undoable.
- Design generation producing editable, semantically named elements; magic resize across formats; rewrite and translate (including into Arabic with correct direction and fonts); background removal, expand, erase and upscaling in an AI worker.

## Phase 6 — Visual suite

Docs, presentations (present mode, transitions, presenter notes — pages already carry notes), whiteboards (infinite canvas, sticky notes, connectors), sheets, and design-to-website publishing.

## Phase 7 — Open-source ecosystem

Plugin API (records already carry `meta` for plugin data), public API, integrations, AI provider adapters, community templates. Self-hosting is available today (Docker, Coolify).
