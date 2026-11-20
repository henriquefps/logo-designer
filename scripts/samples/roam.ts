// Builds the "Roam (sample)" wireframe sample (public/samples/roam.designer.json, its thumbnail and its
// wf sheet preview) through the `designer` CLI only, never by editing ids by hand.
//
//   bun scripts/samples/roam.ts --merge <roam.designer.json> <roam-settings.designer.json>
//       the two projects saved from the promo recording (docs/wireframe-mode.md → Promo video):
//       dumps both with `designer wf dump`, merges the specs into scripts/samples/roam.spec.json, then builds
//   bun scripts/samples/roam.ts
//       rebuilds the sample from the committed scripts/samples/roam.spec.json
//
// The merge: one project, the app screens (Explore, Trips, Lisbon, Portugal) in a first row and the Settings
// story (current → new menu → 8 sub-screens) in a second; the Settings sub-screen "Trips" becomes "Trip
// settings" (screen, menu row, top bar), and the shared tab bar's Profile tab opens "Settings (new)".
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = join(root, 'scripts/samples/roam.spec.json');
const OUT = join(root, 'public/samples/roam.designer.json');
const THUMB = join(root, 'public/samples/roam.thumb.png');
const SHEET = join(root, 'docs/screenshots/sample-roam-sheet.png');

const NAME = 'Roam (sample)';
const W = 390; // phone frame width
const GAP = 200; // between frames in a row (room for routed arrows)
const NOTE_GAP = 24; // frame edge → its notes
const NOTE_W = 200; // a note's width
const ROW_GAP = 360; // first row's bottom → second row's top

type Json = Record<string, unknown>;
interface SpecNote { id?: string; text: string; on?: string; x?: number; y?: number }
interface SpecScreen { name: string; id?: string; status?: string; x?: number; y?: number; root: Json[] }
interface SpecFlow { id?: string; from: string; to: string; label?: string }
interface Spec { $schema?: string; version: number; name: string; components?: Json[]; screens: SpecScreen[]; flows?: SpecFlow[]; notes?: SpecNote[] }

