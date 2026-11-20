// The jobs client against the real designer-sync built from sync-server/ (skipped when Go is not installed).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { health, SyncError, type Connection } from './api';
import { subscribeEvents } from './events';
import { attachmentBytes, attachmentFromBytes, cancelJob, claimJob, createJob, finishJob, getAttachment, getJob, listAgents, listJobs, reportProgress, sendHeartbeat, serverHasJobs, type AgentsEvent, type JobEvent } from './jobs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hasGo = spawnSync('go', ['version']).status === 0;
const KEY = 'test-key-for-the-jobs-e2e';

const freePort = () =>
  new Promise<number>((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    });
  });

describe.skipIf(!hasGo)('jobs client against designer-sync', () => {
  let dir = '';
  let child: ChildProcess | null = null;
  let conn: Connection = { url: '' };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'designer-jobs-test-'));
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
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('announces jobs in /api/health', async () => {
    expect(await serverHasJobs(conn)).toBe(true);
    expect((await health(conn)).jobs).toBe(true);
  });

  it('refuses a wrong key', async () => {
    await expect(listJobs({ ...conn, apiKey: 'wrong' })).rejects.toMatchObject({ kind: 'auth' });
    await expect(listAgents({ url: conn.url })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('runs a job through its whole life, with events', async () => {
    const jobEvents: JobEvent[] = [];
    const agentEvents: AgentsEvent[] = [];
    let open = false;
    const stop = subscribeEvents(conn, { onChange: () => undefined, onOpen: () => (open = true), onJob: (e) => jobEvents.push(e), onAgents: (e) => agentEvents.push(e) });
    await expect.poll(() => open, { timeout: 5000 }).toBe(true);

    const png = new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]);
    const job = await createJob(conn, {
      id: 'e2e-shot',
      type: 'screenshot',
      projectId: 'proj1',
      input: { platform: 'mobile', name: 'Home', hint: 'a "quoted" hint' },
      attachments: [attachmentFromBytes('shot.png', 'image/png', png)],
    });
    expect(job).toMatchObject({ status: 'queued', cancelRequested: false, attachments: [{ name: 'shot.png', mime: 'image/png', size: 8 }] });
    await expect(createJob(conn, { id: 'e2e-shot', type: 'request', projectId: 'proj1', input: { text: 'again' } })).rejects.toMatchObject({ status: 409 });

    expect((await listJobs(conn, { active: true, projectId: 'proj1' })).map((j) => j.id)).toEqual(['e2e-shot']);
    const att = await getAttachment(conn, 'e2e-shot', 'shot.png');
    expect(att.mime).toBe('image/png');
    expect([...att.bytes]).toEqual([...png]);
    expect([...attachmentBytes(attachmentFromBytes('x', 'image/png', att.bytes))]).toEqual([...png]);

    // Presence.
    await sendHeartbeat(conn, { agentId: 'agent-a', name: 'cachyos-fps', host: 'cachyos-fps', version: '0.3.0', busy: false });
    expect(await listAgents(conn)).toMatchObject([{ agentId: 'agent-a', name: 'cachyos-fps', busy: false }]);

    // Two bridges race for it: exactly one wins.
    const claims = await Promise.all(['agent-a', 'agent-b', 'agent-c'].map((a) => claimJob(conn, 'e2e-shot', a)));
    const winners = claims.flatMap((c, i) => (c ? [['agent-a', 'agent-b', 'agent-c'][i]] : []));
    expect(winners).toHaveLength(1);
    const agent = winners[0];
    await sendHeartbeat(conn, { agentId: agent, name: 'n', host: 'h', version: '0.3.0', busy: true, jobId: 'e2e-shot' });

    await expect(reportProgress(conn, 'e2e-shot', { agentId: 'someone-else', message: 'x' })).rejects.toMatchObject({ status: 409 });
    expect(await reportProgress(conn, 'e2e-shot', { agentId: agent, message: 'Reading the screenshot', stage: 'read' })).toMatchObject({ status: 'running', cancelRequested: false, progressCount: 1 });

    expect(await cancelJob(conn, 'e2e-shot')).toMatchObject({ status: 'running', cancelRequested: true });
    expect(await reportProgress(conn, 'e2e-shot', { agentId: agent, message: 'Round 1' })).toMatchObject({ cancelRequested: true });

    const done = await finishJob(conn, 'e2e-shot', { agentId: agent, status: 'cancelled', summary: 'Stopped.' });
    expect(done).toMatchObject({ status: 'cancelled', summary: 'Stopped.', agentId: agent });
    const full = await getJob(conn, 'e2e-shot');
    expect(full.progress.map((p) => p.message)).toEqual(['Reading the screenshot', 'Round 1']);
    expect(full.progress[0].stage).toBe('read');
    expect(await listJobs(conn, { active: true })).toEqual([]);
    await expect(finishJob(conn, 'e2e-shot', { agentId: agent, status: 'done' })).rejects.toBeInstanceOf(SyncError);

    await expect.poll(() => jobEvents.filter((e) => e.id === 'e2e-shot').map((e) => e.status), { timeout: 5000 }).toEqual(['queued', 'running', 'running', 'running', 'running', 'cancelled']);
    expect(agentEvents.some((e) => e.id === 'agent-a' && e.status === 'online')).toBe(true);
    stop();
  });

  it('cancels a queued job at once and the claim then loses', async () => {
    await createJob(conn, { id: 'e2e-req', type: 'request', projectId: 'proj1', input: { text: 'add a settings screen' } });
    expect(await cancelJob(conn, 'e2e-req')).toMatchObject({ status: 'cancelled' });
    expect(await claimJob(conn, 'e2e-req', 'agent-a')).toBeNull();
  });

  it('turns server validation into SyncError 400', async () => {
    await expect(createJob(conn, { id: 'bad', type: 'adapt', projectId: 'p', input: { screenId: 's' } as never })).rejects.toMatchObject({ kind: 'rejected', status: 400 });
  });
});
