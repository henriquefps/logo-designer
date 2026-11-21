# Designer project format (`.designer.json`)

A Designer project is one JSON file: the document model of `src/model/types.ts`, written by
File → Save project file, the `designer` CLI, and read by File → Open project file, open links and
`designer validate`. This page lists every field. For the agent workflow see [`agents.md`](agents.md).

- **JSON Schema:** <https://designer.hfps.dev/schema/designer-project.schema.json>
  (`public/schema/designer-project.schema.json`, generated from the TS types by `bun run schema`;
  a test fails when it is out of date). Saved files carry `"$schema"` so editors autocomplete and
  check them.
- **Validation:** the importer (`validateDocument` in `src/io/projectFile.ts`) is the authority.
  Errors name the JSON path, e.g.
  `This project file is damaged at children[1].children[0].fill.stops[1].color: expected a color "#rrggbb" or "#rrggbbaa", got "red".`
- **Defaults:** fields marked *optional* below may be left out of a hand-written file; the importer
  fills them in. Unknown fields are ignored (and dropped when the app saves).

## Coordinates

- Units are artboard pixels; the origin is the artboard's top-left corner, y grows down.
- Every node is drawn at `translate(x, y) rotate(rotation) scale(scaleX, scaleY)` of its own
  local geometry (its `transform`), inside its parent group's transform.
- **`rect`, `ellipse`, `polygon` and `image` are centered on their local origin**: `transform.x/y`
  is their center. A 40 × 20 rect at the top-left corner has `transform: { x: 20, y: 10 }`.
- `path` points are in local coordinates (any origin); usually `transform` is `{ x: 0, y: 0 }` and
  the points are absolute artboard coordinates.
- `text`: the local origin is the top of the first line, at the left/center/right edge per `align`.
- Rotation is in degrees, clockwise (SVG).

## Top level

```json
{
  "$schema": "https://designer.hfps.dev/schema/designer-project.schema.json",
  "format": "designer",
  "schemaVersion": 1,
  "id": "dmwb2auha1jj3wan",
  "name": "Glyph",
  "createdAt": 1762790400000,
  "updatedAt": 1762790400000,
  "artboard": { "width": 128, "height": 128, "background": { "kind": "none" } },
  "icon": { "preset": "app-icon", "shape": "auto" },
  "children": []
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `$schema` | string | optional; written on save |
| `format` | `"designer"` | optional; written on save |
| `schemaVersion` | `1` | **required**. Files with a higher version are refused ("made with a newer version") |
| `id` | string | optional; a new id is generated. Imported projects always get a fresh id |
| `name` | string | optional (default `"Imported"`); shown in the projects list |
| `createdAt`, `updatedAt` | number (ms since epoch) | optional |
| `artboard` | [Artboard](#artboard) | **required** |
| `children` | [Node](#nodes)[] | **required**; first child is drawn first (bottom of the stack) |
| `icon` | [Icon settings](#icon-settings) | optional; marks the project as an app icon / favicon |
| `wireframe` | [Wireframe](#wireframe-documents) | optional; marks the project as a wireframe (not together with `icon`) |
| `live` | `{ editedBy }` | optional; sync state, not design: present while the project is edited live through the sync server (`designer live`, [`sync.md`](sync.md#live-editing-agent--you)). `editedBy` is who saved this version: `"cli"` or `"app:<device id>"`. Project files written by `designer live` / `sync pull` leave it out; a malformed value is dropped |

### Artboard

| Field | Type | Notes |
| --- | --- | --- |
| `width`, `height` | number > 0 | **required** |
| `background` | [Paint](#paints) | optional (default `{ "kind": "none" }` = transparent) |

### Icon settings

Optional `icon` field: marks an app icon document. The app then shows keylines, the brand tile,
the Icon panel (live build-icons.mjs measurements, Fit to keyline, launcher preview) and
File → Export icon (see `docs/architecture.md`, App icon mode):

```ts
icon?: {
  preset: 'app-icon' | 'android-adaptive' | 'ios' | 'favicon-32' | 'favicon-16';
  shape: 'auto' | 'circle' | 'square' | 'wide' | 'tall'; // keyline; auto = square/wide/tall from the ink box
  smallGlyphProjectId?: string; // another project used as the favicon glyph (glyph-small.svg)
  tile?: string; // tile colour '#rrggbb' (or '#rgb'); default '#2063b0'. Older hfps repos keep olive '#5b7a3a'
  colour?: 'one-colour' | 'full-colour'; // default one-colour (omitted); full-colour keeps the document's own paints
  glyph?: string; // one-colour glyph colour '#rrggbb' (or '#rgb'); default '#ffffff' (omitted); ignored in full-colour
}
```

Artboards: `app-icon` 128 (the visible tile T is the whole artboard), `android-adaptive` 108 (T = the
middle 72, 66 safe circle), `ios` 1024, `favicon-32` 32, `favicon-16` 16. A missing `preset`/`shape`
defaults to `app-icon`/`auto`; an unknown value is an error naming `icon.preset` / `icon.shape`.
`tile` is the colour of every tile in the exported set and of the tile under the glyph in the app (Icon panel →
“Tile colour”); it is normalised to lowercase `#rrggbb` and omitted when it is the default blue, and an invalid
value is an error naming `icon.tile`. `designer icons --tile <#hex>` overrides it for one run.
`colour` / `glyph` choose how the glyph is painted in every output:

