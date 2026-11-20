import { mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, type DesignDocument } from '@/model';
import { serializeProject } from '@/io/projectFile';
import { fakeSyncServer } from '@/sync/__tests__/fakeServer';
import { connectionFrom, LiveMirror, openProjectLink, SyncUsage } from './sync';
import { main } from './main';

const until = async (cond: () => boolean | Promise<boolean>, ms = 4000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

let dir = '';
let server: ReturnType<typeof fakeSyncServer>;
const conn = { url: 'http://sync.test' };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'designer-live-'));
  server = fakeSyncServer();
  vi.stubGlobal('fetch', server.fetch);
});
afterEach(() => vi.unstubAllGlobals());

const readDoc = async (f: string) => JSON.parse(await readFile(join(dir, f), 'utf8')) as DesignDocument;
const writeDoc = (f: string, doc: DesignDocument) => writeFile(join(dir, f), serializeProject(doc));

/** What the app does when Henrique edits: PUT a newer revision, edited by its device, based on what it saw. */
function appEdit(id: string, change: (d: DesignDocument) => void, at = Date.now() + 5) {
  const cur = server.items.projects.get(id)!;
  const doc = structuredClone(cur.data) as DesignDocument;
  change(doc);
  doc.updatedAt = at;
  doc.live = { editedBy: 'app:dev1' };
  return server.put('projects', id, { name: doc.name, createdAt: doc.createdAt, updatedAt: at, deleted: false, base: cur.updatedAt, data: doc });
}

/** `pollMs` large = the file watcher stays out of the way (conflict tests drive the order themselves). */
async function startMirror(file: string, pollMs = 20) {
  const logs: string[] = [];
  const m = new LiveMirror({ conn, path: join(dir, file), origin: 'https://designer.hfps.dev', log: (s) => logs.push(s), pollMs, settleMs: 30, fetch: server.fetch });
  await m.start();
  return { m, logs };
}

describe('connection and links', () => {
  it('reads the server from --server or the environment, and the key from either variable', () => {
    expect(connectionFrom('http://a:3051/', {})).toEqual({ url: 'http://a:3051', apiKey: undefined });
    expect(connectionFrom(undefined, { DESIGNER_SYNC_URL: 'https://s.example.com', SYNC_API_KEY: 'k1' })).toEqual({ url: 'https://s.example.com', apiKey: 'k1' });
    expect(connectionFrom(undefined, { DESIGNER_SYNC_URL: 'https://s', DESIGNER_SYNC_KEY: 'k2', SYNC_API_KEY: 'k1' }).apiKey).toBe('k2');
    expect(() => connectionFrom(undefined, {})).toThrow(SyncUsage);
    expect(() => connectionFrom('ftp://x', {})).toThrow(/http/);
    expect(openProjectLink('https://designer.hfps.dev/', 'dabc')).toBe('https://designer.hfps.dev/?open-project=dabc');
  });
});

