# Document format

OpenCanvas stores designs as structured documents. Nothing is flattened into a bitmap: every text, shape, image, frame and group stays an editable record. This page specifies the JSON document (`opencanvas.document`) and the file package (`.opencanvas`).

## `opencanvas.document` (schema version 1)

```jsonc
{
  "format": "opencanvas.document",
  "schemaVersion": 1,
  "records": [ /* document, pages, nodes, assets */ ]
}
```

- `records` is a flat list. The tree is expressed with `parentId`; order among siblings with `index` (fractional index keys, compared as strings — `"a0" < "a1" < "a1V" < "a2"`).
- Serialization is **canonical**: records come in a fixed order (the document, then pages, nodes and assets, each group sorted by id) and object keys are sorted. The same document always produces the same bytes, which makes diffs, hashes and tests stable. Visual order is never implied by record order — it comes from `parentId` and `index`.
- Readers must treat files as untrusted: OpenCanvas validates every record against its schema, applies limits, migrates older schema versions and repairs structure (see [Validation](#validation)).

### Example

A page with one Arabic/Latin headline (generated with `stringifyDocument`; the shape record and default-valued fields of other nodes look the same):

```json
{
  "format": "opencanvas.document",
  "records": [
    { "formatId": "instagram-post", "id": "document", "meta": {}, "title": "Hello", "typeName": "document" },
    {
      "background": { "color": "#ffffff", "type": "solid" },
      "height": 1080, "id": "page_1", "index": "a0", "meta": {}, "name": "", "notes": "",
      "typeName": "page", "width": 1080
    },
    {
      "align": "right", "autoFit": false, "blendMode": "normal", "blur": 0,
      "content": {
        "paragraphs": [
          {
            "indent": 0, "list": "none",
            "runs": [
              { "style": {}, "text": "مرحبا " },
              { "style": { "color": "#fde047" }, "text": "OpenCanvas" }
            ]
          }
        ]
      },
      "direction": "auto", "effect": null, "flipX": false, "flipY": false,
      "height": 86, "id": "node_2", "index": "a1", "lineHeight": 1.4, "locked": false,
      "meta": {}, "name": "", "opacity": 1, "paragraphSpacing": 0, "parentId": "page_1",
      "rotation": 0,
      "semantic": { "description": "Greeting", "role": "headline", "slot": null },
      "shadow": null, "sizing": "auto-height",
      "style": {
        "color": "#ffffff", "fontFamily": "Cairo", "fontSize": 64, "fontStyle": "normal",
        "fontWeight": 700, "letterSpacing": 0, "strikethrough": false,
        "textTransform": "none", "underline": false
      },
      "type": "text", "typeName": "node", "verticalAlign": "top", "visible": true,
      "width": 920, "x": 80, "y": 120
    }
  ],
  "schemaVersion": 1
}
```

## Records

### `document`

Exactly one, with id `"document"`.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | ≤ 256 characters |
| `formatId` | string \| null | Format preset the design started from (`instagram-post`, `a4`, …) |
| `meta` | object | Free-form JSON for integrations (≤ 64 KB) |

### `page`

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `index` | string | `index` orders pages |
| `name` | string | Empty = "Page N" |
| `width`, `height` | number | Design pixels (CSS px, 96 per inch); 1–10 000 |
| `background` | Fill | Solid color or gradient |
| `notes` | string | Presenter notes |
| `hidden` | boolean | Hidden pages stay in the design but are skipped when downloading all pages (default `false`) |
| `locked` | boolean | Elements on a locked page cannot be changed or added (default `false`) |
| `guides` | `{ axis: "x" \| "y", position }[]` | Ruler guides in page units (≤ 200); `x` guides are vertical lines. Elements snap to them |
| `meta` | object | |

Older documents without `hidden`, `locked` or `guides` load with the defaults.

### `asset`

Binary data is **not** embedded in the document. Assets are content-addressed: the record carries the hash, and the bytes travel next to the document (IndexedDB locally, the `assets/` folder of a package, object storage later).

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | `"image"` | |
| `hash` | string | `sha256-<64 hex>` of the file bytes |
| `mimeType` | string | `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`, `image/svg+xml` |
| `width`, `height`, `size` | number | Intrinsic pixels, byte size |
| `name` | string | Original file name |
| `src` | string \| null | Remote URL once uploaded to a server (future) |

### `node` — common fields

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `shape` \| `line` \| `path` \| `text` \| `image` \| `group` \| `frame` | |
| `parentId` | string | A page, group or frame |
| `index` | string | Higher = in front |
| `name` | string | Layer name; empty = derived from content |
| `x`, `y`, `width`, `height` | number | Box in the parent's coordinate space |
| `rotation` | number | Degrees, clockwise, around the box center |
| `flipX`, `flipY` | boolean | |
| `opacity` | number | 0–1 |
| `visible`, `locked` | boolean | |
| `blendMode` | string | `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity` |
| `shadow` | `{ color, offsetX, offsetY, blur }` \| null | |
| `blur` | number | Layer blur radius in px |
| `semantic` | `{ role, description, slot }` \| null | Meaning for AI, templates and accessibility (`description` doubles as alt text) |
| `meta` | object | Plugin data |

Colors are normalized to lowercase `#rrggbb` or `#rrggbbaa`.

**Fill**: `{ type: "solid", color }`, `{ type: "linear-gradient", angle, stops: [{ offset, color }] }` (CSS angle convention) or `{ type: "radial-gradient", cx, cy, stops }` (center normalized to the box).
**Stroke**: `{ color, width, style: "solid" | "dashed" | "dotted", cap, join }`.

### Node types

| Type | Specific fields |
| --- | --- |
| `shape` | `shape` (`rect`, `ellipse`, `triangle`, `right-triangle`, `diamond`, `pentagon`, `hexagon`, `octagon`, `polygon`, `star`, `arrow-right`, `arrow-left`, `chevron`, `cross`, `heart`, `speech-bubble`, `parallelogram`, `trapezoid`, `arch`, `half-circle`, `quarter-circle`, `ring`, `crescent`, `drop`, `cloud`, `blob`, `scallop`, `squircle`, `shield`, `banner`, `tag`, `double-arrow`, `round-bubble`), `fill`, `stroke`, `cornerRadius`, `sides` (polygon sides / star points / scallop bumps), `innerRatio` (star, ring) |
| `line` | `stroke`, `startArrow`, `endArrow` (`none`, `arrow`, `triangle`, `circle`, `square`, `bar`). The line runs from the left-middle to the right-middle of its box; length = `width`, angle = `rotation` |
| `path` | `path` (SVG path data), `viewBox`, `fill`, `stroke`, `fillRule` — icons and imported vector shapes |
| `text` | `content.paragraphs[]` (`runs[]` of `{ text, style }` overrides, `list`: `none` / `bullet` / `number`, `indent` 0–4), base `style` (`fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `color`, `underline`, `strikethrough`, `letterSpacing` in 1/1000 em, `textTransform`), `align` (`left`, `center`, `right`, `justify`), `verticalAlign`, `direction` (`auto`, `ltr`, `rtl`), `lineHeight`, `paragraphSpacing`, `sizing` (`auto-width`, `auto-height`, `fixed`), `autoFit`, `effect` (outline, hollow, background, neon, echo) |
| `image` | `assetId`, `crop` (visible source region, normalized 0–1), `cornerRadius`, `stroke`, `adjustments` (`brightness`, `contrast`, `saturation`, `hue`, `temperature`, `grayscale`, `sepia`, `vignette`) |
| `group` | none — bounds follow the children; transforms apply to all of them |
| `frame` | `shape`, `fill`, `stroke`, `cornerRadius`, `clipContent` — a container that clips its children to its shape (photo frames, masks) |

`width`/`height` of `auto-width`/`auto-height` text are derived from the content by the layout engine and stored so other tools can read the document without a font engine.

## Validation

Loading (`parseDocument` / `loadDocument`) performs, in order:

1. **Format check** — `format` must be `opencanvas.document`; unknown future `schemaVersion`s are rejected.
2. **Migration** — older schema versions are upgraded step by step (`MIGRATIONS`).
3. **Schema validation** — every record is parsed with its zod schema: types, enums, ranges, string lengths, defaults for missing optional fields. Invalid records reject the document with a readable `ValidationError`.
4. **Limits** — e.g. ≤ 500 pages, ≤ 50 000 nodes, ≤ 5 000 assets, nesting depth ≤ 32, page size ≤ 10 000 px, font size 1–4 000, text ≤ 100 000 characters per node.
5. **Structural repair** — duplicate ids, a missing document or page record, nodes with missing parents, cycles or excessive depth are repaired or dropped; every repair is reported as an `IntegrityIssue`. Images whose asset is missing are reported (and drawn as placeholders in the editor).

## `.opencanvas` package

A ZIP file (`application/vnd.opencanvas+zip`) that carries a complete, editable design — what "Save as .opencanvas" downloads and "Open a file" imports.

```
manifest.json          { format: "opencanvas.package", version: 1, createdWith, document, thumbnail, assets[] }
document.json          canonical opencanvas.document JSON
assets/<hash>.<ext>    one file per asset, named by content hash
thumbnail.png          optional preview of the first page
```

`manifest.assets[]` lists `{ hash, path, mimeType, size }` for every asset.

Reading is defensive:

- the package (≤ 500 MB), each entry (document ≤ 50 MB, asset ≤ 50 MB), the total inflated size (≤ 1 GB) and the number of files (≤ 5 100) are checked **before** inflating, so zip bombs are rejected early;
- only whitelisted paths are read (no `..`, no absolute paths);
- every asset's SHA-256 must equal the hash in the document;
- `document.json` goes through the full validation above.

## Versioning policy

- Additive changes (a new optional field with a default) keep `schemaVersion` and are accepted by older readers that ignore unknown fields.
- Breaking changes increment `schemaVersion` and ship a migration from the previous version; migrations are pure functions with tests.
- The package `version` changes only if the container layout changes.
