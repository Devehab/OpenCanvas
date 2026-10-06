# Example plugins

Small plugins that show what the [plugin API](../../docs/plugins.md) can do ([بالعربية](../../docs/plugins.ar.md)). Each folder is a complete plugin. New to plugins? Start with `starter-tools`.

| Folder | What it shows | Permissions |
| --- | --- | --- |
| `starter-tools` | The basics in a few lines each: add a title, random page background, count elements, recolor selected shapes | `design:read`, `design:write` |
| `image-effects` | Image commands: read pixels, change them on an `OffscreenCanvas`, replace the image | `images:read`, `images:write` |
| `remove-background` | Making a plain background transparent with a flood fill, fully offline | `images:read`, `images:write` |
| `quick-layouts` | A panel with a form that generates a complete, editable design | `design:read`, `design:write` |
| `hand-drawn-arrows` | An icon pack: SVG files and a manifest, no code | none |

Pack one and install it in **Settings → Plugins**:

```bash
pnpm plugin:pack plugins/examples/starter-tools
# → dist/plugins/org.opencanvas.starter-tools-1.0.0.ocplugin
```

They are MIT licensed: copy one as the starting point for your own plugin.
