# Designer: wireframe mode (spec)

Contract for the workers who build wireframe mode. Read `docs/rebuild-spec.md` and
`docs/architecture.md` first; this file only adds to them. Where it says "decided", don't redesign:
ask the coordinator.

## What it is

A second kind of Designer document for **planning the UI of an app before an AI (or a person)
builds it**. The user lays out screens on an infinite canvas, using a library of ready-made lo-fi
wireframe components, connects them with flow arrows, writes notes, and exports the whole thing as
a package an AI agent can read: "these screens, this flow, this is how I want them".

Visual style does not matter (the AI decides that later). Structure, content and flow do. That
drives most decisions below.

What this is **not**: a Figma clone. No constraints system, no component variants, no colour
themes, no prototyping animations. If a feature needs one of those, it is out of scope.

## Phases

Each phase is useful on its own and ships as one or more PRs.

1. **Base** (this spec, in detail below): wireframe document, infinite canvas, screens, semantic
   components, stack/grid layout, component library (common, mobile, desktop), notes, export
   package.
1.5. **Refinements** from the first real use (2026-11-19, detailed below): sizes that follow,
   containers as library elements, container appearance, repeat (lists of anything).
2. **Flow**: arrows from an element to a screen; dropping an arrow on empty canvas offers "New
   screen"; present mode (click through screens like a prototype); shared components (edit the top
   bar once, every screen updates); screen status *current / changed / new*.
3. **Agents** (detailed below, with live editing): wireframe commands in the `designer` CLI and the `designer` skill, so a Claude Code
   session can create screens, read the flow and turn a screenshot into a wireframe (the manual
   experiment of 2026-11-19 automated).
4. **AI in the app, through your own agent** (decided 2026-11-20, detailed below): the app asks
   Henrique's Claude Code (his subscription, on a machine of his) through the sync server; no API
   keys in the browser. Features: screenshot → wireframe, "Generate with AI" when dropping a flow
   arrow, "Adapt this screen to tablet/desktop", and a free request box. (Browser bring-your-own-key
   for other users is deferred.)
5. **Later**: AI suggestions (shared components, automatic current-vs-proposed diff).

Phases 2–5 get their own detailed sections when they start. Phase 1 must not block them: the model
below already reserves what they need.

## Decisions (phase 1)

### A separate document kind

- A wireframe document is a `DesignDocument` with `wireframe: WireframeDocInfo` (like `icon` marks
  app icon documents). It is created from **New document → Wireframe** (and `designer new --preset
  wireframe`). The dialog asks for a name and the first screen's platform (phone by default), so
  creating is one click after picking the mode. A logo document cannot be turned into a wireframe and back; they are different tools.
- In a wireframe document the **artboard is not drawn and not used**: the canvas is infinite. Keep
  the `artboard` field (schema compatibility) with any value; nothing in wireframe mode reads it.
  Fit to view (Cmd+0) fits the content. Grid, rulers, snapping and zoom work as today, against the
  content instead of the artboard.

### Screens

- A **screen** is a top-level node on the canvas that looks like a device frame: white background,
  thin border, its name above it. Content lives inside it and is clipped to it on export.
- Platforms, kept deliberately few (decided, no device list, no orientations, no foldables):

  | Platform | Width | Minimum height |
  | --- | --- | --- |
  | `phone` | 390 | 844 |
  | `tablet` | 820 | 1180 |
  | `desktop` | 1440 | 900 |

  The width can still be typed in the properties panel for an odd case. **Height grows with the
  content** (a long settings page is one tall screen); it never goes below the minimum.
- **Logical screens and variants.** The document keeps a list of logical screens (`Settings`,
  `Gallery`). Each logical screen has **one or more** frames, at most one per platform. Only one is
  required: most screens will exist for one platform only. "Duplicate as tablet/desktop" creates
  another variant of the same logical screen next to it (a plain copy; nothing is converted, the
  user rearranges it). Flow arrows (phase 2) point at the logical screen. The export groups variants
  under their logical screen.
- Screens are placed freely on the canvas. They are not auto-arranged.

### Semantic components

The core decision. A wireframe element **knows what it is**, so the export is a precise spec and
not a drawing to interpret, and so AI (phases 3–4) builds with the same pieces.

- A component instance is a node with `component: { kind, props }`: e.g.
  `{ kind: 'list-row', props: { title: 'Language', subtitle: 'English', trailing: 'chevron' } }`.
  The user edits **props in the properties panel**, not the shapes.
- **Materialized, not virtual.** The instance is a `group` whose children are generated by the
  component's `build(props, size)` from the library. They are stored in the document like any group.
  So rendering, bounds, hit-testing, SVG/PNG export and the CLI keep working unchanged. Changing a
  prop rebuilds the children. The generated children cannot be selected or edited one by one
  (clicking selects the component). **Detach** (Object menu) turns an instance into a plain group of
  shapes for the rare case where the library isn't enough.
- Components are discovered from folders (`import.meta.glob`), one folder per kind, so workers adding
  components never edit a shared list:

  ```ts
  // src/wireframe/library/<kind>/index.ts
  export default defineComponent({
    kind: 'list-row',
    label: 'List row',
    platforms: ['phone', 'tablet'],            // where the library panel shows it first; 'all' = common
    category: 'Lists',
    props: {                                    // drives the generated properties section
      title: { type: 'text', label: 'Title', default: 'Title' },
      subtitle: { type: 'text', label: 'Subtitle', default: '' },
      trailing: { type: 'choice', label: 'Trailing', options: ['none', 'chevron', 'toggle', 'value'], default: 'chevron' },
    },
    sizing: { width: 'fill', height: 'hug' },  // default behaviour inside a stack
    build(props, { width }) { /* returns { children: SceneNode[], height } */ },
    describe(props) { /* one line for the export, e.g. 'List row "Language" → value "English"' */ },
  });
  ```

  Prop types for phase 1: `text`, `multiline`, `number`, `boolean`, `choice`, `icon` (a name from the
  icon libraries already in the app), `list` (a list of strings, e.g. tab labels or table columns).
- **One fixed lo-fi style** (decided): black, white and a few greys from one style module
  (`src/wireframe/style.ts`), Inter, 1 px strokes, images as a grey box with an X, body text that is
  not real content as grey bars, real labels kept as text. No colours, no themes, no per-component
  styling. Notes are the only thing with an accent colour.

### Layout: stacks and grids

Screens are stacks. Absolute positioning makes inserting a row in the middle of a screen painful, so:

- Three container kinds, also materialized groups with `layout` metadata: **vertical stack**,
  **horizontal stack**, **grid** (N columns). Props: gap, padding, alignment; grid adds columns.
- A screen's root is a vertical stack by default (a desktop screen with a sidebar is a horizontal
  stack of sidebar + vertical stack).
- Children size as `fill` (take the available width/height in the stack direction or across it),
  `hug` (their content) or a fixed number. The component's `sizing` gives the default; the user can
  change it per instance.
- Two escape hatches, both needed by real screens: **pinned to bottom** (bottom navigation, a bottom
  action bar: placed at the bottom of the screen's minimum height or of the content, whichever is
  lower) and **free** (FAB, modal, bottom sheet, a badge: absolute position inside the screen,
  ignored by the stack).
- Layout is a **pure function** (`src/wireframe/layout.ts`, Vitest-tested) that writes the computed
  transforms (and screen height) into the document as part of the same undoable change. Layout is
  never computed at render time.
