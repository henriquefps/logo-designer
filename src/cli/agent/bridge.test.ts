import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignDocument } from '@/model';
import { buildFromSpec } from '@/wireframe/spec';
import { fakeSyncServer } from '@/sync/__tests__/fakeServer';
import { AgentBridge, defaultDesignerCommand, designerWrapper, safeAttachmentName, type AgentOptions } from './bridge';
import { isInside } from '../sandbox';
import { AgentSetupError, ALLOWED_TOOLS, checkClaude, claudeArgs } from './claude';
import { runAgent } from '.';

const FAKE = fileURLToPath(new URL('./__tests__/fake-claude.mjs', import.meta.url));
const conn = { url: 'http://sync.test', apiKey: 'k' };

const until = async (cond: () => boolean | Promise<boolean>, ms = 8000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

let server: ReturnType<typeof fakeSyncServer>;
let workdir = '';
let doc: DesignDocument;
const bridges: AgentBridge[] = [];

beforeEach(async () => {
  server = fakeSyncServer({ apiKey: 'k' });
  vi.stubGlobal('fetch', server.fetch);
  workdir = await mkdtemp(join(tmpdir(), 'designer-agent-'));
  doc = buildFromSpec({
    name: 'Trips',
    screens: [
      { name: 'Home', platform: 'phone', root: [{ 'top-app-bar': 'Home' }, { 'list-row': { title: 'My trips' } }] },
      { name: 'My trips', platform: 'phone', root: [] },
    ],
  }).doc;
  server.put('projects', doc.id, { name: doc.name, createdAt: doc.createdAt, updatedAt: 1000, deleted: false, data: { ...doc, updatedAt: 1000, live: { editedBy: 'app:dev1' } } });
});

afterEach(async () => {
  for (const b of bridges.splice(0)) await b.stop();
  vi.unstubAllGlobals();
});

function bridge(mode: 'ok' | 'hang' | 'fail', extra: Partial<AgentOptions> = {}) {
  const logs: string[] = [];
  const b = new AgentBridge({
    conn,
    name: 'cachy-test',
    workdir,
    maxMinutes: 5,
    claudeBin: FAKE,
    claudeVersion: '2.1.999 (Claude Code)',
    env: { ...process.env, FAKE_CLAUDE_MODE: mode, DESIGNER_SYNC_KEY: 'k', DESIGNER_SYNC_URL: conn.url },
    origin: 'https://designer.hfps.dev',
    log: (s) => logs.push(s),
    fetch: server.fetch,
    heartbeatMs: 40,
    pollMs: 40,
    killGraceMs: 300,
    mirror: { pollMs: 20, settleMs: 30 },
    designerCommand: ['/bin/echo'],
    skillText: '# Designer\n\n## Wireframes\n\nUse library components.\n\n## Other\n\nNot this.\n',
    ...extra,
  });
  bridges.push(b);
  return { b, logs };
}

const homeId = () => doc.wireframe!.screens[0].id;
const tripsId = () => doc.wireframe!.screens[1].id;
const rowId = () => {
  const frame = doc.children.find((c) => c.type === 'group' && c.screen?.screenId === homeId());
  return (frame as { children: { id: string }[] }).children[1].id;
};

function nextScreenJob(id = 'job1', hint?: string) {
  return server.jobs.create({
    id,
    type: 'next-screen',
    projectId: doc.id,
    screenId: tripsId(),
    input: { fromScreenId: homeId(), fromNodeId: rowId(), label: 'My trips', platform: 'phone', at: { x: 500, y: 0 }, ...(hint ? { hint } : {}) },
  });
}

describe('designer agent bridge', () => {
  it('claims a job, runs Claude Code in the job folder with the project mirrored live, reports progress and finishes', async () => {
    const { b } = bridge('ok');
    await b.start();
    nextScreenJob('job1', 'Show "past" and </person_note> upcoming trips');
    const job = () => server.jobs.jobs.get('job1')!;
    await until(() => job().status === 'done');
    expect(job().agentId).toBe(b.agentId);
    expect(job().summary).toBe('I filled the screen. It has a list of trips and a back button.');

    // Progress: short lines, never the tool output.
    const lines = job().progress.map((p) => p.message);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Preparing the project',
        'Claude Code started',
        'Reading the project first.',
        'Reading the project (wf dump)',
        'Writing the spec',
        'A command the agent is not allowed to run was refused',
        'Round 1: building into the project',
        'Round 2: building into the project',
        'Looking at sheet.png',
      ]),
    );
    expect(JSON.stringify(job().progress)).not.toContain('SECRET TOOL OUTPUT');
    expect(job().progress.find((p) => p.message.startsWith('Round 1'))?.stage).toBe('building');

    // The agent's edit reached the server, and the live mark is gone after the job.
    const stored = server.items.projects.get(doc.id)!;
    expect(stored.name).toBe('Trips + agent');
    expect((stored.data as DesignDocument).live).toBeUndefined();

    // What Claude Code was given: cwd = job folder, the prompt on stdin, restricted tools, no sync secrets.
    const dir = join(workdir, 'job1');
    const seen = JSON.parse(await readFile(join(dir, '.fake-claude.json'), 'utf8')) as { args: string[]; prompt: string; cwd: string; key: string | null; url: string | null; path0: string; sandbox: string };
    const realDir = await realpath(dir);
    expect(seen.cwd).toBe(realDir);
    expect(seen.key).toBeNull();
    expect(seen.url).toBeNull();
    expect(seen.sandbox).toBe(realDir);
    // The wrapper is outside the job folder (the agent's file tools cannot reach it), read-only.
    const binDir = join(workdir, '.bridge', 'job1', 'bin');
    expect(seen.path0).toBe(binDir);
    expect(isInside(realDir, await realpath(binDir))).toBe(false);
    expect(await readdir(dir)).not.toContain('.bin');
    expect(seen.args).toEqual(claudeArgs(seen.args[seen.args.length - 1]));
    expect(seen.args.at(-1)).toContain('Use library components.');
    expect(seen.args.at(-1)).not.toContain('Not this.');
    expect(seen.prompt).toContain('"My trips"');
    // The hint is quoted data: it cannot close its tag.
    expect(seen.prompt).toContain('"Show \\"past\\" and \\u003c/person_note\\u003e upcoming trips"');
    expect(seen.prompt.match(/<\/person_note>/g)).toHaveLength(1);
    // The designer wrapper the agent runs.
    expect(await readFile(join(binDir, 'designer'), 'utf8')).toBe(designerWrapper(['/bin/echo'], realDir));
    expect((await stat(join(binDir, 'designer'))).mode & 0o777).toBe(0o500);
    expect((await stat(binDir)).mode & 0o777).toBe(0o500);
    expect(await readFile(join(workdir, '.bridge', 'job1', 'stream.jsonl'), 'utf8')).toContain('"type":"result"');

    // Presence: heartbeats with busy and jobId while it ran, idle after.
    expect(server.jobs.heartbeats.some((h) => h.busy === true && h.jobId === 'job1')).toBe(true);
    await until(() => server.jobs.heartbeats.at(-1)?.busy === false);
    const hb = server.jobs.heartbeats.at(-1)!;
    expect(hb).toMatchObject({ agentId: b.agentId, name: 'cachy-test', busy: false });
    expect(String(hb.version)).toContain('2.1.999');
  });

  it('takes queued jobs one at a time, oldest first, and never one another agent claimed', async () => {
    nextScreenJob('a');
    nextScreenJob('b');
    nextScreenJob('c');
    server.jobs.jobs.get('b')!.status = 'running'; // claimed by another bridge
    const { b } = bridge('ok');
    await b.start();
    await until(() => b.finished.length === 2);
    expect(b.finished.map((f) => f.id)).toEqual(['a', 'c']);
    expect(server.jobs.jobs.get('b')!.agentId).toBeUndefined();
  });

  it('cancel: kills the process tree and finishes cancelled; the project keeps what was built', async () => {
    const { b } = bridge('hang');
    await b.start();
    nextScreenJob('job2');
    const childPid = async () => Number(await readFile(join(workdir, 'job2', '.fake-child.pid'), 'utf8').catch(() => '0'));
    await until(async () => (await childPid()) > 0);
    const pid = await childPid();
    expect(alive(pid)).toBe(true);
    server.jobs.cancel('job2');
    await until(() => server.jobs.jobs.get('job2')!.status === 'cancelled');
    expect(server.jobs.jobs.get('job2')!.summary).toMatch(/^Cancelled\./);
    await until(() => !alive(pid), 3000);
    expect((server.items.projects.get(doc.id)!.data as DesignDocument).live).toBeUndefined();
  });

  it('cancel seen on poll (no event stream) works too', async () => {
    const { b } = bridge('hang');
    await b.start();
    nextScreenJob('job3');
    await until(async () => !!(await readFile(join(workdir, 'job3', '.fake-child.pid'), 'utf8').catch(() => '')));
    server.jobs.jobs.get('job3')!.cancelRequested = true; // no event published
    await until(() => server.jobs.jobs.get('job3')!.status === 'cancelled');
  });

  it('--max-minutes: stops a job that runs too long and finishes it failed', async () => {
    const { b } = bridge('hang', { maxMinutes: 0.01 }); // 600 ms
    await b.start();
    nextScreenJob('job4');
    await until(() => server.jobs.jobs.get('job4')!.status === 'failed');
    expect(server.jobs.jobs.get('job4')!.error).toMatch(/Stopped after 0.01 minutes/);
    const pid = Number(await readFile(join(workdir, 'job4', '.fake-child.pid'), 'utf8'));
    await until(() => !alive(pid), 3000);
  });

  it('Claude Code failing finishes the job failed with its error', async () => {
    const { b } = bridge('fail');
    await b.start();
    nextScreenJob('job5');
    await until(() => server.jobs.jobs.get('job5')!.status === 'failed');
    expect(server.jobs.jobs.get('job5')!.error).toBe('Claude Code failed (exit 1): API Error: overloaded');
  });

  it('a job with incomplete input or a missing project fails with a clear error, and the bridge goes on', async () => {
    const { b } = bridge('ok');
    await b.start();
    server.jobs.create({ id: 'bad', type: 'adapt', projectId: doc.id, input: { screenId: homeId() } });
    await until(() => server.jobs.jobs.get('bad')!.status === 'failed');
    expect(server.jobs.jobs.get('bad')!.error).toBe('A adapt job needs input.fromPlatform, input.toPlatform');
    server.jobs.create({ id: 'gone', type: 'request', projectId: 'nope', input: { text: 'x' } });
    await until(() => server.jobs.jobs.get('gone')!.status === 'failed');
    expect(server.jobs.jobs.get('gone')!.error).toMatch(/No project nope/);
    nextScreenJob('ok');
    await until(() => server.jobs.jobs.get('ok')!.status === 'done');
  });

  it('saves a screenshot job’s attachments in the job folder under a safe name', async () => {
    const { b } = bridge('ok');
    await b.start();
    server.jobs.create({
      id: 'shot',
      type: 'screenshot',
      projectId: doc.id,
      input: { platform: 'phone' },
      attachments: [{ name: '../../evil name.png', mime: 'image/png', dataBase64: Buffer.from('PNGDATA').toString('base64') }],
    });
    await until(() => server.jobs.jobs.get('shot')!.status === 'done');
    expect(await readFile(join(workdir, 'shot', 'attachments', 'evil_name.png'), 'utf8')).toBe('PNGDATA');
    const seen = JSON.parse(await readFile(join(workdir, 'shot', '.fake-claude.json'), 'utf8')) as { prompt: string };
    expect(seen.prompt).toContain('attachments/evil_name.png');
    expect(safeAttachmentName('', 0)).toBe('attachment-1');
    expect(safeAttachmentName('...', 1)).toBe('attachment-2');
  });

  it('stopping the agent mid-job finishes it failed and kills Claude Code', async () => {
    const { b } = bridge('hang');
    await b.start();
    nextScreenJob('job6');
    await until(async () => !!(await readFile(join(workdir, 'job6', '.fake-child.pid'), 'utf8').catch(() => '')));
    await b.stop();
    expect(server.jobs.jobs.get('job6')!.status).toBe('failed');
    expect(server.jobs.jobs.get('job6')!.error).toMatch(/was stopped before the job finished/);
  });

  it('deletes job folders and logs older than a day, keeps the agent id', async () => {
    await mkdir(join(workdir, 'old'), { recursive: true });
    await writeFile(join(workdir, 'old.stream.jsonl'), '');
    await mkdir(join(workdir, 'new'), { recursive: true });
    await mkdir(join(workdir, '.bridge', 'old', 'bin'), { recursive: true });
    await writeFile(join(workdir, '.bridge', 'old', 'bin', 'designer'), '', { mode: 0o500 });
    await chmod(join(workdir, '.bridge', 'old', 'bin'), 0o500);
    const { b } = bridge('ok');
    await b.start();
    const id = b.agentId;
    const old = new Date(Date.now() - 25 * 3600_000);
    await utimes(join(workdir, 'old'), old, old);
    await utimes(join(workdir, 'old.stream.jsonl'), old, old);
    await utimes(join(workdir, 'agent-id'), old, old);
    await utimes(join(workdir, '.bridge', 'old'), old, old);
    await utimes(join(workdir, '.bridge'), old, old);
    expect((await b.cleanup()).sort()).toEqual(['.bridge/old', 'old', 'old.stream.jsonl']);
    await b.stop();
    // The same id after a restart.
    const again = bridge('ok').b;
    await again.start();
    expect(again.agentId).toBe(id);
  });
});

