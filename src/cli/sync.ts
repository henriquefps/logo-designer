// `designer live` and `designer sync push|pull|list`: the CLI side of live editing (docs/sync.md → Live
// editing). The CLI has no IndexedDB, so its whole sync state is the file plus, while `live` runs, the
// `updatedAt` both sides last agreed on (`base`) in memory. Same server protocol and the same rules as the
// app: last-write-wins by `updatedAt`, and the losing version is kept (as a file next to the project here,
// and in the server's conflicts/ folder).
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { DesignDocument } from '@/model';
import { serializeProject, validateDocument } from '@/io/projectFile';
import { safeFileName } from '@/io/download';
import { getItem, listItems, normalizeServerUrl, putItem, SyncError, type Connection } from '@/sync/api';
import { subscribeEvents, type StreamState } from '@/sync/events';
import { CLI_EDITOR } from '@/sync/live';
import { conflictedName } from '@/sync/plan';

export interface SyncEnv {
  [k: string]: string | undefined;
}

/** Server and key: `--server` / `DESIGNER_SYNC_URL`, key from `DESIGNER_SYNC_KEY` or `SYNC_API_KEY` (e.g. `skv run designer-sync -- …`). */
export function connectionFrom(server: string | undefined, env: SyncEnv): Connection {
  const url = normalizeServerUrl(server ?? env.DESIGNER_SYNC_URL ?? '');
  if (!url) {
    throw new SyncUsage(
      'No sync server: pass --server URL or set DESIGNER_SYNC_URL (e.g. http://localhost:3051). ' +
        'The API key comes from DESIGNER_SYNC_KEY or SYNC_API_KEY (with skv: `skv run designer-sync -- designer live …`).',
    );
  }
  if (!/^https?:\/\//i.test(url)) throw new SyncUsage(`--server must be an http:// or https:// address, got “${url}”`);
  return { url, apiKey: env.DESIGNER_SYNC_KEY ?? env.SYNC_API_KEY ?? undefined };
}

export class SyncUsage extends Error {}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** The link printed by `live` / `sync push`: opens the project in the app once it has synced. */
export const openProjectLink = (origin: string, id: string) => `${origin.replace(/\/+$/, '')}/?open-project=${encodeURIComponent(id)}`;

/** The file form of a document: no `live` mark (that is sync state, the server copy carries it). */
export function fileText(doc: DesignDocument): string {
  const copy = { ...doc };
  delete copy.live;
  return serializeProject(copy);
}

/** Parses a project file; an id the server would refuse is an error (the file needs a stable id to sync). */
export function parseFileDoc(text: string, path: string): { doc: DesignDocument; hadId: boolean } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${path}: not valid JSON (${e instanceof Error ? e.message : e})`, { cause: e });
  }
  const raw = data && typeof data === 'object' ? (data as { id?: unknown }).id : undefined;
  const hadId = typeof raw === 'string' && raw.length > 0;
  const doc = validateDocument(data);
  if (!ID_RE.test(doc.id)) throw new Error(`${path}: id “${doc.id}” cannot be synced (letters, digits, _ and -, up to 80)`);
  return { doc, hadId };
}

/** Writes through a temp file and a rename, so a reader (the agent, an editor) never sees half a file. */
async function writeAtomic(path: string, text: string) {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  await writeFile(tmp, text);
  await rename(tmp, path);
}

const pathFor = (dir: string, name: string) => join(dir, `${safeFileName(name)}.designer.json`);

/** `<file> (conflicted copy YYYY-MM-DD).designer.json` next to the file, never overwriting one that exists. */
async function keepConflictedCopy(path: string, doc: DesignDocument, now: number): Promise<string> {
  const name = conflictedName(doc.name, now);
  let target = pathFor(dirname(path), name);
  for (let i = 2; await exists(target); i++) target = pathFor(dirname(path), `${name} ${i}`);
  await writeAtomic(target, fileText({ ...doc, name }));
  return target;
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---------- one-off transfers ----------

export interface Out {
  out: (s: string) => void;
  err: (s: string) => void;
}

export async function syncPush(path: string, conn: Connection, origin: string, io: Out): Promise<number> {
  const text = await readFile(path, 'utf8');
  const { doc, hadId } = parseFileDoc(text, path);
  if (!hadId) await writeAtomic(path, fileText(doc)); // the id it now has on the server
  const updatedAt = Date.now();
  const r = await putItem(conn, 'projects', doc.id, {
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt,
    deleted: false,
    data: { ...doc, updatedAt },
  });
  if (!r.applied) {
    io.err(`The server has a newer version of “${r.item.name}” (${new Date(r.item.updatedAt).toLocaleString()}). Nothing was sent; get it with \`designer sync pull ${path}\`.`);
    return 1;
  }
  io.out(`Pushed “${doc.name}” (${doc.id}) to ${conn.url}. Open it: ${openProjectLink(origin, doc.id)}`);
  return 0;
}

