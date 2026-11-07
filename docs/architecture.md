# Designer — architecture

Read `docs/rebuild-spec.md` first (the contract). This file explains how the code is laid out and
how to extend it. Most extension points are **folders discovered with `import.meta.glob`**: you add a
file, you don't edit a shared list, so parallel workers rarely conflict.

## Folder map

```
src/
  main.tsx              initTheme() then <App/>
  app/                  shell: App, DesktopLayout, MobileLayout, MenuBar, ToolBar, OptionsBar,
                        StatusBar, PanelTabs, ProjectTitle, useKeyboard
  model/                pure document model (no React, no stores) + Vitest tests
    types.ts            SceneNode union, Paint, Stroke, Transform, DesignDocument
    factories.ts        createRect/Ellipse/Polygon/Path/Text/Image/Group/Document, solid(), linear()…
    matrix.ts           2D affine matrices, transform <-> matrix, SVG transform strings
    path.ts             nodeSubpaths / nodeToSvgPath / subpathsToD, flattening, cubic helpers
    bounds.ts           localBounds, boundsIn, worldMatrix, worldBounds, worldCorners, setTextMeasurer
    hitTest.ts          hitTest(doc, point), nodesInRect(doc, rect)
    tree.ts             locate/findNode/getParent/walk/topmostIds/sortByDocumentOrder
    transformOps.ts     applyWorldMatrix (move/resize/rotate/flip any node), bakeScale, scaleAbout
    align.ts            alignDeltas / distributeDeltas
    paint.ts            color split/join/normalize, gradientVector, convertPaint
  store/
    useDocStore.ts      document + undo/redo (immer patches), transactions, node helpers
    useEditorStore.ts   tool, selection, zoom/pan, hover, guides, marquee, dialogs, panel tab
    useProjectsStore.ts project list, open/create/rename/duplicate/delete, debounced autosave
    persistence.ts      IndexedDB (idb-keyval, db "designer", store "kv")
    clipboard.ts        copy/cut/paste buffer (+ system clipboard JSON mirror)
  canvas/
    CanvasView.tsx      viewport: pointer routing to tools, wheel/pinch zoom, Space/middle/two-finger pan
    SceneLayer.tsx      artboard + nodes under translate(pan) scale(zoom)
    renderers/          NodeRenderer (one component per node type), paint.tsx (fill/stroke/gradient defs)
    overlays/           SelectionOverlay, HoverOverlay, GuidesOverlay (screen-pixel space)
    selectionFrame.ts   selection box/handles geometry shared by overlay and select tool
    snapping.ts         smart guides (artboard + other objects)
  tools/
    types.ts            Tool interface, ToolPointerEvent, ToolContext
    registry.ts         auto-discovers tools/<id>/index.ts
    context.ts          toolContext, switchTool()
    shapeTool.ts        factory for drag-a-box tools (rect, ellipse; reuse for polygon/star)
    select/ hand/ zoom/ rectangle/ ellipse/
  actions/
    types.ts            Action (menu placement, shortcut, enabled/checked, run)
    registry.ts         auto-discovers actions/modules/*.ts; shortcut matching + formatting; menus
    selection.ts        helpers for actions (editableSelection, translateNodes)
    modules/            file.ts edit.ts object.ts view.ts help.ts nudge.ts
  panels/
    properties/         PropertiesPanel + sections/<id>/ (artboard, transform, appearance, fill, stroke, align)
    layers/             LayersPanel, LayerRow
    assets/             AssetsPanel + sources/<id>/ (empty: icons/fonts workers add theirs)
    shared/             NumberField, ColorField, PaintEditor, AlignButtons, Section/FieldRow
  dialogs/              DialogHost + <id>/ (projects, shortcuts, about, export)
  io/
    projectFile.ts      .designer.json save/open
    download.ts         downloadBlob, pickFiles
    exporters/          registry + <id>/index.ts (empty: export worker)
    importers/          registry + <id>/index.ts (empty: SVG import worker)
  theme/                theme.ts (Light/Dark/System + palettes, keys designer.theme / designer.palette), ThemeMenu
  components/ui/        shadcn radix-vega primitives (generated; local edits: tabs focus fix, sonner theme prop)
  components/ResponsiveDialog.tsx  Dialog on desktop, bottom Sheet below 768px
```

## Core conventions

