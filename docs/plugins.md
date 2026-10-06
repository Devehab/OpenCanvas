# Building OpenCanvas plugins

Plugins add features to OpenCanvas: image effects, background removal, design generators, icon packs, fonts, or a whole panel with its own interface. This guide covers everything a developer needs: the package format, the manifest, permissions, the JavaScript API, the sandbox, and how to test and share a plugin.

**[الدليل الكامل بالعربية ←](plugins.ar.md)**

- [Quick start](#quick-start)
- [How plugins run](#how-plugins-run)
- [The package](#the-package)
- [The manifest](#the-manifest)
- [Permissions](#permissions)
- [The API](#the-api)
- [Element format](#element-format)
- [Panels](#panels)
- [Icon packs and fonts](#icon-packs-and-fonts)
- [Network access](#network-access)
- [Limits and rules](#limits-and-rules)
- [Testing and debugging](#testing-and-debugging)
- [Examples](#examples)

## Quick start

The fastest start is to copy [`starter-tools`](../plugins/examples/starter-tools), the smallest useful plugin (four commands of a few lines each), and change it. Or start from scratch:

1. Create a folder with two files:

   `opencanvas-plugin.json`

   ```json
   {
     "manifestVersion": 1,
     "id": "com.example.hello",
     "name": "Hello",
     "version": "1.0.0",
     "description": "Adds a greeting to the page.",
     "author": "Your name",
     "main": "main.js",
     "permissions": ["design:write"],
     "contributes": {
       "commands": [{ "id": "greet", "title": "Say hello", "titleAr": "قل مرحبًا" }]
     }
   }
   ```

   `main.js`

   ```js
   opencanvas.commands.register('greet', async () => {
     await opencanvas.design.insert([
       {
         type: 'text',
         x: 100,
         y: 100,
         width: 600,
         sizing: 'auto-height',
         content: { paragraphs: [{ runs: [{ text: 'Hello!', style: {} }], list: 'none', indent: 0 }] },
         style: { fontFamily: 'Cairo', fontSize: 96, fontWeight: 800, color: '#7c3aed' },
       },
     ]);
   });
   ```

2. Pack it: `pnpm plugin:pack path/to/folder` writes `dist/plugins/com.example.hello-1.0.0.ocplugin`.
3. Install it: **Settings → Plugins → Install a plugin**, review what it asks for, and confirm.
4. Use it: in the editor, open the **Plugins** panel and click **Say hello**. Undo removes everything the command did in one step.

## How plugins run

Plugin code is untrusted, so OpenCanvas never runs it in the editor's page.

- Each plugin runs in its own **sandboxed frame** (`<iframe sandbox="allow-scripts">`, served by `/plugin-sandbox`). The frame has an opaque origin: it cannot read the editor's page, cookies, `localStorage` or IndexedDB (your designs), and it cannot open windows, submit forms or navigate the editor.
- The frame has its own **Content Security Policy**: no network access at all unless the plugin declares the `network` permission and lists hosts, which you approve when installing.
- The plugin talks to the editor only through the **`opencanvas` API**, which sends messages. The editor checks every call against the plugin's **permissions**, and every change goes through the same validated, undoable commands the editor itself uses. Invalid elements are rejected, exactly as for a paste.
- Images a plugin returns are validated like an upload (type, size, pixel count, sanitized SVG).
- The code is sent to the frame once. If the frame reloads or navigates, the plugin is stopped.
- A frame starts the first time it is needed (a command runs or its panel opens) and stops when the plugin is turned off, updated or uninstalled.

The test suite has a plugin that tries to escape (read the editor page, storage, IndexedDB, call the network, write without permission) and checks every attempt is blocked: `apps/web/e2e/plugins.spec.ts`.

## The package

A plugin is a ZIP file with the extension `.ocplugin` (`.zip` is accepted too). At its root is `opencanvas-plugin.json`; everything else is up to you. Zipping a folder that contains the plugin (one level deep) also works.

```
my-plugin/
├── opencanvas-plugin.json   required
├── main.js                  the script (if the plugin has commands or a panel)
├── icon.svg                 optional, shown in Settings and the Plugins panel
├── icons/*.svg              optional icon pack
└── fonts/*.woff2            optional fonts
```

Allowed file types: `js mjs json css html md txt svg png jpg jpeg webp woff2 woff ttf otf wasm`. Anything else, absolute paths, `..` or backslashes make the package invalid. `pnpm plugin:pack <folder> [out-dir]` builds the file and skips `README.md`, `.DS_Store` and `node_modules`.

`main.js` is loaded as a **single ES module**. It cannot `import` other files from the package by path; bundle your code into one file (esbuild, Rollup, Vite library mode…) or load data with `opencanvas.files.get(path)`.

## The manifest

| Field | Required | Description |
| --- | --- | --- |
| `manifestVersion` | yes | Always `1`. |
| `id` | yes | Reverse-domain id, lower case: `com.example.my-plugin`. Installing a package with the same id updates the plugin. |
| `name` | yes | Up to 64 characters. |
| `version` | yes | Semantic version, e.g. `1.2.0` or `2.0.0-beta.1`. |
| `description` | yes | Up to 400 characters. |
| `author` | yes | Person or organization. |
| `homepage` | no | URL shown in Settings. |
| `license` | no | e.g. `MIT`. |
| `icon` | no | `.svg` or `.png` in the package. |
| `main` | for commands and panels | `.js` or `.mjs` in the package. |
| `panel` | no | `{ "height": 320 }`: show the plugin's own interface in the Plugins panel (80–1200 px). |
| `permissions` | no | See [Permissions](#permissions). Default: none. |
| `network` | with `network` | Host names the plugin may contact, e.g. `["api.example.com", "*.example.org"]` (HTTPS only, up to 20). |
| `contributes.commands` | no | Up to 30: `{ "id", "title", "titleAr"?, "context"? }`. |
| `contributes.iconPacks` | no | Up to 10: `{ "id", "name", "path" }` where `path` is a folder of `.svg` files. |
| `contributes.fonts` | no | Up to 40: `{ "family", "path", "weight"?, "style"? }`. |
| `locales` | no | `{ "ar": { "name", "description" }, "en": { … } }` shown in that language. |

Command **`context`** decides where a command appears:

- `plugins` (default): the Plugins panel.
- `image`: the Plugins panel and the right-click menu of a selected image (or a frame with an image). It is disabled while no image is selected.
- `page`: the Plugins panel and the page menu (right-click a page thumbnail, or "…" in a page header).

Unknown fields are refused, and every problem is listed in the install dialog, so mistakes are easy to find.

## Permissions

| Permission | Allows | API methods |
| --- | --- | --- |
| `design:read` | Reading pages, elements and the selection | `design.get`, `design.page`, `design.selection`, `design.select` |
| `design:write` | Adding, changing and deleting elements | `design.insert`, `design.update`, `design.remove`, `design.execute` |
| `images:read` | Reading image files in the design | `images.get` |
| `images:write` | Replacing images, adding new ones | `images.replace`, `images.add` (also needs `design:write`) |
| `network` | `fetch()` to the hosts in `network` | the browser's `fetch`, `WebSocket` |

Ask for as little as you need: people see the list before installing. A call without its permission is rejected with `Permission needed: …`.

## The API

Everything is on the global `opencanvas` object. All methods return promises.

### Information

- `opencanvas.version`: API version (`1`).
- `opencanvas.locale`: `'en'` or `'ar'`. `opencanvas.dir`: `'ltr'` or `'rtl'`. Use them to translate your interface.
- `opencanvas.pluginId`, `opencanvas.permissions`.

### Commands

```js
opencanvas.commands.register('my-command', async (context) => {
  // context = { command, pageId, selection: [ids] }
});
```

Register every command listed in the manifest when `main.js` loads. While a command runs, all its changes form **one undo step**. If the handler throws, the person sees the message. A command may take up to 2 minutes.

### Design

```js
const design = await opencanvas.design.get();
// { title, pageId, selection, pages: [{ id, name, width, height, background, hidden, locked, … }] }

const { page, nodes } = await opencanvas.design.page(pageId); // current page if omitted
const selected = await opencanvas.design.selection(); // element records

const ids = await opencanvas.design.insert([...elements], { center: false }); // on the current page
await opencanvas.design.update(ids, { opacity: 0.5 });
await opencanvas.design.remove(ids);
await opencanvas.design.select(ids);
await opencanvas.design.execute('node.reorder', { ids, direction: 'front' }); // any editor command
```

`design.execute` runs any command of the editor's command registry (the same validated commands the UI uses; see `packages/core/src/commands/builtin.ts` for their names and parameters).

### Images

```js
const { blob, width, height, mimeType } = await opencanvas.images.get(nodeId); // image or frame with an image
await opencanvas.images.replace(nodeId, newBlob); // keeps position, size and crop
const placed = await opencanvas.images.add(blob); // on the page (or into a selected frame)
```

Work on pixels with `createImageBitmap` and `OffscreenCanvas`; WebAssembly is allowed for heavier processing.

### Files and interface

```js
const data = await opencanvas.files.get('data/presets.json'); // a Blob from your package
await opencanvas.ui.toast('Done!', 'success'); // 'info' | 'success' | 'error'
await opencanvas.ui.resize(480); // panel height in px
```

## Element format

Elements are plain objects; omitted fields get defaults. The most useful ones:

```js
// Shape: rect, ellipse, triangle, star, polygon, …
{ type: 'shape', shape: 'rect', x, y, width, height, cornerRadius: 24,
  fill: { type: 'solid', color: '#7c3aed' } }

// Gradient fill
{ type: 'linear-gradient', angle: 135, stops: [{ offset: 0, color: '#2b1055' }, { offset: 1, color: '#db2777' }] }

// Text (several paragraphs flow in one auto-height box)
{ type: 'text', x, y, width, sizing: 'auto-height', align: 'center',
  content: { paragraphs: [{ runs: [{ text: 'Title', style: { fontSize: 96, fontWeight: 800 } }], list: 'none', indent: 0 }] },
  style: { fontFamily: 'Cairo', fontSize: 48, fontWeight: 400, color: '#111827' } }

// Vector path (24×24 view box, like the icon library)
{ type: 'path', x, y, width: 160, height: 160, path: 'M5 12h14', viewBox: { x: 0, y: 0, width: 24, height: 24 },
  stroke: { color: '#111827', width: 2, style: 'solid', cap: 'round', join: 'round' }, fill: null }
```

Colors are `#rrggbb` or `#rrggbbaa`. Coordinates are page pixels from the top-left corner. Common properties: `rotation` (degrees), `opacity` (0–1), `name`, `locked`, `hidden`. The full schema is in `packages/core/src/model/types.ts` and the [document format](document-format.md).

## Panels

With `"panel": { "height": 360 }`, the plugin's sandbox document is shown inside the Plugins panel when the person clicks **Open**. Build your interface with the DOM in `main.js`:

```js
document.body.innerHTML = '<button id="go">Generate</button>';
document.getElementById('go').addEventListener('click', () =>
  opencanvas.design.insert([...]).catch((e) => opencanvas.ui.toast(e.message, 'error')),
);
```

Inline styles and `<style>` work. Calls made from the panel (outside a command) are each their own undo step; put several changes in one `design.insert` call to keep them together. Use `opencanvas.dir` to lay out Arabic correctly.

## Icon packs and fonts

No code needed:

```json
"contributes": {
  "iconPacks": [{ "id": "arrows", "name": "Hand-drawn arrows", "path": "icons" }],
  "fonts": [{ "family": "My Brand", "path": "fonts/MyBrand-Bold.woff2", "weight": 700 }]
}
```

- **Icons**: each `.svg` in the folder becomes an icon in **Elements → Your icons**, named after the file. SVGs are sanitized and their shapes (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`) merged into one path. Outline icons (`fill="none"` with a stroke) stay stroked; others are filled. Shapes with a `transform` are skipped, so flatten transforms when exporting.
- **Fonts**: TTF, OTF, WOFF or WOFF2, checked by signature. They appear under **Your fonts** in the font picker and are embedded in SVG exports.

Turning a plugin off hides its icons and fonts; uninstalling removes them.

## Network access

```json
"permissions": ["network"],
"network": ["api.example.com"]
```

The sandbox only allows HTTPS requests to the listed hosts (and `blob:`/`data:`). Requests come from an opaque origin (`Origin: null`), so the server must allow CORS. Don't put secrets (API keys) in a plugin: anyone can unzip it. Prefer services the person signs in to, or let them paste their own key into your panel.

## Limits and rules

| Limit | Value |
| --- | --- |
| Package size | 25 MB (60 MB unpacked, 15 MB per file, 400 files) |
| Commands / icon packs / fonts | 30 / 10 / 40 |
| Start-up time | 15 s |
| One command | 2 minutes |
| Calls in flight | 64 |
| Elements per `design.insert` | 1,000 |

Good plugins:

- Make each command one meaningful step (it is one undo step).
- Work offline when they can; explain when they need the network.
- Support both languages with `titleAr`, `locales` and `opencanvas.locale`.
- Never collect data without saying so in the description.

## Testing and debugging

- Pack with `pnpm plugin:pack`, install in **Settings → Plugins**. Installing a package with the same id updates it; the review shows the version change.
- Errors thrown by a command appear as a message in the editor. `console.log` from the plugin appears in the browser's developer tools (select the plugin's frame in the console).
- The install dialog lists every manifest problem with its field.
- Example tests: `apps/web/e2e/plugins.spec.ts` installs the examples with Playwright and checks what they do.

## Examples

All in [`plugins/examples`](../plugins/examples), MIT licensed:

| Plugin | Shows |
| --- | --- |
| [starter-tools](../plugins/examples/starter-tools) | The basics: add a title, random page background, count elements, recolor shapes |
| [image-effects](../plugins/examples/image-effects) | Image commands: read pixels, change them, replace the image |
| [remove-background](../plugins/examples/remove-background) | Making a plain background transparent, offline |
| [quick-layouts](../plugins/examples/quick-layouts) | A panel with a form that generates a complete design |
| [hand-drawn-arrows](../plugins/examples/hand-drawn-arrows) | An icon pack with no code and no permissions |

---

<div dir="rtl" lang="ar">

## بالعربية

تضيف الإضافات ميزات جديدة إلى OpenCanvas: تأثيرات الصور، وإزالة الخلفية، وتوليد التصاميم، وحزم الأيقونات، والخطوط، أو لوحة كاملة بواجهتها الخاصة.

**كيف تعمل:** تعمل كل إضافة في إطار معزول (sandbox) له مصدر مستقل، فلا تستطيع قراءة صفحة المحرّر ولا تصاميمك المخزّنة ولا الاتصال بالإنترنت إلا إذا طلبت ذلك ووافقت عليه. وتتواصل الإضافة مع المحرّر عبر واجهة `opencanvas` فقط، ويُتحقَّق من كل طلب وفق الصلاحيات المعلنة، ويمرّ كل تعديل عبر أوامر المحرّر الموثّقة نفسها، فيكون تشغيل الأمر خطوة تراجع واحدة.

**الحزمة:** ملف ‎.ocplugin‎ (بصيغة ZIP) في جذره ملف `opencanvas-plugin.json` الذي يصف الإضافة: المعرّف والاسم والإصدار والصلاحيات والأوامر وحزم الأيقونات والخطوط. ويمكن إضافة اسم الأمر بالعربية عبر `titleAr`، والاسم والوصف عبر `locales.ar`.

**الصلاحيات:** `design:read` لقراءة التصميم، و`design:write` لتعديله، و`images:read` و`images:write` للصور، و`network` للاتصال بمواقع محددة تُذكر في الحقل `network`.

**الخطوات:**

1. أنشئ مجلدًا فيه `opencanvas-plugin.json` و`main.js` (انظر المثال في أول هذا الدليل).
2. حزّمه بالأمر `pnpm plugin:pack مسار/المجلد`.
3. ثبّته من **الإعدادات ← الإضافات ← تثبيت إضافة**، وراجع ما تطلبه ثم وافق.
4. شغّله من لوحة **الإضافات** في المحرّر، أو من قائمة الصورة أو قائمة الصفحة حسب سياق الأمر.

ويمكنك إيقاف أي إضافة مؤقتًا أو إزالتها نهائيًا من الإعدادات. والأمثلة الكاملة في مجلد [`plugins/examples`](../plugins/examples)، وأبسطها [`starter-tools`](../plugins/examples/starter-tools).

**الدليل الكامل بالعربية، بما فيه القواعد الإلزامية وواجهة البرمجة كاملة: [plugins.ar.md](plugins.ar.md).**

</div>