- Editing: dragging a child inside a stack reorders it (an insertion line shows where it lands);
  dropping a library component on a stack inserts it at that point; dragging it out of every stack
  into the screen makes it free (with a modifier, so it doesn't happen by accident).

### Library (phase 1 content)

The library panel lists components by category and shows first the ones for the platform of the
selected screen (all of them stay reachable). Click inserts into the selected stack; drag drops at
a point.

- **Common**: heading, text, paragraph (grey bars), button (primary / secondary / text), text field,
  text area, select, checkbox, radio group, toggle, slider, image, avatar, icon, chip/tag, divider,
  card, progress bar, empty state, search field.
- **Phone and tablet**: top app bar (title, back, actions), bottom navigation, tabs, list row (title,
  subtitle, leading icon/avatar, trailing chevron/toggle/value/checkbox), section header, FAB,
  bottom sheet, dialog, snackbar, image grid, segmented control.
- **Web and desktop**: header with navigation, sidebar navigation, breadcrumbs, data table (columns,
  rows), modal window, form in columns, pagination, toolbar, footer, cards grid.

### Notes

A note is a sticky (accent background, short text) placed anywhere on the canvas, optionally
**attached to a node** (a thin line to it; it follows the node). Notes describe behaviour that can't
be drawn ("pull to refresh", "only visible offline"). They are not part of screen exports (PNG/SVG)
but are part of the AI export, next to the element they are attached to.

The connector (dashed, canvas and `wf sheet`) is a straight line while it crosses no screen other than its target's;
otherwise it is routed like a flow arrow (Arrow routing below: frames hard, other notes soft), enters the target's
screen from a side and runs to the target, so a note beside one screen never cuts through the next one
(`connectorPoints`, 2026-11-20).

### Export package

File → Export → **For AI** (and `designer wireframe export` in the CLI, phase 3) produces a zip
(`jszip` is already a dependency):

```
<project>/
  README.md                 index: logical screens, platforms, notes not attached to a screen
  screens/<slug>.md         per logical screen: each variant's component tree (indented, from
                            describe()), its notes next to the elements
  screens/<slug>.<platform>.png
  project.designer.json     the editable project
```

Phase 2 adds the flow (a list and a Mermaid diagram) and screen status. **Copy for AI** puts the
markdown of the whole project (no images) on the clipboard. Write the markdown for an AI reader:
plain, structured, no decoration.

### File format

- `WireframeDocInfo`: `{ screens: { id, name }[] }` in phase 1; phase 2 adds `flows`, status and
  shared components there. Screen frames carry `screen: { screenId, platform }`; instances carry
  `component`; containers carry `layout`; the fields are optional on `NodeBase` and ignored by
  non-wireframe code.
- `src/io/projectFile.ts` validates them (errors name the JSON path, like today), the JSON Schema is
  regenerated (`scripts/gen-schema.ts`), and `docs/project-format.md` documents them.
- Unknown component kinds (a file from a newer version) load as plain groups with a warning, never
  fail.

### As built (foundation, workstream 1)

Details the foundation settled, for the next workstreams (code map and APIs: `docs/architecture.md` →
Wireframe mode):

- A frame is a top-level `group` with `screen: { screenId, platform, width, height }` (the group has no size of
  its own, so the frame carries it); `height` is written by the pipeline. Instances carry
  `component: { kind, props, size? }` (`size` = the box they were built for). Children of a layout carry
  `layoutItem: { width?, height?, position? }` next to the container's `layout`.
- Adding screens: the **Screen tool (F)** places a frame where you click (platform in the options bar), Object →
  Add screen ▸ and the Screens section of Properties add one to the right of everything; Object → Duplicate
  screen as ▸ and the Screen section add variants. Click a frame's name label to grab the whole frame.
- Objects dropped on a frame become its children; dragged off, they go back to the canvas (or to the frame they
  land on). A plain duplicate of a frame (⌘D, Alt-drag) becomes a new logical screen "<name> copy". ⌘D / Edit →
  Duplicate puts the copy beside the original (to its right with the usual screen gap, moved further right past any
  frame or note in the way, same top) and brings it into view; Alt-drag leaves it where it is dropped. Other nodes keep
  the small 10 px offset.
- `designer new --preset wireframe` (empty), `designer screen` (add a screen or a variant), `to-png` (one PNG per
  frame, `<slug>.<platform>.png`, the export package's naming) and `to-svg --screen` exist; see `docs/agents.md`.

- Notes (workstream 4): a top-level `group` with `note: { text, target? }`, generated children, kept out of
  screens by `adopt`; connector = canvas overlay; Note tool **K**; `notesFor(doc)` (`src/wireframe/notes.ts`) for
  the AI export. See architecture.md → Notes.

### As built (component system, workstream 3)

- Components are authored with the kit in `src/wireframe/kit.ts` and the tokens in `style.ts`; the authoring guide
  with a complete example is in `docs/architecture.md` → Wireframe mode → Adding a component. A contract test runs
  on every component in the library.
- Icon props hold the Icons panel's keys (`lucide:Heart`, `iconify:ph:heart`). The glyph is stored in the
  instance's children like everything else, so files keep their icons in the CLI and offline; instances made
  outside the app show a placeholder square until the app loads the icon.
- Bad prop values in a file fall back to the default with a warning; a number out of range is clamped.
- Library: Assets → Components (wireframes only). Click appends to the selected screen (or the selected stack, or
  after the selected object in a stack); drag drops at the point (into the stack under the pointer, at that
  point, with the insertion line; freely on a screen without a layout). Starter kinds: `heading`, `button`, `list-row`; the
  foundation's `placeholder` is hidden from the library (older files still load and render it). Fields that don't
  apply are hidden (`visibleWhen`: a list row's Icon only for a leading icon, Value only for a value, On only for a
  toggle or checkbox). Instances are not styled, rotated or flipped by the user; resizing rebuilds them.
- Instances are one object everywhere (canvas click in their whole box, Cmd-click, Layers). Object → Detach
  component (⌥⌘B) or the Detach button in Properties turns one into a plain group.

### As built (library: web and desktop, workstream 5c)

Kinds (`src/wireframe/library/<kind>`): `web-header` (Header with navigation: logo, links + selected position,
optional search / actions / avatar; bleed), `sidebar-nav` (width 240, height fill; items with `#` entries as section
labels, selected = position among items, optional icon slots, optional title), `breadcrumbs`, `data-table`
(columns, rows, checkbox column, row actions; real header labels, grey-bar cells), `modal` (width 480, 1–2 actions,
close button; set Position → Free to float it), `form-columns` (1–3 columns of label + input), `pagination`
(pages, current, align), `toolbar` (action labels, optional icons / title / search; bleed), `footer` (headings,
links per column, logo, legal row; bleed), `cards-grid` (columns, rows, card style image / text / horizontal).
Categories Navigation, Data, Overlays, Forms, Layout. A desktop screen with a sidebar: the screen frame is a
vstack with padding 0, holding the header and an hstack (`align: stretch`) of `sidebar-nav` (fill height) and a
content vstack (`fill` × `fill`, padding 24); see `library/__tests__/desktopScreen.ts` and
`docs/screenshots/wireframe-library-desktop.png`. Kit additions: `iconSlot`, `searchBox`, `buttonBox`.

### As built (library: phone and tablet, workstream 5b)

- `top-app-bar` (title, leading none/back/menu/close, 0–3 action icons, large title), `bottom-navigation`,
  `tabs`, `segmented-control` (list of labels + 1-based selected index; bottom navigation has an icon prop per tab,
  up to 5), `section-header`, `fab` (a label makes it extended), `bottom-sheet`, `dialog` (main action + optional
  other), `snackbar`, `image-grid` (columns 2–4, rows, gap; a fixed height shares the rows). Bars, rows, tabs, headers
  and the sheet are `bleed`.
- Definitions can declare a default position, `placement` (see architecture.md → Adding a component): bottom
  navigation is pinned to the bottom; FAB (bottom right), snackbar (bottom), bottom sheet (bottom edge) and dialog
  (centred) are free, placed by `defaultPlacement()` when inserted on a screen.

### As built (layout, workstream 2)

- Screens are vertical stacks by default: phone padding 16 / gap 12, tablet 24 / 16, desktop 32 / 24, align
  start. A frame without `layout` (older files, "Make the content free") keeps free content. Object → Vertical
  stack / Horizontal stack / Grid wraps the selection (on a free screen: makes its content a stack); Remove stack
  unwraps.
- Containers are groups with `layout` (and a materialized `layout.size`, their box). Defaults for a new one:
  vstack gap 12, hstack gap 8 align center, grid gap 12 align stretch 2 columns; no padding. In a stack a
  container fills the width and hugs its height.
- Plain shapes inside a stack keep their size (only components and containers are sized); pinned-bottom children
  span the full frame width, edge to edge (bars), and only apply to direct children of a screen (elsewhere they
  are flow); free children don't count for the screen height.
- Modifier to take a child out of every stack: **⌘ / Ctrl** while dropping (Alt is duplicate-drag). Resizing a
  child inside a stack makes that dimension fixed.
- Edge to edge: `layoutItem.bleed` (default from the component's `sizing.bleed`; list rows have it) makes a flow
  child ignore the stack's cross-axis padding, so bars and rows span a padded screen. Properties → In stack → Edge
  to edge.
- Stacks are not painted, rotated or flipped by the user (like instances); children in a stack's flow are not
  rotated either (free children can be).

### Mobile layout

Desktop-first, like the rest of Designer. On a phone a wireframe can be viewed, moved around and
edited through the properties panel; drag-and-drop insertion can be desktop-only.

## Phase 1 workstreams

Order and ownership, for the coordinator. Each ends in a PR against `main`.

1. **Foundation** (first, alone): `wireframe` document kind, New document → Wireframe, infinite
   canvas, screen node (platforms, min height, name label, variants, Duplicate as…), file format +
   validation + schema + docs, the materialization pipeline (a post-change step where layout and
   component builds run) with a trivial stand-in component to prove it, PNG/SVG export of one
   screen, `designer new --preset wireframe`.
2. **Layout** (after 1, in parallel with 3 and 4): stacks, grid, sizing, pinned/free, the pure layout
   function with tests, reorder/insert by drag, container properties section.
3. **Component system** (after 1): `defineComponent`, the registry, the generated properties section,
   the library panel (assets source `wireframe`), insert by click/drag, Detach, and three starter
   components (heading, button, list row) that prove the contract.
4. **Notes** (after 1).
5. **Library content** (after 2 and 3): common, phone/tablet, web/desktop. Can be split in three.
6. **Export for AI** (after 3): the zip, Copy for AI, the markdown format.

## Phase 1.5: refinements (from the first real use, 2026-11-19)

Henrique built a screen and hit three gaps. They come before phase 2 because they change how every
screen is built.

### R1. Sizes that follow (no silent no-ops)

Today a card resized to a taller height keeps drawing its border at its content height: `build()`
ignores `size.height`. Rule (decided): **every component either follows the size it is given or
says it can't.**

- A definition declares which axes the user can size: `resizable: { width: boolean; height: boolean }`
  (defaults: width true, height false). When height is resizable and the parent or the user fixes it
  (`layoutItem.height` = number or `fill`), `build(props, { width, height })` must use it: the surface
  (border, background) takes the whole box; content keeps its natural place (top for a card,
  centred for an empty state, the image fills an image's box).
- Components that are surfaces get resizable height: card, image, text area, empty state, dialog,
  modal, bottom sheet, sidebar navigation, data table (more empty rows), cards grid, image grid,
  paragraph (more bars), and any other where a taller box has an obvious meaning.
- Where an axis is not resizable, the UI says so: no handle for that axis, and the W/H field is
  read-only with a short hint ("Height follows the content").
- The contract test checks it: for every component, building with a larger height either produces a
  taller drawing (resizable) or the definition declares the axis fixed.

### R2. Containers are library elements

Stacks and grids exist but only as Object → Vertical stack (wrapping a selection), which nobody
finds. Add a **Layout** category at the top of the library panel with **Vertical stack**,
**Horizontal stack** and **Grid**: insert an empty container and drop elements into it; they arrange
themselves by the container's kind (like SwiftUI's VStack/HStack). Requirements:

- An empty container shows a dashed outline with "Drop elements here" on the canvas (never exported)
  and has a minimum size so it can be targeted.
- Dropping into nested containers works at any depth (the innermost container under the pointer
  wins; the insertion line shows where).
- Wrap selection stays (Object menu) and gets shortcuts; also "Change to horizontal / vertical / grid"
  on a selected container.
- Containers can be resized like components (fixed width/height or fill/hug, per R1).

### R3. Container appearance (custom cards)

To build a custom card the user needs a container that looks like a card. Containers get a lo-fi
**style**: `none` (default), `outline` (1 px border), `filled` (light grey), `outline + filled`, plus a
corner radius (0 / small / large from the style tokens). Still no colours. The library's Layout
category includes **Card container** (a vertical stack with outline, radius, padding 16, gap 8).
The export describes it ("Card container (outlined): …children").

### R4. Repeat: lists of anything

"A list of my custom card, with space between them." Any container can **repeat its first child**:
`layout.repeat: { count: number }`. The first child is the template; the pipeline generates
`count − 1` copies after it (materialized, like component children). Editing the template updates
every copy. Copies can't be selected one by one (clicking one selects the template; Layers shows them
as "Copy 2…n", read-only). The container's gap is the space between items, so vertical = list,
horizontal = carousel, grid = gallery. Properties: "Repeat first item" switch + count. The export
says "List of 6 × (Card container: …)". Turning repeat off keeps only the template.

### As built (R2–R4: containers, appearance, repeat)

- Library → Components → **Layout** (first): Vertical stack, Horizontal stack, Grid, Card container. Click inserts an
  empty one into the selected screen / stack (and selects it, so the next click goes inside); drag drops it into the
  innermost stack under the pointer. An empty container is 160 × 64 at least and shows a dashed "Drop elements here"
  on the canvas only.
- Object menu: Vertical stack **⌥⇧V**, Horizontal stack **⌥⇧H**, Grid **⌥⇧G** (wrap the selection; Alt keeps them clear
  of the tool letters), **Change to vertical stack / horizontal stack / grid** for a selected container.
- Properties → Layout of a stack / grid: **Style** (None, Outline, Filled, Outline + filled), **Corners** (Square,
  Small 8, Large 16), **Repeat** switch (first item, 3 by default) + **Count** (1–50). File format: `layout.style`,
  `layout.radius`, `layout.repeat`, and `repeatCopy` on generated copies (docs/project-format.md).
- Sizes inside containers (2026-11-20, found recording the overview): a definition may declare `minHeight` (the
  shortest box that still shows its content; default its hug height). The image's is a 24 px strip plus its caption,
  so an image can be made shorter than its aspect ratio (it used to be a silent no-op). Resizing a child no longer
  fixes the height of the card and stack around it: the `resize` step counts a node as resized only when its
  `layoutItem` was replaced or (outside a gesture's commit) its box differs from the last output, not when the layout
  reflowed it.
- Copies are generated by a pipeline step (`repeat`, before `layout`), stored like component children, with ids
  derived from the template's. Export for AI: "Card container (outlined)", "List of 6 × (Card container (outlined)),
  each:" followed by the template's content once. See architecture.md → Containers, style, repeat.

## Phase 2: flow (detailed)

### Flows

- Model: `wireframe.flows: { id, from: Id /* any node inside a frame */, to: Id /* logical screen id */, label?: string }[]`.
- Drawing: a selected element inside a screen shows a small **flow handle** (a circle on its right
  edge). Drag from it: dropping on a screen links to that logical screen; dropping on empty canvas
  opens a small menu at the drop point: **New screen** (same platform, placed there, named after the
  source's label, e.g. "Language") and **Generate with AI** (shown disabled with "Coming later" until
  phase 4). A Flow tool is optional; the handle is the main way.
- Arrows are a canvas overlay (never in screen exports): from the source element to a side of the
  target frame, routed around the other screens (see Arrow routing below), with an arrowhead, following moves. When the target logical screen has
  several variants, point at the one with the same platform as the source frame, else the first.
  Selecting an arrow lets you delete it or edit its label. Deleting a source element or a logical
  screen removes its flows (inside the same undo step).
- Properties of a selected element show its outgoing flows ("→ Language"), with remove.

#### As built (flows and status)

- Code map: `docs/architecture.md` → Flows and screen status. Screenshot: `docs/screenshots/wireframe-flows.png`.
- The handle shows for one selected element inside a screen (select tool); releasing on the source's own screen (or
  a click on the handle) links nothing. A second link between the same element and screen reuses the flow. Drop on
  empty canvas → **New screen** puts the frame's top-left at the drop point and selects it. Arrows start at the
  element's right (or left) edge and end on a side of the target frame, with the label on a pill on a clear stretch;
  clicking an arrow selects it (label field and delete under it; Delete / Backspace delete, Escape deselects).
- Properties → Flows lists "→ Screen" rows (click selects the arrow, × removes) and a **Link to screen…** select
  (works without dragging, e.g. on a phone).
- Flows die with their source element or target logical screen (the `flows` step, same undo step); one variant
  deleted is not enough. Duplicate as… gives the copied elements the same flows. Files: unknown `from` / `to` are
  dropped with a warning.
- Status badge: right end of the frame's name strip (Current outlined, Changed filled, New dashed).

#### Arrow routing

An arrow never passes over a screen other than its source and target (it used to be a near-straight curve: with
screens in a row, back arrows ran across every top bar in between). `src/wireframe/routing.ts`, pure geometry shared
by the canvas overlay, arrow picking, the arrow editor and `designer wf sheet`; Present mode has no arrows.

- **Orthogonal routes on gutter lanes.** A short stub leaves the source frame from the element (left or right; up or
  down for a part in a row), the route runs on lanes around and between the frames (frame edges ± a clearance, the
  middles of gutters), and enters the target from its left, right or bottom side. The top is a last resort: the
  screen's name strip is there. Frames are hard obstacles, grown upwards by the name strip (`band`: 30 screen px on
  the canvas, the label strip in the sheet); notes are soft (crossed only when going around costs much more). An A*
  search on the sparse lane grid keeps arrows short with few bends; a self-link loops out of the nearest side.
- **Busy gutters.** Arrows are routed shortest first; a later one pays for running next to earlier ones where the
  gutter is narrow, so it takes another gutter (above or below the row, the other side) when that is cheap.
- **Spreading.** Arrows that share a lane (or close parallel lanes in one gutter) get their own tracks, `gap` apart
  (less in a narrow gutter, twice as much for arrowheads on a frame edge), keeping the clearance from frames when
  there is room. The order follows where two arrows part, so a bundle never crosses itself: back arrows from a row of
  screens to the first one nest, the farthest outermost.
- **Labels** go on the longest clear stretch of their arrow, off frames (and their name strips), notes and other
  labels; the arrow editor opens at the arrow's middle.
- **Cost.** Routing depends on every arrow (busy gutters, spreading), so it is memoized per set of arrow ends and
  frame/note rects (`flowLayout`), and per frozen document state (re-renders and pointer moves cost a lookup). A
  drag that moves no arrow end or frame costs nothing; moving a frame re-routes everything, ~5 ms for the 16 arrows
  of the Hoard benchmark (10 screens). Canvas zoom is quantized to powers of two for the band and spacing, so a
  zoom gesture re-routes only when it crosses one. The sheet's bounds grow to hold arrows routed above or below
  the frames.

### Present mode

View → Present (and a button in the status bar): shows one frame at a time, fitted, on a dark
backdrop. Elements with a flow show a subtle hotspot on hover; clicking one goes to the target
screen (same platform if it exists). Back (← / Backspace / a button) and Esc to leave. Starts at the
selected screen, else the first. A platform switch when variants exist.

Built (`wireframe/present.ts` = pure state machine, `presentStore.ts`, `canvas/PresentMode.tsx`): View → Present, shortcut
**⌥⌘P** (Ctrl+Alt+P), and a Present button in the status bar of wireframe documents. The overlay is read-only and swallows
every other key, so Delete / Cmd+D cannot change the document underneath; Esc restores the editor exactly as it was. Hotspots
are real buttons (keyboard focus and touch work); on touch, tapping the empty part of a screen flashes all hotspots. Hotspots
on repeat copies follow the template's flow. A flow to a screen without a frame of the same platform opens its first variant.

### Screen status

Each logical screen has `status?: 'current' | 'changed' | 'new'` (unset = not stated), set in the
Screen section and shown as a small badge on the frame label. Typical use: import a screenshot as
"current", duplicate it, edit the copy and mark it "changed".

### Shared components (user components)

Select a group, a container or a single library component (a list row, a button) and **Make component**: it becomes a **master** stored in
`wireframe.symbols` and the selection becomes an instance (`symbol: { id }`). Instances are linked
copies: editing the content of any instance updates the master and every instance (a pipeline step
keeps them in sync, in the same undo step). Per instance: position and size, the content of its
**slots** (containers marked "Content per instance") and **overridden text** (see Slots and text overrides below). The library panel lists them under **My components** for inserting on other screens.
**Detach** turns an instance back into plain content. The export describes a shared component once
("Shared: Top bar …") and refers to it by name in each screen. R4's repeat template may be a shared
component.

#### As built (shared components)

- Code map: `docs/architecture.md` → Shared components. Screenshot: `docs/screenshots/wireframe-shared-components.png`.
- **Master storage**: `wireframe.symbols[].content`, a group in the master's own id space, never on the canvas. Its
  `layout` (minus size) and children are shared; its `layout.size` / `layoutItem` are only a new instance's defaults.
- **Instances are materialized**: real children, ids `<instance id>~s~<master id>`, so bounds, hit testing, export, present
  mode and the CLI need nothing special. The content is editable like a group's (double-click to enter, one level per
  double-click); position, size, visibility and the root's name are per instance. What the layout computes inside an
  instance (positions in stacks, sizes of laid-out pieces) is not content, so instances of different widths stay in sync.
