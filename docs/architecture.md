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
    usePaintDefaults.ts current fill/stroke (tool bar swatches, key designer.paint); shapeStyle/lineStyle/
                        brushPaint/textFill give new objects their paint; applyPaint edits the selection
  canvas/
    CanvasView.tsx      viewport: pointer routing to tools, wheel/pinch zoom, Space/middle/two-finger pan
    SceneLayer.tsx      artboard + nodes under translate(pan) scale(zoom)
    renderers/          NodeRenderer (one component per node type), paint.tsx (fill/stroke/gradient defs)
    overlays/           SelectionOverlay, HoverOverlay, GuidesOverlay (screen-pixel space)
    selectionFrame.ts   selection box/handles geometry shared by overlay and select tool
    snapping.ts         smart guides (artboard + other objects) + snap to grid; tools check snapEnabled()
    GridLayer.tsx       grid over the artboard (View → Grid), under the artwork
    CanvasContextMenu.tsx  right-click menu (built from action ids), state in contextMenuStore.ts
    overlays/Rulers.tsx rulers on the canvas edges (View → Rulers)
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
  dialogs/              DialogHost + <id>/ (newDocument = welcome/File → New, projects, shortcuts, about,
                        export, convertToPath); each Component is React.lazy and mounts on first open
  io/
    projectFile.ts      .designer.json serialize ($schema) + validateDocument (errors name the JSON path, defaults)
    projectFileTypes.ts file shape for the JSON Schema (scripts/gen-schema.ts → public/schema/)
    fileAccess.ts       save in place (File System Access handles per project in IndexedDB), Save as, Open
    shareLink.ts        #open= (deflate-raw + base64url) / ?import= links: build, read, resolve to a document
    launch.ts           handles those URLs at startup/hashchange → dialogs/openLink confirm → new project
    svgDocument.ts      svgToDocument (SVG → whole document; app + CLI)
    glyphExport.ts      document → 128-box currentColor glyph fragment (build-icons.mjs)
    download.ts         downloadBlob, pickFiles
    svgExport.ts        exportSvg(doc, {scope, selection, padding, background}) → clean SVG string
    outlineText.ts      adapter to fonts/outline.ts textToPaths (glob: picked up when it exists, else <text>)
    rasterExport.ts     rasterizeSvg (PNG/JPG via canvas), rasterSize (scale or custom width)
    exportActions.ts    renderExport/downloadExport (used by the Export dialog), copySvgToClipboard
    svgImport.ts        parseSvg(text, {matrix, currentColor}) → SceneNodes (icons can reuse it)
    svg/                pathData (d parser, arcs → cubics), transformAttr, styles (<style>/style=""), color
    importActions.ts    importSvgText / importFiles / openSvgAsDocument / image downscale (2048)
    useImportHandlers.ts  paste (SVG text, images, in-app nodes) + drop on window; mounted in App
    legacy/             LogoGo → Designer migration (logogo.ts pure, migrate.ts runs once from init)
    exporters/          registry + <id>/index.ts (extra formats; SVG/PNG/JPG are built into the dialog)
    importers/          registry + <id>/index.ts (svg: SVG + PNG/JPG/WebP)
  cli/                  `designer` CLI (bin/designer.ts): main.ts commands, env.ts headless shim (happy-dom
                        DOMParser, fonts read from disk), presets.ts. See docs/agents.md
  theme/                theme.ts (Light/Dark/System + palettes, keys designer.theme / designer.palette), ThemeMenu
  components/ui/        shadcn radix-vega primitives (generated; local edits: tabs focus fix, sonner theme prop)
  components/ResponsiveDialog.tsx  Dialog on desktop, bottom Sheet below 768px
  components/color/     ColorPicker (SV square, hue/alpha, hex/RGB, document + recent colors), used by
                        ColorField, PaintEditor (inline) and the swatches popover
  sync/                 optional self-hosted project sync (docs/sync.md): plan.ts (pure merge: what to push/pull/
                        delete/keep as a conflicted copy; Vitest), api.ts (HTTP client), state.ts (settings in
                        localStorage; per-id base + local tombstones in IndexedDB `designer-sync`), engine.ts
                        (useSyncStore, syncNow, startSync: pull on start/focus/30 s, push 2 s after autosave)
  dialogs/sync/         Sync dialog (File → Sync…, or the Sync button in the top bar)
  dialogs/cli/          "CLI & agents" dialog (Help menu; terminal button in the desktop top bar)
  app/TopBarButtons.tsx the top-bar Sync button (states from sync/view.ts) and CLI button
  pages/SyncSetup.tsx   the /sync guide (download, run, connect, tunnel); Root.tsx picks it by pathname
  dev/debugHandle.ts    dev-only window.__designer (stores, model, actions, tools, sync, fonts, theme) for browser QA scripts
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
  `svg`. `io/useImportHandlers.ts` routes dropped files (`importerForFile`) and pasted text
  (`importText` of every importer), falling back to the in-app clipboard. It lets Mod+V reach the
  browser (capture listener) so the `paste` event carries the system clipboard without a prompt.
- To turn SVG markup into nodes anywhere (icons, templates), call `parseSvg` from `io/svgImport.ts`.

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

## View preferences

Rulers, grid, snap to grid and grid size live in `useEditorStore` (`setViewPrefs`, saved in
`localStorage['designer.view']`), not in the document. The current fill/stroke is in
`usePaintDefaults` (`designer.paint`), recent colors in `designer.recentColors`, and the welcome
dialog's "seen" flag in `designer.welcomed`.

## Persistence

