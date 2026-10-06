# Architecture

OpenCanvas is a design **engine** with a web editor on top, not a web page that happens to draw on a canvas. The rule that shapes everything:

> React is never the source of truth for the design. The document model is.

```
             dispatch(command, payload)
  UI (React) ───────────────────────────▶ Command registry ──▶ Transaction ──▶ Document store
     ▲                                    (zod-validated)      (atomic, with      (flat, immutable
     │                                                          finalizers)        records)
     │  subscribe(selector)                                                           │ diff
     │                                                                                ▼
  Editor UI state (Atom) ◀── History (undo/redo of diffs) ◀──────────────────── change events
     │                                                                                │
     ▼                                                                                ▼
  Overlay (selection, guides)                                         Renderer (Canvas2D) · Exporters
```

Every layer below the UI is framework-agnostic TypeScript that runs in the browser and in Node (the same renderer produces the editor canvas, the exports and the golden-image tests).

## Packages

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `@opencanvas/core` | Document model, schemas, store, transactions, history, commands, geometry, text layout (bidi, line breaking), serialization | zod, bidi-js, linebreak |
| `@opencanvas/renderer` | Canvas2D scene renderer, text drawing and effects, image adjustments, platform abstraction (browser / Node via Skia) | core |
| `@opencanvas/export` | PNG/JPEG/WebP with DPI metadata, SVG, PDF, `.opencanvas` packages, upload validation | core, renderer, fflate |
| `@opencanvas/editor` | Interaction layer: selection, tools, gestures, snapping, keyboard, clipboard, text editing, DOM canvas view | core, renderer |
| `@opencanvas/web` | Next.js app: dashboard, editor UI, local persistence, i18n, export dialog | all of the above |

## Document model

A design is a **flat map of immutable records** keyed by id — never a nested tree in memory, never a bitmap.

| Record | Key fields |
| --- | --- |
| `document` (one per design) | `title`, `formatId`, `meta` |
| `page` | `index`, `name`, `width`, `height`, `background`, `notes` |
| `node` | `type`, `parentId`, `index`, geometry (`x`, `y`, `width`, `height`, `rotation`, `flipX`, `flipY`), appearance (`opacity`, `blendMode`, `shadow`, `blur`), `visible`, `locked`, `semantic`, `meta` + type-specific fields |
| `asset` | `hash` (`sha256-…`), `mimeType`, `width`, `height`, `size`, `src` |

Node types: `shape` (33 parametric kinds), `line`, `path` (SVG path data, used for icons), `text`, `image`, `group`, `frame` (clipping container, also an image placeholder).

- **Hierarchy** is expressed with `parentId`; **z-order** with a fractional `index` key (base-62 fractional indexing). Inserting between two layers never renumbers siblings, which keeps diffs small and is what real-time collaboration needs later.
- **Geometry**: a node's local transform is `T(center) · R(rotation) · S(flip) · T(−size/2)`; page transforms compose parent transforms. Hit-testing, bounds, snapping and the renderer share these functions.
- **Validation**: every record is created and loaded through zod schemas with defaults and hard limits (`LIMITS` — page size, node count, nesting depth, string lengths, font sizes…). Untrusted input (files, clipboard, future API calls) cannot create an invalid document.
- **Semantics** (`semantic: { role, description, slot }`): roles such as `headline`, `cta`, `logo`, `price`; descriptions double as alt text; slots let templates swap content while keeping layout. This is what makes designs readable by AI and resizable intelligently.

## Store and transactions

`DocumentStore` owns the records.

- `transact(fn, { source, label })` runs edits atomically. Any exception rolls the whole transaction back; listeners see one `RecordsDiff` (`added`, `updated: [from, to]`, `removed`).
- **Finalizers** run inside every transaction to keep invariants: groups shrink/grow to their children (and empty groups disappear), auto-sized text boxes are re-measured when content or style changes.
- **Change sources**: `user`, `history`, `system`, `remote`, `load`. History records only `user` changes; autosave ignores `load` and `remote` (following another tab), so following never echoes back.
- Records are deep-frozen in development, so accidental mutation fails loudly.

## Commands

Every edit a person, plugin or AI agent can make is a named command with a zod payload schema — 27 built in (`node.create`, `node.update`, `node.translate`, `node.group`, `text.set-style`, `image.replace`, `page.duplicate`, `document.resize`, `clipboard.paste`, …).

- The registry validates payloads and produces readable errors (`Invalid payload for node.translate: dx: Expected number`).
- History labels come from commands ("Move", "Change text style").
- `registry.toolDefinitions()` exports every command with a JSON Schema for its payload. An AI agent therefore edits the *structured* design through exactly the same validated operations as a person, and its edits are undoable.

## History

`History` stores inverse-able diffs, not snapshots.

