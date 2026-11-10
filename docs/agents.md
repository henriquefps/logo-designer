# Designer for agents

How an agent (a Claude session, a script) creates and edits Designer projects **without driving the
browser**, and hands them to Henrique to edit in one click. Agents write SVG or JSON; the `designer`
CLI turns it into a project and a link; Henrique edits in the app and saves back into the repo.

- File format: [`project-format.md`](project-format.md) (every field, with examples) and the JSON
  Schema at <https://designer.hfps.dev/schema/designer-project.schema.json>.
- Code: CLI `bin/designer.ts` → `src/cli/main.ts`; links `src/io/shareLink.ts` + `src/io/launch.ts`;
  save in place `src/io/fileAccess.ts`.

## The CLI

Inside this repo:

```sh
bun run designer <command> …          # or: bun bin/designer.ts <command> …
```

Anywhere else (Bun installed; first run downloads the package, ~20 s):

```sh
bunx --bun github:henriquefps/logo-designer <command> …
bunx --bun github:henriquefps/logo-designer designer <command> …   # same thing
```

**Pin the commit.** Bun caches an unpinned `github:` spec and keeps serving that old build
after `main` moves (for example `Unknown option --no-open` from a build older than `present`).
Pin the current `main` commit so you always run the latest CLI:

```sh
DESIGNER="github:henriquefps/logo-designer#$(git ls-remote https://github.com/henriquefps/logo-designer.git main | cut -c1-12)"
bunx --bun "$DESIGNER" present concept-a.designer.json concept-b.designer.json
```

| Command | What it does |
| --- | --- |
| `designer new [--preset P] [--name N] [-o file]` | empty project. `P`: `app-icon`, `android-adaptive`, `ios`, `favicon-32`, `favicon-16` (sets the `icon` field and a transparent artboard) or `WIDTHxHEIGHT` (default `1024x1024`, white) |
| `designer from-svg <file.svg\|-> [-o file] [--name N] [--icon P] [--no-fit]` | editable project from an SVG (**with `--icon`, the drawing is fitted to its keyline** so the project opens centred and at the right size; `--no-fit` keeps the raw drawing): `<rect>`/`<circle>`/`<ellipse>` stay shapes, everything else becomes Bézier paths, `<g>` stays groups, gradients, strokes, transforms, `<style>` and `<use>` are resolved. `clip-path` and solid `mask`s become real geometry (see below). Warnings go to stderr |
| `designer to-svg <project> [-o file]` | clean SVG of the artboard, text outlined with the bundled fonts |
| `designer to-svg <project> --glyph [-o file]` | glyph fragment for `build-icons.mjs`, byte-identical to the app's File → Export icon → Glyph SVG: the visible tile (icon projects) or the artboard's long side mapped to a 128 box, every paint → `currentColor` keeping its alpha, references and hidden objects skipped, all group/object transforms baked into plain coordinates (strokes scale with them; so the Android splash drawable always works), no `<svg>` wrapper |
| `designer icons <project> -o <dir> [--small <project>] [--shape S]` | the whole icon set, same files and numbers as `build-icons.mjs` (ported to `src/icon/`, rendered with resvg): `docs-img/`, `site/`, `android/res/`, `ios/` (`AppIcon.appiconset` Light/Dark/Tinted + iOS 26 `AppIcon.icon`), `review-sheet.png`, `README.txt`, `glyph.svg` and the project. Prints the script's report (`shape tall: glyph 48% x 68% of the tile, ink 11.0%` …). Look at `review-sheet.png` |
| `designer fit <project> [-o file]` | **scale and centre the glyph of an app icon project onto its keyline**: the same transform as the app's *Fit to keyline* (shared code, strokes scale with the glyph), measured like `icons`. In place unless `-o`. Prints before/after (long side as a fraction of T, on keyline yes/no). Error if the project is not an app icon. Run it after manual edits or `knockout`; exports fit automatically, so this only keeps the canvas in line with them. Idempotent |
| `designer to-png <project> --size N [-o file]` | PNG N px wide (resvg). Default output `<project>-N.png` |
| `designer validate <project…>` | `ok`/`FAIL` per file; errors name the JSON path (`children[2].fill.stops[0].color: …`). Exit 1 on failure. For icon projects, a `note:` (not an error) when the glyph is off its keyline |
| `designer info <project> [--json]` | artboard, `icon`, content bounds and the node tree with names, world bounds and ids (`[id]` at the end of each line); for icon projects also `keyline: …, on keyline: yes/no` (`keyline` in `--json`): use them to address objects in `knockout` |
| `designer knockout <project> --cutter <id\|name>[,…] [--targets <id\|name>,…] [--gap N\|NT] [--outline-only] [-o file]` | **cut the objects behind a shape where it sits, with a small gap**, like the app's Object → Knock out (same code). The cutter stays as it is; each target becomes target − (cutter's silhouette grown by the gap; an unfilled closed shape counts as solid, `--outline-only` cuts only under its strokes), strokes outlined first, as plain editable paths keeping name, opacity and z-order. Targets default to everything drawn below the cutter. Gap in document units, or a tile fraction on icon projects (`0.03T`, the default there; 4 px elsewhere). Names must be unique, else use ids. Prints what was cut to stderr |
| `designer open <project\|svg> [more…] [--no-wait]` | **the way to hand a file over.** One file: opens Designer in the default browser (macOS `open`, Linux `xdg-open`, Windows) with the file and prints one short line; the browser asks Henrique to confirm the import. Several files, or no GUI (SSH without a display): same as `present` |
| `designer present <files…> [--port 8765] [--no-open]` | **the way to hand over several files.** Local gallery at `http://localhost:<port>/`: a card per file (SVG preview, name, artboard size) with an **Open in Designer** button. Opens the browser unless `--no-open`, prints one short URL, runs until Ctrl+C (run it in the background) |
| `designer link <project\|svg> [--name N]` | (avoid; for scripts) prints a `https://designer.hfps.dev/#open=…` link that carries the file |
| `designer link <file> --github` | prints a `?import=` link to the file's raw URL on GitHub (current branch; it must be pushed) |
| `designer link --url <url>` | prints a `?import=` link for any URL that allows CORS |
| `designer serve <project\|svg> [--port 8765]` | serves one file on `http://localhost:<port>/` with CORS and prints its `?import=` link (Ctrl+C to stop) |