const tmp = mkdtempSync(join(tmpdir(), 'roam-sample-'));
const designer = (...args: string[]) => execFileSync('bun', [join(root, 'bin/designer.ts'), ...args], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

function dump(project: string, name: string): Spec {
  const out = join(tmp, `${name}.spec.json`);
  designer('wf', 'dump', project, '-o', out);
  return readJson<Spec>(out);
}

/** The spec node with this id (any depth), for changing a prop of one known node. */
function findNode(nodes: unknown, id: string): Json | null {
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      const hit = findNode(n, id);
      if (hit) return hit;
    }
    return null;
  }
  if (nodes && typeof nodes === 'object') {
    const o = nodes as Json;
    if (o.id === id) return o;
    for (const v of Object.values(o)) {
      const hit = findNode(v, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Sets `prop` of a component node (`{ "<kind>": { … }, "id" }`), checking it had the expected value. */
function setProp(spec: Spec, id: string, kind: string, prop: string, from: string, to: string) {
  const node = findNode(spec.screens, id);
  const props = node?.[kind] as Json | undefined;
  if (!props || props[prop] !== from) throw new Error(`${kind} ${id}: expected ${prop} "${from}", found ${JSON.stringify(props?.[prop])}`);
  props[prop] = to;
}

function merge(app: Spec, settings: Spec): Spec {
  // Unique screen names: the Settings sub-screen "Trips" → "Trip settings" (its menu row and top bar too).
  const sub = settings.screens.find((s) => s.name === 'Trips');
  if (!sub) throw new Error('roam-settings has no "Trips" screen');
  sub.name = 'Trip settings';
  for (const f of settings.flows ?? []) if (f.to === 'Trips') f.to = 'Trip settings';
  const menuRow = settings.flows?.find((f) => f.to === 'Trip settings')?.from;
  if (!menuRow) throw new Error('no flow opens the Settings sub-screen "Trips"');
  setProp(settings, menuRow, 'list-row', 'title', 'Trips', 'Trip settings');
  const topBar = (sub.root[0] as Json | undefined)?.id as string;
  setProp(settings, topBar, 'top-app-bar', 'title', 'Trips', 'Trip settings');

  const names = [...app.screens, ...settings.screens].map((s) => s.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`screen name "${dup}" is in both projects`);

  // Connect the stories: the shared tab bar's Profile tab opens the new Settings menu (a link on the master,
  // so it works from every screen with the tab bar, in Present mode too).
  const tripsTab = app.flows?.find((f) => f.to === 'Trips' && f.from.includes('#'));
  if (!tripsTab) throw new Error('no tab bar link to Trips in roam');
  const profile: SpecFlow = { from: tripsTab.from.replace(/#.*$/, '#Profile'), to: 'Settings (new)' };

  return {
    $schema: app.$schema,
    version: app.version,
    name: NAME,
    components: [...(app.components ?? []), ...(settings.components ?? [])],
    screens: [...app.screens, ...settings.screens],
    flows: [...(app.flows ?? []), profile, ...(settings.flows ?? [])],
    notes: [...(app.notes ?? []), ...(settings.notes ?? [])],
  };
}

interface Frame { name: string; x: number; y: number; height: number }

/** Frames of a built project, by logical screen name. */
function frames(project: string): Map<string, Frame> {
  const doc = readJson<{ wireframe: { screens: { id: string; name: string }[] }; children: { transform: { x: number; y: number }; screen?: { screenId: string; height: number } }[] }>(project);
  const byId = new Map(doc.wireframe.screens.map((s) => [s.id, s.name]));
  const out = new Map<string, Frame>();
  for (const c of doc.children) {
    if (!c.screen) continue;
    const name = byId.get(c.screen.screenId)!;
    out.set(name, { name, x: c.transform.x, y: c.transform.y, height: c.screen.height });
  }
  return out;
}

/** Places the frames in two rows; notes keep their offset to the frame of the node they are attached to. */
function arrange(spec: Spec, built: Map<string, Frame>) {
  // Explore's card opens Lisbon next to it (a straight arrow); the tabs' arrows run below the frames.
  const row1 = ['Explore', 'Lisbon, Portugal', 'Trips'];
  const row2 = spec.screens.map((s) => s.name).filter((n) => !row1.includes(n));
  const height = (names: string[]) => Math.max(...names.map((n) => built.get(n)!.height));
  // Notes: which frame holds the node a note is on (from the first build's coordinates).
  const owner = (note: SpecNote) => spec.screens.find((s) => note.on && findNode(s.root, note.on))?.name;
  const notesRight = new Set((spec.notes ?? []).filter((n) => { const o = owner(n); return o && n.x !== undefined && n.x >= built.get(o)!.x + W; }).map(owner));
  const place = new Map<string, { x: number; y: number }>();
  const row = (names: string[], y: number) => {
    let x = 0;
    for (const n of names) {
      place.set(n, { x, y });
      x += W + GAP + (notesRight.has(n) ? NOTE_GAP + NOTE_W : 0);
    }
  };
  row(row1, 0);
  row(row2, height(row1) + ROW_GAP);

  for (const note of spec.notes ?? []) {
    const name = owner(note);
    if (!name || note.x === undefined || note.y === undefined) continue;
    const was = built.get(name)!;
    const now = place.get(name)!;
    // Beside the frame (right) keeps its vertical offset; below it keeps its horizontal one.
    if (note.x >= was.x + W) note.x = now.x + W + NOTE_GAP;
    else note.x = now.x + (note.x - was.x);
    note.y = now.y + (note.y - was.y);
  }
  for (const s of spec.screens) Object.assign(s, place.get(s.name));
}

function build(spec: Spec, out: string) {
  const file = join(tmp, 'spec.json');
  writeFileSync(file, JSON.stringify(spec, null, 2));
  designer('wf', 'build', file, '-o', out);
}

try {
  const args = process.argv.slice(2);
  let spec: Spec;
  if (args[0] === '--merge') {
    if (args.length !== 3) throw new Error('usage: bun scripts/samples/roam.ts --merge <roam.designer.json> <roam-settings.designer.json>');
    spec = merge(dump(resolve(args[1]), 'roam'), dump(resolve(args[2]), 'settings'));
    const first = join(tmp, 'first.designer.json');
    build(spec, first);
    arrange(spec, frames(first));
    writeFileSync(SPEC, `${JSON.stringify(spec, null, 2)}\n`);
    console.log(`Wrote ${SPEC}`);
  } else {
    spec = readJson<Spec>(SPEC);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  const built = join(tmp, 'roam.designer.json');
  build(spec, built);
  // Compact JSON: the app and the CLI read it, nobody edits it.
  writeFileSync(OUT, JSON.stringify(readJson(built)));
  designer('validate', OUT);
  designer('wf', 'sheet', OUT, '-o', SHEET, '--notes', '--max', '3200');
  designer('wf', 'sheet', OUT, '-o', THUMB, '--max', '480');
  const raw = statSync(OUT).size;
  const gz = gzipSync(readFileSync(OUT)).length;
  console.log(`Wrote ${OUT} (${(raw / 1024).toFixed(0)} KB, ${(gz / 1024).toFixed(0)} KB gzipped), ${THUMB} (${(statSync(THUMB).size / 1024).toFixed(0)} KB), ${SHEET}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
