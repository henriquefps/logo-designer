# Designer — rebuild spec

Shared spec for the rebuild of this repo (formerly "LogoGo") into **Designer**, a free, open,
client-side SVG editor in the spirit of Adobe Illustrator, published at `designer.hfps.dev`
(`logogo.hfps.dev` redirects there). Not only for logos: any SVG illustration, icon, badge, banner.

Every worker reads this file first. The old code is archived on branch `archive/logogo-2-wip`
(useful pieces: `src/lib/booleanOps.ts`, `textToPath.ts`, `convertToPath.ts`, `bezierSplit.ts`,
`pathGeometry.ts`, `snapping.ts`, `useCanvasZoomPan.ts`, `IconPicker/`, `useVirtualGrid.ts`).
Copy and adapt ideas freely; nothing old must survive as-is.

## Principles

- Everything runs in the browser. No account, no server. Projects and user fonts live in IndexedDB.
- The SVG DOM is the rendering engine; the document model maps 1:1 to SVG. paper.js is used only for
  geometry (booleans, simplify, offsets), never to render.
- Desktop-first editor, still usable on a phone.
- Small, typed, testable modules. Pure geometry/model code has Vitest tests.

## Stack

Vite + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui **`radix-vega`** style, Inter,
Phosphor icons (UI chrome), zustand (+ immer) for state, paper.js (geometry), opentype.js (fonts),
idb-keyval or a tiny IndexedDB wrapper, Vitest. Package manager: **bun**. UI follows the
`hfps-app-ui` skill (olive tokens + palettes). **Default theme: palette `blue`, mode `light`**
(user can pick Light / Dark / System and palette from a menu; storage keys `designer.theme`,
`designer.palette`).

## Document model (`src/model/`)

```ts
type Id = string;
type Paint =
  | { kind: 'none' }
  | { kind: 'solid'; color: string /* #rrggbb or #rrggbbaa */ }
  | { kind: 'linear' | 'radial'; stops: { offset: number; color: string }[]; angle?: number /* linear, deg */ };

interface Stroke { paint: Paint; width: number; cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel'; dash: number[]; }

interface Transform { x: number; y: number; rotation: number /* deg */; scaleX: number; scaleY: number; }
// node is drawn at translate(x,y) rotate(rotation) scale(scaleX,scaleY) around its local origin.

interface NodeBase { id: Id; name: string; visible: boolean; locked: boolean; opacity: number /* 0..1 */;
  blendMode?: string; transform: Transform; }

type BezierPoint = { x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number };
  type: 'corner' | 'smooth' | 'symmetric' }; // in/out handles are absolute in local coords
interface SubPath { points: BezierPoint[]; closed: boolean; }

type SceneNode =
  | NodeBase & { type: 'group'; children: SceneNode[] }
  | NodeBase & { type: 'path'; subpaths: SubPath[]; fill: Paint; stroke: Stroke; fillRule: 'nonzero' | 'evenodd' }
  | NodeBase & { type: 'rect'; width: number; height: number; radius: number; fill: Paint; stroke: Stroke }
  | NodeBase & { type: 'ellipse'; rx: number; ry: number; fill: Paint; stroke: Stroke }
  | NodeBase & { type: 'polygon'; sides: number; radius: number; innerRadius?: number /* star when set */; fill: Paint; stroke: Stroke }
  | NodeBase & { type: 'text'; text: string; fontFamily: string; fontWeight: number; fontStyle: 'normal'|'italic';
      fontSize: number; letterSpacing: number; lineHeight: number; align: 'left'|'center'|'right'; fill: Paint; stroke: Stroke }
  | NodeBase & { type: 'image'; href: string /* data URL */; width: number; height: number };

interface Artboard { width: number; height: number; background: Paint /* none = transparent */; }
interface DesignDocument { schemaVersion: 1; id: Id; name: string; createdAt: number; updatedAt: number;
  artboard: Artboard; children: SceneNode[]; }
```

Icons from libraries are inserted as `group`/`path` nodes (parsed from SVG), so they are fully editable.
Import of arbitrary SVG uses the same parser (`src/io/svgImport.ts`).

