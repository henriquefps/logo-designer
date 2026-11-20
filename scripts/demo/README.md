# Demo recorder

Short screen recordings of Designer features, made in the real app with real input: Playwright moves
the mouse in visible steps, drags, clicks and types. Nothing calls the stores or injects documents;
each video starts from New document → Wireframe. A fake cursor (with a click ripple), a caption bar
above the app and a key badge (bottom right) make each step readable.

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

Needs ffmpeg on the PATH and Playwright's Chromium (`bunx playwright install chromium`). Output:
1280 × 840 (the app at 1280 × 800 plus the 40 px caption bar), H.264, 25 fps, a few hundred KB per
video. `demo-out/` is git-ignored; the raw `.webm` stays next to each MP4, and a failing scenario
leaves `<name>.error.png` and exits non-zero.

## Files

- `run.ts`: starts the app (`lib/server.ts`), records each scenario in a fresh browser context,
  cuts the setup and converts webm → mp4 (`lib/encode.ts`).
- `lib/overlay.ts`: runs in the page before the app (cursor, ripple, caption bar, key badge, a paste box).
  It only listens to events; it never touches the app.
- `lib/demo.ts`: the driver: `move`, `click`, `dblclick`, `drag`, `type`, `fill`, `key`, `menu`,
  `zoomAt` (Ctrl + wheel), `scroll` (wheel), `caption`, `pause`.
- `lib/designer.ts`: where things are in Designer's UI (library items, Properties fields by their
  aria-label, screens by their name label, canvas nodes by the text they draw) and common gestures
  (`insertFromLibrary`, `dragFromLibrary`, `setField`, `choose`, `focusScreen`, …).
- `scenarios/NN-name.ts`: one video each. `setup()` (optional) runs fast and is cut from the video;
  `run()` is what the viewer sees. Captions are in Portuguese, one short sentence per step.

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
