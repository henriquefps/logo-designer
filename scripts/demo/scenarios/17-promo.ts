// The wireframe mode PROMO (~60–90 s, English, hfps look): Roam, a fictional trip planner. A title card, New document →
// Wireframe, the Explore screen built by hand from library blocks (sped up), the tab bar made a shared component with
// a tab linked once, a flow dragged to empty canvas → Generate with AI (the agent adds notes); then Roam's long, mixed-up Settings
// screen (fixtures/roam/) reorganized by the real agent from a plain-English request, a Present tap-through and Export
// for AI. Real app, real input, real agent (Claude Code through `designer agent`, a local designer-sync built from
// sync-server/, never production). Every long part is sped up with the "×N" badge; scene changes are hfps scene
// cards, and what happens behind a card (opening the Settings project) is cut. `bun run demo promo`; writes
// demo-out/17-promo.mp4, 17-promo-poster.png and 17-promo.chapters.txt.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Demo } from '../lib/demo.ts';
import type { Scenario } from '../lib/scenario.ts';
import { canvas, choose, field, focusScreen, insertFromLibrary, openTab, screenBox, screenLabel, setField } from '../lib/designer.ts';
import { designer, editProject } from '../lib/live.ts';
import { newestRow, startAgentBackend, waitAgentOnline, waitForAgent, type AgentBackend } from '../lib/agent.ts';
import { dialog, findId, hideJobs, hideJobsFor, screenToLeft, selectDeep, tabOn, type W } from '../lib/wf.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

/** The request typed to the agent: Henrique's, in English. */
export const REQUEST =
  'This settings menu is way too long and mixed up. Organize it into a few entries, for example Account, Data & storage and so on, each with its own screen, on mobile.';

export interface State {
  backend?: AgentBackend;
  /** Roam's current Settings screen as a project file (opened behind the "Ask your agent" card). */
  settingsFile?: string;
}

const state: State = {};

export interface Chapter {
  title: string;
  run(demo: Demo, st: State): Promise<void>;
}

/** Escape twice: leaves text fields and clears the selection. */
async function deselect(demo: Demo): Promise<void> {
  await demo.key('Escape', { show: false });
  await demo.key('Escape', { show: false });
}

/** Properties: one icon prop picked from the icon dialog by searching its name. */
async function pickIcon(demo: Demo, label: string, query: string): Promise<void> {
  const { page } = demo;
  await demo.click(page.getByRole('button', { name: new RegExp(`^${label}: `) }), {}, { pause: 300 });
  const dlg = dialog(demo);
  await demo.click(dlg.getByLabel('Search icons'), {}, { pause: 150 });
  await demo.type(query, { delay: 40 });
  await demo.click(dlg.getByRole('button', { name: new RegExp(`^Insert ${query}$`, 'i') }).first(), {}, { pause: 300 });
}

const TITLE = { variant: 'title' as const, eyebrow: 'Designer · Wireframe mode', title: 'Plan an app before you build it', line: 'Screens, flow and notes, by hand or with your own AI agent.' };

