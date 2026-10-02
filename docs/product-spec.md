# Product specification

> **OpenCanvas is an open-source, AI-powered visual creation platform that lets anyone create, edit, collaborate, publish, and automate visual content from one workspace.**

It is an open-source **visual creation suite**, not a "Canva clone". The difference is the foundation: a production-grade design engine where every design is a structured, editable document. Features, AI and collaboration are built on that engine, not painted on a UI prototype.

This document describes the full product vision. What is built today and what comes next is tracked in the [roadmap](roadmap.md); how it is built is in [architecture](architecture.md).

## Principles

1. **A design is a document, never a picture.** Every element (text, image, shape, line, icon, frame, group) is an independent object with its own properties. Designs are never stored as images.
2. **The document model is the source of truth**, not the UI framework: *Document Model → Command System → History → Renderer → UI*.
3. **Every change is a command** (add, move, resize, rotate, delete, update text, change style, group…). Undo/redo, version history and collaboration all build on commands.
4. **Nothing is lost.** Local change → immediate local persistence → debounced server sync → server version. A lost connection never loses a design; offline mode is a requirement.
5. **Real Arabic support from day one** — shaping, bidirectional text, Arabic fonts and a mirrored interface, not just `dir="rtl"`.
6. **AI works on the structure.** AI understands designs semantically (a hero section with a headline, supporting text, product image and call to action — not "an image, some text and a rectangle") and produces editable, layered results instead of flat images.
7. **Open and replaceable.** Open-source components where practical; AI providers, storage, rendering engines and integrations sit behind adapters.
8. **Quality is automated.** A feature is done only when its acceptance criteria are covered by automated regression tests (see [Definition of Done](definition-of-done.md)).

## Dashboard

After signing in, the home page offers:

- a prominent AI prompt ("Create an Instagram post for a coffee shop announcing 20% off this weekend.") that returns a real, editable design;
- **Create** with formats (presentation, Instagram, video, poster, document, website, whiteboard, logo, custom size);
- navigation: Home, Projects, Templates, Brand Kits, Assets, AI, Shared, Trash;
- recent projects, templates, recommendations and brand content;
- global search.

## Editor

The editor is the heart of the product.

```
┌──────────────────────────────────────────────────────────────────┐
│ Logo | File | Edit | View | Undo | Redo | Zoom | Share | Export  │
├────────┬───────────────────────────────────────────────┬─────────┤
│ Design │                                               │ Inspect │
│ Elem.  │                   CANVAS                      │ Position│
│ Text   │                                               │ Size    │
│ Brand  │                                               │ Rotate  │
│ Upload │                                               │ Opacity │
│ Media  │                                               │ Color   │
│ Apps   │                                               │ Effects │
│ AI     │                                               │ Layers  │
├────────┴───────────────────────────────────────────────┴─────────┤
│ Page 1  Page 2  Page 3       + Add page          Timeline (video) │
└──────────────────────────────────────────────────────────────────┘
```

| Area | Requirements |
| --- | --- |
| Objects | Text, images, video, audio, shapes, lines, SVG, icons, charts, tables, QR codes, frames, stickers, gradients, patterns, backgrounds |
| Transform | Move, resize, rotate, crop, flip, skew, scale, align, distribute, snap, group/ungroup, lock/unlock, duplicate, copy/paste, multi-select |
| Professional controls | Layers, position X/Y, width/height, rotation, opacity, blur, shadow, border, corner radius, blend modes, masking, clipping, guides, margins, rulers, grid, safe areas |
| Text | Rich text editing, font family, font upload, size, weight, italic, underline, letter spacing, line height, alignment, color, text effects, text boxes, auto-fit, text on a path, RTL/LTR, Arabic shaping, Arabic fonts |

### Layers are the core system

The design is a tree of independent objects:

```
Document
 ├── Page
 │    ├── Background
 │    ├── Image
 │    ├── Text
 │    ├── Shape
 │    └── Logo
 ├── Page
 └── Page
```

Storing this scene/document model, never an image, is what makes AI editing, undo/redo, version history, collaboration, templates, animation, export, search inside designs, accessibility and plugins possible.

## Image editing

Crop, resize, rotate, filters, brightness, contrast, saturation, blur, sharpness, background removal and replacement, object erasing, magic expand, object selection, upscaling, color adjustment, duotone, transparency.

## Video

A real timeline with tracks (video, text, audio), not "animated images": trim, split, merge, transitions, animations, keyframes, text overlays, captions, audio, voice-over, music, speed, volume, fades, video effects, video background removal, image-to-video, and export to MP4, WebM and GIF.

## Templates

A template engine where every template (Instagram post/story, YouTube thumbnail/banner, presentation, résumé, business card, poster, flyer, certificate, invitation, logo, website, document, infographic) is a structured, editable design. Users create from a template, then "replace all photos" or "apply my brand".

## Brand kits

Per user or company: logos, colors, fonts, typography, templates, images and brand rules. AI applies them on request ("use the brand colors and fonts"). Brand templates and approval workflows are first-class.

## AI

Three layers, all operating on the structured design:

1. **Assistant** — a conversation that understands the open document: "Create a presentation about renewable energy" → "Make it more professional" → "Change slide 3" → "Match my brand colors" → "Translate the whole design to Arabic".
2. **Design generation** — a prompt produces pages of editable, semantically named elements (background, logo, headline, product image, price, call to action).
3. **Editing** — "Remove the person in the background", "Make the background a sunset", "Make this image wider", "Replace the laptop with a phone", "Make this look like a professional ad", "Change the headline but keep the layout", "Create 10 variants".

