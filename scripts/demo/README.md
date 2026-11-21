# Demo recorder

Short screen recordings of Designer features, made in the real app with real input: Playwright moves
the mouse in visible steps, drags, clicks and types. Nothing calls the stores or injects documents;
each video starts from New document → Wireframe. A fake cursor (with a click ripple), a caption bar
above the app and a key badge (bottom right) make each step readable. Everything drawn on top of the app (caption bar,
ripple, speed and key badges, terminal strip, scene and end cards, file viewer) is in Henrique's **hfps** identity
(`lib/hfps.ts`: the hfps-kit tokens for a palette, blue by default; Inter as the app loads it; Phosphor icons; one white
card on the tinted background, eyebrow labels), so every video looks the same without per-scenario styling.

```sh
bun run demo                 # every scenario → demo-out/<name>.mp4
bun run demo 03 05           # only the scenarios whose file name contains 03 or 05
bun run demo 02 --headed     # watch it run
bun run demo --preview       # against `vite preview` of an existing build instead of `vite` (dev)
DEMO_URL=http://localhost:5173/ bun run demo   # against an app that is already running
DEMO_OUT=/some/dir bun run demo                # another output folder
```

Scenario `07-edicao-ao-vivo` (live editing) also needs Go: it builds and starts a real `designer-sync`,
runs `designer live` on a file and edits that file from the scenario (as an agent would), then stops both
in `teardown()`. The same pieces back `bun run e2e:live` (`scripts/live-e2e.ts`, helpers in `lib/live.ts`).

Scenario `08-agente-ao-vivo` (an agent builds a wireframe live, the phase 3 end-to-end run) also needs Go: a real
`designer-sync`, `designer live` on an empty project, then the three rounds of the real run
(`fixtures/hoard-e2e/round-*.spec.json`) built `--into` it with the CLI while the app shows them; every command and
its real output appear in a terminal strip (`demo.terminal()`). Then Henrique's edits in the app reach the file.
`09-sheet-e-compare` opens the `wf sheet` / `wf compare` images and the to-png before/after in a page. Both read the
Hoard screenshots from `HOARD_SHOTS=<dir>` (`hoard-galeria.jpg`, `hoard-configuracoes.jpg`; without it 08 skips
`wf compare` and 09 shows only the sheet and the fidelity image) and keep their project and images in
`DEMO_E2E_DIR=<dir>` when set:

```sh
HOARD_SHOTS=~/designer-demos/inputs/hoard DEMO_E2E_DIR=/tmp/e2e bun run demo 08 09
```

Scenario `10-links-na-navegacao` (links from parts): a bottom navigation made into the shared "Tab bar" on four
screens, each tab linked once from the master, each screen's own tab selected, then Present through the tabs.

Scenarios `18`–`20` (component kits): `18-kit-proprio` (a project marked with Properties → Project → Use as component kit, then New document → "Start with components from" it, the library's search on top), `19-importar-componentes` (Library → Import from project… into Roam: two nested masters unticked, "Import 6 (2 come along)", then again) and `20-colar-entre-projetos` (copy an instance with nested masters in the kit project, paste into Roam, one undo). They use a fictional "Acme kit" (`lib/acmeKit.ts`) built with `designer wf build` and opened from a `designer link`, in the cut setup.

Scenarios `21`–`23` (slots, text overrides, Layers): `21-conteudo-por-instancia` (a shared "Acme · App shell" made through the UI in the cut setup, its card marked "Content per instance", the shell on a second phone screen, different library components dragged into each card with the insertion line, then the top bar title with "Use everywhere"), `22-texto-por-instancia` (three "Acme · List row" instances: Overridden here, Reset to shared, Use everywhere) and `23-camadas-seguem-o-canvas` (Roam with every screen collapsed in Layers; clicks deep in the canvas open and scroll Layers). Helpers in `lib/acmeShell.ts`.

Scenarios `11`–`15` (phase 4, AI through `designer agent`) run the real thing: a designer-sync with an API key,
`designer agent` with **real Claude Code** (logged in on this machine) and the app with Sync on
(`lib/agent.ts`). 11 pastes the Hoard Settings screenshot (Turn into a wireframe with AI), 12 drags a flow to empty
canvas (Generate with AI), 13 adapts a screen to tablet, 14 asks the agent, 15 is Henrique's benchmark (the whole
Settings screen reorganized; `BENCH_OUT=<dir>` keeps the project, sheet, coverage report and export). The agent's
wait is not cut: `demo.speedUp(n, wait)` plays it n× faster with a "×n" badge (a fast-forward icon), and the
terminal strip shows `designer agent`'s own progress lines. Results differ from run to run (it is a real model).

Scenario `16-overview` (`bun run demo overview`) is the wireframe mode **overview**: one continuous project in ten
chapters, each opened by a full-screen title card (`demo.chapter()`; the caption bar then shows the chapter), the
three real agent jobs of phase 4 (paste a screenshot, Generate with AI from a flow, Henrique's benchmark request on
the Settings fixture opened with File → Open project file…) sped up, Present, and Export for AI shown in a file viewer
(`__demoDoc`) from the real downloaded zip. It runs at `demo.pace = 0.75` (every pause, move and keystroke a little
quicker) and writes `<name>.chapters.txt` with the chapter times in the video. ~5 min, ~10 MB; ~8 min to record.
The agent builds different structures from run to run, so the scenario finds nodes by what they are (`findId`: kind,
text, ancestors) rather than by fixed paths. While the agent works the job panel is hidden (its status is read from
the server) so the screens it builds stay in view.