- **`one-colour`** (default, the minimal hfps style): every paint of the drawing becomes the one glyph colour, with its
  alpha (opacity gives depth). The glyph colour is `glyph`, white by default, so `tile: "#ffffff"` with
  `glyph: "#e5322d"` is a red glyph on a white tile. The light variant (`icon-light.svg`) paints the
  glyph in `glyph` when it is set, else in the tile colour. Android 13+ themed icons still recolour it.
- **`full-colour`**: the document's own paints are kept: a solid colour per shape, linear / radial gradients (a rainbow),
  opacity. `glyph` is ignored. Derived variants: Android monochrome = the glyph's silhouette (alpha only, black);
  iOS Tinted = the luminance grayscale of the glyph on black; iOS Dark = the same colours on transparency (the system
  supplies the dark background; pick colours that read on near-black); `icon-light.svg` = the glyph on a white tile;
  the Android splash `ic_splash.xml` keeps solid colours and writes gradients as `aapt:attr` gradients on each
  shape's bounding box (a paint it cannot translate, e.g. `gradientTransform`, is painted white with a warning).
  In the app the canvas then shows the paints as drawn (no white override) and the paint editor is the normal one.

The tile stays one solid colour (`tile`): Android's `ic_launcher_background` is a `@color`, iOS Light is flattened on a
single colour and the light variant derives from it, so a gradient tile does not fit every output; use a gradient
*glyph* in full-colour mode. Both modes check the contrast of the glyph colour(s) against the tile (WCAG ratio, 3:1
for graphics) and warn in `designer icons`, `validate`, `info` and the Icon panel when they nearly vanish.
`colour` must be `"one-colour"` or `"full-colour"` (an error names `icon.colour`); `glyph` is normalised to lowercase
`#rrggbb`, omitted when white, and an invalid value is an error naming `icon.glyph`.
`designer new --preset <preset>` and `designer from-svg --icon <preset>` write it with `shape: "auto"`
(`--tile`, `--colour one|full`, `--glyph <#hex>` add the colour fields).

## Wireframe documents

A top-level `wireframe` field marks a wireframe: screens on an infinite canvas, to plan an app's UI
(`docs/wireframe-mode.md`). The `artboard` stays in the file (it is required) but is not drawn or used.