/** Scrolls the canvas (wheel) so the bottom of `screen` sits just above the canvas's bottom edge. */
async function screenBottomInView(demo: Demo, screen: string, margin = 24): Promise<void> {
  const c = (await canvas(demo.page).boundingBox())!;
  const b = await screenBox(demo.page, screen);
  await demo.move({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
  await demo.scroll(0, b.y + b.height - (c.y + c.height - margin));
}

export const chapters: Chapter[] = [
  {
    title: 'New document',
    async run(demo) {
      // The video opens on the title card (put up at the end of the setup).
      const cards = dialog(demo).getByRole('group', { name: 'Design mode' }).getByRole('button');
      await demo.scene(TITLE, {
        ms: 2300,
        label: 'New document',
        shown: true,
        // Behind the card: File → New (Ctrl + Alt + N), so the card slides away onto the dialog.
        behind: async () => {
          await demo.key('Control+Alt+N');
          await cards.first().waitFor();
        },
      });
      await demo.caption('File → New: three design modes, side by side');
      await demo.hover(cards.nth(2), {}, 300);
      await demo.caption('Wireframe: an app’s screens and flow');
      await demo.click(cards.nth(1), {}, { pause: 300 });
      await demo.fill(dialog(demo).getByLabel('Name', { exact: true }), 'Roam', { enter: false });
      await demo.click(dialog(demo).getByRole('button', { name: 'Create', exact: true }), {}, { pause: 300 });
      await dialog(demo).waitFor({ state: 'hidden' });
    },
  },
  {
    title: 'Build by hand',
    async run(demo) {
      const { page } = demo;
      await demo.scene({ eyebrow: 'Build by hand', title: 'A real screen from library blocks', line: 'Roam, a trip planner: the Explore tab.' }, {
        ms: 1700,
        label: 'Build by hand',
        // Behind the card: the new screen named and brought close (the canvas settles after Create).
        behind: async () => {
          await hideJobs(demo);
          await demo.click(screenLabel(page, 'Screen 1'));
          await openTab(demo, 'Properties');
          await setField(demo, 'Screen name', 'Explore');
          await focusScreen(demo, 'Explore', 1.45, 30);
          await demo.click(screenLabel(page, 'Explore'));
        },
      });
      await demo.caption('Top bar, search and filter chips');
      await demo.speedUp(12, async () => {
        await insertFromLibrary(demo, 'Top app bar', 'top app');
        await openTab(demo, 'Properties');
        await setField(demo, 'Title', 'Explore');
        await choose(demo, 'Leading', 'None');
        await insertFromLibrary(demo, 'Search field', 'search f');
        await openTab(demo, 'Properties');
        await setField(demo, 'Placeholder', 'Where to next?');
        await insertFromLibrary(demo, 'Horizontal stack', 'horiz');
        for (const [i, chip] of ['All', 'Beaches', 'Cities', 'Mountains'].entries()) {
          await insertFromLibrary(demo, 'Chip', 'chip');
          await openTab(demo, 'Properties');
          await setField(demo, 'Label', chip);
          if (i === 0) await demo.click(field(page, 'Selected'));
        }
      }, { pace: 0.6 });
      await demo.caption('A card container: image, title, text');
      await demo.speedUp(12, async () => {
        // The screen selected: what comes next goes at its end (a selected stack would take it inside).
        await demo.click(screenLabel(page, 'Explore'));
        await insertFromLibrary(demo, 'Section header', 'section h');
        await openTab(demo, 'Properties');
        await setField(demo, 'Label', 'Popular trips');
        await setField(demo, 'Action', 'See all');
        await insertFromLibrary(demo, 'Vertical stack', 'vert');
        await insertFromLibrary(demo, 'Card container', 'card c');
        await insertFromLibrary(demo, 'Image', 'imag');
        await insertFromLibrary(demo, 'Heading', 'heading');
        await openTab(demo, 'Properties');
        await setField(demo, 'Text', 'Lisbon, Portugal');
        await insertFromLibrary(demo, 'Text', 'text');
        await openTab(demo, 'Properties');
        await setField(demo, 'Text', '5 days from $640');
      }, { pace: 0.6 });
      await demo.caption('Repeat it: a list of cards');
      await selectDeep(demo, await findId(demo, 'Explore', { kind: 'image', up: 2 }), { fy: 0.97 });
      await openTab(demo, 'Properties');
      await demo.click(field(page, 'Repeat first item'), {}, { pause: 900 });
      await demo.caption('A bottom navigation with four tabs');
      await demo.speedUp(12, async () => {
        // The screen selected (its name): a bottom navigation goes pinned to its bottom.
        await deselect(demo);
        await demo.click(screenLabel(page, 'Explore'));
        await insertFromLibrary(demo, 'Bottom navigation', 'bottom n');
        await openTab(demo, 'Properties');
        await setField(demo, 'Tab 1', 'Explore');
        await setField(demo, 'Tab 2', 'Trips');
        await setField(demo, 'Tab 3', 'Saved');
        await demo.click(page.getByRole('button', { name: 'Add tab' }), {}, { pause: 250 });
        await setField(demo, 'Tab 4', 'Profile');
        await pickIcon(demo, 'Icon, tab 1', 'compass');
        await pickIcon(demo, 'Icon, tab 2', 'plane');
        await pickIcon(demo, 'Icon, tab 3', 'heart');
        await pickIcon(demo, 'Icon, tab 4', 'user');
        await deselect(demo);
        await screenBottomInView(demo, 'Explore');
      }, { pace: 0.6 });
      await demo.pause(700);
    },
  },
  {
    title: 'Shared navigation',
    async run(demo) {
      const { page } = demo;
      await demo.caption('One tab bar for every screen: Make component');
      await demo.speedUp(6, async () => {
        await selectDeep(demo, await findId(demo, 'Explore', { kind: 'bottom-navigation' }), { fx: 0.5, fy: 0.5 });
        await demo.menu('Object', 'Vertical stack');
        await demo.menu('Object', 'Make component…');
        const name = dialog(demo).getByRole('textbox');
        await name.waitFor();
        await demo.click(name, {}, { pause: 150 });
        await page.keyboard.press('ControlOrMeta+A');
        await demo.type('Tab bar', { delay: 40 });
        await demo.click(dialog(demo).getByRole('button', { name: 'Make component', exact: true }));
      }, { pace: 0.6 });
      await demo.caption('Drag the Trips tab to empty canvas: a new screen, linked');
      const trips = await tabOn(demo, 'Explore', 'Trips');
      await demo.click(trips, {}, { pause: 200 });
      await demo.page.waitForTimeout(650);
      await demo.dblclick(trips);
      await demo.hover(trips, {}, 300);
      const ex = await screenBox(page, 'Explore');
      const c = (await canvas(page).boundingBox())!;
      const handle = canvas(page).locator('[data-slot="part-handle"] circle');
      await demo.drag(handle, { x: Math.min(ex.x + ex.width + 90, c.x + c.width - 120), y: c.y + 30 }, { duration: 900, hold: 400 });
      await demo.click(page.getByRole('menuitem', { name: /New screen/ }), {}, { pause: 400 });
      await demo.caption('Its tab bar marks Trips: the selected tab follows the screen');
      await demo.speedUp(10, async () => {
        await insertFromLibrary(demo, 'Tab bar', 'tab bar');
        await demo.click(screenLabel(page, 'Trips'));
        await insertFromLibrary(demo, 'Top app bar', 'top app');
        await openTab(demo, 'Properties');
        await setField(demo, 'Title', 'My trips');
        await choose(demo, 'Leading', 'None');
        await insertFromLibrary(demo, 'Empty state', 'empty');
        await openTab(demo, 'Properties');
        await setField(demo, 'Title', 'No trips yet');
        await setField(demo, 'Message', 'Save a trip from Explore to start planning.');
        await deselect(demo);
        await demo.key('ControlOrMeta+0', { show: false });
        // Both tab bars, close.
        const e = await screenBox(page, 'Explore');
        const t = await screenBox(page, 'Trips');
        await demo.zoomAt({ x: (e.x + t.x + t.width) / 2, y: Math.max(e.y + e.height, t.y + t.height) - 6 }, 1.7);
      }, { pace: 0.6 });
      await demo.pause(1300);
    },
  },
  {
    title: 'Generate with AI',
    async run(demo, st) {
      const { page } = demo;
      await demo.scene({ eyebrow: 'Flow and AI', title: 'Drag a flow, let the agent draw the screen', line: 'Claude Code through designer agent, on your machine.' }, {
        ms: 1700,
        label: 'Flow and AI',
        // Behind the card: both screens in view with empty canvas right of Trips (where the new screen goes).
        behind: async () => {
          await hideJobs(demo);
          await demo.key('ControlOrMeta+0');
          // Pan left until there is room for a phone frame's start right of Trips, keeping the Lisbon card in view;
          // zoom out only if panning cannot make the room.
          const r = (await canvas(page).boundingBox())!;
          const t = await screenBox(page, 'Trips');
          const e = await screenBox(page, 'Explore');
          const need = t.x + t.width + 110 - (r.x + r.width);
          if (need > 0 && e.x + e.width * 0.5 - need > r.x + 40) {
            await demo.move({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
            await demo.scroll(need, 0);
          } else if (need > 0) await demo.zoomAt({ x: r.x + 20, y: r.y + r.height * 0.3 }, (r.x + r.width - 110 - (r.x + 20)) / (t.x + t.width - (r.x + 20)));
        },
      });
      await demo.caption('From the Lisbon card, a flow to empty canvas');
      const card = await findId(demo, 'Explore', { kind: 'image', up: 1 });
      await selectDeep(demo, card, { fx: 0.5, fy: 0.85 });
      const ex = await screenBox(page, 'Explore');
      const trips = await screenBox(page, 'Trips');
      const c = (await canvas(page).boundingBox())!;
      const to = { x: Math.min(trips.x + trips.width + 60, c.x + c.width - 40), y: ex.y + 30 };
      if (to.x < trips.x + trips.width + 20) throw new Error('no empty canvas right of Trips');
      await demo.drag(canvas(page).locator('[data-slot="flow-handle"] circle'), to, { duration: 1000, hold: 400 });
      await demo.click(page.getByRole('menuitem', { name: /Generate with AI/ }));
      const dlg = dialog(demo);
      await demo.click(dlg.getByLabel('Hint (optional)'), {}, { pause: 150 });
      await demo.speedUp(2, () => demo.type('Itinerary by day, a map, a Book button', { delay: 24 }));
      await demo.click(dlg.getByRole('button', { name: 'Generate' }));
      await newestRow(page).waitFor();
      await demo.caption('The agent builds it live: same library, notes for what it cannot show');
      const job = await hideJobsFor(demo, 300);
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await waitForAgent(demo, st.backend!, 10, { jobId: job });
      await demo.terminal([]);
      await demo.key('ControlOrMeta+0', { show: false });
      const made = await page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc.wireframe.screens.at(-1)?.name ?? null);
      if (made) {
        const b = await screenBox(page, made);
        await demo.zoomAt({ x: b.x + b.width * 0.75, y: b.y + 10 }, 1.8);
      }
      await demo.pause(1600);
    },
  },
  {
    title: 'Ask your agent',
    async run(demo, st) {
      const { page } = demo;
      await demo.scene(
        { eyebrow: 'Ask your agent', title: 'Roam’s Settings: 50 items, mixed up', line: 'One request in plain words. The agent reorganizes it.' },
        {
          ms: 2200,
          label: 'Ask your agent',
          behind: async () => {
            const chooser = page.waitForEvent('filechooser');
            await demo.menu('File', 'Open project file…');
            await (await chooser).setFiles(st.settingsFile!);
            await screenLabel(page, 'Settings').waitFor();
            await waitAgentOnline(page);
            await hideJobs(demo);
            await demo.key('ControlOrMeta+0');
          },
        },
      );
      await demo.caption('Six sections in one long column');
      const cfg = await screenBox(page, 'Settings');
      const c = (await canvas(page).boundingBox())!;
      await demo.speedUp(3, async () => {
        await demo.zoomAt({ x: cfg.x + cfg.width / 2, y: c.y + 50 }, 2.4);
        await demo.move({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
        await demo.scroll(0, 900);
      });
      await demo.key('ControlOrMeta+0', { show: false });
      await demo.caption('Ask the agent (Ctrl + K)');
      await demo.key('ControlOrMeta+K', { show: 'Ctrl + K' });
      const dlg = dialog(demo);
      await demo.click(dlg.getByLabel('Request'), {}, { pause: 150 });
      await demo.speedUp(2, () => demo.type(REQUEST, { delay: 14 }));
      await demo.pause(700);
      await demo.click(dlg.getByRole('button', { name: 'Send' }));
      await newestRow(page).waitFor();
      await demo.caption('A short menu and one screen per entry, live');
      const job = await hideJobsFor(demo, 300);
      await screenToLeft(demo, 'Settings', 30);
      const run = await waitForAgent(demo, st.backend!, 16, { timeoutMs: 30 * 60_000, jobId: job });
      await demo.terminal([]);
      await demo.key('ControlOrMeta+0', { show: false });
      await demo.caption(`Done in ${Math.round(run.totalMs / 1000)} s: a short menu, one screen per entry; the old screen stays`);
      const menu = await page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc.wireframe.screens.find((x) => x.status === 'changed')?.name ?? null);
      if (menu) {
        const b = await screenBox(page, menu);
        await demo.zoomAt({ x: b.x + b.width * 0.5, y: b.y + 20 }, 2.6);
        demo.poster();
        await demo.pause(2000);
      }


    },
  },
  {
    title: 'Present',
    async run(demo) {
      const { page } = demo;
      await hideJobs(demo);
      const menu = await page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc.wireframe.screens.find((x) => x.status === 'changed')?.name ?? null);
      if (!menu) throw new Error('the agent made no changed screen');
      await demo.caption('Present: tap through it like a prototype');
      await demo.click(screenLabel(page, menu));
      await demo.key('Control+Alt+P', { show: 'Ctrl + Alt + P' });
      const hot = () => page.locator('[data-slot="hotspot"]').filter({ visible: true });
      await hot().first().waitFor();
      // A hotspot by what it opens (the agent names the entries), else the n-th one.
      const pick = async (re: RegExp, nth: number) => {
        const named = hot().and(page.getByRole('button', { name: re }));
        return (await named.count()) ? named.first() : hot().nth(Math.min(nth, (await hot().count()) - 1));
      };
      await demo.pause(700);
      await demo.click(await pick(/open (Data|Storage)/i, 2), {}, { pause: 1400 });
      await demo.click(await pick(/^(Back|Close)|open Settings/i, 0), {}, { pause: 900 });
      await demo.click(await pick(/open Notifications/i, 3), {}, { pause: 1400 });
      await demo.key('Escape', { show: 'Esc' });
    },
  },
  {
    title: 'Hand off',
    async run(demo) {
      const { page } = demo;
      await demo.caption('Export for AI: a README and one page per screen, for any coding agent');
      const download = page.waitForEvent('download');
      await demo.menu('File', 'Export for AI…');
      const dl = await download;
      const file = await dl.path();
      const { default: JSZip } = await import('jszip');
      const { readFileSync } = await import('node:fs');
      const zip = await JSZip.loadAsync(readFileSync(file));
      const all = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
      const isReadme = (n: string) => /(^|\/)README\.md$/.test(n);
      const names = all.sort((a, b) => (isReadme(a) ? -1 : isReadme(b) ? 1 : a.localeCompare(b)));
      const folder = names[0].replace(/README\.md$/, '');
      const c = (await canvas(page).boundingBox())!;
      const rect = { x: 24, y: c.y + 10, width: 1232, height: c.height - 20 };
      const show = async (on: number) =>
        page.evaluate((d) => (window as unknown as { __demoDoc(d: unknown): void }).__demoDoc(d), {
          title: `${dl.suggestedFilename()} · ${names.length} files`,
          files: names.map((n) => n.slice(folder.length)),
          on,
          text: await zip.file(names[on])!.async('string'),
          rect,
        });
      await show(0);
      await demo.move({ x: rect.x + 700, y: rect.y + 300 });
      await demo.pause(1700);
      const menuFile = names.findIndex((n) => /settings.*new/i.test(n) && n.endsWith('.md'));
      if (menuFile > 0) {
        await show(menuFile);
        await demo.pause(1400);
      }
      await page.evaluate(() => (window as unknown as { __demoDoc(d: unknown): void }).__demoDoc(null));
      await demo.scene({ variant: 'end', title: 'Designer', line: 'Plan the screens. Hand them to AI.', url: 'designer.hfps.dev' }, { ms: 3800, label: null, keep: true });
      await demo.pause(1200);
    },
  },
];

export default {
  name: '17-promo',
  steps: 0,
  video: { width: 1280, appHeight: 760, captionHeight: 40, palette: 'blue' },
  async setup(demo, st: State = state) {
    // The browser's own file picker cannot be driven; without it the app falls back to a file input (as in Firefox).
    await demo.page.addInitScript(() => void delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker);
    st.backend = await startAgentBackend(demo, root);
    st.settingsFile = join(st.backend.work, 'roam-settings.designer.json');
    designer(root, ['new', '--preset', 'wireframe', '--name', 'Roam Settings', '-o', st.settingsFile], st.backend.work);
    designer(root, ['wf', 'build', join(here, '../fixtures/roam/settings-current.spec.json'), '--into', st.settingsFile], st.backend.work);
    editProject(st.settingsFile, (d) => void (d.name = 'Roam Settings'));
    await demo.page.getByRole('menubar').waitFor();
    await demo.showCard(TITLE);
  },
  async run(demo) {
    demo.pace = 0.7;
    // PROMO_CHAPTERS=1,2 records only those chapters (a quick check of a part; the full video needs all of them).
    const only = process.env.PROMO_CHAPTERS?.split(',').map(Number);
    for (const [i, ch] of chapters.entries()) if (!only || only.includes(i + 1)) await ch.run(demo, state);
  },
  async teardown(st: State = state) {
    await st.backend?.stop();
  },
} satisfies Scenario & { setup(demo: Demo, st?: State): Promise<void>; teardown(st?: State): Promise<void> };