Every command takes `--origin http://localhost:5173` to make links for a local dev server instead of
production. Without `-o`, projects and SVGs go to stdout; `-` reads the SVG from stdin.

The CLI runs the app's own code (`src/model`, `src/io`, the fonts module) with a DOM shim
(happy-dom), so a file that passes `designer validate` opens in the app, and `to-svg` matches the
app's File → Export.

## Knockouts, not clip paths or tile-coloured shapes

App icon glyphs are **one colour** (`currentColor`: white on the tile, themed on Android). A shape
painted in the tile colour to hide what is behind it does not work: Designer paints it white like
everything else, and themed icons would show it. To make one object sit "in front of" another
(an overlapping back file, a ring behind a dot), **cut the back object**:

```sh
bun run designer info glyph.designer.json                      # names and [ids]
bun run designer knockout glyph.designer.json --cutter "Front file" -o glyph.designer.json
```

Do this instead of a `<clipPath>` when Henrique will edit the result: the cut is real geometry he
can node-edit. (`from-svg` also turns `clip-path="url(#…)"` and masks made of solid white/black
shapes into real geometry, intersecting the content with the clip, respecting `clip-rule`,
`clipPathUnits` and transforms, strokes outlined first, so a clipped glyph imports looking the same.
Luminance masks with gradients or greys are imported unmasked with a warning.) Exports never contain
clip paths, so `--glyph` and `build-icons.mjs` stay byte-compatible.

## The workflow

1. **Write the drawing.** Prefer SVG (agents are good at it): a `viewBox` that is the artboard
   (`0 0 128 128` for an app icon glyph), plain shapes and paths, solid colors or gradients. Or
   write `.designer.json` directly when you need exact Designer features (names, locked/hidden
   layers, stars, text with a bundled font); start from `designer new` and the
   [format doc](project-format.md).
2. **Make it a project and check it:**

   ```sh
   bun run designer from-svg scripts/glyph.svg -o scripts/glyph.designer.json --name "Glyph" --icon app-icon
   bun run designer validate scripts/glyph.designer.json   # notes if the glyph is off its keyline
   bun run designer info scripts/glyph.designer.json      # bounds + keyline: is it centered, inside the box?
   bun run designer to-png scripts/glyph.designer.json --size 256 -o /tmp/glyph.png   # look at it
   ```

3. **Hand it over** with one of:
   - **`bun run designer open scripts/glyph.designer.json`** (recommended): launches the browser
     straight into Designer, nothing to paste. For several files or variants,
     **`bun run designer present a.designer.json b.designer.json`** (run in the background): a gallery
     page with previews and an *Open in Designer* button per file. The buttons use `?import=` links
     to the gallery's own `localhost` server, so every URL stays short.

     **Never paste `#open=` links into chat; they are 750–1000+ characters, wrap, and the click opens
     a truncated URL ("links don't work").** If you must send a link, commit the file and use `--github`.
   - `bun run designer link scripts/glyph.designer.json` → an `#open=` link (prints a warning when
     stdout is a terminal). Only for scripts that pass it to a browser themselves; never print it to chat.
   - Commit and push the file, then `bun run designer link scripts/glyph.designer.json --github`
     → a `?import=` link to raw.githubusercontent.com. Best for big files or a file that should
     stay the source of truth.
   - `bun run designer serve scripts/glyph.designer.json` → a `?import=` link to a local server
     (same machine only; keep the command running until the import is done).
