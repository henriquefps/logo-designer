---
name: designer
description: Create and edit vector artwork (logos, app icon glyphs, illustrations, badges, banners) and app wireframes (screens, flows, notes) as Designer projects (designer.hfps.dev, an Illustrator-style SVG editor with a wireframe mode) that a person can open and keep editing, using the `designer` CLI instead of driving the browser. Use when asked to draw or redesign a logo, icon, glyph or SVG that someone will want to adjust by hand, to wireframe an app or turn app screenshots into wireframes, to hand artwork or screens over "in the Designer", to read or change a `.designer.json` file, to turn an existing SVG into an editable project, or to build an app from a Designer "Export for AI" package.
---

# Designer for agents

[Designer](https://designer.hfps.dev) is a free, client-side SVG editor (source:
github.com/henriquefps/logo-designer, AGPL-3.0). Projects are `.designer.json` files. You never click
through the web app: you **write SVG or JSON, check it with the `designer` CLI, and hand it over**;
the person edits it in the browser and saves it back into the repo.

Full reference (read it when you need a detail this page skips):
[docs/agents.md](https://github.com/henriquefps/logo-designer/blob/main/docs/agents.md),
[docs/project-format.md](https://github.com/henriquefps/logo-designer/blob/main/docs/project-format.md),
JSON Schema <https://designer.hfps.dev/schema/designer-project.schema.json>.

## Run the CLI

Needs [Bun](https://bun.sh). **Pin the commit**: Bun caches unpinned `github:` specs and keeps
running an old CLI after `main` moves.

```sh
DESIGNER="github:henriquefps/logo-designer#$(git ls-remote https://github.com/henriquefps/logo-designer.git main | cut -c1-12)"
bunx --bun "$DESIGNER" --help          # first run downloads it (~20-60 s)
```

Inside a checkout of the Designer repo use `bun run designer <command>` instead.
Below, `designer` means either form.

## Workflow

1. **Draw.** Write SVG: `viewBox` = the artboard (`0 0 128 128` for an app icon glyph), plain shapes
   and paths, solid colours or gradients, round caps/joins for strokes. Keep the source next to the
   app, e.g. `scripts/glyph.svg`. Write `.designer.json` directly only when you need Designer-only
   features (layer names, locked/hidden layers, stars, text in a bundled font); start from
   `designer new`.
2. **Make it a project:**
   `designer from-svg scripts/glyph.svg -o scripts/glyph.designer.json --name "Glyph A" [--icon app-icon]`
   (rect/circle/ellipse stay shapes, everything else becomes editable Bézier paths, groups and
   gradients are kept). With `--icon` it **fits the drawing to the keyline** by default, so the project
   opens centred and at the right size (`--no-fit` keeps the raw drawing). After manual changes or
   `knockout`, run `designer fit <project>` again (exports fit anyway; this keeps the canvas in line).
3. **Check your own work before handing it over:**
   - `designer validate <project>` (errors name the JSON path);
   - `designer info <project>` (node tree, ids, bounds: is it centred, inside the box? icon projects also show whether the glyph is on its keyline);
   - `designer to-png <project> --size 512 -o /tmp/x.png` and **look at the PNG**;
   - app icons: `designer icons <project> -o /tmp/icons` prints the keyline report (glyph size as a
     fraction of the tile, ink %, Android safe zone) and writes `review-sheet.png`: open it. Fix the
     drawing, rebuild, repeat until there are no warnings. It also writes `drawable/ic_splash.xml` (the
     glyph as a VectorDrawable: point the Android 12+ splash theme at `@drawable/ic_splash`); `--android
     <res>`, `--ios <dir>`, `--site <dir>` write straight into an app (existing `splash_background` kept).
     `--tile <#hex>` sets the tile colour of the whole set (repos that keep their olive tile: `--tile
     #5b7a3a`; default `#2063b0`); it can also live in the project (`icon.tile`, `new --preset app-icon
     --tile #hex`), so `designer icons` uses it without the flag. Ask which tile the repo uses if unsure.
     `--colour one|full` and `--glyph <#hex>` (also stored in the project) choose the colour mode and the one-colour glyph colour
     (see "App icons" below).
4. **Hand it over:** `designer open <project>` (one file) or `designer present a.json b.json c.json`
   (several concepts: a local gallery with previews and an *Open in Designer* button each; run it in
   the background and leave it running until the person has imported). The browser asks the person
   to confirm; the file is added as a **new** project, never overwriting one.
5. **After they edit**, they save in place (File → Open project file, then ⌘S writes back to the same
   `.designer.json`). Read that file for the next round; commit `*.designer.json` with the exported
   SVG so the artwork stays editable.

## Rules

- **Never paste `#open=` links into chat** (`designer link`): they are 750-1000+ characters, wrap,
  and the click opens a truncated URL. Use `open` / `present`; if a link is unavoidable, commit the
  file and use `designer link <file> --github` (short `?import=` link).
- Don't drive the web UI with a browser automation tool to create artwork; the CLI runs the app's own
  code, so what passes `validate` opens identically in the app.
- Deliver real, editable geometry. Avoid `clipPath`/`mask` for anything the person must edit (the
  importer does turn them into geometry, but you then can't control the result). To hide what is
  behind a shape, **knock it out**: `designer info <project>` lists names and ids, then
  `designer knockout <project> --cutter "<name|id>" [--gap 0.03T] [--outline-only] -o <project>`
  cuts every object below the cutter where it sits, with a small gap, as plain editable paths
  (same code as the app's Object → Knock out).
- **App icons** (`--icon app-icon`) are **one colour by default** (the hfps style): every paint becomes
  `currentColor` (the glyph colour: white on the tile, or `--glyph <#hex>`, e.g. `--tile #ffffff --glyph #ff0000`;
  themed on Android 13+). Express depth with opacity (1, 0.7, 0.45 front to back) and separate
  overlapping shapes with `knockout`, never with a tile-coloured shape (knockout stays the recommended way in both
  modes). **Only when the person asks for colour** (each shape its own colour, a rainbow or other gradient) use
  `--colour full` (`from-svg --icon app-icon --colour full`, `new … --colour full`; stored as `icon.colour:
  "full-colour"`): the drawing's solids, gradients and opacity are kept in every output; Android monochrome becomes
  the silhouette, iOS Tinted the grayscale, iOS Dark the same colours on transparency. Heed a `! contrast:` warning
  (glyph colours too close to the tile). The tile is always one solid colour. Sizes and keylines follow the `hfps-kit` skill (`repo-assets/GUIDE.md`) ("The icon: rules");
  the Designer's numbers are a port of its `build-icons.mjs`. Export for that script with
  `designer to-svg <project> --glyph -o scripts/glyph.svg`, or skip it with `designer icons`.
- Several concepts = several files, one project each, named so the person can tell them apart.

## Wireframes

**Wireframe mode vs a logo document.** Screens of an app (phone/tablet/desktop frames, lists, bars, buttons,
flows between screens, notes on behaviour) are a **wireframe project**, built from library components. A logo,
icon, illustration or anything drawn is a normal document (above). Never draw UI with paths, and never put a
logo in a wireframe as more than an `image` placeholder.

Reference: [docs/wireframe-spec.md](https://github.com/henriquefps/logo-designer/blob/main/docs/wireframe-spec.md)
(the spec format, with a complete example), the "Wireframes from the CLI" and "Live editing" sections of
[docs/agents.md](https://github.com/henriquefps/logo-designer/blob/main/docs/agents.md).

### Write a spec, not a project

You write a small JSON **spec**; `designer wf build` turns it into the project through the app's own pipeline
(layout, components, shared components, repeat). Nothing to position by hand.

- `designer wf components` (once per session; `designer wf components list-row` for one) lists every kind with
  its props, defaults, options and an example. Use only those kinds and props; `wf build` rejects anything else
  with the spec path and a "did you mean".
- A screen: `{ "name": "Settings", "status": "current", "platform": "phone", "root": [ …nodes ] }`. A node is a
  component (`{ "list-row": { "title": "Language", "trailing": "value", "value": "English" } }`, short forms
  `{ "heading": "Settings" }`, `{ "tabs": ["A", "B"] }`), a stack (`{ "vstack": […], "gap": 8 }`, `hstack`, `grid`
  with `columns`), or a shared component (`{ "use": "Tab bar" }`, defined once under `components`).
- Lists and galleries: one item with `"repeat": N` on its container, not N copies. Anything on several screens
  (tab bar, a card): a shared component.
- More than the component offers (a top bar with 6 icons, a row with a button on its right): build it from
  stacks of library pieces (`{ "hstack": [ { "heading": … }, { "icon": { "icon": "search" } }, … ] }`), and put
  what still cannot be drawn in a note. Icons are Lucide names (`search`, `trash-2`, `settings`); `wf build` warns
  about a name Lucide does not have.
- `"opens": "Other screen"` on a node draws a flow; on a navigation component link each tab / item / action with
  `"opens": { "Files": "Files" }` (parts by label or key; `wf components` lists them). Put the `opens` of a tab bar
  inside its shared component's `content`: one link for every screen, and each screen shows its own tab selected
  (`selected` defaults to `"auto"`). `"note": "…"` attaches a note; `"status"` is `current`
  (as the app is), `changed` (proposed change) or `new`. Write a note wherever behaviour cannot be drawn
  (what a tap does besides navigating, loading/empty/error states, gestures, conditions).

### Screenshot → wireframe

1. **Look at the screenshot** (open the image) and list its parts top to bottom: bars, sections, rows, controls,
   grids. Map each to a library component from the catalog. **Never trace shapes or copy pixel positions**: a
   wireframe states structure and content; spacing comes from the layout.
2. Write the spec with the real texts and states (which tab is selected, toggles on/off, values).
3. `designer wf build app.spec.json -o app.designer.json` (later: `--into app.designer.json`). Fix what the
   errors name.
4. `designer wf compare shot.png app.designer.json --screen "<name>" --overlay 50 -o cmp.png` and **look at the
   image**: missing or extra rows, order, wrong component, wrong selection, heights far off (the overlay panel
   shows drift). Lo-fi is expected: greys, no icons' exact shapes, no colours.
5. Fix the spec, build `--into`, compare again. `--into` keeps what the spec leaves out (sizes, positions,
   note positions): state a value to change it. Stop when every element of the screenshot has its component and
   the order and proportions match; usually 2–3 rounds.
6. Several screens: add the flows and notes, then `designer wf sheet app.designer.json --notes -o sheet.png`
   and look at the whole flow (names, status badges, arrows) before handing over.

### Live, so the person watches

For a working session, run live editing instead of handing a file over at the end (wireframes with screenshots
are MBs; links are not the way). Start it **before** the first build, on an empty project, so the person watches
the screens appear:

```sh
designer new --preset wireframe --name "Hoard" -o app.designer.json
skv run designer-sync -- designer live app.designer.json &   # or DESIGNER_SYNC_URL + DESIGNER_SYNC_KEY
designer wf build app.spec.json --into app.designer.json     # every round: --into the file live mirrors
```

Give the person the printed `?open-project=` link once (or tell them it is in their projects with Sync on).
Every `wf build --into` then appears in their app within a second. Never `-o` a new file during the session: a
new file is a new project the person is not watching. **They may edit too**: before each build,
`designer wf dump app.designer.json --no-geometry -o app.spec.json` and merge their changes into your spec
(their moves and resizes survive `--into` anyway). Stop `live` with Ctrl+C (SIGINT) when done.
Without a sync server: `designer open app.designer.json` (big files go through a local `?import=` by
themselves).

### Receiving an "Export for AI" package

When you are given `<project>-for-ai.zip` (or its folder) to **build the app**:

1. Read `README.md` first: the screen list with platform and status, how to read the files, the shared
   components and the flow map (with a Mermaid graph).
2. For each screen read `screens/<slug>.md` (the component tree top to bottom, per platform) **and** look at
   `screens/<slug>.<platform>.png`. Status tells you the job: `current` = exists, leave it; `changed` = modify the
   existing screen; `new` = add it.
3. Build in the target app's own stack and design system (wireframes are greyscale and low fidelity: no colours,
   fonts or exact sizes to copy). "List of N × (…)" is one item rendered from data; "Shared: X" is one reusable
   component; "pinned to bottom" / "floating" are real placement.
4. Wire navigation from the "→ opens X" lines (also inline, after an item: "Bottom navigation: Gallery (selected)
   → opens Gallery; Files → opens Files") and the Flow section; implement every "Note:" (they are
   requirements, not comments) and ask when one is ambiguous.
5. `project.designer.json` is the editable source: `designer wf dump` it for an exact, machine-readable tree.

