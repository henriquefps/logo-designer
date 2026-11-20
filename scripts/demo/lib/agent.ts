// The phase 4 videos (11–15): a real designer-sync on localhost with an API key, `designer agent` running real
// Claude Code against it, a project built from a fixture spec and pushed, and the app opened on it with Sync on.
// Waiting for the agent is shown sped up (`demo.speedUp`) with the bridge's own progress lines in the terminal strip.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Locator, Page } from 'playwright';
import type { Demo } from './demo.ts';
import { designer, readProject, startAgent, startSyncServer, waitUntil, type AgentProcess, type SyncServer } from './live.ts';

export interface AgentSession {
  server: SyncServer;
  agent: AgentProcess;
  apiKey: string;
  projectId: string;
  work: string;
  stop(): Promise<void>;
}

/** Where the Hoard screenshots are (HOARD_SHOTS, else ~/designer-demos/inputs/hoard). */
export const hoardShots = () => resolve(process.env.HOARD_SHOTS ?? join(process.env.HOME ?? '', 'designer-demos/inputs/hoard'));

/**
 * Setup (cut from the video): server, agent, the project from `spec` (a fixture, built with the CLI) pushed to the
 * server, Sync on in the app with the key, the project open, the agent online in the status bar.
 */
export async function startAgentSession(demo: Demo, root: string, spec: string, name = 'Hoard'): Promise<AgentSession> {
  const { page } = demo;
  const work = process.env.DEMO_E2E_DIR ? resolve(process.env.DEMO_E2E_DIR) : mkdtempSync(join(tmpdir(), 'designer-demo-agent-'));
  mkdirSync(work, { recursive: true });
  const apiKey = randomBytes(32).toString('hex');
  const server = await startSyncServer(root, join(work, '.sync-server'), { apiKey });
  const agent = await startAgent(root, { server: server.url, apiKey, workdir: join(work, 'agent'), cwd: work, maxMinutes: 30 });
  const file = join(work, 'project.designer.json');
  designer(root, ['new', '--preset', 'wireframe', '--name', name, '-o', file], work);
  designer(root, ['wf', 'build', spec, '--into', file], work);
  const env = { ...process.env, DESIGNER_SYNC_URL: server.url, DESIGNER_SYNC_KEY: apiKey };
  const { spawnSync } = await import('node:child_process');
  const pushed = spawnSync('bun', [join(root, 'bin/designer.ts'), 'sync', 'push', file], { cwd: work, env, encoding: 'utf8' });
  if (pushed.status !== 0) throw new Error(`designer sync push failed:\n${pushed.stderr}`);
  const projectId = readProject(file).id as string;
  const origin = new URL(page.url()).origin + '/';
  await page.evaluate(
    ([u, k]) => {
      localStorage.setItem('designer.sync', JSON.stringify({ enabled: true, url: u, apiKey: k, syncFonts: false }));
      localStorage.setItem('designer.welcomed', '1');
    },
    [server.url, apiKey],
  );
  await page.goto(`${origin}?open-project=${projectId}`);
  await waitUntil('the project to open', async () => (await page.evaluate(() => (window as unknown as W).__designer?.useDocStore.getState().doc.id).catch(() => null)) === projectId, 30_000);
  await page.getByTestId('agent-status').first().waitFor();
  await waitUntil('the agent online in the app', async () => (await page.getByTestId('agent-status').first().getAttribute('data-presence')) === 'online', 30_000);
  return {
    server,
    agent,
    apiKey,
    projectId,
    work,
    stop: async () => {
      await agent.stop();
      server.stop();
    },
  };
}

type W = { __designer: { useDocStore: { getState(): { doc: { id: string; wireframe?: { screens: { name: string; status?: string }[] } } } } } };

export const screenNames = (page: Page) => page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc.wireframe?.screens.map((s) => s.name) ?? []);

/** The newest row of the job panel. */
export const newestRow = (page: Page): Locator => page.getByTestId('agent-job-panel').locator('[data-testid="agent-job"]').first();

