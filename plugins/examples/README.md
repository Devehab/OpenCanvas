# Example plugins

Four small plugins that show what the [plugin API](../../docs/plugins.md) can do. Each folder is a complete plugin.

| Folder | What it shows | Permissions |
| --- | --- | --- |
| `image-effects` | Image commands: read pixels, change them on an `OffscreenCanvas`, replace the image | `images:read`, `images:write` |
| `remove-background` | Making a plain background transparent with a flood fill, fully offline | `images:read`, `images:write` |
| `quick-layouts` | A panel with a form that generates a complete, editable design | `design:read`, `design:write` |
| `hand-drawn-arrows` | An icon pack: SVG files and a manifest, no code | none |

Pack one and install it in **Settings → Plugins**:

```bash
pnpm plugin:pack plugins/examples/image-effects
# → dist/plugins/org.opencanvas.image-effects-1.0.0.ocplugin
```

They are MIT licensed: copy one as the starting point for your own plugin.