- **Make component** (Object menu, context menu, ⌥⇧K, or Properties → Shared component on a group / container): a name
  prompt with the container's own name, else its first label. **Detach** (⌥⌘B, Properties) leaves plain content.
  **My components** is the first section of the library: preview, name, rename, delete (asks first when instances exist;
  they become plain content), click or drag to insert like a library component.
- **One library component**: Make component wraps it first in a hug vertical stack (named after the component) that takes
  its place and size (an edge-to-edge component such as a list row keeps `bleed`, a hugging one such as a button keeps
  its width), and that stack is the master's content: same undo step, same look on the canvas. Properties shows the
  button for it too. A node inside a shared component or a copy cannot be made one.
- ⌘D / Alt-drag / paste of an instance stay linked (same master); their flows follow. Pasted into another document,
  the masters come along (see Kits, import and paste below).
- **Flows inside an instance**: a flow from an element inside an instance belongs to that instance's node only (the
  other instances don't get it). It survives edits made through other instances; deleting the element (in any instance)
  deletes it everywhere and the flow with it.
- A repeat template may be an instance: its copies follow the master. A master may contain other shared components;
  never itself.
- Export for AI: README "Shared components" (each once: its tree and where it is used); screens say "Shared: Trip card".

#### Kits, import and paste (2026-11-20)