/** The bridge's lines about a job, shortened for the terminal strip (no clock, no job id). */
function bridgeLines(agent: AgentProcess, jobId: string): string[] {
  return agent.lines
    .filter((l) => l.includes(jobId))
    .map((l) => l.replace(/^\S+(\s?[AP]M)?\s/, '').replace(`job ${jobId}: `, '').replace(`job ${jobId} `, ''))
    .filter((l) => !l.startsWith('↑'));
}

export interface JobRun {
  id: string;
  /** ms from the job's creation to the first change of the project in the app, and to its end. */
  firstChangeMs: number | null;
  totalMs: number;
  status: string;
}

/**
 * Waits for the newest job to finish, sped up ×`factor` in the video, with the bridge's progress in the terminal
 * strip (`designer agent` output, as on Henrique's machine). Returns timings measured in the app.
 */
export async function waitForAgent(demo: Demo, session: AgentSession, factor: number, opts: { label?: string; timeoutMs?: number } = {}): Promise<JobRun> {
  const { page } = demo;
  const row = newestRow(page);
  await row.waitFor();
  const id = (await row.getAttribute('data-job-id'))!;
  const sig = () => page.evaluate(() => {
    const d = (window as unknown as { __designer: { useDocStore: { getState(): { doc: { children: unknown; wireframe: unknown } } } } }).__designer.useDocStore.getState().doc;
    return JSON.stringify([d.children, d.wireframe]);
  });
  const t0 = Date.now();
  const base = await sig();
  let firstChangeMs: number | null = null;
  const label = opts.label ?? 'designer agent';
  let shown = 0;
  const status = await demo.speedUp(factor, async () => {
    for (;;) {
      const st = await row.getAttribute('data-status');
      if (firstChangeMs === null && (await sig()) !== base) firstChangeMs = Date.now() - t0;
      const lines = bridgeLines(session.agent, id);
      if (lines.length !== shown) {
        shown = lines.length;
        await demo.terminal([`$ ${label}`, ...lines.slice(-4).map((l) => `  ${l.length > 66 ? `${l.slice(0, 65)}…` : l}`)], { clear: true, keep: 5, width: 520 });
      }
      if (st === 'done' || st === 'failed' || st === 'cancelled') return st;
      if (Date.now() - t0 > (opts.timeoutMs ?? 20 * 60_000)) throw new Error(`job ${id} still ${st} after ${opts.timeoutMs ?? 20 * 60_000} ms`);
      await page.waitForTimeout(250);
    }
  });
  const run = { id, firstChangeMs, totalMs: Date.now() - t0, status };
  console.log(`  job ${id}: ${status}, first change ${firstChangeMs === null ? '—' : `${(firstChangeMs / 1000).toFixed(1)} s`}, total ${(run.totalMs / 1000).toFixed(1)} s`);
  if (status !== 'done') throw new Error(`the agent's job ended ${status}: ${await row.innerText()}`);
  return run;
}

/** Puts an image file on the system clipboard (as PNG, what a browser hands to a paste). */
export async function copyImageToClipboard(page: Page, file: string): Promise<void> {
  const { readFileSync } = await import('node:fs');
  const b64 = readFileSync(file).toString('base64');
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  await page.evaluate(
    async ([data, type]) => {
      const img = new Image();
      img.src = `data:${type};base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    },
    [b64, mime],
  );
}

/** A screen's name label on the canvas, also when it is cut with "…" at a small zoom. */
export function frameLabel(page: Page, name: string): Locator {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixes = Array.from({ length: Math.max(0, name.length - 3) }, (_, i) => esc(name.slice(0, name.length - 1 - i)));
  const re = new RegExp(`^(${esc(name)}|(${prefixes.join('|')})…)$`);
  return page.locator('[data-slot="canvas"] [data-slot="screen-labels"] tspan').filter({ hasText: re }).first();
}
