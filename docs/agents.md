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
| `designer new [--preset P] [--name N] [-o file]` | empty project. `P`: `app-icon`, `android-adaptive`, `ios`, `favicon-32`, `favicon-16` (sets the `icon` field and a transparent artboard), `wireframe` (an empty [wireframe](#wireframes), no screens yet) or `WIDTHxHEIGHT` (default `1024x1024`, white) |
| `designer screen <project> [--name N] [--platform phone\|tablet\|desktop] [-o file]` | wireframe projects: adds a screen (default phone), placed right of everything. When a screen called N exists, adds its `--platform` **variant** instead: a copy of its content next to it (one frame per platform; an error when that platform exists). In place unless `-o` |
| `designer from-svg <file.svg\|-> [-o file] [--name N] [--icon P [--tile #hex] [--colour one\|full] [--glyph #hex]] [--no-fit]` | editable project from an SVG (**with `--icon`, the drawing is fitted to its keyline** so the project opens centred and at the right size; `--no-fit` keeps the raw drawing): `<rect>`/`<circle>`/`<ellipse>` stay shapes, everything else becomes Bézier paths, `<g>` stays groups, gradients, strokes, transforms, `<style>` and `<use>` are resolved. `clip-path` and solid `mask`s become real geometry (see below). Warnings go to stderr |
| `designer to-svg <project> [-o file]` | clean SVG of the artboard, text outlined with the bundled fonts |
| `designer to-svg <project> --glyph [--colour one\|full] [-o file]` | glyph fragment for `build-icons.mjs`, byte-identical to the app's File → Export icon → Glyph SVG: the visible tile (icon projects) or the artboard's long side mapped to a 128 box, every paint → `currentColor` keeping its alpha (a **full-colour** icon project, or `--colour full`, keeps the real paints instead: solids, gradients, opacity; pass `--colour full` to `build-icons.mjs` too), references and hidden objects skipped, all group/object transforms baked into plain coordinates (strokes scale with them; so the Android splash drawable always works), no `<svg>` wrapper |
| `designer icons <project> -o <dir> [--small <project>] [--shape S] [--tile <#hex>] [--colour one\|full] [--glyph <#hex>]` | the whole icon set, same files and numbers as `build-icons.mjs` (ported to `src/icon/`, rendered with resvg): `docs-img/`, `site/`, `android/res/`, `ios/` (`AppIcon.appiconset` Light/Dark/Tinted + iOS 26 `AppIcon.icon`), `review-sheet.png`, `README.txt`, `glyph.svg` and the project. Prints the script's report (`shape tall: glyph 48% x 68% of the tile, ink 11.0%` …). Look at `review-sheet.png`. `--tile <#hex>` sets the tile colour everywhere (tiles, favicons, Android launcher background, iOS Light and `AppIcon.icon` fill, the light variant's glyph, the review sheet) and derives the iOS Dark glyph from it; default: the project's `icon.tile`, else the hfps blue `#2063b0`. Older hfps repos keep their olive tile: `--tile #5b7a3a`. `new --preset app-icon --tile #hex` / `from-svg --icon app-icon --tile #hex` store it in the project |
| `designer fit <project> [-o file]` | **scale and centre the glyph of an app icon project onto its keyline**: the same transform as the app's *Fit to keyline* (shared code, strokes scale with the glyph), measured like `icons`. In place unless `-o`. Prints before/after (long side as a fraction of T, on keyline yes/no). Error if the project is not an app icon. Run it after manual edits or `knockout`; exports fit automatically, so this only keeps the canvas in line with them. Idempotent |
| `designer to-png <project> --size N [-o file]` | PNG N px wide (resvg). Default output `<project>-N.png` |
| `designer to-png <wireframe> [--screen N] [--platform P] [--size N] [-o dir\|file.png]` | wireframe projects: **one PNG per screen frame**, `<screen>.<platform>.png` (e.g. `settings.phone.png`) in `-o dir` (default `<project>-screens/`); `--screen` (name or slug) and `--platform` pick frames; `--size` = PNG width (default the frame width, 1×; the height follows the frame). One matching frame and `-o x.png` writes that file |
| `designer wf build <spec.json\|-> [-o project.designer.json] [--into existing.designer.json]` | wireframes from a **spec** ([`wireframe-spec.md`](wireframe-spec.md)): screens as a tree of library components, stacks, shared components, flows and notes, built through the app's pipeline. Errors name the spec path (`screens[1].root[3].list-row.trailing: "arrow" is not one of …`), all at once. `--into` updates that project by id (in place unless `-o`): what the spec states wins, the geometry it leaves out is kept, only what it no longer lists is removed. Without `-o` / `--into`: stdout |
| `designer wf dump <project> [-o spec.json] [--no-geometry]` | wireframe project → spec, every node with its id, defaults left out (to read what was edited by hand). `--no-geometry` leaves out positions and sizes, so a later `build --into` keeps the project's |
| `designer wf components [kind…] [--json]` | the component catalog, generated from the library: kind, label, platforms, category, props (type, default, options, visibleWhen, help), sizing / resizable / placement, short form and an example per component; Markdown or `--json` |
| `designer wf sheet <wireframe> [-o sheet.png] [--platform P] [--notes] [--scale S] [--max N]` | wireframe projects: **one image of every frame laid out as on the canvas**, with names, platform, status badges (Current / Changed / New) and flow arrows (same geometry as the canvas overlay, labels included), for reviewing the whole flow. `--notes` adds the notes and their connectors; `--platform` shows only that platform's frames (flows to hidden frames are dropped); `--scale` (default 1) is output px per canvas unit, reduced so the long side stays within `--max` (default 4096 px). Default output `<project>-sheet.png` |
| `designer wf compare <screenshot.png\|jpg> <wireframe> --screen N [--platform P] [-o out.png] [--grid N] [--overlay PCT] [--scale S] [--max N]` | the screenshot (scaled to the frame's width, keeping its aspect) and the rendered frame **side by side**, labelled; `--grid N` draws a thin grid every N frame px on every panel; `--overlay 50` adds a third panel with the frame blended 50 % over the screenshot, for alignment checks. `--platform` is needed when the screen has several frames. Default output `<screen>.<platform>.compare.png`. Use it in the loop: look, fix the spec, render, compare again |
| `designer export-ai <wireframe> [-o out.zip \| --dir folder]` | wireframe projects: the **Export for AI** package, same as File → Export for AI… in the app: `README.md` (screens and platforms, free notes), `screens/<slug>.md` (every variant's component tree from the components' descriptions, with the notes next to their elements), `screens/<slug>.<platform>.png` (resvg, notes excluded) and `project.designer.json`, in a `<project>/` folder inside the zip. Default output `<project>-for-ai.zip`; `--dir` writes the files into a folder instead. Give the zip (or the `.md` files) to an agent that builds the app |
| `designer to-svg <wireframe> [--screen N] [--platform P] [-o file]` | one screen frame (white, content clipped; `--platform` when the screen has several) or, without `--screen`, every screen on one canvas |
| `designer validate <project…>` | `ok`/`FAIL` per file; errors name the JSON path (`children[2].fill.stops[0].color: …`). Exit 1 on failure. For icon projects, a `note:` (not an error) when the glyph is off its keyline |
| `designer info <project> [--json]` | artboard, `icon`, content bounds and the node tree with names, world bounds and ids (`[id]` at the end of each line); for icon projects also `keyline: …, on keyline: yes/no` (`keyline` in `--json`): use them to address objects in `knockout` |
| `designer knockout <project> --cutter <id\|name>[,…] [--targets <id\|name>,…] [--gap N\|NT] [--outline-only] [-o file]` | **cut the objects behind a shape where it sits, with a small gap**, like the app's Object → Knock out (same code). The cutter stays as it is; each target becomes target − (cutter's silhouette grown by the gap; an unfilled closed shape counts as solid, `--outline-only` cuts only under its strokes), strokes outlined first, as plain editable paths keeping name, opacity and z-order. Targets default to everything drawn below the cutter. Gap in document units, or a tile fraction on icon projects (`0.03T`, the default there; 4 px elsewhere). Names must be unique, else use ids. Prints what was cut to stderr |
| `designer open <project\|svg> [more…]` | **the way to hand a file over.** One file: opens Designer in the default browser (macOS `open`, Linux `xdg-open`, Windows) with the file and prints one short line; the browser asks Henrique to confirm the import. A file whose `#open=` link would be over 64 KB (30 000 characters on Windows), such as a 10-screen wireframe or anything with an embedded screenshot, is served on `localhost` instead and opened with a short `?import=` link; the command waits until Designer has downloaded it, then exits ([sizes](#open-links-in-detail)). Several files, or no GUI (SSH without a display): same as `present` |
| `designer present <files…> [--port 8765] [--no-open]` | **the way to hand over several files.** Local gallery at `http://localhost:<port>/`: a card per file (SVG preview, name, artboard size) with an **Open in Designer** button. Opens the browser unless `--no-open`, prints one short URL, runs until Ctrl+C (run it in the background) |
| `designer link <project\|svg> [--name N]` | (avoid; for scripts) prints a `https://designer.hfps.dev/#open=…` link that carries the file |
| `designer link <file> --github` | prints a `?import=` link to the file's raw URL on GitHub (current branch; it must be pushed) |
| `designer link --url <url>` | prints a `?import=` link for any URL that allows CORS |
| `designer serve <project\|svg> [--port 8765]` | serves one file on `http://localhost:<port>/` with CORS and prints its `?import=` link (Ctrl+C to stop) |
| `designer live <project> [--server URL]` | **live editing** through Henrique's sync server ([below](#live-editing)): pushes the file now, then mirrors both ways until Ctrl+C. File edits are pushed within a second; edits made in the app are written back to the file. Run it in the background |
| `designer sync push <project> [--server URL]` | uploads a project file once (it then appears in the app on every device with Sync on); prints an `?open-project=` link |
| `designer sync pull <project\|id> [-o file] [--server URL]` | downloads a project: into its own file (matched by the file's `id`), or for an id into `-o` / `<name>.designer.json` |
| `designer sync list [--json] [--server URL]` | the projects on the server: id, last change, size, name |

Every command takes `--origin http://localhost:5173` to make links for a local dev server instead of
production. Without `-o`, projects and SVGs go to stdout; `-` reads the SVG from stdin.

The CLI runs the app's own code (`src/model`, `src/io`, the fonts module) with a DOM shim
(happy-dom), so a file that passes `designer validate` opens in the app, and `to-svg` matches the
app's File → Export. Text is outlined with the same code the canvas measures with, and a test
(`src/fonts/__tests__/browserFidelity.test.ts`) keeps `to-png` / `export-ai` renders within a fraction of a
pixel and a few percent of ink of what the app (Chromium) draws, for Inter 400–700 and letter spacing up
to 0.14 em.

## App icon colours: one colour by default, full colour when asked

App icon glyphs are **one colour** by default (`icon.colour: "one-colour"`: every paint becomes the glyph
colour, white unless `icon.glyph` / `--glyph <#hex>` says otherwise, e.g. a red glyph on a white tile with `--tile #ffffff`;
themed on Android). That is the hfps house style: use it unless the person asks for colour. When they do
(the Designer logo with each shape in its own colour, a rainbow gradient, a multicolour brand mark), use
**`--colour full`** (`new` / `from-svg --icon … --colour full`, or `icon.colour: "full-colour"` in the project; `icons`
and `to-svg --glyph` accept it too): the drawing's solids, gradients and opacity are kept in every output. The set
stays correct on every platform without extra work: Android 13+ monochrome is the glyph's silhouette, iOS Tinted its
grayscale on black, iOS Dark the same colours on transparency (so pick colours that read on near-black), the splash
VectorDrawable keeps solids and gradients, `icon-light.svg` puts the glyph on a white tile. Check the report: a
`! contrast:` line means a glyph colour is too close to the tile (WCAG 3:1). The tile is always one solid colour.

## Knockouts, not clip paths or tile-coloured shapes

One-colour glyphs paint every shape the glyph colour, so a shape
painted in the tile colour to hide what is behind it does not work: Designer paints it white like
everything else, and themed icons would show it. Full-colour glyphs have the same problem on the themed variants (the
silhouette and the grayscale would show the cover shape), so knockouts stay the right tool in both modes. To make one object sit "in front of" another
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

## Wireframes

Wireframe projects plan an app's UI: screens (phone 390, tablet 820, desktop 1440 wide; the height grows with
the content) on an infinite canvas ([`wireframe-mode.md`](wireframe-mode.md), file fields in
[`project-format.md`](project-format.md#wireframe-documents)). A new screen's content is a vertical stack
(`layout`): add children in reading order and the layout places them when the file is opened or validated.
Phase 1 of the CLI:

```sh
bun run designer new --preset wireframe --name "Notes app" -o notes.designer.json
bun run designer screen notes.designer.json --name Home                        # phone (default)
bun run designer screen notes.designer.json --name Settings --platform desktop
bun run designer screen notes.designer.json --name Settings --platform phone   # variant of Settings
bun run designer validate notes.designer.json      # lists screens and frames: Settings: desktop 1440×900 […], phone 390×844 […]
bun run designer to-png notes.designer.json        # notes-screens/home.phone.png, settings.desktop.png, settings.phone.png
bun run designer to-png notes.designer.json --screen settings --platform phone -o settings.png
```

Content goes inside a frame's `children` in the frame's local space (origin = its top-left). Component
instances (`component: { kind, props }`) are generated on open; write their props, not their children.
`validate`, `info` and the renders materialize the file first (screen heights, component children), exactly
like the app does on open, and print a `warning:` for what was ignored (an unknown component kind loads as a
plain group). `export-ai` turns the project into the package an AI agent reads to build the app (`bun run designer export-ai notes.designer.json`).
To build screens, write a spec instead of node trees: next section.

## Wireframes from the CLI

Write screens as a **spec** ([`wireframe-spec.md`](wireframe-spec.md), schema
`https://designer.hfps.dev/schema/wireframe-spec.schema.json`) and let `designer wf build` make the project: library
components (`{ "list-row": { "title": "Language", "trailing": "value", "value": "English" } }`, or short forms like
`{ "heading": "Settings" }`), stacks (`{ "vstack": [ … ], "gap": 8 }`), shared components (`{ "use": "Tab bar" }`),
flows (`"opens": "Language"` on a node, or `flows: [{ "from": "Settings/Language", "to": "Language" }]`) and notes. The
pipeline is the app's, so stacks, sizes, repeat copies, shared instances and screen heights come out exactly as the
app makes them; nothing to position by hand.

```sh
bun run designer wf components                              # the pieces: props, defaults, options, examples (--json)
bun run designer wf components list-row                     # one of them
bun run designer wf build hoard.spec.json -o hoard.designer.json
#   Built: 2 screens (2 frames), 17 nodes
bun run designer to-png hoard.designer.json                 # look at it: hoard-screens/settings.phone.png, server.phone.png
bun run designer wf dump hoard.designer.json --no-geometry -o hoard.spec.json   # later: read what Henrique changed
# … edit hoard.spec.json …
bun run designer wf build hoard.spec.json --into hoard.designer.json
#   Updated hoard.designer.json: 2 screens (2 frames), 18 nodes: 1 added, 0 removed, 21 kept
```

- The whole spec is checked first; every problem comes back at once, each with its spec path and, for typos, a
  "did you mean". Exit code 1, nothing written.
- `dump` gives every node its `id`; `build --into` updates by id, so manual sizes and positions survive (use
  `dump --no-geometry`, or leave `x` / `y` / `width` / `height` out of what you write) and only what the spec no
  longer lists is removed. `build(dump(p))` gives `p` back.
- Lucide icons (`"icon": "heart"`) are drawn by the CLI too; Iconify ones (`"ph:heart"`) show a placeholder until
  the app opens the file.
- **Hand a wireframe over with live editing**, not a link: wireframes are big (a 10-screen project is ~1.4 MB
  of JSON, several MB with a reference screenshot), and live editing keeps Henrique's copy and the file in step
  for the rest of the session. `designer open` still works for a one-off (it switches to `?import=` by itself).
- While Henrique watches: run [`designer live`](#live-editing) on the project; every `wf build --into` then shows
  up in his app within a second, and his edits are written back to the file (`wf dump` it before the next build).
- Then `export-ai` packages the result for the agent that builds the app.

## Live editing

With Henrique's sync server ([`sync.md`](sync.md)) an agent can work on a project **while he watches and
adjusts it** in the app: no links, no re-imports, both sides see each other's edits within a second.

```sh
# server from --server or DESIGNER_SYNC_URL; key from DESIGNER_SYNC_KEY or SYNC_API_KEY (here via skv)
skv run designer-sync -- bun run designer live hoard.designer.json &
# Live: “Hoard” (dmwob5jkn1oddhqb) ↔ https://sync.example.com
# Open Designer with Sync on (same server): it appears in your projects. Or open https://designer.hfps.dev/?open-project=dmwob5jkn1oddhqb
# Edits to hoard.designer.json are pushed within a second; edits in the app are written back to it. Ctrl+C to stop.
# 10:36:08 PM ↑ pushed (start)
# 10:36:12 PM ↑ pushed (file changed)
# 10:36:14 PM ↓ pulled (changed on the server, edited in the app) → hoard.designer.json
```

- Keep editing the file as usual (`designer screen`, writing the JSON, `wf build --into` …): each save is
  pushed. The file must be valid; a broken save is reported (`! not pushed: …`) and the next one is tried.
- **Henrique's edits come back into the file**: re-read it before the next change (it is rewritten whole,
  atomically). The file never carries the `live` mark; the server copy does.
- Give him the printed `?open-project=` link (or tell him it is in his projects). The app shows **Live ·
  the CLI / this device / another device** in the top bar: who saved the current version.
- **Conflicts** follow the sync rules (last write wins, the loser is kept): when both sides changed before
  either was synced, the newer one wins and the other is saved next to the file as
  `<name> (conflicted copy YYYY-MM-DD).designer.json` (the server also archives what it overwrote).
- If the project is deleted in the app, `live` stops and leaves the file alone. Ctrl+C pushes once more
  without the live mark.
- One-off transfers: `designer sync push|pull|list` (same server and key). A push is stamped "now", so it
  wins over older versions (which the server archives); it is refused only when the server's copy is
  stamped later (a device clock ahead), and then `sync pull` first.

## AI agent bridge (`designer agent`)

The app's AI features ("Generate with AI" on a flow, "Turn into a wireframe with AI" for a screenshot, "Adapt to
tablet / desktop with AI", "Ask the agent…") send **jobs** to the sync server ([`sync.md`](sync.md) → Jobs).
`designer agent` runs on one of Henrique's machines, takes them one at a time and runs **his own Claude Code**
on each (headless `claude -p`, his subscription; no API key anywhere in the app). The project is mirrored live
while it works, so the screens appear in the app as they are built. Spec: [`wireframe-mode.md`](wireframe-mode.md)
→ Phase 4.

```sh
# on cachy (cachyos-fps), from a checkout of this repo: server and key exactly as for `designer live`
~/.local/bin/skv run designer-sync -- bun run designer agent --name cachy
# Agent “cachy” (agent-…) online on https://sync.example.com with 2.1.328 (Claude Code).
# Waiting for jobs from the Designer app; one at a time, at most 15 min each. Job folders: ~/.cache/designer-agent (kept a day). Ctrl+C to stop.
```

Options: `--server URL` (or `DESIGNER_SYNC_URL`), `--name N` (shown in the app, default the host name),
`--workdir DIR` (default `$XDG_CACHE_HOME/designer-agent`), `--max-minutes 15` (per job), `--claude PATH`
(or `DESIGNER_AGENT_CLAUDE`; default `claude` on PATH). Keep it running in a terminal, tmux or a user service.

It **refuses to start** when `claude` is not found, when `claude auth status` does not say `loggedIn: true`
(run `claude` once and log in), or when the server has no job queue (designer-sync older than 0.3.0) or
refuses the key.

Per job: claim it (two agents never run the same one) → `<workdir>/<jobId>/` with the project pulled into
`project.designer.json`, marked live and mirrored (the same code as `designer live`) and the screenshots in
`attachments/` → a prompt from the job type's template (`src/cli/agent/prompts/`: the task, the source screen
as a `wf dump` excerpt, the tapped element and platform, Henrique's hint as quoted data, the rules) with the
"Wireframes" section of `skills/designer/SKILL.md` appended as system prompt → `claude -p --output-format
stream-json` in that folder → short progress lines for the app's job panel ("Reading the project (wf dump)",
"Round 2: building into the project", "Checking with wf compare"; never tool output) → finish with the
agent's last message as the summary. A heartbeat every 15 s says online / busy. Cancel (from the app, seen
on the event stream, the poll or a progress answer) and `--max-minutes` kill Claude Code's whole process tree;
the project keeps what was already built. Job folders and the bridge's own files (`.bridge/<jobId>/`: wrapper and `stream.jsonl`, for
debugging) are deleted after a day. Ctrl+C finishes a running job as failed.

### Security model

One person's Claude Code login, for that person's own projects, on that person's machine. What a job can make
Claude Code do is fenced four times:

1. **Tools.** `--tools Bash,Read,Write,Edit` (no web fetch or search, no subagents, no other tools exist in the
   session), `--allowedTools "Bash(designer wf *)" "Bash(designer screen *)" "Bash(designer to-png *)"
   "Bash(designer validate *)" "Bash(designer info *)" Read Write Edit` and `--permission-mode dontAsk
   --permission-prompts none`: anything else, including chained commands (`designer wf … && ls /`),
   substitutions (`$(…)`), variable prefixes (`X=… designer …`) and `./designer`, is denied without asking anyone.
2. **Folder and settings.** `--restricted` confines Read / Write / Edit to the job folder and ignores the
   user's and project's settings files (their allow rules cannot widen the list); `--safe-mode
   --strict-mcp-config --disable-slash-commands` leave out CLAUDE.md, skills, plugins, hooks and MCP servers;
   `--no-session-persistence`. Model: the CLI default.
3. **The `designer` it runs** is a wrapper the agent cannot touch: it lives **outside the job folder**, in
   `<workdir>/.bridge/<jobId>/bin/designer` (folder and file read-only, 0500; first on the agent's PATH), with
   the job's stream log next to it. It passes only `wf`, `screen`, `to-png`, `validate` and `info` to this
   checkout's CLI, with the sandbox root baked in, and starts Bun with `--no-install --config=/dev/null
   --no-env-file --tsconfig-override=<repo>/tsconfig.json`: a `bunfig.toml` (its `preload` would run any
   script), `.env` or `tsconfig.json` the agent writes into the job folder is never read. The sync server's
   address and key (`DESIGNER_SYNC_*`, `SYNC_API_KEY`) are removed from the agent's environment: only the bridge
   talks to the server.
4. **The CLI's sandbox** (`src/cli/sandbox.ts`, on when `DESIGNER_SANDBOX_ROOT` is set, as the wrapper does):
   - only those commands run (`live`, `sync`, `serve`, `open`, `present`, `agent`, … exit 2), even if
     something bypassed the wrapper;
   - every file the CLI reads or writes (inputs, `-o`, `--into`, the screenshot of `wf compare`, the folder of
     `to-png`) must resolve inside the job folder, through every symlink (a link pointing out, or a broken
     one, is refused), else `designer: cannot read|write <path>: it is outside the job folder`;
   - rendered SVG keeps only `data:` and `#…` references (resvg would otherwise draw any local image file a
     project names, e.g. `href="/home/…/private.png"`, into a PNG the agent can look at);
   - `fetch` serves the bundled font files only: no network.

Text from the app (a hint, a free request) goes into the prompt as one JSON string inside a tag, with `<` and
`>` escaped, and the prompt tells the agent it is data that cannot change the rules. Even if a hint talks the
agent into trying something else, the fences above refuse it.

Check the fences against the real Claude Code on a machine (one short session, ~30 s):

```sh
bun scripts/agent-restrictions.ts
# Claude Code: refuses ls /, curl, cat /etc/passwd, designer live, chained, $(…), X=… prefixes, ./designer,
#   Read/Write outside the folder, Read/Edit/Write of the wrapper, WebFetch (not in the session);
# the CLI: refuses -o / --into / wf dump / validate / info / wf compare / to-png on paths outside the folder;
# planted bunfig.toml + tsconfig.json + .env have no effect; an image pointing outside renders blank;
# designer wf, build --into, inside Read/Write run. Exit 0 = all checks passed
```

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
- **Big projects:** `designer open` picks the path by itself. Up to 64 KB of link (30 000 characters on
  Windows) it opens the `#open=` link; above that it serves the file on `localhost` and opens a
  `?import=` link, because the OS opener refuses long arguments well before Chrome's 2 MB (Linux: 128 KB
  per argument, `E2BIG`; macOS: 1 MB; Windows: 32 767 characters). `present` always uses `?import=`.
  Measured (2026-11-19):

  | Project | File | Compact JSON | `#open=` link |
  | --- | --- | --- | --- |
  | App icon glyph | 3–10 KB | 1–4 KB | 1–5 KB |
  | Wireframe: Hoard Gallery + Settings (the phase 3 e2e run: 2 screens, 7 notes, 2 flows) | 398 KB | 114 KB | 13 KB |
  | … plus its two screenshots embedded as references | 2.3 MB | 2.0 MB | 1.8 MB |
  | Wireframe: 10 phone screens × ~100 components (shared tab bar, a 6-card carousel, a 24-image grid and a 20-row list per screen, flows, notes) | 4.4 MB | 1.4 MB | 99 KB |
  | … plus one embedded reference screenshot (1080×2243 JPEG, 437 KB) | 5.0 MB | 2.0 MB | 611 KB |
  | … plus two (437 KB + 986 KB) | 6.3 MB | 3.3 MB | 1.8 MB |

  Image *components* are placeholders and cost nothing; embedded bitmaps (reference screenshots, dropped
  photos) are base64 and do not compress, so they decide the size. For an agent session on a wireframe,
  prefer [live editing](#live-editing) (up to 64 MB per project, no link at all) over `open`.
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
  files without a handle the user picked. [Live editing](#live-editing) does this through the sync server.

The format + CLI + links cover agent work with far less surface. Revisit if agents need to edit a
project while Henrique has it open.
