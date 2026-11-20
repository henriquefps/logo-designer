// The app's presence flips within about a second when `designer agent` stops cleanly (docs/wireframe-mode.md →
// Phase 4 → protocol: the `status: 'offline'` heartbeat). Real designer-sync (Go), the real bridge (`designer agent`,
// needs Claude Code installed and logged in; no model request is made) and the real app in Playwright's Chromium:
//
//   bun scripts/agent-offline-e2e.ts           (bunx playwright install chromium)
//
// SIGTERM (and SIGINT) must flip the status bar to "Agent offline" in under 3 s (a crash would take the 45 s window).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { startApp } from './demo/lib/server.ts';
import { designer, enableSyncBeforeLoad, startAgent, startSyncServer, waitUntil } from './demo/lib/live.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'designer-agent-offline-'));
const status = (page: Page) => page.getByTestId('agent-status').first();
const presence = (page: Page) => status(page).getAttribute('data-presence');

const server = await startSyncServer(root, join(work, 'server'));
// A wireframe project on the server (the agent status lives in a wireframe project's status bar).
const file = join(work, 'hoard.designer.json');
designer(root, ['new', '--preset', 'wireframe', '--name', 'Hoard', '-o', file], work);
designer(root, ['screen', file, '--name', 'Home'], work);
const doc = JSON.parse(readFileSync(file, 'utf8')) as { id: string; name: string; createdAt: number; updatedAt: number };
const put = await fetch(`${server.url}/api/projects/${doc.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt, deleted: false, data: doc }) });
if (!put.ok) throw new Error(`PUT project: HTTP ${put.status}`);
const app = await startApp(root, 'dev');
const browser = await chromium.launch();
let failed = false;
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await enableSyncBeforeLoad(page, server.url);
  await page.goto(`${app.url}?open-project=${doc.id}`);
  await waitUntil('presence: offline (no agent yet)', async () => (await presence(page)) === 'offline', 30_000);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    const agent = await startAgent(root, { server: server.url, workdir: join(work, `agent-${signal}`), cwd: work, name: 'e2e-agent' });
    await waitUntil('presence: online', async () => (await presence(page)) !== 'offline', 10_000);
    console.log(`ok  ${signal}: the app shows the agent online (“${(await status(page).textContent())?.trim()}”)`);
    const t0 = Date.now();
    await agent.stop(signal);
    const ms = await waitUntil('presence: offline', async () => (await presence(page)) === 'offline', 10_000).then(() => Date.now() - t0);
    if (ms > 3000) throw new Error(`${signal}: the app took ${ms} ms to show the agent offline`);
    console.log(`ok  ${signal}: the app shows “Agent offline” ${ms} ms after the stop (the agent's own log: ${agent.lines.at(-1)})`);
  }
} catch (e) {
  failed = true;
  console.error(e instanceof Error ? e.stack : e);
} finally {
  await browser.close();
  await app.stop();
  server.stop();
}
console.log(failed ? 'FAILED' : 'All checks passed.');
process.exit(failed ? 1 : 0);
