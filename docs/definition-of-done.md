# Definition of Done

> A feature is not complete when it works once. It is complete only when it is **implemented, persisted, undoable, reload-safe, collaborative where applicable, exported correctly, tested, accessible, and covered by automated regression tests.**

Every pull request is reviewed against this checklist (it is also the pull request template).

| Criterion | What it means here | How it is verified |
| --- | --- | --- |
| **Implemented** | Works through the document model and commands — no design state that lives only in React | Code review; unit tests on the command/operation |
| **Persisted** | Every new property is part of a record schema with a default and limits; old documents still load (migration if the shape changes) | Schema tests; serialization round-trip tests |
| **Undoable** | One user action = one undo step; gestures are batched; undo restores the exact previous document and selection | History/property tests; E2E undo/redo |
| **Reload-safe** | Survives autosave → reload with an identical document, including edits made right before closing the tab | E2E persistence tests compare canonical records before and after reload |
| **Collaborative where applicable** | Changes are expressed as record diffs so they can sync; two tabs never overwrite each other | Cross-tab E2E tests; (Phase 4) multi-browser convergence tests |
| **Exported correctly** | Looks the same in the editor, PNG/JPEG/WebP, SVG and PDF | Golden-image tests in Node; visual regression and SVG-vs-PNG pixel comparison in the browser |
| **Tested** | Unit tests for logic, E2E tests for the user flow, visual tests for anything drawn | CI must be green |
| **Accessible** | Keyboard operable, visible focus, labelled controls, sufficient contrast, announced state changes, works in Arabic (RTL) | axe WCAG 2.1 AA scans; keyboard-only E2E; review in both languages |
| **Regression-covered** | A bug fix starts with a failing test that reproduces it | Review |

## Checklist

- [ ] The change goes through commands/operations; React holds no design state
- [ ] New record fields have schema defaults, limits and (if needed) a migration
- [ ] Undo/redo produce the exact previous/next state; gestures are one step
- [ ] Autosave → reload restores the exact document
- [ ] Rendering matches across canvas, raster export, SVG and PDF
- [ ] Works with Arabic text and in the Arabic (RTL) interface
- [ ] Keyboard accessible with visible focus and labels; axe scan passes
- [ ] Unit tests and E2E tests added or updated; visual baselines reviewed if pixels changed
- [ ] Performance budgets still pass (`pnpm test:e2e --grep @perf`)
- [ ] Documentation updated (format, architecture or user-facing behavior)