- **Batches** turn a gesture (a drag with dozens of intermediate updates, a text-editing session) into one undo step; `cancelBatch` rolls a gesture back (Escape during a drag).
- **Coalescing**: repeated edits with the same key inside a time window (arrow-key nudges, slider drags) merge into one step.
- Undo/redo restore the selection that belonged to the step.
- Property-based tests run random editing sessions and check that undoing everything restores the exact original document and redoing restores the exact final one.

## Text engine

Text is the part where most editors break for Arabic. OpenCanvas lays text out itself, so the editor, every export and the server-side renderer agree:

1. Runs are styled spans over paragraphs (`content.paragraphs[].runs[]`), with lists (bullet / number, 5 indent levels), per-paragraph spacing, and node-level alignment, direction (`auto` / `ltr` / `rtl`) and sizing (`auto-width`, `auto-height`, `fixed` with optional auto-fit).
2. Paragraph direction is detected from the first strong character (`auto`) or forced.
3. **Line breaking** follows UAX #14 (break opportunities), with grapheme-safe emergency breaks for overlong words.
4. **Bidi** follows UAX #9: embedding levels per character, fragments split by level and style, visual reordering by rule L2. Mixed lines such as `صدر OpenCanvas 1.0 في عام 2026 (RTL).` render in the same order as a browser would.
5. **Shaping** (contextual Arabic forms, ligatures, marks) is done by the platform's text engine on whole fragments (browser shaper, or Skia/HarfBuzz in Node), so words are never shaped letter by letter.
6. Measurement goes through a `TextMeasurer` backed by a real canvas context with a width cache. When a web font finishes loading, the cache and the measuring context are replaced and all auto-sized text is re-measured.

Effects (outline, hollow, highlight background, neon, echo), underline/strikethrough, letter spacing and case transforms are applied consistently in layout, canvas drawing and SVG export.

## Rendering

`SceneRenderer.renderPage(ctx, store, pageId, options)` draws a page into any Canvas2D context:

- the editor view (with camera transform, viewport culling, interactive quality),
- exports (`rasterizePage` at any scale, export quality),
- Node tests and future server-side rendering (`@napi-rs/canvas`, Skia).

Group opacity, blend modes, shadows and blur use offscreen layers so they composite correctly. Image adjustments (brightness, contrast, saturation, hue, temperature, grayscale, sepia, vignette) are deterministic pixel filters with a cache, so exports match the canvas. Platform differences (letter-spacing support, `ctx.filter`) are detected once and handled explicitly.

### Decision: a custom renderer instead of Konva, Fabric.js or PixiJS

The spec suggested "Konva + custom document/scene engine" and named Fabric.js and PixiJS as alternatives. We kept the custom document engine and wrote the renderer ourselves on plain Canvas2D because:

1. **One source of truth.** Konva and Fabric each keep their own object graph. Mirroring the document into it means two models that can drift apart; drawing straight from the records keeps the document authoritative, as the spec requires.
2. **Text we control.** Correct Arabic needs our own line breaking, bidi reordering, lists, auto-fit and effects, identical in the editor and every export. With a library we would be working around its text object instead.
3. **The same code everywhere.** The renderer runs unchanged in the browser and in Node (Skia), so exports, previews, golden-image tests and future workers share one implementation.
4. **Replaceable backend.** Rendering sits behind a small platform interface, so a WebGL/WebGPU backend (e.g. on PixiJS) can be added for very large scenes without touching the model, the commands or the UI.

## Editor (interaction layer)

`Editor` combines the store, history, command registry and a small UI-state atom (selection, tool, camera, guides, editing text id…). It is framework-agnostic and fully unit-tested with synthetic pointer and keyboard input.

- **Tools** are state machines (select, hand, text, rect, ellipse, line, frame).
- **Gestures** (move, resize from 8 handles, rotate, marquee) restore the gesture's start snapshot and re-apply the transform each frame, so there is no floating-point drift, and end in one history step.
- **Snapping** to page edges, centers and other elements, with visual guides.
- **Text editing** places a `contenteditable` overlay exactly over the text node, so IME, Arabic keyboards, spell-check and screen readers work natively; the overlay writes structured runs back to the model.
- `CanvasView` binds an editor to DOM canvases (scene + overlay), handles device pixel ratio, wheel/pinch zoom, and schedules redraws with `requestAnimationFrame`.

## Web application

