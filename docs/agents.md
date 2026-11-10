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

| Command | What it does |
| --- | --- |
| `designer new [--preset P] [--name N] [-o file]` | empty project. `P`: `app-icon`, `android-adaptive`, `ios`, `favicon-32`, `favicon-16` (sets the `icon` field and a transparent artboard) or `WIDTHxHEIGHT` (default `1024x1024`, white) |
| `designer from-svg <file.svg\|-> [-o file] [--name N] [--icon P]` | editable project from an SVG: `<rect>`/`<circle>`/`<ellipse>` stay shapes, everything else becomes Bézier paths, `<g>` stays groups, gradients, strokes, transforms, `<style>` and `<use>` are resolved. Warnings go to stderr |
| `designer to-svg <project> [-o file]` | clean SVG of the artboard, text outlined with the bundled fonts |
| `designer to-svg <project> --glyph [-o file]` | glyph fragment for `build-icons.mjs`, byte-identical to the app's File → Export icon → Glyph SVG: the visible tile (icon projects) or the artboard's long side mapped to a 128 box, every paint → `currentColor` keeping its alpha, references and hidden objects skipped, no `<svg>` wrapper |
| `designer icons <project> -o <dir> [--small <project>] [--shape S]` | the whole icon set, same files and numbers as `build-icons.mjs` (ported to `src/icon/`, rendered with resvg): `docs-img/`, `site/`, `android/res/`, `ios/`, `review-sheet.png`, `README.txt`, `glyph.svg` and the project. Prints the script's report (`shape tall: glyph 48% x 68% of the tile, ink 11.0%` …). Look at `review-sheet.png` |
| `designer to-png <project> --size N [-o file]` | PNG N px wide (resvg). Default output `<project>-N.png` |
| `designer validate <project…>` | `ok`/`FAIL` per file; errors name the JSON path (`children[2].fill.stops[0].color: …`). Exit 1 on failure |
| `designer info <project> [--json]` | artboard, `icon`, content bounds and the node tree with world bounds and ids |
| `designer link <project\|svg> [--name N]` | prints a `https://designer.hfps.dev/#open=…` link that carries the file |
| `designer link <file> --github` | prints a `?import=` link to the file's raw URL on GitHub (current branch; it must be pushed) |
| `designer link --url <url>` | prints a `?import=` link for any URL that allows CORS |
| `designer serve <project\|svg> [--port 8765]` | serves one file on `http://localhost:<port>/` with CORS and prints its `?import=` link (Ctrl+C to stop) |

Every command takes `--origin http://localhost:5173` to make links for a local dev server instead of
production. Without `-o`, projects and SVGs go to stdout; `-` reads the SVG from stdin.

The CLI runs the app's own code (`src/model`, `src/io`, the fonts module) with a DOM shim
(happy-dom), so a file that passes `designer validate` opens in the app, and `to-svg` matches the
app's File → Export.

## The workflow

1. **Write the drawing.** Prefer SVG (agents are good at it): a `viewBox` that is the artboard
   (`0 0 128 128` for an app icon glyph), plain shapes and paths, solid colors or gradients. Or
   write `.designer.json` directly when you need exact Designer features (names, locked/hidden
   layers, stars, text with a bundled font); start from `designer new` and the
   [format doc](project-format.md).
2. **Make it a project and check it:**

   ```sh
   bun run designer from-svg scripts/glyph.svg -o scripts/glyph.designer.json --name "Glyph" --icon app-icon
   bun run designer validate scripts/glyph.designer.json
   bun run designer info scripts/glyph.designer.json      # bounds: is it centered, inside the box?
   bun run designer to-png scripts/glyph.designer.json --size 256 -o /tmp/glyph.png   # look at it
   ```

3. **Hand it over** with one of:
   - `bun run designer link scripts/glyph.designer.json` → send Henrique the `#open=` link. Works
     anywhere, no server, nothing to commit. Best for anything up to a few hundred KB.
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