describe('designer live (mirror)', () => {
  it('pushes the file marked live, mirrors both ways and clears the mark on stop', async () => {
    const doc = createDocument({ name: 'Hoard' });
    await writeDoc('hoard.designer.json', doc);
    const { m, logs } = await startMirror('hoard.designer.json');
    const stored = () => server.items.projects.get(doc.id)!;
    expect(stored().name).toBe('Hoard');
    expect((stored().data as DesignDocument).live).toEqual({ editedBy: 'cli' });

    // The agent edits the file: pushed.
    await writeDoc('hoard.designer.json', { ...doc, name: 'Hoard v2' });
    await until(() => stored().name === 'Hoard v2');
    expect((stored().data as DesignDocument).live).toEqual({ editedBy: 'cli' });

    // Henrique edits in the app: written to the file (without the live mark).
    appEdit(doc.id, (d) => (d.name = 'Hoard (Henrique)'));
    await until(async () => (await readDoc('hoard.designer.json')).name === 'Hoard (Henrique)');
    const file = await readDoc('hoard.designer.json');
    expect(file.live).toBeUndefined();
    expect(file.id).toBe(doc.id);

    // The write-back is not pushed again (no echo).
    const at = stored().updatedAt;
    await new Promise((r) => setTimeout(r, 150));
    expect(stored().updatedAt).toBe(at);

    await m.stop();
    expect(stored().name).toBe('Hoard (Henrique)');
    expect((stored().data as DesignDocument).live).toBeUndefined();
    expect(logs.join('\n')).toMatch(/↑ pushed \(start\)[\s\S]*↑ pushed \(file changed\)[\s\S]*↓ pulled \(changed on the server, edited in the app\)/);
    expect(server.archived).toHaveLength(0); // no conflicts in a clean back and forth
  });

  it('gives a file without an id one, and does not push a broken file', async () => {
    const doc = createDocument({ name: 'No id' });
    const raw = JSON.parse(serializeProject(doc)) as Record<string, unknown>;
    delete raw.id;
    await writeFile(join(dir, 'x.designer.json'), JSON.stringify(raw));
    const { m, logs } = await startMirror('x.designer.json');
    const id = (await readDoc('x.designer.json')).id;
    expect(id).toBe(m.id);
    expect(server.items.projects.has(id)).toBe(true);
    const before = server.items.projects.get(id)!.updatedAt;
    await writeFile(join(dir, 'x.designer.json'), '{ "half": ');
    await until(() => logs.some((l) => l.includes('not pushed')));
    expect(server.items.projects.get(id)!.updatedAt).toBe(before);
    await m.stop();
  });

  it('conflict, the app is newer: the file takes the app version and keeps its own as a conflicted copy', async () => {
    const doc = createDocument({ name: 'Plan' });
    await writeDoc('plan.designer.json', doc);
    const { m, logs } = await startMirror('plan.designer.json', 60_000);
    // The agent wrote the file (a minute ago, not pushed yet) and Henrique saved in the app just now.
    await writeDoc('plan.designer.json', { ...doc, name: 'Plan (agent)' });
    const past = new Date(Date.now() - 60_000);
    await utimes(join(dir, 'plan.designer.json'), past, past);
    appEdit(doc.id, (d) => (d.name = 'Plan (app)'));
    await until(async () => (await readDoc('plan.designer.json')).name === 'Plan (app)');
    const copy = (await readdir(dir)).find((f) => f.includes('conflicted copy'));
    expect(copy).toBeDefined();
    expect((await readDoc(copy!)).name).toMatch(/^Plan \(agent\) \(conflicted copy/);
    expect(logs.join('\n')).toMatch(/conflict: changed in the app and in the file; the app is newer/);
    expect(server.items.projects.get(doc.id)!.name).toBe('Plan (app)');
    await m.stop();
  });

  it('conflict, the file is newer: it is pushed, and the app version is kept (file copy + server archive)', async () => {
    const doc = createDocument({ name: 'Plan' });
    await writeDoc('plan.designer.json', doc);
    const { m, logs } = await startMirror('plan.designer.json', 60_000);
    // The agent's write is the later one (its mtime is after the app's save).
    await writeDoc('plan.designer.json', { ...doc, name: 'Plan (agent)' });
    const later = new Date(Date.now() + 30_000);
    await utimes(join(dir, 'plan.designer.json'), later, later);
    appEdit(doc.id, (d) => (d.name = 'Plan (app)'));
    await until(() => server.items.projects.get(doc.id)!.name === 'Plan (agent)');
    expect((await readDoc('plan.designer.json')).name).toBe('Plan (agent)');
    const copy = (await readdir(dir)).find((f) => f.includes('conflicted copy'));
    expect((await readDoc(copy!)).name).toMatch(/^Plan \(app\) \(conflicted copy/);
    expect(server.archived.map((a) => a.name)).toEqual(['Plan (app)']); // the server keeps what it overwrote too
    expect(logs.join('\n')).toMatch(/the file is newer and wins/);
    await m.stop();
  });

  it('starts from the server when it is newer than the file (resuming a session)', async () => {
    const doc = createDocument({ name: 'Old' });
    await writeDoc('r.designer.json', doc);
    const past = new Date(Date.now() - 60_000);
    await utimes(join(dir, 'r.designer.json'), past, past);
    server.put('projects', doc.id, { name: 'Newer', createdAt: doc.createdAt, updatedAt: Date.now(), deleted: false, data: { ...doc, name: 'Newer' } });
    const { m } = await startMirror('r.designer.json');
    expect((await readDoc('r.designer.json')).name).toBe('Newer');
    await m.stop();
  });

  it('stops when the project is deleted in the app', async () => {
    const doc = createDocument({ name: 'Gone' });
    await writeDoc('g.designer.json', doc);
    const { m, logs } = await startMirror('g.designer.json');
    server.put('projects', doc.id, { name: '', createdAt: 0, updatedAt: Date.now() + 10, deleted: true });
    await m.ended;
    expect(logs.join('\n')).toMatch(/was deleted on the server/);
    expect((await readDoc('g.designer.json')).name).toBe('Gone'); // the file is left alone
    await m.stop();
  });

  it('works with a server without the event stream (polls)', async () => {
    server = fakeSyncServer({ events: false });
    vi.stubGlobal('fetch', server.fetch);
    const doc = createDocument({ name: 'Poll' });
    await writeDoc('p.designer.json', doc);
    const { m, logs } = await startMirror('p.designer.json');
    appEdit(doc.id, (d) => (d.name = 'Poll (app)'));
    await until(async () => (await readDoc('p.designer.json')).name === 'Poll (app)', 5000);
    expect(logs.join('\n')).toMatch(/no event stream/);
    await m.stop();
  });
});

describe('designer live / sync (commands)', () => {
  const cli = async (argv: string[], signal?: AbortSignal) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: dir, env: { DESIGNER_SYNC_URL: conn.url }, signal });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };

  it('sync push / list / pull', async () => {
    const doc = createDocument({ name: 'Board' });
    await writeDoc('board.designer.json', doc);
    const push = await cli(['sync', 'push', 'board.designer.json']);
    expect(push.code).toBe(0);
    expect(push.out).toContain(`?open-project=${doc.id}`);
    expect((await cli(['sync', 'list'])).out).toMatch(new RegExp(`${doc.id} .* Board`));

    appEdit(doc.id, (d) => (d.name = 'Board (app)'));
    expect((await cli(['sync', 'pull', 'board.designer.json'])).code).toBe(0);
    expect((await readDoc('board.designer.json')).name).toBe('Board (app)');
    const byId = await cli(['sync', 'pull', doc.id, '-o', 'copy.designer.json']);
    expect(byId.out).toContain('into copy.designer.json');
    expect((await readDoc('copy.designer.json')).id).toBe(doc.id);
    expect((await cli(['sync', 'pull', doc.id])).out).toContain('Board (app).designer.json');

    // A server version stamped later than now (another device's clock ahead) is not overwritten.
    appEdit(doc.id, (d) => (d.name = 'Board (future)'), Date.now() + 60_000);
    const refused = await cli(['sync', 'push', 'copy.designer.json']);
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/newer version of “Board \(future\)”.*sync pull/);
    // Otherwise a push is stamped now, so it is the newest: last write wins, and the server archives what it replaced.
    server.items.projects.get(doc.id)!.updatedAt = Date.now() - 1000; // (as if that clock had been right)
    expect((await cli(['sync', 'push', 'copy.designer.json'])).code).toBe(0);
    expect(server.archived.length).toBeGreaterThan(0);

    expect((await cli(['sync', 'pull', 'nope'])).err).toMatch(/No project nope/);
    expect((await cli(['sync', 'frob', 'x'])).code).toBe(2);
  });

  it('needs a server address', async () => {
    const err: string[] = [];
    expect(await main(['sync', 'list'], { out: () => {}, err: (s) => err.push(s), cwd: dir, env: {} })).toBe(2);
    expect(err.join('')).toMatch(/DESIGNER_SYNC_URL/);
  });

  it('live runs until stopped and prints how to open it', async () => {
    const doc = createDocument({ name: 'Live one' });
    await writeDoc('l.designer.json', doc);
    const ctrl = new AbortController();
    const running = cli(['live', 'l.designer.json'], ctrl.signal);
    await until(() => server.items.projects.has(doc.id));
    ctrl.abort();
    const r = await running;
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Live: “Live one” (${doc.id}) ↔ http://sync.test`);
    expect(r.out).toContain(`https://designer.hfps.dev/?open-project=${doc.id}`);
    expect(r.err).toMatch(/Stopped\. \d+ pushed/);
    expect((server.items.projects.get(doc.id)!.data as DesignDocument).live).toBeUndefined();
  });
});