/** `target` is a project file (its id is read from it, and it is overwritten) or a project id. */
export async function syncPull(target: string, output: string | undefined, conn: Connection, io: Out, cwd: string): Promise<number> {
  let id = target;
  let dest = output;
  let localId: string | null = null;
  if (await exists(target)) {
    const { doc } = parseFileDoc(await readFile(target, 'utf8'), target);
    id = doc.id;
    localId = doc.id;
    dest ??= target;
  } else if (!ID_RE.test(target)) {
    throw new SyncUsage(`“${target}” is neither a project file nor a project id`);
  }
  const rec = await getItem(conn, 'projects', id).catch((e: unknown) => {
    if (e instanceof SyncError && e.message.startsWith('Not found')) throw new Error(`No project ${id} on ${conn.url} (see \`designer sync list\`)`);
    throw e;
  });
  if (rec.deleted || rec.data == null) throw new Error(`Project ${id} was deleted on the server`);
  const doc: DesignDocument = { ...validateDocument(rec.data), id, name: rec.name || 'Untitled', createdAt: rec.createdAt, updatedAt: rec.updatedAt };
  dest ??= pathFor(cwd, doc.name);
  if (!localId && (await exists(dest))) {
    const other = await readFile(dest, 'utf8').then((t) => parseFileDoc(t, dest!).doc.id).catch(() => null);
    if (other && other !== id) throw new Error(`${dest} holds another project (${other}); choose another file with -o`);
  }
  await writeAtomic(dest, fileText(doc));
  io.out(`Pulled “${doc.name}” (${id}, saved ${new Date(rec.updatedAt).toLocaleString()}) into ${relative(cwd, dest) || dest}`);
  return 0;
}