- **Next.js App Router** with a nonce-based Content Security Policy issued per request (`proxy.ts`), strict security headers and a standalone production build.
- The editor page is a client component; React components subscribe to the editor with `useEditorValue(selector)` (`useSyncExternalStore` keyed by the editor's version), so a property change re-renders only what reads that property.
- **Internationalization**: English and Arabic dictionaries with typed keys, `<html dir>` set on the server, Radix `Direction` provider, logical CSS properties (`ms-`, `pe-`, `start-`) throughout, so the entire UI mirrors in Arabic.

### Local-first persistence

```
edit ─▶ store ─▶ autosave (debounced, never mid-drag) ─▶ IndexedDB (designs, assets, thumbnails)
                     │
          hide/close ┴─▶ synchronous crash journal (localStorage) ─▶ recovered on next open
```

- Designs are saved in the browser's IndexedDB; assets are content-addressed blobs (SHA-256), so identical images are stored once.
- Every save carries the revision it was based on (**optimistic concurrency**). Two tabs editing the same design cannot overwrite each other: an idle tab follows the other tab's saves in place; a tab with unsaved edits shows a conflict banner offering to load the latest version or keep its edits as a copy.
- IndexedDB writes are asynchronous and may not finish while a tab closes, so unsaved edits are also written synchronously to a small journal when the page is hidden or unloaded, and recovered (or kept as a separate copy if newer work was saved meanwhile) the next time the design opens.
- Thumbnails carry the revision they show; the dashboard regenerates missing or outdated ones with the same renderer.

Server sync is the next layer on this foundation (see the [roadmap](roadmap.md)): the revision-based save protocol and the record/diff model are designed to map onto a server API and onto Yjs documents for real-time collaboration.

## Export

| Format | How |
| --- | --- |
| PNG / JPEG / WebP | `rasterizePage` at any scale; PNG `pHYs` and JPEG JFIF density carry the DPI so print size equals design size; transparent backgrounds for PNG/WebP |
| SVG | Vector output mirroring the renderer: text stays text, gradients/strokes/clips are native SVG, image adjustments are baked into embedded PNGs, and the font subsets used on the page are embedded as `@font-face` data URLs |
| PDF / print PDF | Dependency-free PDF writer; pages at 150 or 300 DPI, page size in points from the design size |
| `.opencanvas` | ZIP with `manifest.json`, canonical `document.json`, assets by hash and a thumbnail — see [document format](document-format.md) |

Multi-page raster exports download as a ZIP; page ranges such as `1-3, 5` are supported.

## Security model

- **Untrusted input never reaches the model unvalidated**: documents, packages and clipboard data are parsed with the zod schemas and limits, then structurally repaired (duplicate ids, missing document or pages, dangling parents, cycles and excessive nesting; images whose asset is missing are reported).
- **Uploads** are identified by their bytes (magic numbers), not their names or MIME types; size and pixel-count limits apply before decoding.
- **SVG uploads** are sanitized with DOMPurify (no scripts, event handlers, `foreignObject` or external references) and only ever drawn as images.
- **Packages** are read defensively: size limits before inflating (zip bombs), whitelisted paths (no traversal), and every asset's SHA-256 must match the document.
- **Text pasted into a text box** is inserted as plain text; no foreign HTML enters the document.
- The web app sends a per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and COOP headers; the container runs as a non-root user on a read-only filesystem.

## Performance

- Viewport culling, cached text layouts and adjusted images, and offscreen layers only where compositing requires them.
- Gestures update the store in place per frame and record one history step; autosave and preview rendering never run during a gesture.
- Budgets are enforced in CI (`e2e/performance.spec.ts`, headless Chromium with software rendering). Frame times include rasterization (each timed frame ends with a pixel readback), and the frame rate is measured with `requestAnimationFrame` while dragging. Results on the development machine:

| Scenario | Full redraw | Drag frame | Drag FPS |
| --- | --- | --- | --- |
| 100 elements (text, strokes, shadows, rotation) | 5.5 ms | 7.4 ms | 61 |
| 300 elements | 10.9 ms | 15.5 ms | 47 |
| 500 elements | 15.0 ms | 20.6 ms | 39 |
| 1000 elements | 25.9 ms | 35.8 ms | 24 |
| 10 MB photo on the page | 2.6 ms | 2.7 ms | 55 |

| Scenario | Result |
| --- | --- |
| Open a saved 1000-element design | 0.43 s |
| 4K PNG export of a 300-element slide | 0.8 s |
| 100-page document: open / switch page / PDF export | 0.56 s / 1.2 ms / 12 s |
| Upload and place a 10 MB image | 2.1 s |

The next step for very large pages is layer caching during drags (rasterize the static elements once, redraw only what moves) and a WebGL/WebGPU backend behind the same renderer interface.

## Extension points for later phases

- **Collaboration**: records and fractional indices map one-to-one onto a Yjs map; `remote` is already a first-class change source.
- **AI**: semantic roles and slots describe intent; command tool definitions give agents a validated editing API; the renderer runs in Node for previews.
- **Templates and brand kits**: slots and semantic roles, plus `meta` on every record for plugin data.
- **Server rendering and workers**: the renderer and exporters already run in Node, so export queues can move to workers without new rendering code.
