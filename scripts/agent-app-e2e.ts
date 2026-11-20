// Playwright check of the app's side of phase 4 (docs/wireframe-mode.md → Phase 4 → The app), against the
// in-memory sync server (src/sync/__tests__/fakeServer.ts) served over HTTP: no Go, no Claude Code. This script
// plays the bridge (heartbeat, claim, progress, finish) and drives each entry point in the real app:
//
//   bun run e2e:agent-app        (Playwright's Chromium: bunx playwright install chromium)
//   SHOTS=docs/screenshots/agent bun run e2e:agent-app     also saves the screenshots for the docs / PR
//
// 0. no agent: presence says "Agent offline", the entry points are disabled with the reason as tooltip;
// 1. a heartbeat → "Agent online on cachyos-fps";
// 2. Ask the agent… (Mod+K): the project reaches the server marked live, the job is created; claim, progress and
//    finish appear in the job panel (status, latest line, elapsed, summary); Undo the agent's changes;
// 3. the flow drop menu's Generate with AI: the empty target screen is made and linked, a next-screen job sent;
// 4. Screen section → Adapt to tablet with AI → an adapt job; Cancel while queued;
// 5. a pasted screenshot: the choice, "Turn into a wireframe with AI" → a screenshot job with the image attached;
//    a running job is cancelled from the panel and the bridge finishes it as cancelled.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { startApp } from './demo/lib/server.ts';
import { addComponent, designer, editProject, enableSyncBeforeLoad, freePort, waitUntil } from './demo/lib/live.ts';
import { fakeSyncServer } from '../src/sync/__tests__/fakeServer.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'designer-agent-app-'));
const shots = process.env.SHOTS ? resolve(root, process.env.SHOTS) : null;
if (shots) mkdirSync(shots, { recursive: true });
const ok = (s: string) => console.log(`ok  ${s}`);

// ---------- the fake sync server over HTTP (CORS like designer-sync with no ALLOWED_ORIGINS) ----------

const fake = fakeSyncServer();
const port = await freePort();
const serverUrl = `http://localhost:${port}`;
const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  const r = await fake.fetch(`${serverUrl}${req.url}`, { method: req.method, body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined, headers: {}, signal: ctrl.signal });
  res.writeHead(r.status, { ...cors, 'Content-Type': r.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' });
  if (!r.body) return void res.end();
  const reader = r.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch {
    // the stream was aborted
  }
  res.end();
});
await new Promise<void>((r) => http.listen(port, r));

/** The bridge's side, played here. */
const AGENT = { agentId: 'bridge-e2e', name: 'cachyos-fps', host: 'cachyos-fps', version: '0.3.0', busy: false };
const bridge = {
  heartbeat: (busy = false, jobId?: string) => fake.heartbeat({ ...AGENT, busy, ...(jobId ? { jobId } : {}) }),
  claim: (id: string) => fake.claim(id, AGENT.agentId),
  progress: (id: string, m: string) => fake.progress(id, m),
  finish: (id: string, status: 'done' | 'failed' | 'cancelled', summary?: string) => fake.finish(id, status, summary ? { summary } : {}),
};
const newestJob = () => [...fake.jobs.values()].sort((a, b) => b.createdAt - a.createdAt)[0];

// ---------- the project: Home with a Settings button, made with the CLI and put on the server ----------

const file = join(work, 'hoard.designer.json');
designer(root, ['new', '--preset', 'wireframe', '--name', 'Hoard', '-o', file], work);
designer(root, ['screen', file, '--name', 'Home'], work);
editProject(file, (d) => {
  addComponent(d, 'Home', 'top-app-bar', { title: 'Home' }, 'Top app bar');
  addComponent(d, 'Home', 'button', { label: 'Settings' }, 'Settings button');
});
const doc = JSON.parse(readFileSync(file, 'utf8')) as { id: string; name: string; createdAt: number; updatedAt: number };
fake.put('projects', doc.id, { name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt, deleted: false, data: doc });

type W = { __designer: { useDocStore: { getState(): { doc: { live?: unknown; wireframe?: { screens: { name: string }[]; flows?: { from: string; to: string }[] }; children: { id: string; name: string; screen?: { screenId: string } }[] } } } } };
const appDoc = (page: Page) => page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc);
const screens = async (page: Page) => (await appDoc(page)).wireframe?.screens.map((s) => s.name) ?? [];
const shot = async (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => {
  if (!shots) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(shots, `${name}.png`), ...(clip ? { clip } : {}) });
};
const panel = (page: Page) => page.getByTestId('agent-job-panel');
const row = (page: Page, id: string) => page.locator(`[data-testid="agent-job"][data-job-id="${id}"]`);
const status = (page: Page) => page.getByTestId('agent-status').first();
const canvas = (page: Page) => page.locator('[data-slot="canvas"]');

async function settingsButton(page: Page) {
  const text = canvas(page).locator('text').filter({ hasText: /^Settings$/ }).first();
  await text.waitFor();
  return text;
}

