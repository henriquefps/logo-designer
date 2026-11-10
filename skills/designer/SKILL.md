---
name: designer
description: Create and edit vector artwork (logos, app icon glyphs, illustrations, badges, banners) as Designer projects (designer.hfps.dev, an Illustrator-style SVG editor) that a person can open and keep editing, using the `designer` CLI instead of driving the browser. Use when asked to draw or redesign a logo, icon, glyph or SVG that someone will want to adjust by hand, to hand artwork over "in the Designer", to read or change a `.designer.json` file, or to turn an existing SVG into an editable project.
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
- **App icons** (`--icon app-icon`) are **one colour**: every paint becomes `currentColor` (white on
  the tile, themed on Android 13+). Express depth with opacity (1, 0.7, 0.45 front to back) and separate
  overlapping shapes with `knockout`, never with a tile-coloured shape. Sizes and keylines follow the `hfps-repo-assets` skill ("The icon: rules");
  the Designer's numbers are a port of its `build-icons.mjs`. Export for that script with
  `designer to-svg <project> --glyph -o scripts/glyph.svg`, or skip it with `designer icons`.
- Several concepts = several files, one project each, named so the person can tell them apart.