Shared components used to live in one project only. A **component kit** is a project whose masters are meant to
be reused: any wireframe becomes one with Properties → Project → **Use as component kit** (nothing selected; stored as
`wireframe.kit: true`, docs/project-format.md; CLI `designer wf kit <file> [--off]`). A bundled sample can be one too
(`kit: true` in `src/samples/registry.ts`; none ships today). Any project with shared components can also be a source
for Import.

- **Import from project…** (Library → My components): pick a source (component kits first: kit samples, then your
  kit projects; then your other projects that have shared components), tick its components (all ticked, each with a
  preview and its full name on up to two lines), Import. The button counts what will come in: the ticked ones plus
  the ones they nest ("Import 12 (2 come along)"), and the toast's title says the same number; its description breaks
  it down (came along, new vs. already there and reused, master links left out). One undo step.
- **New document → Wireframe → "Start with components from"**: None (default) or a kit: every local project marked
  as a kit (synced projects included: they are local copies; the open project with its unsaved state) and any kit
  sample. Hidden, with a one-line hint about the toggle, when there is none. The project starts with the kit's
  masters only (no screens, no notes, not a kit itself), plus its usual first screen.
- **Paste between documents keeps instances**: the clipboard (in-app and the system clipboard's JSON) carries the
  masters of the instances it holds. Pasting into a document that lacks them imports them (same rules) in the paste's
  undo step, and a toast names them. Within the same document nothing changes. An old payload without masters still
  pastes plain groups.
- **Rules** (`src/wireframe/symbolImport.ts`, pure): the chosen masters are copied with fresh master ids, with every
  master they nest (transitively, dependencies first); their content keeps its node ids (the master's own id space).
  A master with the same name (or "Name N") and the same shared content (`masterShape`, node ids ignored, nested
  masters compared through the import) is **reused**, not copied; same name with other content gets "Name 2". So
  importing the same kit twice changes nothing. **Master flows** (links defined on a shared component) follow a copied
  master when the target has a logical screen of the same name (case-insensitive); the others are dropped and counted.
- **CLI**: `designer wf components import <project> --from <file.designer.json|sample:<id>> [--only "<name>,…"]
  [-o file] [--json]`, `designer new --kit <file.designer.json|sample:<id>>` (implies `--preset wireframe`; `--json`
  with `-o`) and `designer wf kit <file> [--off] [-o file]`. `wf build --into` keeps a kit a kit (the flag is not part
  of the spec).
- **Library cards** show a component's full name on up to two lines (kits often share a prefix, "Acme · Top bar",
  "Acme · List row", so cutting at the end hid the distinctive part); the tooltip has the whole name.
- Code map: `docs/architecture.md` → Shared components → Kits, import and paste. Screenshots:
  `docs/screenshots/kit-import/`. Checks: `src/wireframe/__tests__/symbolImport.test.ts`,
  `src/wireframe/__tests__/symbolImportCommands.test.ts`, `src/cli/components-import.test.ts`, `bun run
  e2e:kit-import` (Playwright: a fictional "Acme" kit made in the app, marked as a kit, then used by New document,
  Import and paste).

#### Slots and text overrides (2026-11-20)

From real use: an "App shell" (top bar + a card that fills the phone) placed on a screen could not take content in
its card (every drop landed above or below the shell, and adding through Layers changed every App shell), and a
shared "List row" showed the same label everywhere.

- **Slots.** A container (vertical / horizontal stack, grid, card container) inside a shared component can be marked
  **Content per instance** (Properties → Layout, when the container is part of an instance; `layout.slot`, spec
  `"slot": true`). The container itself (layout, style, size rules) stays shared; its children belong to each
  instance: sync never copies them between instances or into the master (`sharedShape` leaves them out), and every
  rewrite of an instance keeps them. A new instance starts with the master's slot children (its default content).
  A nested shared component keeps its own slots (per outer instance). Detach removes the flags.
- **Drops and inserts.** The drop target search goes into instances: a slot is a target like any stack (insertion
  line included); the rest of an instance is not (a drop there lands next to the instance). Click-insert with an
  instance selected fills its first slot (a slot selected: that one); paste with a slot (or something in one)
  selected goes into it. The Layers tree can still put things into a shared part: that edits the master, as
  before, and a toast says "Changed shared component X (N instances)". Plain empty containers ("Drop elements
  here") take drops as before (test in `__tests__/slots.test.ts`).
- **Text overrides.** Editing a text prop (title, label, subtitle, heading text…: the `text` / `multiline` props)
  of a component inside an instance in Properties stays on that instance (`symbol.text`: master node id → prop →
  value). Properties shows **Overridden here** with **Reset to shared** and **Use everywhere** (the value becomes
  the master's; instances without their own text follow). The master's text is the default; changing it updates the
  instances that do not override it. Other prop edits, and text edited outside Properties (the CLI, a spec), change
  the master as before.
- **Spec.** `{ "use": "App shell", "content": [ … ] }` fills the only slot; several: `"slots": { "<slot name>": [ … ]
  }`; `"text": { "<node name or path>": "…" }` (the component's main text prop) or `{ "<node>": { "<prop>": "…" } }`.
  Node and slot names are the master's (a unique name, else a path of names "Body/Row", else the id); `wf dump`
  writes them back only where they differ from the master.
- **Export for AI.** "Shared: App shell, content:" with the instance's slot content under it (several slots: one
  "In "Body":" line each), "Shared: Acme · List row — text: Row "Inbox"" for overrides; the README marks a master's
  slot "— content per instance".
- **Layers follows the canvas.** A selection made on the canvas (click, marquee, keyboard) opens the selected node's
  ancestors in Layers and scrolls its row into view (nearest: no jump when it is visible); a selection made in Layers
  never scrolls it.
- Code map: `docs/architecture.md` → Shared components → Slots and text overrides. Checks:
  `src/wireframe/__tests__/slots.test.ts`, `bun run e2e:slots` (Playwright). Screenshots: `docs/screenshots/slots/`.

### Export additions

README gets a **Flow** section (a list "Settings → Language (from "Language" row)" and a Mermaid
`flowchart` of logical screens) and each screen's status; each screen file lists its outgoing flows
next to their source elements ("→ opens Language").

## Links from parts of a component (2026-11-20)

Henrique's report: a bottom navigation takes up to 5 items, but they can't link to other screens —
a flow starts at a whole node, and a bottom navigation is one component. Same for tabs, segmented
control, sidebar navigation, web header links, breadcrumbs, toolbar actions, top app bar back/actions,
bottom sheet rows, dialog/modal/card actions, and similar.

### Parts

- A component definition may declare **parts**: the pieces of its drawing a person taps
  (`parts(props, size) → { key, label, rect }[]`, rects in the instance's local space). Keys are
  stable: for list props, the item index (`item:2`); for fixed pieces, a name (`back`, `action:1`).
  Every component above declares its parts; the contract test checks rects lie inside the build.
- A flow can start at a part: `from` stays the instance id and a new optional `part` holds the key.
  Validation, schema, docs/project-format.md.
- **Reorder/rename safety:** when a list prop changes, flows on its parts are remapped in the same
  undo step: an item keeps its flow if its label still exists (found by label, first match), else
  by its old index if still in range, else the flow is removed.
- **UI:** with an instance selected, hovering a part highlights it and shows a flow handle on it
  (the whole-instance handle stays). Drag from a part's handle like today (to a screen, or empty
  canvas → New screen named after the part's label). The Flows section lists flows per part
  ("Arquivos → Arquivos screen"). Arrows start at the part.
- **Present mode:** each linked part is its own hotspot.
- **Export for AI:** "Bottom navigation: Galeria (selected) → opens Galeria; Arquivos → opens
  Arquivos". **Spec format:** `"opens": { "Arquivos": "Arquivos screen" }` on a component (part by
  label or key) besides the plain `"opens": "<screen>"`; `from` paths accept `…/Bottom navigation#Arquivos`;
  dump writes them.

### Links defined once for shared navigation

A bottom navigation is usually the same on every screen (a shared component). Flows that start at an
element or part **inside a shared component's master content** apply to every instance (one link, all
screens). Flows started on one instance's content stay on that instance (today's rule) — the UI asks
which when drawing from inside an instance ("This screen only" / "Every screen using Tab bar").

### Selected item follows the screen

Navigation components with a selected index (bottom navigation, tabs, segmented control, sidebar
navigation, web header) get `selected: 'auto'` as an option (default for new instances): the item
whose part links to the **current screen** is drawn selected. This makes one shared tab bar show the
right tab on each screen with no per-instance overrides. A number keeps the old fixed behaviour.

When no item links to the current screen (a sub-screen), the flows are walked backwards (decided
2026-11-20, refined the same day): the item that links to a screen which, directly or through other
screens, **opens** the current one is selected, so Settings → Server keeps "Settings" selected on the
Server screen.

- **Only "opens" flows count** (parent → child). Ignored: flows from a **back or close part** (top app
  bar `back` / `close`, modal `close`: they lead to a parent), flows from a **navigation component**
  (bottom navigation, tabs, segmented control, sidebar navigation, web header: switching between
  siblings, whole element or part) and flows from a screen **to itself**. So a back link never makes
  the parent look like a child, and in-screen tabs whose item opens a screen that switches back keep
  the first tab.
- **Nearest wins:** breadth first over the remaining incoming flows (from any element or part, on any
  frame of a screen); an item linking to a screen one flow away beats one linking to a screen two
  flows away.
- **Ties:** the first such item. **Cycles** are safe (each screen is visited once).
- **No path:** the first item, as before.
- One resolved value (`component.resolved`) serves the canvas, exports, the wf sheet, Present mode and
  Export for AI's "(selected)". Code: `src/wireframe/steps/autoSelect` (`screenGraph`, `distancesTo`);
  tests: `src/wireframe/__tests__/autoSelect.test.ts`.

### As built (links from parts)

- Code map: `docs/architecture.md` → Links from parts of a component. Demo: `scripts/demo/scenarios/10-links-na-navegacao.ts`.
- **Part keys** are 0-based: `item:<i>` for list entries (`action:<i>` for action lists: web header, toolbar, card),
  fixed names otherwise: top app bar `back` / `menu` / `close` and `action:<i>` (its icons), dialog and modal
  `primary` / `secondary` (+ modal `close`), web header `logo` / `avatar`, section header and snackbar `action`,
  pagination `previous` / `next`. Sidebar items keep their index in `items` (section labels have no part).
  Only drawn pieces are parts (a header link cut by the width has none; its flow stays).
- **Removal rule, made exact:** an item keeps its flow by label (first match); else by its old index only when the
  entry now there is not one of the old entries (a rename); else the flow goes. So removing a tab removes its link
  and never hands it to the next tab.
- **Shared links:** `WireframeFlow.symbol` + `from` in the master's id space. A shared link draws **one** arrow (from
  the selected instance when there is one, else the first instance not on the screen it opens): four tabs × four
  screens would be sixteen arrows. Shared arrows are dashed. Detach and Delete master turn the master's links into
  links of each copy, so nothing is lost.
