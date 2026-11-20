// The bridge against the real designer-sync built from sync-server/ (skipped when Go is not installed), with the
// fake Claude Code: the protocol as the Go server implements it (claim, progress, cancel, finish, presence).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DesignDocument } from '@/model';
import { getItem, putItem, type Connection } from '@/sync/api';
import { cancelJob, createJob, getJob, listAgents } from '@/sync/jobs';
import { buildFromSpec } from '@/wireframe/spec';
import { AgentBridge } from './bridge';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FAKE = fileURLToPath(new URL('./__tests__/fake-claude.mjs', import.meta.url));
const hasGo = spawnSync('go', ['version']).status === 0;
const KEY = 'test-key-for-the-agent-e2e';

const freePort = () =>
  new Promise<number>((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    });
  });

const until = async (cond: () => Promise<boolean>, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 30));
  }
};

describe.skipIf(!hasGo)('designer agent against designer-sync', () => {
  let dir = '';
  let child: ChildProcess | null = null;
  let conn: Connection = { url: '' };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'designer-agent-server-'));
    const bin = join(dir, 'designer-sync');
    const built = spawnSync('go', ['build', '-o', bin, '.'], { cwd: join(root, 'sync-server'), encoding: 'utf8' });
    if (built.status !== 0) throw new Error(`go build failed:\n${built.stderr}`);
    const port = await freePort();
    child = spawn(bin, ['--port', String(port), '--data-dir', join(dir, 'data'), '--api-key', KEY], { stdio: 'ignore' });
    conn = { url: `http://127.0.0.1:${port}`, apiKey: KEY };
    for (let i = 0; i < 200; i++) {
      if (await fetch(`${conn.url}/api/health`).then((r) => r.ok, () => false)) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('designer-sync did not start');
  }, 180_000);

  afterAll(() => {
    child?.kill();
    if (dir) {
      spawnSync('chmod', ['-R', 'u+w', dir]); // the wrappers' folders are read-only
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs a next-screen job end to end and a cancel', async () => {
    const doc = buildFromSpec({ name: 'Trips', screens: [{ name: 'Home', root: [{ 'list-row': { title: 'My trips' } }] }, { name: 'My trips', root: [] }] }).doc;
    await putItem(conn, 'projects', doc.id, { name: doc.name, createdAt: doc.createdAt, updatedAt: 1000, deleted: false, data: { ...doc, updatedAt: 1000 } });
    const [home, trips] = doc.wireframe!.screens;
    const frame = doc.children.find((c) => c.type === 'group' && c.screen?.screenId === home.id) as Extract<DesignDocument['children'][number], { type: 'group' }>;
    const logs: string[] = [];
    const mk = (mode: string) =>
      new AgentBridge({
        conn,
        name: 'go-test',
        workdir: join(dir, `work-${mode}`),
        maxMinutes: 2,
        claudeBin: FAKE,
        claudeVersion: '2.1.999 (Claude Code)',
        env: { ...process.env, FAKE_CLAUDE_MODE: mode },
        origin: 'https://designer.hfps.dev',
        log: (s) => logs.push(s),
        heartbeatMs: 200,
        pollMs: 200,
        killGraceMs: 300,
        mirror: { pollMs: 30, settleMs: 40 },
        designerCommand: ['/bin/echo'],
        skillText: '## Wireframes\n\nx\n',
      });
    const job = (id: string) =>
      createJob(conn, {
        id,
        type: 'next-screen',
        projectId: doc.id,
        screenId: trips.id,
        input: { fromScreenId: home.id, fromNodeId: frame.children[0].id, label: 'My trips', platform: 'phone', at: { x: 0, y: 0 } },
      });

    const b = mk('ok');
    await b.start();
    await until(async () => (await listAgents(conn)).some((a) => a.agentId === b.agentId && a.name === 'go-test'));
    await job('job-go-1');
    await until(async () => (await getJob(conn, 'job-go-1')).status === 'done');
    const done = await getJob(conn, 'job-go-1');
    expect(done.agentId).toBe(b.agentId);
    expect(done.summary).toMatch(/^I filled the screen\./);
    expect(done.progress.map((p) => p.message)).toContain('Round 2: building into the project');
    const stored = await getItem(conn, 'projects', doc.id);
    expect(stored.name).toBe('Trips + agent');
    expect((stored.data as DesignDocument).live).toBeUndefined();
    await b.stop();

    const h = mk('hang');
    await h.start();
    await job('job-go-2');
    await until(async () => (await getJob(conn, 'job-go-2')).progress.some((p) => p.message === 'Working on a long step.'));
    await cancelJob(conn, 'job-go-2');
    await until(async () => (await getJob(conn, 'job-go-2')).status === 'cancelled');
    await h.stop();
  }, 60_000);
});