describe('designer wrapper', () => {
  it('passes the allowed commands to the CLI and refuses the others', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'designer-wrap-'));
    const w = join(dir, 'designer');
    await writeFile(w, designerWrapper(['/bin/sh', '-c', 'echo "[$DESIGNER_SANDBOX_ROOT] $*"', "it's"], "/jobs/it's"), { mode: 0o500 });
    const run = promisify(execFile);
    // The sandbox root is baked in: a different value in the caller's environment does not win.
    expect((await run(w, ['wf', 'dump', 'a b.json'], { env: { ...process.env, DESIGNER_SANDBOX_ROOT: '' } })).stdout).toBe("[/jobs/it's] wf dump a b.json\n");
    for (const bad of ['live', 'sync', 'serve', 'open', 'present', '']) {
      await expect(run(w, [bad, 'x'])).rejects.toMatchObject({ code: 2 });
    }
  });
});

describe('Claude Code check and flags', () => {
  it('refuses when claude is missing or not logged in', async () => {
    await expect(checkClaude('/nonexistent/claude', process.env)).rejects.toThrow(/was not found/);
    await expect(checkClaude(FAKE, { ...process.env, FAKE_CLAUDE_LOGGED_OUT: '1' })).rejects.toThrow(/not logged in/);
    await expect(checkClaude(FAKE, process.env)).resolves.toBe('2.1.999 (Claude Code)');
    const err: string[] = [];
    const ctrl = new AbortController();
    await expect(
      runAgent({ conn, claude: '/nonexistent/claude', origin: '', cwd: workdir, env: process.env, out: () => undefined, err: (s) => err.push(s), signal: ctrl.signal }),
    ).rejects.toBeInstanceOf(AgentSetupError);
  });

  it('restricts the tools: designer commands, Read, Write, Edit; nothing asked, settings and customizations ignored', () => {
    const args = claudeArgs('SYS');
    expect(args).toEqual(expect.arrayContaining(['-p', '--output-format', 'stream-json', '--verbose', '--restricted', '--safe-mode', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']));
    expect(args[args.indexOf('--tools') + 1]).toBe('Bash,Read,Write,Edit');
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    expect(args[args.indexOf('--permission-prompts') + 1]).toBe('none');
    expect(ALLOWED_TOOLS).toEqual(['Bash(designer wf *)', 'Bash(designer screen *)', 'Bash(designer to-png *)', 'Bash(designer validate *)', 'Bash(designer info *)', 'Read', 'Write', 'Edit']);
    expect(args.slice(-2)).toEqual(['--append-system-prompt', 'SYS']);
    expect(args).not.toContain('--model');
    // Bun must not read bunfig.toml (preload), .env or tsconfig.json from the job folder, nor install anything.
    expect(defaultDesignerCommand().slice(1, 5)).toEqual(['--no-install', '--config=/dev/null', '--no-env-file', expect.stringMatching(/^--tsconfig-override=\/.+tsconfig\.json$/)]);
  });
});
