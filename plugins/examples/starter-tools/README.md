# Starter tools

The smallest useful plugin, made for trying the plugin system. Four commands, each a few lines in `main.js`:

| Command | What it does | API it shows |
| --- | --- | --- |
| Add a title | Adds a text box at the top of the page and selects it | `design.page`, `design.insert`, `design.select` |
| Random background | Gives the page a new background color (also in the page menu) | `design.execute('page.update', …)` |
| Count elements | Shows how many elements are on the page (also in the page menu) | `design.page`, `ui.toast` |
| Recolor shapes | Gives the selected shapes new colors | `design.selection`, `design.update` |

Permissions: `design:read`, `design:write`.

```bash
pnpm plugin:pack plugins/examples/starter-tools
# → dist/plugins/org.opencanvas.starter-tools-1.0.0.ocplugin
```