export async function syncList(conn: Connection, io: Out, json: boolean): Promise<number> {
  const items = (await listItems(conn, 'projects')).filter((p) => !p.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
  if (json) {
    io.out(JSON.stringify(items, null, 2));
    return 0;
  }
  if (!items.length) io.out(`No projects on ${conn.url}.`);
  for (const p of items) io.out(`${p.id}  ${new Date(p.updatedAt).toLocaleString()}  ${Math.max(1, Math.round(p.size / 1024))} KB  ${p.name}`);
  return 0;
}

// ---------- live mirror ----------

export interface LiveOptions {
  conn: Connection;
  /** Absolute path of the project file. */
  path: string;
  origin: string;
  log: (s: string) => void;
  /** File polling interval (ms). */
  pollMs?: number;
  /** A change counts once the file has been still this long (an agent may write in several steps). */
  settleMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Two-way mirror between a project file and its copy on the sync server, while `designer live` runs.
 * - The file changed (the agent wrote it): push it, marked live and edited by the CLI.
 * - The server changed (Henrique edited in the app): write it to the file.
 * - Both changed since the last agreement: the newer one (file mtime vs the server's updatedAt) wins; the
 *   other is kept as "<name> (conflicted copy …).designer.json" next to the file (and, when the file wins,
 *   the server also archives what it overwrote).
 */
export class LiveMirror {
  private base: number | undefined;
  /** The file content as last read or written by this mirror. */
  private lastText = '';
  private lastStat = '';
  private pendingStat = '';
  private pendingSince = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private poll: ReturnType<typeof setInterval> | null = null;
  private remotePoll: ReturnType<typeof setInterval> | null = null;
  private stopStream: (() => void) | null = null;
  private stopped = false;
  private stream: StreamState = 'connecting';
  id = '';
  name = '';
  /** Resolves when the mirror stops on its own (the project was deleted on the server). */
  readonly ended: Promise<void>;
  private end!: () => void;
  readonly counters = { pushed: 0, pulled: 0, conflicts: 0 };

  private readonly o: LiveOptions;

  constructor(o: LiveOptions) {
    this.o = o;
    this.ended = new Promise((r) => (this.end = r));
  }

  private now = () => (this.o.now ?? Date.now)();

  /** Serializes file and server work: one transfer at a time, in order. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch((e: unknown) => this.o.log(`${time(this.now())} ! ${e instanceof Error ? e.message : e}`));
    return next;
  }

  /** Pushes the file now (marked live), then starts watching both sides. */
  async start(): Promise<void> {
    const { path, conn } = this.o;
    const text = await readFile(path, 'utf8');
    const { doc, hadId } = parseFileDoc(text, path);
    this.id = doc.id;
    this.name = doc.name;
    let current = text;
    if (!hadId) {
      current = fileText(doc);
      await writeAtomic(path, current);
    }
    // What the server has decides the first move: if it is newer than the file, the file is updated from it
    // (the agent resumes a session Henrique continued); otherwise the file is pushed.
    const remote = (await listItems(conn, 'projects')).find((p) => p.id === doc.id);
    const mtime = (await stat(path)).mtimeMs;
    this.lastText = current;
    this.lastStat = await this.statKey();
    if (remote && !remote.deleted && remote.updatedAt > mtime) {
      await this.pull('newer on the server than the file');
    } else {
      // When the server already holds exactly this content, the push is no conflict; otherwise base stays
      // unknown, so the server keeps the version it overwrites in conflicts/.
      let base: number | undefined;
      if (remote && !remote.deleted) {
        const rec = await getItem(conn, 'projects', doc.id);
        const same = (d: DesignDocument) => fileText({ ...d, updatedAt: 0, createdAt: 0 });
        if (rec.data != null && same({ ...validateDocument(rec.data), id: doc.id, name: rec.name }) === same(doc)) base = rec.updatedAt;
      }
      this.base = base;
      await this.push(doc, base, 'start');
    }
    this.watch();
  }

  private async statKey(): Promise<string> {
    try {
      const s = await stat(this.o.path);
      return `${s.mtimeMs}:${s.size}`;
    } catch {
      return 'missing';
    }
  }

  private watch() {
    const pollMs = this.o.pollMs ?? 150;
    const settleMs = this.o.settleMs ?? 120;
    let busy = false;
    this.poll = setInterval(() => {
      if (busy || this.stopped) return;
      busy = true;
      void (async () => {
        const key = await this.statKey();
        if (key === this.lastStat || key === 'missing') {
          this.pendingStat = '';
        } else if (key !== this.pendingStat) {
          this.pendingStat = key;
          this.pendingSince = this.now();
        } else if (this.now() - this.pendingSince >= settleMs) {
          this.pendingStat = '';
          await this.run(() => this.fileChanged()).catch(() => undefined);
        }
      })().finally(() => (busy = false));
    }, pollMs);

    this.stopStream = subscribeEvents(this.o.conn, {
      fetch: this.o.fetch,
      onOpen: () => void this.run(() => this.checkRemote()).catch(() => undefined),
      onChange: (e) => {
        if (e.kind !== 'projects' || e.id !== this.id || e.updatedAt === this.base) return;
        void this.run(() => this.remoteChanged(e.updatedAt)).catch(() => undefined);
      },
      onState: (s) => {
        if (s === this.stream) return;
        if (s === 'unsupported') this.o.log(`${time(this.now())} · this server has no event stream (update designer-sync); checking every 2 s`);
        if (s === 'auth') this.o.log(`${time(this.now())} ! the server refused the event stream: missing or wrong API key`);
        this.stream = s;
      },
    });
    // Without the stream (older server, reconnecting), look every 2 s.
    this.remotePoll = setInterval(() => {
      if (this.stream !== 'open' && !this.stopped) void this.run(() => this.checkRemote()).catch(() => undefined);
    }, 2_000);
  }

  private async checkRemote() {
    const remote = (await listItems(this.o.conn, 'projects')).find((p) => p.id === this.id);
    if (!remote) return;
    if (remote.deleted) return this.deletedRemotely();
    if (remote.updatedAt !== this.base) await this.remoteChanged(remote.updatedAt);
  }

  private async fileChanged() {
    if (this.stopped) return;
    const key = await this.statKey();
    const text = await readFile(this.o.path, 'utf8').catch(() => null);
    if (text === null) return;
    this.lastStat = key;
    if (text === this.lastText) return;
    let doc: DesignDocument;
    try {
      doc = parseFileDoc(text, basename(this.o.path)).doc;
    } catch (e) {
      // Not pushed; the next save of the file is tried again.
      this.o.log(`${time(this.now())} ! not pushed: ${e instanceof Error ? e.message : e}`);
      return;
    }
    if (doc.id !== this.id) {
      this.o.log(`${time(this.now())} ! not pushed: the file's id changed (${this.id} → ${doc.id}); restart \`designer live\` for another project`);
      return;
    }
    this.lastText = text;
    await this.push(doc, this.base, 'file changed');
  }

  /** `after`: the revision must be newer than this (a conflict the file won against a newer-stamped remote). */
  private async push(doc: DesignDocument, base: number | undefined, why: string, live = true, after = 0) {
    const updatedAt = Math.max(this.now(), (this.base ?? 0) + 1, after + 1);
    const data: DesignDocument = { ...doc, updatedAt, ...(live ? { live: { editedBy: CLI_EDITOR } } : {}) };
    if (!live) delete data.live;
    const r = await putItem(this.o.conn, 'projects', doc.id, { name: doc.name, createdAt: doc.createdAt, updatedAt, deleted: false, base, data });
    if (r.applied) {
      this.base = updatedAt;
      this.name = doc.name;
      this.counters.pushed++;
      this.o.log(`${time(updatedAt)} ↑ pushed (${why})`);
      return;
    }
    // The server has a newer version than this edit (another clock ahead of ours): it wins, the file's
    // version is kept as a conflicted copy.
    if (r.item.deleted) return this.deletedRemotely();
    const copy = await keepConflictedCopy(this.o.path, doc, this.now());
    this.counters.conflicts++;
    this.o.log(`${time(this.now())} ⚠ conflict: the server's version is newer; the file's version is kept in ${basename(copy)}`);
    await this.pull('newer on the server');
  }

  private async remoteChanged(updatedAt: number) {
    if (this.stopped || updatedAt === this.base) return;
    if (this.base !== undefined && updatedAt < this.base) return; // older than what we agreed: stale event
    // Did the file change too, without having been pushed yet?
    const text = await readFile(this.o.path, 'utf8').catch(() => null);
    if (text !== null && text !== this.lastText) {
      let local: DesignDocument | null;
      try {
        local = parseFileDoc(text, basename(this.o.path)).doc;
      } catch {
        local = null; // half-written or broken: the server's version wins, the file is replaced below
      }
      const mtime = (await stat(this.o.path)).mtimeMs;
      if (local && mtime > updatedAt) {
        // Both changed; the file is newer: it wins (the server archives the version it overwrites).
        const rec = await getItem(this.o.conn, 'projects', this.id);
        if (!rec.deleted && rec.data != null) {
          const theirs = { ...validateDocument(rec.data), id: this.id, name: rec.name, createdAt: rec.createdAt, updatedAt: rec.updatedAt };
          const copy = await keepConflictedCopy(this.o.path, theirs, this.now());
          this.counters.conflicts++;
          this.o.log(`${time(this.now())} ⚠ conflict: changed in the app and in the file; the file is newer and wins, the app's version is kept in ${basename(copy)}`);
        }
        this.lastText = text;
        this.lastStat = await this.statKey();
        await this.push(local, this.base, 'file changed, conflict', true, updatedAt);
        return;
      }
      if (local) {
        const copy = await keepConflictedCopy(this.o.path, local, this.now());
        this.counters.conflicts++;
        this.o.log(`${time(this.now())} ⚠ conflict: changed in the app and in the file; the app is newer and wins, the file's version is kept in ${basename(copy)}`);
      }
    }
    await this.pull('changed on the server');
  }

  private async pull(why: string) {
    const rec = await getItem(this.o.conn, 'projects', this.id);
    if (rec.deleted || rec.data == null) return this.deletedRemotely();
    const doc: DesignDocument = { ...validateDocument(rec.data), id: this.id, name: rec.name || 'Untitled', createdAt: rec.createdAt, updatedAt: rec.updatedAt };
    const by = (rec.data as { live?: { editedBy?: string } }).live?.editedBy;
    const text = fileText(doc);
    await writeAtomic(this.o.path, text);
    this.lastText = text;
    this.lastStat = await this.statKey();
    this.base = rec.updatedAt;
    this.name = doc.name;
    this.counters.pulled++;
    const where = by?.startsWith('app:') ? ', edited in the app' : '';
    this.o.log(`${time(rec.updatedAt)} ↓ pulled (${why}${where}) → ${basename(this.o.path)}`);
  }

  private deletedRemotely() {
    if (this.stopped) return;
    this.o.log(`${time(this.now())} ✕ “${this.name}” was deleted on the server (in the app); stopping. The file is unchanged.`);
    this.halt();
    this.end();
  }

  private halt() {
    this.stopped = true;
    if (this.poll) clearInterval(this.poll);
    if (this.remotePoll) clearInterval(this.remotePoll);
    this.stopStream?.();
  }

  /** Stops watching; unless the project was deleted, pushes once more without the live mark. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.halt();
    await this.chain;
    const text = await readFile(this.o.path, 'utf8').catch(() => null);
    if (text === null) return;
    try {
      const { doc } = parseFileDoc(text, basename(this.o.path));
      // Whatever the file holds now (the last pull or the agent's last edit) goes up without `live`.
      await this.push(doc, this.base, 'stopped, no longer live', false);
    } catch (e) {
      this.o.log(`${time(this.now())} ! could not clear the live mark: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** `designer live`: runs until `signal` aborts (Ctrl+C) or the project is deleted on the server. */
export async function runLive(path: string, conn: Connection, origin: string, io: Out, signal: AbortSignal, extra: Partial<LiveOptions> = {}): Promise<number> {
  const mirror = new LiveMirror({ conn, path, origin, log: io.err, ...extra });
  await mirror.start();
  io.out(`Live: “${mirror.name}” (${mirror.id}) ↔ ${conn.url}`);
  io.out(
    `Open Designer with Sync on (same server): it appears in your projects. Or open ${openProjectLink(origin, mirror.id)}\n` +
      `Edits to ${basename(path)} are pushed within a second; edits in the app are written back to it. Ctrl+C to stop.`,
  );
  await new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
    void mirror.ended.then(resolve);
  });
  await mirror.stop();
  const c = mirror.counters;
  io.err(`Stopped. ${c.pushed} pushed, ${c.pulled} pulled${c.conflicts ? `, ${c.conflicts} conflicts (copies kept next to the file)` : ''}.`);
  return 0;
}