const app = await startApp(root, 'dev');
const browser = await chromium.launch();
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await enableSyncBeforeLoad(page, serverUrl);
  await page.goto(`${app.url}?open-project=${doc.id}`);
  await waitUntil('the project to open', async () => (await appDoc(page).catch(() => null))?.children.some((c) => c.name === 'Home') ?? false, 30_000);
  ok('the project opened from the sync server');

  // 0. No agent yet.
  await waitUntil('presence: offline', async () => (await status(page).getAttribute('data-presence')) === 'offline', 10_000);
  ok('status bar: “Agent offline”');
  await (await settingsButton(page)).click();
  const handle = canvas(page).locator('[data-slot="flow-handle"] circle');
  const home = canvas(page).locator('[data-slot="screen-labels"] tspan').filter({ hasText: /^Home$/ }).first();
  const hb = (await home.boundingBox())!;
  const drop = { x: hb.x + 520, y: hb.y + 120 };
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await page.mouse.up();
  const gen = page.getByRole('menuitem', { name: /Generate with AI/ });
  await gen.waitFor();
  if ((await gen.getAttribute('data-disabled')) === null) throw new Error('Generate with AI should be disabled with no agent online');
  await page.locator('[data-agent-unavailable]').first().hover();
  await page.getByRole('tooltip').filter({ hasText: /No agent online/ }).first().waitFor();
  ok('flow menu: Generate with AI disabled, tooltip “No agent online…”');
  await shot(page, 'flow-menu-no-agent');
  await page.keyboard.press('Escape');

  // 1. The bridge starts.
  bridge.heartbeat();
  await waitUntil('presence: online', async () => (await status(page).getAttribute('data-presence')) === 'online', 10_000);
  if (!(await status(page).textContent())?.includes('Agent online on cachyos-fps')) throw new Error('status should say Agent online on cachyos-fps');
  ok('heartbeat → “Agent online on cachyos-fps”');
  await status(page).click();
  await page.getByTestId('agent-status-text').waitFor();
  await shot(page, 'presence-online');
  await page.keyboard.press('Escape');

  // 2. Ask the agent… (Mod+K).
  await canvas(page).click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('Control+k');
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Request').fill('Add an empty state to every list screen');
  await shot(page, 'entry-ask-the-agent');
  await dlg.getByRole('button', { name: 'Send' }).click();
  await dlg.waitFor({ state: 'hidden' });
  const ask = newestJob();
  if (ask?.type !== 'request') throw new Error('a request job should be on the server');
  const onServer = fake.items.projects.get(doc.id)?.data as { live?: { editedBy?: string } };
  if (!onServer?.live?.editedBy?.startsWith('app:')) throw new Error('the project should be on the server, marked live by the app');
  ok('Ask the agent… → request job; the project was flushed and marked live first');
  await row(page, ask.id).waitFor();
  bridge.claim(ask.id);
  bridge.heartbeat(true, ask.id);
  bridge.progress(ask.id, 'Reading the project');
  bridge.progress(ask.id, 'Round 1: adding empty states to 2 screens');
  await row(page, ask.id).getByTestId('agent-job-progress').filter({ hasText: 'Round 1' }).waitFor();
  await row(page, ask.id).getByTestId('agent-job-warning').waitFor();
  await page.waitForTimeout(1200); // elapsed ticks
  ok('claim + progress → the row shows Working, the latest line, elapsed and the warning');
  await shot(page, 'job-panel-running');
  // The agent's edit arrives (as `designer live` would push it).
  const remote = structuredClone(fake.items.projects.get(doc.id)!.data) as Record<string, unknown>;
  writeAgentScreen(remote, 'Empty state');
  fake.put('projects', doc.id, { name: doc.name, createdAt: doc.createdAt, updatedAt: Date.now() + 1, deleted: false, base: fake.items.projects.get(doc.id)!.updatedAt, data: remote });
  await waitUntil('the agent’s screen in the app', async () => (await screens(page)).includes('Empty state'), 10_000);
  bridge.finish(ask.id, 'done', 'Added an “Empty state” screen and linked it from Home.');
  bridge.heartbeat(false);
  await row(page, ask.id).getByTestId('agent-job-summary').waitFor();
  ok('finish → Done with the summary and “Undo the agent’s changes”');
  await shot(page, 'job-panel-done');
  await row(page, ask.id).getByRole('button', { name: /Undo the agent/ }).click();
  await waitUntil('the snapshot restored', async () => !(await screens(page)).includes('Empty state'), 5_000);
  await waitUntil('the undo on the server', () => !(fake.items.projects.get(doc.id)!.data as { wireframe: { screens: { name: string }[] } }).wireframe.screens.some((s) => s.name === 'Empty state'), 5_000);
  ok('Undo the agent’s changes → the project as it was at send, synced');
  await row(page, ask.id).getByRole('button', { name: 'Dismiss' }).click();

  // 3. Generate with AI from the flow drop menu.
  await (await settingsButton(page)).click();
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('menuitem', { name: /Generate with AI/ }).click();
  await dlg.getByLabel('Hint (optional)').fill('A list of settings with toggles');
  await shot(page, 'entry-generate-with-ai');
  await dlg.getByRole('button', { name: 'Generate' }).click();
  await dlg.waitFor({ state: 'hidden' });
  const next = newestJob();
  const d3 = await appDoc(page);
  const made = d3.children.find((c) => c.id === next.frameId);
  if (next.type !== 'next-screen' || !made || made.name !== 'Settings') throw new Error('a next-screen job for a new empty “Settings” screen');
  if (!d3.wireframe?.flows?.some((f) => f.to === made.screen?.screenId)) throw new Error('the new screen should be linked');
  if (!(fake.items.projects.get(doc.id)!.data as { children: { id: string }[] }).children.some((c) => c.id === made.id)) throw new Error('the server should have the new screen');
  ok('Generate with AI → empty “Settings” screen made and linked, next-screen job sent');
  bridge.claim(next.id);
  bridge.progress(next.id, 'Building “Settings”');
  await row(page, next.id).getByTestId('agent-job-progress').waitFor();
  await shot(page, 'job-panel-next-screen');
  bridge.finish(next.id, 'failed');
  await row(page, next.id).getByRole('button', { name: 'Dismiss' }).click();

  // 4. Adapt to tablet with AI (Screen section).
  await home.click();
  await page.getByRole('tab', { name: 'Properties', exact: true }).click();
  const adaptBtn = page.getByRole('button', { name: 'Adapt to tablet with AI' });
  await adaptBtn.scrollIntoViewIfNeeded();
  await shot(page, 'entry-adapt-screen-section');
  await adaptBtn.click();
  await dlg.getByRole('button', { name: 'Adapt' }).click();
  await dlg.waitFor({ state: 'hidden' });
  const adapt = newestJob();
  if (adapt.type !== 'adapt' || (adapt.input as { toPlatform: string }).toPlatform !== 'tablet') throw new Error('an adapt job to tablet');
  ok('Adapt to tablet with AI → adapt job');
  await row(page, adapt.id).getByRole('button', { name: 'Cancel' }).click();
  await waitUntil('cancelled at once (queued)', async () => (await row(page, adapt.id).getAttribute('data-status')) === 'cancelled', 5_000);
  ok('Cancel on a queued job → Cancelled at once');
  await row(page, adapt.id).getByRole('button', { name: 'Dismiss' }).click();

  // 5. A pasted screenshot.
  const png = readFileSync(join(root, 'docs/screenshots/wireframe-canvas.png')).toString('base64');
  await canvas(page).click({ position: { x: 900, y: 600 } });
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'gallery.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, png);
  await dlg.getByRole('button', { name: 'Place as reference image' }).waitFor();
  await dlg.getByLabel('Screen name (optional)').fill('Gallery');
  await shot(page, 'entry-paste-screenshot');
  await dlg.getByRole('button', { name: 'Turn into a wireframe with AI' }).click();
  await dlg.waitFor({ state: 'hidden' });
  const shotJob = newestJob();
  if (shotJob.type !== 'screenshot' || shotJob.attachments[0]?.mime.startsWith('image/') !== true) throw new Error('a screenshot job with the image attached');
  ok(`pasted screenshot → choice → screenshot job (${shotJob.attachments[0].name}, platform ${(shotJob.input as { platform: string }).platform})`);
  bridge.claim(shotJob.id);
  bridge.progress(shotJob.id, 'Reading the screenshot');
  await row(page, shotJob.id).getByTestId('agent-job-progress').waitFor();
  await row(page, shotJob.id).getByRole('button', { name: 'Cancel' }).click();
  await waitUntil('cancel requested on the server', () => fake.jobs.get(shotJob.id)!.cancelRequested === true, 5_000);
  await row(page, shotJob.id).getByText('Cancelling…').first().waitFor();
  bridge.finish(shotJob.id, 'cancelled');
  await waitUntil('cancelled', async () => (await row(page, shotJob.id).getAttribute('data-status')) === 'cancelled', 5_000);
  ok('Cancel on a running job → Cancelling… → Cancelled when the bridge finishes it');
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  app.stop();
  http.close();
  fake.dropStreams();
}
if (failed) process.exit(1);
console.log(shots ? `screenshots in ${shots}` : 'done');
process.exit(0);

/** The agent adds an empty screen (what `wf build --into` would do), with a frame. */
function writeAgentScreen(d: Record<string, unknown>, name: string) {
  const wf = d.wireframe as { screens: { id: string; name: string }[] };
  const children = d.children as Record<string, unknown>[];
  const screenId = `s-agent-${Date.now().toString(36)}`;
  wf.screens.push({ id: screenId, name });
  const proto = children.find((c) => c.screen) as Record<string, unknown>;
  children.push({ ...structuredClone(proto), id: `f-agent-${Date.now().toString(36)}`, name, transform: { x: 1400, y: 0 }, children: [], screen: { ...(proto.screen as object), screenId } });
}