## Store (`src/store/`)

- `useDocStore`: the active document, `apply(recipe, { label })` (immer, records undo patches),
  `beginTransaction()/commitTransaction()` for drags (one undo step per gesture), `undo/redo`,
  helpers: `addNodes`, `updateNode(id, patch)`, `deleteNodes`, `reorder`, `group`, `ungroup`,
  `findNode`, `getParent`. History limit 100.
- `useEditorStore`: ephemeral UI state: `tool`, `selection: Id[]`, `zoom`, `pan`, `hover`,
  `editingPathId` (node-edit mode), `editingTextId`, panel tab, snapping on/off.
- `useProjectsStore`: list of projects in IndexedDB, open/create/rename/duplicate/delete, autosave
  (debounced) of the active document.

## Tools (`src/tools/`)

A tool is `{ id, label, shortcut, icon, cursor, onPointerDown/Move/Up, onKeyDown?, Overlay?, Options? }`
registered in `src/tools/registry.ts`. Pointer events arrive in document coordinates. `Options` renders
in the contextual options bar under the menu bar; `Overlay` renders on top of the canvas.
Tools: select (V), direct-select / node edit (A), pen (P), pencil (N, freehand, simplified to Bézier),
rectangle (M), ellipse (L), line (\\), polygon/star, text (T), hand (H, also Space-drag), zoom (Z),
eyedropper (I).

## Layout (desktop)

```
┌ Menu bar: File  Edit  Object  Text  View  Help        project name        theme menu ┐
├ Options bar (contextual for the active tool / selection)                              ┤
│ Tool │                    Canvas (artboard centered, zoom/pan)          │ Right panel │
│ bar  │                                                                   │ Properties  │
│      │                                                                   │ Layers      │
│      │                                                                   │ Assets      │
└──────┴──────────────────────── Status bar: zoom %, cursor x/y, selection ┴─────────────┘
```

Right panel: tabs **Properties** (transform x/y/w/h/rotation, fill, stroke, opacity, text props,
align/distribute, boolean ops), **Layers** (tree, drag reorder, visibility/lock, rename, groups),
**Assets** (Icons: Lucide, Phosphor, Iconify search; Fonts: bundled + uploaded). Below 768px: canvas
full screen, a compact bottom toolbar, panels open in a bottom Sheet.

## Fonts (`src/fonts/`)

- Bundled open fonts (keep the ones in the archive: Inter, Space Grotesk, Playfair Display, Bebas
  Neue, JetBrains Mono; add a few more OFL fonts if cheap).
- Upload `.otf/.ttf/.woff/.woff2` (woff2 decoded for opentype if needed); stored in IndexedDB only;
  registered with the FontFace API for live render; parsed with opentype.js for outlining.
- Export always converts text to outlines (paths). "Text → Create outlines" is also an Object action.
- Missing font on load → fallback + warning badge in the text properties.

## Export / import (`src/io/`)

- Export SVG (clean, outlined text, optimized numbers), PNG (transparent ok), JPG (background white
  if transparent); scope = artboard or selection; scale 1×/2×/4× or custom width.
- Import SVG file (and paste SVG text) → editable nodes. Drop image file → image node.
- Project file `.designer.json` (save/open). Migrate old LogoGo projects from localStorage key
  `logogo-project-storage` once, best effort (icons → paths, text → text, shapes → shapes).

## Keyboard

Illustrator-style: V A P N M L T H Z I, Cmd/Ctrl+Z / Shift+Z, Cmd+C/V/X/D, Cmd+G / Shift+G,
Cmd+] [ (order), Delete, arrows (Shift = ×10), Cmd+0 fit, Cmd+1 100%, Cmd+ +/-, Shift+O outlines,
Enter on a path → node edit, Esc exits mode. A Shortcuts dialog lists them all.

## Quality bar

`bun run build`, `bun run lint`, `bunx tsc -b` and `bun run test` pass. Check widths 390/1024/1440,
light and dark. No text below 12px. No raw Tailwind colors in the UI chrome.