```json
{
  "schemaVersion": 1,
  "name": "Notes app",
  "artboard": { "width": 1024, "height": 1024 },
  "wireframe": {
    "screens": [ { "id": "s1", "name": "Settings", "status": "changed" }, { "id": "s2", "name": "Language" } ],
    "flows": [ { "id": "f1", "from": "row-language", "to": "s2", "label": "tap" } ]
  },
  "children": [
    { "type": "group", "name": "Settings", "transform": { "x": 0, "y": 0 },
      "screen": { "screenId": "s1", "platform": "phone", "width": 390, "height": 844 },
      "children": [
        { "type": "group", "name": "Hero", "transform": { "x": 24, "y": 120 },
          "component": { "kind": "placeholder", "props": { "label": "Hero image", "height": 220 } },
          "children": [] },
        { "id": "row-language", "type": "group", "name": "Language row", "transform": { "x": 0, "y": 360 },
          "component": { "kind": "list-row", "props": { "title": "Language", "trailing": "value", "value": "English" } },
          "children": [] }
      ] },
    { "type": "group", "name": "Settings", "transform": { "x": 470, "y": 0 },
      "screen": { "screenId": "s1", "platform": "tablet" }, "children": [] },
    { "type": "group", "name": "Language", "transform": { "x": 1370, "y": 0 },
      "screen": { "screenId": "s2", "platform": "phone" }, "children": [] }
  ]
}
```

`wireframe`:

| Field | Type | Notes |
| --- | --- | --- |
| `screens` | `{ id, name, status? }[]` | optional (default `[]`). The logical screens (`Settings`, `Gallery`), in creation order. `id` is required and unique; `name` defaults to `"Screen"`. `status`: `"current"` (the screen as the app has it today), `"changed"` (a proposed change to an existing screen) or `"new"`; omit when not stated (an unknown value is ignored with a warning). Kept in sync with the frames when the document opens: a frame with an unknown `screenId` gets a logical screen, a logical screen without frames is removed, every frame takes its logical screen's name |
| `symbols` | `{ id, name, content }[]` | optional. **Shared components** (masters of the user's own components, e.g. a "Trip card"): `id` required and unique, `name` (default `"Component"`) shown in My components and the export for AI, `content` a `group` node (validated like any node, in its own id space: its ids may repeat canvas ids). The content's `layout` (minus `size`) and `children` are what every instance shows; its `transform` is ignored, its `layout.size` and `layoutItem` are only what a new instance starts with. A nested instance inside `content` is stored with `symbol` and no children (it is expanded from its own master); a master that contains itself loads that reference as a plain group with a warning. The masters are not on the canvas |
| `kit` | boolean | optional (default `false`; written only when `true`). The project is a **component kit**: the app offers its `symbols` in New document → Wireframe → "Start with components from" and lists it first in Import components (Properties → Project → Use as component kit; `designer wf kit`). A project made from a kit is not a kit itself. A value that is not a boolean is ignored with a warning |
| `flows` | `{ id, from, to, label?, part?, symbol? }[]` | optional. Flow arrows: tapping the node `from` (an element inside a screen frame; for a component, the instance's id) opens the logical screen `to` (`screens[].id`, not a frame: the app points the arrow at the variant with the source's platform, else the first). `label` is an optional short text on the arrow. `id` defaults to a new one. `part`: the flow starts at a **part** of the component instance `from` (a bottom navigation item `"item:2"`, a tab, a back button `"back"`, a dialog's `"primary"` action; keys come from the component's definition, `designer wf components` lists them); when the instance's list changes in the app, part flows follow their items. `symbol`: the flow is defined in that shared component's master (`symbols[].id`) and `from` is a node of its `content`: it applies to **every instance** (a tab bar linked once for all screens). A flow whose `from` node (in the canvas, or in the master's content with `symbol`), master or `to` screen is not in the file is dropped with a warning; deleting the element or the screen in the app removes its flows. The arrows are drawn by the app, never part of a screen export |

Wireframe fields of nodes (optional; on a document without `wireframe` they are ignored with a warning):

| Field | On | Notes |
| --- | --- | --- |
| `screen` | top-level `group` only | a **screen frame**: `{ screenId, platform, width, height }`. `platform`: `phone` (390 wide, min height 844), `tablet` (820 / 1180) or `desktop` (1440 / 900), default `phone`. `width` defaults to the platform width; `height` is recomputed on open: max(platform minimum, content bottom). `screenId` names the logical screen (a new one when missing). At most one frame per platform per logical screen: a second one becomes its own logical screen "<name> copy". The group's `transform` places the frame's **top-left corner** (frames are never rotated or scaled); children use the frame's local space (origin = top-left). Content is clipped to the frame in exports |
| `component` | `group` | a **component instance**: `{ kind, props, size? }`. `kind` names a library component (`src/wireframe/library/<kind>`: `heading`, `button`, `list-row`, `placeholder`, …; the Components tab of the Assets panel lists them); `props` its prop values (missing props take the definition's defaults; see [Component props](#component-props)); `size` `{ width, height }` the box it was built for (default: the component's size); `resolved` (generated, e.g. `{ "selected": 2 }`) what a prop set to `"auto"` resolved to on this screen. The children are **generated** from `kind` + `props` + `size` and rewritten on open, so edit props, not children. An unknown `kind` (a file from a newer version) loads as a plain group with a warning |
| `layout` | `group` | a **stack or grid** (a screen frame can be one: its content is then laid out): `{ kind: "vstack" \| "hstack" \| "grid", gap?, padding?, align?: "start" \| "center" \| "end" \| "stretch", columns?, size? }` (defaults 0, 0, `stretch`, 2 for a grid). The children's positions (and the frame's `height`, or the container's `size` `{ width, height }`, its box with local origin at the top-left) are **recomputed on open**; edit the order of `children` and the fields, not the transforms. New screens are vertical stacks (phone: padding 16, gap 12; tablet 24 / 16; desktop 32 / 24; align `start`). A screen without `layout` keeps free content. Stacks and grids (not screens) also take `style?: "none" \| "outline" \| "filled" \| "outline-filled"` (a lo-fi look: 1 px light-grey border, light-grey fill, or both; default `none`), `radius?: "none" \| "small" \| "large"` (8 / 16 px corners, default `none`) and `repeat?: { count }` (1–50): the **first child is a template** repeated `count` times; the `count − 1` copies after it are **generated** (rewritten on open, marked `repeatCopy`; edit the template). An empty stack keeps a minimum size (160 × 64) |
| `repeatCopy` | any node inside a repeating stack | marks a **generated repeat copy**: `{ template, index }` (`template` = id of the container's first child, `index` 2…count). Its ids are the template's behind a `<template id>~r<index>~` prefix. Copies are rewritten (or removed when the container no longer repeats) on open; at the top level the field is ignored with a warning |
| `symbol` | `group` | a **shared component instance**: `{ id }` names a master in `wireframe.symbols`. Its children are a **materialized** copy of the master's content: ids are the master's behind a `<instance id>~s~` prefix (a node added inside one instance in the app keeps its own id in that instance), and they are rewritten from the master on open when they differ (so edit the master's `content` to change every instance). Per instance: the group's own id, name, `transform`, `layoutItem`, `layout.size`, visibility, lock and opacity; everything else follows the master. An unknown `id` (or `symbol` on a screen frame, component or note) loads as a plain group with a warning. Repeat copies of an instance keep the field (they follow their template) |
| `note` | top-level `group` only | a **note** (sticky): `{ text, target? }`. `text` defaults to `""`; `target` is the id of the node it is attached to (any node: screen, component, shape; omit for a free note, and it is cleared on open when that node no longer exists). The sticky and its text are **generated** children (rewritten on open; edit `text`). Notes stay on the canvas (never adopted into a screen), are unscaled and unrotated, and are left out of screen exports (PNG/SVG per screen, `to-png`); the connector line to the target is drawn by the app, not stored. Not together with `screen` / `component` |
| `layoutItem` | any node | how the node sits in its parent's layout: `{ width?, height?: "fill" \| "hug" \| number, position?: "flow" \| "pinned-bottom" \| "free", bleed?: boolean }`. `bleed` (edge to edge): the node ignores the stack's cross-axis padding (sides in a vertical stack, top and bottom in a horizontal one; not in grids); default from the component (list rows: `true`). Defaults: a component's own `sizing` (most fill the width and hug their height), a nested stack fills the width and hugs its height; plain shapes always keep their size and are only moved. `pinned-bottom` (direct children of a screen): stacked at the bottom of the screen (its minimum height or the content, whichever is lower), full width. `free`: absolute position, ignored by the stack. See `src/wireframe/layout.ts` for the exact rules |

#### Component props

Each component declares its props (`src/wireframe/library/<kind>/index.ts`); the types are:

| Type | JSON value | Notes |
| --- | --- | --- |
| `text`, `multiline` | string | `multiline` keeps `\n` line breaks |
| `number` | number | clamped to the prop's `min`/`max`. The `selected` prop of bottom navigation, tabs, segmented control, sidebar navigation and the web header also takes `"auto"` (their default): the item whose part opens the screen the component is on is drawn selected, else the first |
| `boolean` | `true` / `false` | |
| `choice` | one of the listed strings | e.g. `button.variant`: `"primary"`, `"secondary"`, `"text"` |
| `icon` | string | an icon from the app's libraries: `"lucide:Heart"`, `"iconify:ph:heart"`; shorthands `"heart"`, `"arrow-right"` (Lucide) and `"ph:heart"` (Iconify) are accepted; `""` = no icon |
| `list` | array of strings | e.g. tab labels, table columns |

Props are checked on open: a value of the wrong type or outside a `choice` is dropped (the default applies) and a number
out of range is clamped, each with a warning naming the JSON path (`children[0].children[2].component.props.trailing:
expected one of …`). Unknown prop names are kept as they are (a newer version may use them). A file never fails to open
because of a prop value.

Starter components (phase 1):

| `kind` | Props |
| --- | --- |
| `heading` | `text`; `level` `title` / `heading` / `subheading`; `align` `left` / `center` / `right` |
| `button` | `label`; `variant` `primary` / `secondary` / `text`; `icon` (before the label) |
| `list-row` | `title`; `subtitle`; `leading` `none` / `icon` / `avatar`; `leadingIcon`; `trailing` `none` / `chevron` / `toggle` / `value` / `checkbox`; `value` (trailing text); `checked` (toggle/checkbox state); `divider` |
| `placeholder` | `label`; `height` (a grey box with an X; the foundation's stand-in, not listed in the library, still valid in files) |

Icons are drawn from the glyphs stored in the instance's children, so a file shows its icons anywhere (the CLI
included). An instance created outside the app (the CLI, a hand-written file) draws a placeholder square until the
app loads the icon library.

Errors name the path (`children[0].screen.platform: expected one of "phone", "tablet", "desktop", got "watch"`,
`children[0].children[1].screen: screen frames must be top-level objects`). `designer new --preset wireframe`
and `designer screen` write these fields for you (see [`agents.md`](agents.md#wireframes)).

## Nodes

Every node has these common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"group" \| "path" \| "rect" \| "ellipse" \| "polygon" \| "text" \| "image"` | **required** |
| `id` | string | optional; duplicates are renewed |
| `name` | string | optional (default: the type); shown in Layers |
| `visible` | boolean | optional (default `true`); hidden nodes are not exported |
| `locked` | boolean | optional (default `false`) |
| `reference` | boolean | optional; tracing reference: drawn, never hit-tested, snapped to or exported |
| `opacity` | number 0..1 | optional (default `1`) |
| `blendMode` | string | optional; a CSS `mix-blend-mode` value (`multiply`, `screen`…) |
| `transform` | [Transform](#transform) | optional (default identity) |
| `screen`, `component`, `layout`, `layoutItem`, `note`, `repeatCopy`, `symbol` | object | optional; [wireframe documents](#wireframe-documents) only |

Painted nodes (`path`, `rect`, `ellipse`, `polygon`, `text`) also have:

| Field | Type | Notes |
| --- | --- | --- |
| `fill` | [Paint](#paints) | optional (default `none`) |
| `stroke` | [Stroke](#strokes) | optional (default: no stroke) |

### Transform

```json
{ "x": 64, "y": 64, "rotation": 0, "scaleX": 1, "scaleY": 1 }
```

All optional: `x`, `y`, `rotation` default to 0, `scaleX`, `scaleY` to 1. Flips are negative
scales.

### rect

Centered on its origin; `radius` rounds the corners (optional, default 0).

```json
{ "type": "rect", "name": "Background", "width": 112, "height": 112, "radius": 24,
  "transform": { "x": 64, "y": 64 },
  "fill": { "kind": "solid", "color": "#2f6fb5" } }
```

### ellipse

Centered on its origin; `rx`, `ry` are the radii. A circle has `rx == ry`.

```json
{ "type": "ellipse", "rx": 8, "ry": 8, "transform": { "x": 96, "y": 32 },
  "fill": { "kind": "solid", "color": "#ffffff" } }
```

### polygon (and star)

Centered; first vertex points up. `sides` ≥ 3, `radius` = distance to the vertices. With
`innerRadius` it is a star with `sides` points.

```json
{ "type": "polygon", "sides": 5, "radius": 40, "innerRadius": 18,
  "transform": { "x": 64, "y": 64 }, "fill": { "kind": "solid", "color": "#f5b301" } }
```

### path

`subpaths` is a list of contours; each is a list of Bézier points and `closed`. Every point is an
anchor `x, y` with optional handles `in` (control point arriving at this anchor) and `out` (control
point leaving it), **absolute** in the same local coordinates (not relative to the anchor). A
segment from point A to point B is a cubic `C A.out B.in B` (a missing handle = the anchor itself,
so two points without handles make a straight line).

`type` (optional, default `corner`) tells the editor how to move handles: `corner` independent,
`smooth` collinear, `symmetric` collinear and same length. `fillRule`: `nonzero` (default) or
`evenodd` (holes).

The SVG `M32 96 C32 60 64 32 96 32` (a stroke-only curve):

```json
{ "type": "path", "name": "Curve",
  "subpaths": [{ "closed": false, "points": [
    { "x": 32, "y": 96, "type": "corner", "out": { "x": 32, "y": 60 } },
    { "x": 96, "y": 32, "type": "corner", "in": { "x": 64, "y": 32 } }
  ] }],
  "fill": { "kind": "none" },
  "stroke": { "paint": { "kind": "solid", "color": "#ffffff" }, "width": 10, "cap": "round", "join": "round", "dash": [] } }
```

A closed triangle with a hole (evenodd):

```json
{ "type": "path", "fillRule": "evenodd", "fill": { "kind": "solid", "color": "#000000" },
  "subpaths": [
    { "closed": true, "points": [ { "x": 64, "y": 16 }, { "x": 112, "y": 104 }, { "x": 16, "y": 104 } ] },
    { "closed": true, "points": [ { "x": 64, "y": 56 }, { "x": 80, "y": 88 }, { "x": 48, "y": 88 } ] }
  ] }
```

Tip: writing the shape as SVG and running `designer from-svg` is usually easier than writing points
by hand; arcs, `<circle>`, `<rect>` and transforms are converted for you.

### group

```json
{ "type": "group", "name": "Mark", "transform": { "x": 0, "y": 0 },
  "children": [ { "type": "ellipse", "rx": 4, "ry": 4, "transform": { "x": 10, "y": 10 } } ] }
```

Children are drawn inside the group's transform and opacity. Nesting is limited to 64 levels.

### text

```json
{ "type": "text", "text": "Hello\nworld", "fontFamily": "Inter", "fontWeight": 700,
  "fontStyle": "normal", "fontSize": 24, "letterSpacing": 0, "lineHeight": 1.2, "align": "center",
  "transform": { "x": 64, "y": 40 }, "fill": { "kind": "solid", "color": "#111111" } }
```

| Field | Notes |
| --- | --- |
| `text` | **required**; `\n` breaks lines |
| `fontSize` | **required**, px |
| `fontFamily` | optional (default `Inter`). Bundled: Inter, Space Grotesk, Montserrat, Archivo Black, Bebas Neue, Playfair Display, DM Serif Display, Lora, JetBrains Mono, Pacifico; or a font the user uploaded |
| `fontWeight` | optional, 100..900 (default 400) |
| `fontStyle` | optional, `normal` \| `italic` |
| `letterSpacing` | optional, px between characters (default 0) |
| `lineHeight` | optional, multiple of `fontSize` (default 1.2) |
| `align` | optional, `left` \| `center` \| `right` (where the origin sits) |

Exports (and `designer to-svg`) convert text to outlines with the real font files.

### image

Centered; `href` is a data URL (`data:image/png;base64,…`).

```json
{ "type": "image", "href": "data:image/png;base64,iVBORw0…", "width": 64, "height": 64,
  "transform": { "x": 64, "y": 64 } }
```

## Paints

```json
{ "kind": "none" }
{ "kind": "solid", "color": "#2f6fb5" }
{ "kind": "solid", "color": "#2f6fb580" }
{ "kind": "linear", "angle": 90, "stops": [ { "offset": 0, "color": "#2f6fb5" }, { "offset": 1, "color": "#7fb3e8" } ] }
{ "kind": "radial", "stops": [ { "offset": 0, "color": "#ffffff" }, { "offset": 1, "color": "#ffffff00" } ] }
```

- Colors are `#rrggbb` or `#rrggbbaa` (alpha last). Named colors and `rgb()` are not accepted in
  the file (the SVG importer converts them).
- Gradients span the node's bounding box. `offset` is 0..1. `linear.angle` is in degrees (0 = left
  to right, 90 = top to bottom; optional, default 0). Radial gradients are centered.

## Strokes

```json
{ "paint": { "kind": "solid", "color": "#000000" }, "width": 2, "cap": "round", "join": "round", "dash": [6, 4] }
```

| Field | Notes |
| --- | --- |
| `paint` | **required** [Paint](#paints); `{ "kind": "none" }` = no stroke |
| `width` | **required**, px; strokes do not scale with the node |
| `cap` | optional, `butt` (default) \| `round` \| `square` |
| `join` | optional, `miter` (default) \| `round` \| `bevel` |
| `dash` | optional, SVG dash array (`[]` = solid) |

## A complete minimal file

```json
{
  "$schema": "https://designer.hfps.dev/schema/designer-project.schema.json",
  "schemaVersion": 1,
  "name": "Dot",
  "artboard": { "width": 128, "height": 128 },
  "children": [
    { "type": "rect", "width": 112, "height": 112, "radius": 28, "transform": { "x": 64, "y": 64 },
      "fill": { "kind": "linear", "angle": 90, "stops": [ { "offset": 0, "color": "#2f6fb5" }, { "offset": 1, "color": "#1d4f86" } ] } },
    { "type": "ellipse", "rx": 20, "ry": 20, "transform": { "x": 64, "y": 64 }, "fill": { "kind": "solid", "color": "#ffffff" } }
  ]
}
```

`designer validate dot.designer.json` → `ok   dot.designer.json: “Dot”, 128×128, 2 objects`.