`node scripts/demo/dev-scenario.ts <scenario> <dir>` develops such a long scenario one chapter at a time against a live
app (no recording; the scenario module exports `chapters`): `echo setup > <dir>/cmd`, `echo "ch 3" > <dir>/cmd` (add
`slow` for real pace and a screenshot every 1.5 s in `<dir>/frames`), `echo "eval x.js" > <dir>/cmd`, `echo quit`.
Editing the scenario reloads the dev page (Vite); the overview hides the job panel again at each chapter.

`node scripts/demo/watch-live.ts <dir>` runs the same pieces for a session driven by hand or by an agent: a
designer-sync on localhost, the app in Chromium with Sync on, and a control folder (`echo <id> > <dir>/open`,
`echo shot.png > <dir>/shot`); see the comment at its top. With `--agent` it is the phase 4 setup (API key, `designer agent` with real Claude
Code, its output in `<dir>/agent.log`), and `cp step.js <dir>/eval` runs a script against the page.

Needs ffmpeg on the PATH and Playwright's Chromium (`bunx playwright install chromium`). Output:
1280 × 840 (the app at 1280 × 800 plus the 40 px caption bar), H.264, 25 fps, a few hundred KB per
video. `demo-out/` is git-ignored; the raw `.webm` stays next to each MP4, and a failing scenario
leaves `<name>.error.png` and exits non-zero.

Scenario `17-promo` (`bun run demo promo`) is the wireframe mode **promo**: ~90 s, all English, a fictional app
(Roam, a trip planner). The Explore screen built by hand from library blocks (sped up ×10–12), the tab bar made a shared
component and its Trips tab dragged out to a new linked screen whose tab bar marks Trips, Generate with AI from the
Lisbon card's flow, then Roam's long, mixed-up Settings (`fixtures/roam/settings-current.spec.json`, 50 items in six
sections) reorganized by the real agent from a plain-English request, Present through the new menu and Export for AI,
closed by the end card. Same backend as the overview (Go, Claude Code logged in); no screenshots needed. It records at
1280 × 800 (the app at 760 under the caption bar, `scenario.video`), runs at `demo.pace = 0.7`, opens on its title
card (`demo.showCard` in the setup) and does what the viewer need not see behind scene cards (`scene({ behind })`: cut
from the video). `PROMO_CHAPTERS=1,2 bun run demo promo` records only some chapters; `dev-scenario.ts` works on it
too. Writes `17-promo.mp4`, `17-promo-poster.png` (`demo.poster()`) and `17-promo.chapters.txt`; ~5 min to record.

## Files

- `run.ts`: starts the app (`lib/server.ts`), records each scenario in a fresh browser context,
  cuts the setup and converts webm → mp4 (`lib/encode.ts`).
- `lib/hfps.ts`: the hfps identity for the overlay: the five palettes, the light tokens derived from them (as
  hfps-kit's `visuals/hfps-tokens.css`, prefixed `--demo-*`), the fonts, Phosphor icon paths, Designer's app icon.
- `lib/overlay.ts`: runs in the page before the app (cursor, ripple, caption bar, key badge, speed badge, a paste box,
  scene cards: `scene` / `title` / `end`, a file viewer), styled from `lib/hfps.ts`. The app is pushed down by the caption bar and shortened by it (the status bar used to sit
  40 px below the window).
  It only listens to events; it never touches the app.
- `lib/demo.ts`: the driver: `move`, `click`, `dblclick`, `drag`, `type`, `fill` (Ctrl + Enter commits a multiline
  field), `key`, `menu`, `zoomAt` (Ctrl + wheel), `scroll` (wheel), `caption`, `terminal` (a strip with CLI commands and
  output), `pause`, `speedUp` (a sped-up part, encoded by `lib/encode.ts` with trim + setpts + concat; `{ pace }` for a
  brisker series of edits), `cut` (left out of the video), `scene` / `chapter` / `showCard` (scene cards), `poster`.
- `lib/wf.ts`: wireframe gestures shared by the long scenarios (`findId`, `selectDeep`, the job panel, tabs of a
  bottom navigation, `linkTab`).
- `lib/agent.ts`: the phase 4 session (server with key, `designer agent`, project from a fixture spec), waiting
  for a job with timings, putting an image on the clipboard, selecting a screen by name.
- `lib/designer.ts`: where things are in Designer's UI (library items, Properties fields by their
  aria-label, screens by their name label, canvas nodes by the text they draw) and common gestures
  (`insertFromLibrary`, `dragFromLibrary`, `setField`, `choose`, `focusScreen`, …).
- `scenarios/NN-name.ts`: one video each. `setup()` (optional) runs fast and is cut from the video;
  `run()` is what the viewer sees. One short sentence per caption: Portuguese in 01–16, English from the promo on.

## Writing a scenario

```ts
import type { Scenario } from '../lib/scenario.ts';
import { insertFromLibrary, newWireframe } from '../lib/designer.ts';

export default {
  name: '07-exemplo',
  steps: 2,
  async setup(demo) {
    await newWireframe(demo);
  },
  async run(demo) {
    await demo.caption('Inserindo um botão');
    await insertFromLibrary(demo, 'Button');
    await demo.caption('Pronto');
  },
} satisfies Scenario;
```

Aim with locators (`demo.click(locator, { fx, fy })`) rather than fixed coordinates: the layout of
the panels and the canvas zoom change. Drags move linearly at the end on purpose (an eased tail ends
in sub-pixel moves).