4. **Henrique opens the link.** Designer asks *Import “Glyph” into your projects?*; Import adds it
   as a **new project** (it never overwrites one) and opens it.
5. **Henrique edits**, then saves back into the repo:
   - File → **Save project file** (⌘S / Ctrl+S): the first time it asks where (pick
     `scripts/glyph.designer.json` in the checkout); after that ⌘S writes to that same file, with a
     "Saved to glyph.designer.json" toast. File → **Open project file…** also remembers the file,
     so opening `scripts/glyph.designer.json` and pressing ⌘S saves in place.
   - File → **Save project file as…** (⇧⌘S) picks another file.
   - For the icon build: `bun run designer to-svg scripts/glyph.designer.json --glyph -o scripts/glyph.svg`
     (same bytes as the app's File → Export icon → Glyph SVG), then run `build-icons.mjs`; or
     `bun run designer icons scripts/glyph.designer.json -o /tmp/icons` for the whole set without sharp.
6. **Commit** `scripts/glyph.designer.json` (+ `scripts/glyph.svg`). An agent can pick up the edited
   JSON from the repo for the next round (`designer info`, edit JSON, `link` again).

## Open links in detail

- `https://designer.hfps.dev/#open=<data>[&name=<name>]`: `data` is the file (compact project JSON,
  or SVG markup) compressed with **deflate-raw** and encoded as **base64url** (no padding). `name`
  names an SVG project (a project carries its own name). The fragment never reaches the server.
- `https://designer.hfps.dev/?import=<url-encoded URL>`: the app downloads a `.designer.json` or
  `.svg` (detected from the content) with `fetch`, so the server must send
  `Access-Control-Allow-Origin` (raw.githubusercontent.com and `designer serve` do; GitHub's
  normal `github.com/…/blob/…` pages do not). Chrome may ask to allow access to a local network
  device for `http://localhost` URLs; `designer serve` answers the Private Network Access preflight.
- Both remove themselves from the address bar right away, so a reload does not import twice. A
  link pasted into an open tab works too (`hashchange`).
- **Size:** the practical limit of an `#open=` link is Chrome's 2 MB URL limit; the CLI refuses
  longer links and warns above 64 KB, because chat apps and mail clients may cut long links. A
  typical icon project is 1–5 KB of link; a detailed illustration with hundreds of paths can reach
  100 KB+. A cut link shows "The link is incomplete or damaged"; use `--github` or `serve`
  instead. Imports above 32 MB decompressed are refused.
- Errors are toasts: invalid project (with the JSON path), not SVG, HTTP status, CORS.

## Save in place: browsers and the manual check

Save in place uses the File System Access API: **Chrome, Edge, Opera, Arc** on desktop. Firefox and
Safari (and phones) fall back to downloading `<name>.designer.json`, as before. The file handle is
kept per project in IndexedDB (`file:<projectId>` in the `designer` db); after a reload Chrome asks
once more for permission to write ("Allow Designer to edit glyph.designer.json?"). If the file was
moved or deleted, ⌘S asks where to save again.

Tests: `src/io/fileAccess.test.ts` covers the logic with fake handles. It was also run in real
Chromium (Playwright) with an origin-private file standing in for the native picker: first ⌘S picks,
the second writes in place without a picker, and after a reload ⌘S still writes to the same file.
Manual check (native dialogs can't be automated):

1. In Chrome, File → Open project file… → pick `scripts/glyph.designer.json` in the checkout.
2. Move a shape, press ⌘S → toast "Saved to glyph.designer.json"; `git diff` shows the change.
3. Reload the page, move it again, ⌘S → Chrome asks to allow editing → Allow → saved, same file.
4. ⇧⌘S → the save dialog opens; pick a new name → later ⌘S goes to the new file.

## Not built (on purpose)

- **An MCP server**: it would duplicate the CLI behind a protocol and need a running process; the
  CLI is already one command per action and works from any agent with a shell.
- **A `window` automation API** for agents driving the page: it needs a browser session and
  couples agents to UI internals. (`window.__designer` exists in development only, for tests.)
- **A watch folder** (the app reloading a file when an agent edits it): the browser can't watch
  files without a handle the user picked; reopening the file or a new link is enough.

The format + CLI + links cover agent work with far less surface. Revisit if agents need to edit a
project while Henrique has it open.
