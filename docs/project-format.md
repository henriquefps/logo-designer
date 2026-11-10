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

### Artboard

| Field | Type | Notes |
| --- | --- | --- |
| `width`, `height` | number > 0 | **required** |
| `background` | [Paint](#paints) | optional (default `{ "kind": "none" }` = transparent) |

### Icon settings

Optional `icon` field, used by the icon mode (preview masks, exports for launchers and favicons):

```ts
icon?: {
  preset: 'app-icon' | 'android-adaptive' | 'ios' | 'favicon-32' | 'favicon-16';
  shape: 'auto' | 'circle' | 'square' | 'wide' | 'tall';
  smallGlyphProjectId?: string; // another project used as the glyph at 16/32 px
}
```

`designer new --preset <preset>` and `designer from-svg --icon <preset>` write it with
`shape: "auto"`. Artboard sizes the CLI uses: `app-icon` and `ios` 128, `android-adaptive` 108,
`favicon-32` 32, `favicon-16` 16. (The field is in the schema now; the app reads it once icon mode
lands. Until then the app keeps working and ignores it.)

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