- **Drawing:** the part's handle is on its top edge when parts share a row (tabs), else on its right edge; a tab's
  arrow leaves vertically (from its top or bottom: routing picks), so arrows do not run along the bar over the next screens' tabs. A part can be
  dragged onto its own screen (a real drag, not a click on the handle): that is how a tab becomes the selected one
  there. The scope choice appears after the drop (on a screen: the two choices; on empty canvas: a radio group
  next to New screen, default "Every screen using …"). Properties → Flows has From (whole element / each part) and
  On (every screen / this screen only) for linking without dragging.
- **Selected follows the screen:** `selected` is `'auto'` by default for bottom navigation, tabs, segmented control,
  sidebar navigation and the web header (new instances and specs; files that stored a number keep it); the resolved
  value is `component.resolved`, per instance. The Properties field is "Follows the screen / Fixed".
- **Found while recording the demo:** wrapping a pinned bottom navigation in a stack (needed for Make component,
  since a library component cannot be one itself) dropped the stack into the screen's flow. `wrapInLayout` now gives
  the stack the pieces' common `pinned-bottom` / `free` position (regression test in `layoutEdit.test.ts`).

## Phase 3: agents (detailed)

Goal: an agent (Claude Code, Codex, a script) creates, reads and edits wireframe projects as well as
Henrique does by hand, on his subscription, through the `designer` CLI and the `designer` skill. It
is also the best-quality path for screenshot → wireframe: the agent looks, compares and corrects in
a loop, like the 2026-11-19 experiment, but builds with library components instead of converting a
DOM into shapes. Henrique approved this phase and live editing on 2026-11-19.

### A1. The wireframe spec format (`designer wf build` / `wf dump`)

A compact JSON an agent writes and reads, describing screens the way a person thinks of them, not
coordinates: logical screens and their variants (platform), each frame's root layout, a tree of
nodes where each node is a library component (`{ "list-row": { "title": "Language", "trailing":
"value", "value": "English" } }` or an explicit `{ "kind": …, "props": … }`), a container (`vstack`,
`hstack`, `grid` with gap/padding/align/columns/style/radius/repeat), a shared component instance
(`{ "use": "Trip card" }`), plain text, or a free/pinned placement; shared component masters; flows
(`"from": "Settings/Language row"` → `"to": "Language"`, by path or by an `id` the agent assigns);
notes (attached by path/id); screen status.