The **semantic design model** (roles such as headline, supporting text, product image, CTA; sections; slots) is a key differentiator.

**Magic resize**: convert a design to other formats (Instagram story, YouTube thumbnail, Facebook, LinkedIn, presentation, A4) with elements re-laid-out automatically.

AI providers are abstracted (OpenAI, Anthropic, Google, local LLMs, local image models, custom models) so the platform is never tied to one model.

## Collaboration

Like Google Docs or Figma: live cursors, presence ("Ahmed is editing… Sara is viewing…"), comments with mentions, replies and resolution, share links, view/edit and team permissions, version history and restore, approval workflows. A CRDT such as Yjs is the intended synchronization layer.

## Visual suite

- **Docs**: rich text, images, tables, charts, design embeds, comments, AI writing.
- **Presentations**: slides, transitions, animations, presenter notes, present mode.
- **Whiteboards**: infinite canvas, sticky notes, shapes, connectors, mind maps, flowcharts, timer, real-time collaboration.
- **Sheets**: tables, formulas, charts, CSV/XLSX import, AI analysis.
- **Websites**: design → publish as a responsive website with sections, navigation, buttons, forms, images, SEO title/description, custom domain, favicon and analytics.

## Export engine

PNG, JPG, WebP, SVG, PDF, print PDF, MP4, WebM and GIF — with transparent backgrounds, 2×/4× resolution, custom DPI, page ranges and compression options.

## Platform

| Layer | Choice |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS, accessible headless components (Radix) |
| Editor | Custom document/scene engine with a dedicated renderer (see the [architecture decision](architecture.md#decision-a-custom-renderer-instead-of-konva-fabricjs-or-pixijs)) |
| Backend (planned) | Next.js API / Fastify, PostgreSQL, Prisma, Redis/Valkey, WebSocket, Yjs, BullMQ |
| Files (planned) | S3-compatible object storage (e.g. Cloudflare R2) behind a CDN |
| Search (planned) | PostgreSQL full-text search, later OpenSearch or Meilisearch |
| Clients | Web-first for Chrome, Safari, Firefox and Edge on desktop; installable PWA rather than Electron |
| Deployment | Docker → Coolify → Hetzner (self-hostable) |

Heavy work runs in separate workers so a 90-second AI job never blocks the editor:

```
Web server ─┬─ API
            ├─ Database
            └─ Queue ─┬─ Image worker
                      ├─ Video worker
                      ├─ Export worker
                      └─ AI worker
```

## Quality requirements

"It works on my machine" is not enough; the automated suite covers:

| Kind | Scope |
| --- | --- |
| Unit | Object transforms, text measurement, layer ordering, serialization/deserialization, undo/redo, grouping, snapping, export settings, color conversion |
| Integration | e.g. create project → add image → add text → resize → save → reload → verify the exact result |
| End-to-end (Playwright) | Sign up, log in, create a design, add a template, upload an image, edit text, move objects, duplicate/delete pages, undo/redo, save, reload, export PNG/PDF, share, open a shared link |
| Visual regression | Expected vs. actual screenshots for the renderer, text engine and exports; unintended pixel changes fail CI |
| Performance | 100 objects → 60 FPS; 300 objects → smooth editing; 500+ → acceptable interaction. Also: 4K PNG, multi-page PDF, 100-page document, 1000-element design, 10 MB image, 100 MB video |
| Collaboration stress | Four browsers edit the same design concurrently (text, move, color, delete) and converge to the same state without corruption |
| Security | Authentication, authorization, rate limiting, CSRF, XSS, SQL injection, file upload validation, SVG sanitization, malicious PDF handling, signed URLs, tenant isolation, API permissions |
| Accessibility | Keyboard navigation, screen readers, focus states, ARIA, contrast, reduced motion, text alternatives |
| Browser matrix | Latest Chrome, Safari, Firefox and Edge on macOS, Windows and iPadOS — Safari in particular |

## Definition of Done

> A feature is not complete when it works once. It is complete only when it is implemented, persisted, undoable, reload-safe, collaborative where applicable, exported correctly, tested, accessible, and covered by automated regression tests.

See [definition-of-done.md](definition-of-done.md) for the checklist applied to every change.

## Engineering brief

> Build OpenCanvas as a production-grade open-source visual creation platform, not as a Canva-style UI prototype.
>
> The core architecture must be based on a persistent, structured document/scene model where every design element is an independent editable object. The editor must support pages, layers, text, images, SVG, shapes, media, grouping, transformations, snapping, alignment, guides, masking, effects, animations, undo/redo, autosave, offline recovery, version history, export, and real-time collaboration.
>
> React must not be the source of truth for the document state. Implement a dedicated document model and command system. The rendering layer must be abstracted from the document model. The system must support deterministic serialization/deserialization, reliable autosave, collaborative synchronization, and pixel-accurate exports.
>
> AI capabilities must operate on the structured design model and produce editable layered output, not only flattened images.
>
> Build automated unit, integration, Playwright E2E, visual regression, performance, security, accessibility, and collaboration tests. Every feature must have acceptance criteria and automated regression coverage before being considered complete.
>
> The application must be deployable using Docker and support self-hosted deployment. Use open-source components wherever practical and keep AI providers, storage providers, rendering engines, and external integrations replaceable through adapters.

Development starts with the **OpenCanvas Design Engine** — document model, renderer, layers, text, images, undo/redo, serialization and export. If that foundation is excellent, every modern feature can be built on top of it; if it is weak, no amount of AI on top will make the product more than a demo.
