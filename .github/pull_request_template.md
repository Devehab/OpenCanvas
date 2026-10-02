## What and why

<!-- What does this change do, and why is it needed? Link related issues. -->

## How it was tested

<!-- Commands run, new or updated tests, screenshots for UI changes (English and Arabic). -->

## Definition of Done

- [ ] Goes through commands/operations; no design state in React
- [ ] Persisted: schema defaults/limits (and a migration if record shapes changed)
- [ ] Undoable: one action = one undo step; undo restores the exact state
- [ ] Reload-safe: autosave → reload restores the exact document
- [ ] Exported correctly: canvas, PNG/JPEG/WebP, SVG and PDF agree
- [ ] Works with Arabic text and in the right-to-left interface
- [ ] Accessible: keyboard, focus, labels, contrast (axe passes)
- [ ] Tests added/updated; changed visual baselines reviewed
- [ ] Docs updated where behavior or formats changed