- **Coordinates.** Document (world) units = artboard pixels, origin at the artboard's top-left.
  Every node is drawn at `translate(x,y) rotate(r) scale(sx,sy)` of its local geometry.
  **Primitives are centered on their local origin** (`rect`, `ellipse`, `polygon`, `image`), so
  `transform.x/y` is their center and rotation pivots around the center. Paths keep points in local
  coords (any origin). Text's origin is the top of the first line at the left/center/right anchor.
- **Transforms from the UI** go through `applyWorldMatrix(node, parentWorldMatrix, M)`: compose a
  world-space matrix `M` (translation, `rotationAbout`, `scaleAbout(kx, ky, anchor, frameRotation)`)
  and apply it to a snapshot of the node. `bakeScale` then folds scale into width/height/rx/ry/points
  (strokes don't scale). Groups and non-uniformly scaled polygons/text keep `scaleX/scaleY`.
- **Undo.** `useDocStore.apply(recipe, { label })` records one immer patch entry. For drags, call
  `beginTransaction(label)` on pointerdown, apply freely while moving (no history recorded), and
  `commitTransaction()` on pointerup (one undo step) or `cancelTransaction()` on Escape. Gestures compute
  each frame **from the snapshot taken at the start** and use `replaceNodes`, never incremental deltas.
- **Selection** lives in `useEditorStore.selection`. It can contain nested ids (layers panel, Cmd-click
  on canvas); use `topmostIds(doc, ids)` before transforming.
- **Rendering.** `NodeRenderer` is memoized by node identity; immer structural sharing keeps untouched
  nodes equal, so a drag re-renders only the moved nodes. Gradients use `objectBoundingBox` units with ids
  `<nodeId>-fill` / `<nodeId>-stroke` inside the node's own `<defs>`.
- **UI.** hfps-app-ui rules: semantic tokens only, nothing below 12px, Phosphor icons, inputs in
  panels are `h-8` (one size per panel), dialogs via `ResponsiveDialog`.

## How to add a tool

1. Create `src/tools/<id>/index.ts` with `export default` a `Tool` (`src/tools/types.ts`): `id`,
   `label`, `shortcut` (single key, e.g. `'p'`), Phosphor `icon`, `cursor`, `group`
   (`select | draw | shape | text | paint | view`) and `order`.
2. Implement `onPointerDown/Move/Up` (points arrive in document coords; `e.pressed` tells drag vs hover),
   `onCancel`, and optionally `onKeyDown` (return `true` when handled: Enter/Escape for pen, etc.).
3. Use `ctx.docStore()` transactions for gestures, `ctx.editor().setSelection(...)`, `ctx.px()` for
   screen-pixel tolerances, `ctx.hitTest(point)`, and `snapPoint/snapRect` from `canvas/snapping.ts`
   (respect `ctx.editor().snapping` and skip when `e.mod`).
4. Optional `Overlay` component (renders inside the screen-space overlay `<svg>`; use `useView()` from
   `canvas/overlays/useView.ts` for `toScreen`/`matrix`) and `Options` component (options bar).
   Keep tool-local state in module variables or a tiny zustand store inside the tool folder.
5. Done: the toolbar, tooltip, shortcut and shortcuts dialog pick it up automatically.

Box-dragging shapes (polygon, star, image placeholder) should reuse `createShapeTool` in
`src/tools/shapeTool.ts`. Node editing (A) should set `useEditorStore.editingPathId`; text editing sets
`editingTextId` (both fields exist already).

## How to add a node type

1. Add the type to the `SceneNode` union in `src/model/types.ts` and a factory in `factories.ts`.
2. Geometry: `nodeSubpaths` in `path.ts` (if it has a vector outline) and `localBounds` in `bounds.ts`.
   `hitTestNode` falls back to the outline or the local box.
3. Rendering: a component in `src/canvas/renderers/` registered in `RENDERERS` (`NodeRenderer.tsx`).
4. `bakeScale` in `transformOps.ts` if its size should absorb scale. Icon in `panels/layers/nodeIcons.ts`.
5. Tests in `src/model/__tests__/`.

Text metrics come from the fonts module (`src/fonts/measure.ts` installs `setTextMeasurer()`).

## Fonts and text (`src/fonts/`)

- `catalog.ts` bundled OFL fonts (TTF in `files/`, licenses in `files/licenses/`); `uploads.ts` user fonts
  in IndexedDB `designer-fonts` (WOFF2 stored decompressed); `store.ts` registry (`useFontStore`,
  `resolveText`, `ensureFace`, uploads/rename/delete). Canvas CSS family names are prefixed `dz `.
- `layout.ts` is the single layout (baselines, alignment, letter spacing between characters, CSS weight
  matching, synthetic italic) shared by `TextRenderer`, the measurer, the inline editor and outlines.
- `outline.ts` → **`textToPaths(node): Promise<SceneNode>`** (group of glyph paths with the text's
  transform; one compound path when the paint is a gradient). Exporters call this.
- `kerning.ts` reads GPOS pair kerning directly (opentype.js 2 skips extension lookups).
- Text tool (`tools/text/`): click = point text, the editor is a textarea portaled into the canvas and
  transformed to match; `session.ts` keeps one undo step per edit. Select double-click edits text.

## How to add a Properties section

Create `src/panels/properties/sections/<id>/index.ts`:

```ts
import type { PropertySection } from '../../types';
import { TextSection } from './TextSection';
export default { id: 'text', order: 35, when: (ctx) => ctx.nodes.some((n) => n.type === 'text'), Component: TextSection } satisfies PropertySection;
```

`ctx` has `doc`, `ids` (topmost selected ids) and `nodes`. Edit with `editNodes(ids, recipe, label)` or
`transformNodes(ids, matrix, label)` from `panels/properties/edit.ts`. Use `Section`, `FieldRow`,
`NumberField`, `ColorField`, `PaintEditor` from `panels/shared/`. Existing orders: artboard 0,
transform 10, appearance 20, fill 30, stroke 40, align 50 (booleans could go at 60).

## How to add an asset source (icons, fonts, templates)

Create `src/panels/assets/sources/<id>/index.ts` with `export default` an `AssetSource`
(`{ id, label, icon, order, Component }`, see `panels/assets/types.ts`). The Assets tab shows a tab per
source (or the single source directly). Insert content with
`useDocStore.getState().addNodes(nodes)` then `useEditorStore.getState().setSelection(ids)`; place new
nodes at the artboard center. Icons must become `group`/`path` nodes (spec).

## How to add an exporter / importer

- Exporter: `src/io/exporters/<id>/index.ts` → `export default` an `Exporter`
  (`{ id, label, extension, order, Options?, run(req) }`, `io/exporters/types.ts`). File → Export
  (`dialogs/export/ExportDialog.tsx`, a stub the export worker may rewrite) lists all of them.
  `downloadBlob` is in `io/download.ts`. For SVG output, serialize the model directly (don't scrape the
  canvas DOM: it contains editor overlays).
- Importer: `src/io/importers/<id>/index.ts` → `export default` an `Importer`
  (`{ id, label, accept, importFiles, importText? }`). File → Import SVG runs the importer with id
  `svg`. Paste/drop handling for SVG text and image files is not wired yet: the import worker should add
  a `paste`/`drop` listener (e.g. in a small hook mounted from `app/App.tsx`) that uses
  `importerForFile` / `importText`, falling back to `edit.paste` for in-app nodes.

## How to add a menu command or shortcut

Add an `Action` to a file in `src/actions/modules/` (or create a new file there, e.g. `text.ts`,
`boolean.ts`): `{ id, label, menu, group, order, submenu?, shortcut?, enabled?, checked?, run }`.
The menu bar (desktop) and the mobile menu are built from the registry; a menu with no actions is
hidden (the Text menu appears once a text action exists). Shortcut strings: `mod+shift+o`, `delete`,
`arrowleft`, `mod+]`; `mod` = ⌘ on macOS / Ctrl elsewhere. The Shortcuts dialog lists everything.
Single-key tool shortcuts belong to tools, not actions. Keys reach the active tool's `onKeyDown` first.

## How to add a dialog

`src/dialogs/<id>/index.ts` → `export default { id, Component }`; open it with
`useEditorStore.getState().openDialog('<id>')`. Use `ResponsiveDialog*` for form dialogs and
`AlertDialog` for confirmations.

## Persistence

IndexedDB database `designer`, object store `kv`: key `projects` = `ProjectMeta[]`, `doc:<id>` = the
full `DesignDocument`. The active project id is in `localStorage['designer.activeProject']`. Autosave runs
600 ms after the last change (not during a transaction) and on `pagehide`/hidden. LogoGo migration
(`logogo-project-storage`) is not done yet: add it as a one-time step in `useProjectsStore.init`.

## Tests

`bun run test` (Vitest, node environment). Model and store logic are tested in `src/**/__tests__` and
`*.test.ts` next to the code; `fake-indexeddb` backs the projects store test.
