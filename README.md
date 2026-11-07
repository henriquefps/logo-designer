# Designer

A free, open SVG editor that runs entirely in your browser — in the spirit of Adobe Illustrator,
for logos, icons, badges, banners and any SVG illustration. No account, no server: projects live in
your browser's IndexedDB. Live at [designer.hfps.dev](https://designer.hfps.dev/) (formerly LogoGo).

## Status

Phase 1 (foundation): document model, undo/redo, projects with autosave, canvas with zoom/pan,
selection, move/resize/rotate with smart guides, rectangle and ellipse tools, layers, fill/stroke
with gradients, align/distribute, light/dark themes with palettes, phone layout.
Next: pen/pencil/node editing, polygons and lines, text and fonts, icon libraries, booleans,
SVG/PNG/JPG export and SVG import.

## Develop

```sh
bun install
bun run dev      # http://localhost:5173
bun run test     # Vitest
bun run lint
bun run build
```

- Spec: [`docs/rebuild-spec.md`](docs/rebuild-spec.md)
- Architecture and extension points: [`docs/architecture.md`](docs/architecture.md)