IndexedDB database `designer`, object store `kv`: key `projects` = `ProjectMeta[]`, `doc:<id>` = the
full `DesignDocument`. The active project id is in `localStorage['designer.activeProject']`. Autosave runs
600 ms after the last change (not during a transaction) and on `pagehide`/hidden. `init` first runs the
one-time LogoGo migration (`io/legacy/migrate.ts`: `logogo-project-storage` → new projects, flag
`designer.logogoMigrated`; the old key is left untouched).

## Agents, links and the CLI

See `docs/agents.md` and `docs/project-format.md`. Keep `src/model`, `src/io/projectFile.ts`,
`svgImport.ts`, `svgExport.ts` and `shareLink.ts` free of React/store imports: the CLI imports them
under Bun. After changing `src/model/types.ts`, run `bun run schema` (a test compares the committed
schema) and update the `OPTIONAL` list in `scripts/gen-schema.ts` if the importer gives a field a default.

## Tests

`bun run test` (Vitest, node environment). Model and store logic are tested in `src/**/__tests__` and
`*.test.ts` next to the code; `fake-indexeddb` backs the projects store test.

## Knockout and clip paths (`src/vector/knockout.ts`)

Pure paper.js geometry shared by the app, the importer and the CLI. `cutNode(scope, node,
parentWorld, shape, 'subtract' | 'intersect')` cuts any node (groups keep their structure; painted
leaves that change become filled paths: the fill area and the outlined stroke, `fillRule: evenodd`;
untouched nodes come back as the same object). `knockout(scope, doc, { cutters, targets?, gap })`
grows the cutters' silhouette (painted area, plus the inside of unfilled closed shapes unless
`outlineOnly`) by `gap` (`expandArea`) and subtracts it from each target;
`applyKnockout` writes the result into a document (CLI). Default gap: `defaultKnockoutGap` (0.03 T
on icon documents, 4 px elsewhere).

- App: Object → Knock out (`path.knockout`, ⌥⌘K, also the context menu and the Boolean section)
  runs `vector/knockoutSession.ts`: the topmost selected object cuts the others inside one open
  transaction; `vector/KnockoutPanel.tsx` (floating on the canvas) changes the gap with a live
  preview, Apply commits one undo step, Cancel/Escape restores. Texts are outlined first.
- Import: `svgImport` resolves `clip-path` (and masks made of solid white/black shapes) by
  intersecting the converted content with the clip geometry (`clip-rule`, `clipPathUnits`,
  transforms). paper.js is loaded lazily, so parseSvg stays synchronous: callers `await
  ensureSvgGeometry(text)` first (import, open, links, CLI); without it clips are skipped with a
  warning. Tests: `src/io/svgClip.test.ts` rasterizes `__fixtures__/hoard-c1k.svg` and its import
  with resvg and compares pixels.

## Reference images (tracing)

`NodeBase.reference?: boolean` marks a node as a tracing reference (Illustrator "template"). Reference
nodes render normally but are skipped by `hitTest`/`nodesInRect`, snapping and every exporter (SVG,
PNG, JPG, Copy SVG); they are selectable only from the Layers panel. `useEditorStore.showReferences`
hides them all from the view without touching the document. Entry points: File → Place reference
image, Alt-drop of an image, "Use as reference" in Properties/Object/context menu.

## App icon mode (`src/icon/`, `src/iconMode/`)

`DesignDocument.icon?: { preset, shape, smallGlyphProjectId? }` marks an app icon document (New
document → App icon, or File → Make this an app icon document). Everything else is untouched for
other documents.

- `src/icon/` is a **pure TS port of `build-icons.mjs`** from the `hfps-kit` skill (`repo-assets/GUIDE.md`)
  (keylines, SMALL_FILL, BRAND, ink-box measurement, `fit()`, the report and warnings, every output
  of the icon set, the .ico encoder, the review sheet, an RGB PNG encoder for iOS). Rendering is
  injected (`Rasterize`, `IconRenderer`). It must change together with the script;
  `src/icon/__tests__/parity.test.ts` measures the skill's glyphs with `@resvg/resvg-js` and checks
  the script's printed numbers. iOS ships Light / Dark / Tinted (`AppIcon.appiconset`) and an
  iOS 26 Icon Composer `AppIcon.icon`; rules, schema and sources in `docs/app-icons-theming.md`,
  script port in `docs/build-icons-port-notes.md`.
- `src/iconMode/`: `glyph.ts` exports the glyph as the script's input (fragment, 128 space = the
  visible tile, every paint → `currentColor` with its alpha, references/hidden skipped, text
  outlined); `analysis.ts` measures it live (offscreen canvas, debounced) into `useIconStore`;
  `fit.ts` is Fit to keyline (strokes scale with the glyph, like the script's `scale()`);
  `commands.ts` builds the ZIP (jszip, lazy). The tile (`canvas/TileLayer.tsx`, under the artwork,
  plus a filter that previews the glyph in white) and the keylines (`canvas/KeylinesOverlay.tsx`,
  screen space, labels on hover) are view-only, never document nodes. `themedPreview.ts` builds the
  approximate "System themes" previews (Android themed, iOS Light/Dark/Tinted; `ui/ThemedPreview.tsx`).
- Glyphs are one colour: in icon documents `PaintEditor` (Fill/Stroke sections, tool bar swatches)
  edits only none/glyph and opacity and shows the one-colour note (`panels/shared/glyphPaint.ts`);
  the swatches preview white on the brand tile. Knock out replaces "hide it with a tile-coloured shape".
- UI: Properties section `icon` (nothing selected), dialog `exportIcon` (File → Export icon…),
  exporter `app-icon` in the Export dialog (`Exporter.when` hides it for other documents), actions
  in `actions/modules/icon.ts`.