- `designer wf build <spec.json> [-o project.designer.json] [--into existing.designer.json]`: spec →
  project, through the same pipeline as the app (layout, components, symbols, repeat), validated with
  errors that name the spec path ("screens[1].root[3].list-row.trailing: 'arrow' is not one of none,
  chevron, toggle, value, checkbox").
- `designer wf dump <project> [-o spec.json]`: project → spec, so the agent can read what Henrique
  edited by hand.
- **Round trip without damage** (decided): `dump` writes stable ids for every node; `build --into`
  updates an existing project by id, keeping what the spec does not express (manual sizes, free
  positions, frame positions on the canvas, notes positions) and removing only what the spec removed.
  `build(dump(p)) == p` for any project made of library pieces is a test.
- A JSON Schema for the spec (`public/schema/wireframe-spec.schema.json`) and docs in
  `docs/wireframe-spec.md` with a complete example (the Hoard settings screen).

### A2. The catalog (`designer wf components`)

Lists every library component with its kind, label, platforms, category, props (type, default,
options, visibleWhen, help), sizing/resizable/placement defaults and one example, as Markdown (for
reading) or `--json`. Generated from the registry at run time, so it never goes stale.

#### As built (A1 + A2)

- Reference: [`wireframe-spec.md`](wireframe-spec.md); code `src/wireframe/spec/` (`parse.ts` → `build.ts` / `dump.ts`,
  `catalog.ts`, `schema.ts`), CLI `src/cli/wf.ts`. The schema is written by `bun run schema` with the project schema.
- Node forms: `{ "<kind>": props | "text" | [list] }`, `{ "kind", "props" }`, `vstack` / `hstack` / `grid`, `use`,
  `group`, and `{ "node": … }` for any other object (so a dump never loses anything). Sugar on any node: `opens`
  (flows) and `note`. Screen children with a default placement (bottom navigation, FAB…) get it, like a library insert.
- `build --into`: by id (id-less nodes: same parent, same index, same kind). Geometry the spec leaves out is kept;
  everything stated wins; top-level `components` / `notes` / `flows` / `canvas` left out entirely are kept.
  `dump --no-geometry` is the agent's side of that. Flows from removed nodes go, notes on them detach (warnings).
- The CLI loads Lucide glyphs for the build (no placeholders in `to-png`); Iconify icons still wait for the app.

### A3. Looking at the result (`designer wf sheet`, `wf compare`)

- `designer wf sheet <project> [-o sheet.png] [--platform P]`: one image of every frame laid out as
  on the canvas, with names, status badges and flow arrows, for reviewing the whole flow.
- `designer wf compare <screenshot.png> <project> --screen <name> [--platform P] [-o out.png]`:
  the screenshot and the rendered frame side by side at the same scale (the frame's width), with a
  thin grid, for the "look, fix, render again" loop.

**Done (A3).** `src/cli/wfView.ts`, registered as `wf sheet` / `wf compare` in the CLI command table
(`case 'wf'`; other `wf` subcommands register beside it). Layout and scaling are pure and tested
(`sheetLayout`, `compareLayout`, `solveScale`); the image is one SVG (frames as embedded resvg PNGs,
overlay shapes as markup, labels outlined by the fonts module) rendered by resvg. Name/platform/badge
fitting is the canvas's own `labelLayout`; arrows use the canvas routing (`flowLayout`, `placeLabels`) and `arrowHead`.

### A4. Rendering fidelity (the `to-png` font bug)

Noticed in the experiment: in `to-png`, Inter 500/600 render lighter than in the browser, and
letter-spaced text ("SERVIDOR", 0.14em) and some words ("Domingo") get gaps between letters. An
agent comparing renders is misled by this, so it is fixed in this phase: CLI renders must match the
app (same font files and weights, same letter spacing and kerning). A visual regression test renders
a fixed set of texts (weights 400–700, letter spacing 0 / 0.05 / 0.14 em, mixed words) through the
CLI and compares against the app's SVG text layout within a tolerance.

**Done (A4).** Cause: opentype.js 2.0 applied the variable font's `gvar` deltas wrongly for many
glyphs (Inter "D", comma, accented letters at non-default weights came out as thin or distorted
shapes, which read as "lighter weight" and as gaps next to them), rounded every HVAR advance (up to
a pixel of drift per word), and ignored the per-weight GPOS kerning deltas. `src/fonts/gvar.ts`,
`itemVarStore.ts` and `kerning.ts` now read these tables per the spec; the test compares with
Chromium (≤ 0.15 px per glyph, ≤ 3 % ink) and fontTools (≤ 1 font unit).

### A5. Live editing (agent ↔ Henrique, through the sync server)

Henrique sees the screens appear while the agent works and can adjust them in the middle; the agent
sees his adjustments. Built on the existing sync (docs/sync.md); the server stays "yours", and
nothing changes for people who don't use it.

- **Server:** an event stream `GET /api/events` (SSE, auth like the rest; heartbeat every 25 s so
  Cloudflare Tunnel keeps it open) that emits `{kind, id, updatedAt}` when a project or font changes.
  The rest of the protocol (list, GET/PUT, last-write-wins, conflict archive) is unchanged. New
  release of `designer-sync`.
- **App:** when sync is on, subscribe to the stream and pull a changed project immediately (falling
  back to the 30 s poll when the stream is unavailable). The project open in the editor updates in
  place when it has no unsaved edits (today's rule); for a project marked **live**, the app pushes
  its own edits faster (≈ 500 ms after the edit instead of autosave + 2 s) and shows a small "Live"
  indicator with who changed it last (this device / another device / the CLI).
- **CLI:** `designer live <project.designer.json> [--server URL]` (API key from `DESIGNER_SYNC_KEY`
  or `SYNC_API_KEY`, server from `DESIGNER_SYNC_URL`; with skv: `skv run designer-sync -- designer
  live …`): pushes the file now, then mirrors both ways until stopped — file changes (the agent ran
  `wf build --into`) are pushed; remote changes (Henrique edited in the app) are written back to the
  file. Prints one line with how to open it ("open Designer → it appears in your projects", or an
  `?open-project=<id>` link that opens it once synced). Also `designer sync push|pull <file|id>` for
  one-off transfers. Conflicts follow today's rules (last-write-wins, loser kept).
- Security: no new exposure; the stream carries only ids and timestamps.

#### As built (A5)

- Server: `GET /api/events` in `sync-server/events.go` (broker with per-client buffer, slow clients dropped,
  256 streams max, per-write deadlines so the 2 min `WriteTimeout` does not cut a stream, streams closed on
  shutdown); `/api/health` reports `events: true`.
- App: `src/sync/events.ts` (SSE over `fetch`, shared with the CLI), the engine subscribes and syncs on each
  change; the live mark is `live: { editedBy }` in the document (`"cli"` / `"app:<device>"`); `LiveIndicator`
  in the top bar; `?open-project=<id>`. Opening a live project or filling in its icons is not an edit.
- CLI: `src/cli/sync.ts` (`designer live`, `designer sync push|pull|list`). Proof: `bun run e2e:live`
  (Go server + Chromium + `designer live`, both conflict directions) and `bun run demo 07`.

### A6. Handing over big projects

`#open=` links stop at about 2 MB. Check how big real wireframe projects get (10 screens with
images), make sure `designer open` / `present` pick the `?import=` path automatically when needed,
and that live editing (A5) is the recommended path for agent sessions.

#### As built (A6)

- Measured (`docs/agents.md` → Open links in detail has the table): 10 phone screens of ~100 components each
  are 1.4 MB of compact JSON and a 99 KB `#open=` link; one embedded 1080×2243 screenshot makes it 611 KB, two
  1.8 MB. Image components are placeholders; embedded bitmaps decide the size.
- The real limit was not Chrome's 2 MB but the OS opener: `designer open` died with `E2BIG` on Linux above
  128 KB of link (one screenshot was enough). `designer open` now opens the `#open=` link only up to 64 KB
  (30 000 characters on Windows) and otherwise serves the file on `localhost`, opens a `?import=` link and
  exits once the app has downloaded it (the app fetches before asking to confirm). `present` always used
  `?import=`; its cards now say "Wireframe · N screens" instead of the unused artboard size. Code:
  `chooseHandover` / `openLinkLimit` in `src/cli/present.ts`, `openViaImport` in `src/cli/main.ts`; tests in
  `present.test.ts` (the decision, with the measured sizes) and `main.test.ts` (the served path end to end).
- Live editing (`designer live`, A5) is the recommended handover for agent sessions on wireframes (64 MB per
  project on the sync server, no link); `docs/agents.md` and the skill say so.
- Found on the way: CLI output into a pipe was cut at 64 KB (`designer to-svg big.json | wc -c` → 65537), and
  Bun's async stdout writes repeated 64 KB chunks; `bin/designer.ts` now writes stdout synchronously
  (`src/cli/bin.test.ts`).

### A7. The `designer` skill and an end-to-end run

The skill (`skills/designer/`) gets a **Wireframes** section: when to use wireframe mode, the spec
format, the catalog, the screenshot → wireframe loop (look at the screenshot, write the spec with
library components, `wf build`, `wf compare`, fix, repeat), flows and notes, live editing, and how
an agent that **receives** an "Export for AI" package should read it to build the app. Then an
end-to-end run: an agent turns real screenshots (Hoard's Gallery and Settings) into a wireframe
project through the CLI only, live, recorded as the round's demo video.

#### As built (A7)

- The skill (`skills/designer/SKILL.md` → Wireframes): wireframe vs logo document, the spec and the catalog,
  composing what a component lacks from stacks, the screenshot → wireframe loop (look, spec with library
  components, `wf build`, `wf compare --overlay`, fix, repeat; `wf sheet` for the flow), live sessions (start
  `designer live` on an empty project before the first build; always `--into` the mirrored file; `wf dump` before
  each build), and how an agent that receives an Export for AI package reads it.
- End-to-end run (2026-11-19), CLI only, live against a local designer-sync with the app in Chromium: Hoard's
  Gallery and Settings (dark Android screenshots) became one project with both screens, two flows and seven notes
  in four rounds. Specs of each round: `scripts/demo/fixtures/hoard-e2e/`. Replayed as demo `08-agente-ao-vivo`
  (with Henrique's edits in the app flowing back to the file) and toured in `09-sheet-e-compare`.
- Bugs it found, fixed, each with a regression test: the app saved an opened live project as an app edit when an
  autosave of the previous project was pending, and that empty copy replaced the agent's build (`activate()`;
  `projectsStore.test.ts`, `bun run e2e:live` step 6); `build --into` dropped default placements (a pinned bottom
  navigation fell into the flow; `roundtrip.test.ts`); notes of the left screen covered the next screen (now left
  of their screen when the right side is taken; `notes.test.ts`); Lucide aliases (`filter`, `check-circle`) drew
  placeholders silently (now resolved, unknown names warn; `wf.test.ts`); CLI stdout into a pipe was cut at 64 KB
  and `| head` raised EPIPE (`bin.test.ts`).
- Limits seen, not bugs: a list row's subtitle and a checkbox label are one line (ellipsis); a top app bar has at
  most 3 actions (compose with an `hstack` of icons); the wireframes are greyscale (a dark theme is a note).

### Phase 3 workstreams

1. **A1 + A2** (first; Opus): spec format, build/dump with round trip, catalog.
2. **A4** (now, in parallel; Sonnet): rendering fidelity.
3. **A5** (now, in parallel; Opus): live editing — server, app, CLI.
4. **A3** (after A4; Sonnet): sheet and compare.
5. **A6 + A7** (last; Opus): handover check, skill, end-to-end run and demo video.

## Phase 4: AI through your own agent (detailed)

Decided with Henrique on 2026-11-20: **Claude Code only** (his subscription, headless `claude -p`),
**through the sync server**, the agent running on a machine of his (cachyos-fps by default). No API
keys anywhere in the app. The agent works exactly like the phase 3 end-to-end run (wf dump → look →
wf build --into → wf compare → fix), on a live project, so the screens appear in the app while it
works.

### The pieces

1. **Jobs on the sync server** (`designer-sync` v0.3.0): a small, authenticated job queue next to
   projects and fonts, announced on the existing event stream.
2. **The bridge** `designer agent` (CLI): runs on Henrique's machine, listens for jobs, claims one,
   runs Claude Code on it in an isolated folder with the project mirrored live, reports progress,
   finishes.
3. **The app**: four entry points, a job panel (progress, cancel, result), and agent presence
   ("Agent online on cachyos-fps").

### Protocol (decided; server, bridge and app are built against it in parallel)

All under the sync server's usual auth (API key / LAN rules), JSON, ids are client-generated.

- `POST /api/jobs` — create: `{ id, type, projectId, screenId?, frameId?, input, attachments? }`.
  `type`: `screenshot` (input `{ platform, name?, hint? }`, one image attachment), `next-screen`
  (input `{ fromScreenId, fromNodeId, fromPart?, label, platform, hint?, at: {x,y} }`), `adapt`
  (input `{ screenId, fromPlatform, toPlatform, hint? }`), `request` (input `{ text }`, free request
  about the project). `attachments`: `[{ name, mime, dataBase64 }]`, total ≤ `MAX_BODY_MB`.
  The server stores `data/jobs/<id>.json` (attachments in `data/jobs/<id>/`), status `queued`.
- `GET /api/jobs?active=1|projectId=…` (metadata, newest first) and `GET /api/jobs/<id>` (full, incl.
  progress; attachments via `GET /api/jobs/<id>/attachments/<name>`).
- `POST /api/jobs/<id>/claim` `{ agentId }` → 200 and status `running` if it was `queued`, else
  409 (atomic: two bridges never run one job).
- `POST /api/jobs/<id>/progress` `{ agentId, message, stage? }` → appended to `progress[]`
  (`{ at, message, stage }`), at most 200 entries.
- `POST /api/jobs/<id>/finish` `{ agentId, status: 'done'|'failed'|'cancelled', summary?, error? }`.
- `POST /api/jobs/<id>/cancel` (app) → `cancelRequested: true` (status unchanged until the bridge
  finishes it as `cancelled`; a `queued` job becomes `cancelled` at once).
- Presence: `POST /api/agents/heartbeat` `{ agentId, name, host, version, busy, jobId?, status? }` every 15 s;
  `GET /api/agents` lists agents seen in the last 45 s. `status: 'offline'` is the goodbye of a bridge that
  stops cleanly (SIGINT/SIGTERM, normal exit): the server stops listing the agent and emits the `agents`
  event `offline` at once (an unknown agent: nothing); a crash still falls back to the 45 s window. A later
  heartbeat brings the agent back.
- Events on `GET /api/events`: `{ kind: 'jobs', id, status, updatedAt }` on every job change and
  `{ kind: 'agents', … }` when presence changes.
- Retention: the newest 200 jobs; attachments deleted 24 h after a job finishes. A `running` job
  whose agent stopped heartbeating for 2 min becomes `failed` ("agent went away").
- Jobs are private (like fonts): never readable without auth, files 0600.

### The bridge (`designer agent`)

`designer agent [--server URL] [--name N] [--workdir DIR] [--max-minutes 15]` (key and server like
`designer live`: `DESIGNER_SYNC_KEY` / `SYNC_API_KEY`, `DESIGNER_SYNC_URL`; on cachy:
`~/.local/bin/skv run designer-sync -- designer agent`). One job at a time, queued jobs taken in
order. Per job:

1. Claim; make `<workdir>/<jobId>/`; pull the project; mark it live and start the live mirror on it;
   save attachments there.
2. Build the prompt **from a template per job type** (in the repo, reviewed like code): the task,
   the relevant context (the source screen as a `wf dump` excerpt, the element/part label, the
   platform, Henrique's hint **as quoted data**), the rules (library components only, keep what
   exists, `wf dump` before every `wf build --into`, `wf compare` loop for screenshots, stop after
   at most N rounds), and the Wireframes section of the `designer` skill appended as system prompt.
3. Run `claude -p` with `--output-format stream-json`, cwd = the job folder, **tools restricted**:
   only the `designer` CLI (`Bash(designer …)` patterns for wf/to-png/validate), `Read` (to look
   at images and files in the job folder) and `Write`/`Edit` inside the job folder; nothing else
   (no network tools, no other shell commands), no extra dirs. Model: the CLI default.
4. Turn the stream into short progress messages ("Reading the screenshot", "Round 2: fixing the
   list", "Checking with wf compare") → `progress`.
5. Cancel (event or `cancelRequested` seen on poll) or `--max-minutes` → kill the process tree,
   finish `cancelled`/`failed`; the project keeps whatever was already built (in the app the job's
   changes are one undo step on top of your own edits, which stay undoable: [sync.md → In-place update
   and undo](sync.md#in-place-update-and-undo)).
6. Finish with a one-paragraph summary from the agent's last message; stop the mirror; keep the job
   folder for a day (debugging), then delete.
7. Heartbeat every 15 s, including `busy`/`jobId`.

It refuses to start if `claude` is not found or not logged in, with a clear message. Uses the
user's own Claude Code login: one person's subscription, for that person's own projects.

### The app

- **Agent presence**: a small "AI agent" status in the status bar / menu (online on <name>,
  busy, offline, or "no sync server" with a link to the sync setup). Entry points are disabled with
  a tooltip when no agent is online.
- **Entry points**:
  1. Paste or drop a screenshot onto the canvas of a wireframe document → a choice: "Place as
     reference image" (today) or **"Turn into a wireframe with AI"** (platform + optional hint).
  2. The flow drop menu's **"Generate with AI"** (enabled now): creates the target logical screen
     and frame at once (empty, named after the label), links the flow, and sends a `next-screen` job
     that fills it.
  3. Screen section → **"Adapt to tablet / desktop with AI"** (next to "Duplicate as …").
  4. **"Ask the agent…"** (Edit menu + a shortcut): a free request about the whole project.
- **Before sending**: the project is flushed to the sync server (it must exist there) and marked
  live.
- **Job panel** (a small floating panel, one row per running/recent job of this project): type,
  status, latest progress line, elapsed time, Cancel; on finish, the summary and "Undo the agent's
  changes" (restores the project as it was when the job started, from a snapshot taken at send).
- Henrique can keep editing while the agent works (live editing rules apply); the panel warns that
  edits on the same screen may be overwritten.
- **Built** (`src/agent/`, `src/dialogs/agentJob/`): the presence is in the status bar (a sparkle icon in the phone
  top bar), wireframe documents only. Every entry point opens one small dialog (what the job is about, an optional
  hint, Send); a pasted or dropped screenshot gets platform (guessed from the image's shape), name and hint, and
  "Place as reference image" keeps today's import. **Ask the agent…** is Edit → Ask the agent… and **Mod+K**; it
  stays enabled so the shortcut always answers, and its dialog says why it cannot send. The job panel floats at
  the canvas's bottom right, can be hidden (the status popover shows it again) and drops finished jobs after
  24 h; "Undo the agent's changes" restores the snapshot as one edit (Edit → Undo brings the agent's version
  back), keeping the project's name and live mark. Only the newest job of the project offers it (restoring an
  older job's snapshot would also throw away the later jobs' work); dismissed and undone rows survive a reload. Checked by `bun run e2e:agent-app` (screenshots:
  `docs/screenshots/agent/`).

### Phase 4 workstreams

1. **Server jobs** (designer-sync, Go + a shared TS client in `src/sync/jobs.ts` used by app and CLI):
   the protocol above, tests (-race), docs/sync.md + README. No release (the coordinator releases
   v0.3.0).
2. **Bridge** (`designer agent`): against the protocol (use a fake server in tests until 1 lands),
   prompt templates, tool restrictions, progress mapping, cancel/timeout, presence, docs/agents.md.
3. **App**: presence, the four entry points, job panel, snapshot + undo, against the protocol (fake
   server in tests).
4. **End to end + demo videos** (after 1–3): local server + bridge running real Claude Code + app in
   Playwright; each feature once; videos; bugs fixed.

### Phase 4 end-to-end run (workstream 4, 2026-11-20)

Run on cachyos-fps as Henrique uses it: a local designer-sync built from `sync-server/` with an API key, `designer
agent` running the real Claude Code 2.1 (logged in, CLI default model), the app (`vite`) in Playwright with Sync on
(`node scripts/demo/watch-live.ts <dir> --agent`). Each feature once through the UI, then again in the videos
(`scripts/demo/scenarios/11`–`15`). Times are from Send to the first change of the project in the app and to the
job's end; rounds are `wf build --into` runs.

| Feature | First change | Total | Rounds | Result |
|---|---|---|---|---|
| Paste the Hoard Settings screenshot → Turn into a wireframe with AI | 17.6 s (videos: 17.0, 41.8) | 34 s (24.8, 65.1) | 2 | Every part of the screenshot as a library component, in order, real texts and states (radio 1,1 GB, checkbox on); rows a bit taller than the original and "Sincronizar agora" as a full-width button instead of trailing. Good. |
| Flow from the "Backup do celular" row → Generate with AI, hint "pastas incluídas, progresso, botão para fazer backup agora" | 14.4 s (14.3, 17.7) | 20 s (19.3, 24.6) | 1 | Followed the hint (progress, folders with toggles, Fazer backup agora, options), same style as Settings, back link to Configurações added. Good. |
| Screen section → Adapt to tablet with AI | 3.8 s, the frame copy (1.5–1.9) | 34 s (21–38) | 1 | Two columns, same content and states, phone frame untouched. Correct but plain: no master-detail (the screen has none to make). |
| Ask the agent… "add a search field to the top of the Galeria screen and an empty state for no results" | 19 s (18.7–26.3) | 29 s (26.6–43.0) | 1 | Search field under the title, empty state as its own screen with flows both ways. In the first run it edited the current Galeria in place; now it proposes "Galeria (nova)" (changed) and keeps the current one. |

Checked too: **cancel** mid-job (Cancel → the bridge kills Claude Code's tree within a second, the row says
Cancelled, nothing half-built, the live mark cleared); **two jobs** sent back to back run in order (the second
waits as "Waiting for the agent"); **agent offline** (bridge stopped → at once "Agent offline" (45 s after a crash), Generate with
AI disabled with the tooltip, Ask the agent… says why); the **live mark** is cleared after every job; **Undo**.
Screenshots: `docs/screenshots/agent-e2e/`. Henrique's benchmark (the whole Settings screen reorganized by one
request): [`agents.md`](agents.md) → Benchmark.

Found and fixed (each with a regression test or e2e check):

- Every `designer` command the agent ran printed Bun's "Internal error: directory mismatch" (from
  `--tsconfig-override`): dropped; a test runs the real CLI next to a hostile `tsconfig.json`/`bunfig.toml`/`.env`.
- `wf build` placed a new screen on top of the notes beside the last one: notes now count as taken space.
- The job panel showed the agent's multi-paragraph summary in full, over the canvas: clamped to 4 lines with
  More / Less; the prompt asks for at most 3 plain sentences.
- The undo history was gone right after a job (seen recording the overview): every pull of the open project went
  through `useDocStore.load`. Now `applyRemote` keeps it: the job's changes are one undo step on top of your own
  edits ([sync.md → In-place update and undo](sync.md#in-place-update-and-undo)).
- Undo on an older job wiped the later jobs' screens: offered for the newest job only. Dismissed rows came back
  after a reload: kept per device.
- The paste dialog's preview revoked a blob URL still loading (a console error on every paste in development).
- The platform guess: the Hoard screenshots (1080 × 2243) did default to Phone; the "Desktop" seen in the app
  e2e screenshot was its 1440 × 900 image, correctly desktop. The thresholds now fit real devices (10:16 tablets
  were "phone", iPad landscape "desktop"), with tests on real sizes.
- Prompt templates (`src/cli/agent/prompts/`): a short plain summary; for screenshots, look at the last compare
  before finishing (it skipped it); files are read with Read, never printed (a 37 KB `cat` was saved where the
  agent could not read it back); start each round from a fresh dump and never dump between the edits and the build
  (the old wording contradicted itself); requests keep "current" screens intact and propose a "changed" version with
  a note (notes on current screens are fine), move content verbatim, and give every new screen a way back.

Closed afterwards: Claude Code's built-in read-only commands (`grep`, `sed -n`, `cat` …) are denied too (a
`--disallowedTools` prefix tree around `designer `; `agents.md` → Security model), and a clean stop sends an
`offline` heartbeat, so the app shows "Agent offline" within a second (a crash: the 45 s window).

## Overview video (2026-11-20)

One continuous project ("Planejando a próxima versão do Hoard") in ten chapters, real app, real agent, Portuguese
captions: `scripts/demo/scenarios/16-overview.ts` (`bun run demo overview`). Found and fixed while recording, each
with a regression test:

- An image could not be made shorter than its aspect ratio (R1 no-op); resizing a child fixed the height of its card
  and stack (a list of repeated cards stayed tall). See As built (R2–R4).
- A flow from a custom card named the new screen "Card container": a container now gives its first label inside
  ("Câmera"), in New screen, Generate with AI and the AI export (`flowSourceLabel`).
- Make component on a wrapped bottom navigation proposed "Component": now the component's kind.
- Fit to view (Ctrl+0, opening a project) cut the arrows routed above the screens: `fitTarget` includes routes and
  note connectors.
- Note connectors crossed the screens between a note and its target: routed (Notes above).

## Promo video (2026-11-20)

A ~90 s promotional cut after the overview, all English, on a fictional app (Roam, a trip planner) instead of Hoard,
with Henrique's hfps identity on everything the recorder draws over the app: `scripts/demo/scenarios/17-promo.ts`
(`bun run demo promo`; the recorder's pieces in `scripts/demo/README.md`). Found while recording, with tests:

- A note attached to a screen with screens on both sides (the agent's note on a reorganized menu, between the current
  screen and its new sub-screens) was placed over the next screen: it now goes below its screen
  (`notePositionFor`, `notes.test.ts`).
- The recorder's `fill` pressed Enter in multiline fields, which adds a line there: every Text set in a demo ended with
  a newline and a taller box (the cards of the overview too). It commits with Ctrl + Enter now.
- The scene cards' full-screen clip-path animation left blank white frames in the headless recording; they slide with
  a transform.

### The Roam sample

The promo's finished project ships as the app's first sample project ("Roam (sample)": New document → Wireframe →
Sample: Roam, Help → Open sample project…, `designer new --sample roam`): the app screens in a first row, the
Settings story in a second, the Settings sub-screen "Trips" renamed "Trip settings", and the shared tab bar's
Profile tab linked to "Settings (new)". Built by `scripts/samples/roam.ts` from the two recorded projects;
architecture.md → Samples.

### Building a component kit as shared components

A kit built as a wireframe (a component sheet: one screen per group of patterns, each pattern a shared component
with a note stating its rule) showed one bug and the gaps below.

- **Fix found building it:** an instance of one master inside another master did not get that master's own size
  and placement (a hug button nested in a sheet stretched to the full width): `wf build` now gives the placeholder
  masters their content's `width` / `height` / `position` / `bleed` while it builds them
  (`spec.test.ts` → "an instance inside another master starts with that master's own size").

#### Gaps (what the library cannot say yet)

- **Fixed sizes a kit may want denser:** a two-line list row is 72 (a dense kit uses 56); chips and toolbar buttons
  are 32 (some kits use 36); the toolbar is 56 with a bottom divider. A note can state the kit's numbers; a density
  prop on these components would close it.
- **Top app bar always draws a bottom divider**; a header without one cannot be drawn with it.
- **No end alignment in a stack** (no `justify`): sheet footers and Cancel / confirm pairs sit at the start instead
  of the end; a stack cannot centre a free overlay either (a desktop dialog is placed by `x` / `y`).
- **No per-side padding:** a shell's margin around its card also adds space above the card, under the header.
- **No vertical divider, menu or grab-handle components:** a master-detail split is the detail panel's outline, a
  menu is an outlined stack of radio groups, a drawer's handle can only be stated in a note.
- **Section titles are canvas headings**, so `wf sheet` and `to-png` (frames only) do not show them; the app does.

## Quality bar

Everything in `docs/rebuild-spec.md` → Quality bar, plus: layout and every component's `build` have
Vitest tests; a wireframe with 10 screens of ~100 components each stays smooth to pan, zoom and edit
(check it, and cull off-screen screens if needed); logo and app icon documents behave exactly as
before (their existing tests pass untouched).
