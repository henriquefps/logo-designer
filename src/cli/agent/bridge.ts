// `designer agent`: the bridge between the sync server's job queue and Claude Code on this machine
// (docs/wireframe-mode.md → Phase 4 → The bridge; docs/agents.md → AI agent bridge). One job at a time:
// claim → job folder with the project mirrored live (the same LiveMirror as `designer live`) → `claude -p` with
// restricted tools → progress → finish. Presence by heartbeat.
import { randomUUID } from 'node:crypto';
import { appendFile, chmod, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignDocument } from '@/model';
import { getItem, putItem, SyncError, type Connection } from '@/sync/api';
import { subscribeEvents } from '@/sync/events';
import { LiveMirror, parseFileDoc, syncPull } from '../sync';
import { agentEnv, ALLOWED_DESIGNER, startClaude, type ClaudeRun } from './claude';
import { claimJob, finishJob, getAttachment, getJob, HEARTBEAT_MS, listJobs, reportProgress, sendHeartbeat, serverHasJobs, type FinishBody, type JobMeta } from '@/sync/jobs';
import { ProgressMapper, summaryOf, type ProgressLine } from './progress';
import { ATTACHMENTS_DIR, MAX_ROUNDS, PROJECT_FILE, renderPrompt, systemPrompt } from './prompts';

export const AGENT_VERSION = '1';
const DAY = 24 * 60 * 60_000;

const repoFile = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));

/** Single-quoted for sh. */
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * The `designer` the agent runs: a wrapper on its PATH that only passes the allowed commands to this checkout's CLI
 * (a second fence behind Claude Code's permission rules: `designer live`, `sync`, `serve`, … never run), with the
 * CLI's sandbox root (src/cli/sandbox.ts) baked in, so no prefix or file in the job folder can drop it. It lives
 * outside the job folder, read-only: the agent's file tools cannot reach it.
 */
export function designerWrapper(command: string[], sandboxRoot: string): string {
  return [
    '#!/bin/sh',
    '# Written by `designer agent`: the designer CLI for one job, limited to the commands the agent may run.',
    `DESIGNER_SANDBOX_ROOT=${sq(sandboxRoot)}`,
    'export DESIGNER_SANDBOX_ROOT',
    'case "$1" in',
    `  ${[...ALLOWED_DESIGNER, 'help', '--help', '-h'].join('|')}) ;;`,
    '  *) echo "designer $1: not available to the agent (allowed: ' + ALLOWED_DESIGNER.join(', ') + ')" >&2; exit 2 ;;',
    'esac',
    `exec ${command.map(sq).join(' ')} "$@"`,
    '',
  ].join('\n');
}

/**
 * How this checkout's CLI is started: the Bun running us (or `bun`) and bin/designer.ts. Bun would otherwise read
 * `bunfig.toml` (preload scripts!) and `.env` from the current folder, which is the job folder the agent writes; and
 * it must never install packages. A `tsconfig.json` there does not matter: Bun resolves each source file with the
 * tsconfig nearest to it, which is this checkout's (bridge.test.ts checks a hostile one). `--tsconfig-override` is
 * not used: Bun 1.4 prints "Internal error: directory mismatch" with it on every run, noise in all of the agent's
 * command output.
 */
export function defaultDesignerCommand(): string[] {
  return [process.versions.bun ? process.execPath : 'bun', '--no-install', '--config=/dev/null', '--no-env-file', repoFile('bin/designer.ts')];
}

const JOB_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
/** Where the bridge keeps a job's own files (the designer wrapper, the stream log), next to the job folder. */
export const BRIDGE_DIR = '.bridge';

/** File names the server gives attachments are kept to a safe basename. */
export const safeAttachmentName = (name: string, i: number) => {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
  return clean || `attachment-${i + 1}`;
};

export interface AgentOptions {
  conn: Connection;
  /** Shown in the app ("Agent online on <name>"). */
  name: string;
  /** Job folders live here (`<workdir>/<jobId>/`). */
  workdir: string;
  maxMinutes: number;
  claudeBin: string;
  /** Claude Code's version line (from the startup check), sent with the heartbeat. */
  claudeVersion: string;
  /** The environment the agent starts from (sync secrets are removed). */
  env: NodeJS.ProcessEnv;
  origin: string;
  log: (s: string) => void;
  fetch?: typeof fetch;
  /** Tests: shorter rhythms. */
  heartbeatMs?: number;
  pollMs?: number;
  keepMs?: number;
  killGraceMs?: number;
  mirror?: { pollMs?: number; settleMs?: number };
  designerCommand?: string[];
  skillText?: string;
}

type Ending = 'cancel' | 'timeout' | 'stop';

interface Running {
  id: string;
  ending: Ending | null;
  claude: ClaudeRun | null;
}

const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export class AgentBridge {
  agentId = '';
  private readonly o: AgentOptions;
  private current: Running | null = null;
  private jobPromise: Promise<void> | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private stopEvents: (() => void) | null = null;
  private stopped = false;
  private ticking = false;
  private retick = false;
  private heartbeatFailing = false;
  /** Jobs this bridge finished: ids (tests, and never claiming one twice). */
  readonly finished: { id: string; status: string }[] = [];

  constructor(o: AgentOptions) {
    this.o = o;
  }

  private log(s: string) {
    this.o.log(`${time()} ${s}`);
  }

  /** Starts listening: heartbeat, event stream, polling for queued jobs, daily cleanup. */
  async start(): Promise<void> {
    await mkdir(this.o.workdir, { recursive: true, mode: 0o700 });
    this.agentId = await this.loadAgentId();
    await this.cleanup();
    // A wrong key or an older server without the job queue: a clear error now, not a silent agent.
    if (!(await serverHasJobs(this.o.conn))) throw new Error(`${this.o.conn.url} has no job queue: update designer-sync to v0.3.0 or later`);
    await this.heartbeat();
    this.timers.push(setInterval(() => void this.heartbeat(), this.o.heartbeatMs ?? HEARTBEAT_MS));
    this.timers.push(setInterval(() => void this.poll(), this.o.pollMs ?? 5_000));
    this.timers.push(setInterval(() => void this.cleanup(), 60 * 60_000));
    this.stopEvents = subscribeEvents(this.o.conn, {
      fetch: this.o.fetch,
      onChange: () => undefined,
      onOpen: () => void this.tick(),
      onJob: (e) => {
        if (this.current?.id === e.id) void this.checkCancel();
        else if (e.status === 'queued') void this.tick();
      },
    });
    void this.tick();
  }

  /** Stops listening; a running job is stopped and finished as failed. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.stopEvents?.();
    if (this.current) this.end('stop');
    await this.jobPromise;
  }

  /** Resolves when the job running now (if any) has finished. */
  idle(): Promise<void> {
    return this.jobPromise ?? Promise.resolve();
  }

  private async loadAgentId(): Promise<string> {
    const file = join(this.o.workdir, 'agent-id');
    const saved = await readFile(file, 'utf8').then((t) => t.trim(), () => '');
    if (/^[A-Za-z0-9_-]{1,80}$/.test(saved)) return saved;
    const id = `agent-${randomUUID()}`;
    await writeFile(file, `${id}\n`, { mode: 0o600 });
    return id;
  }

  private async heartbeat() {
    try {
      await sendHeartbeat(this.o.conn, {
        agentId: this.agentId,
        name: this.o.name,
        host: hostname(),
        version: `designer-agent ${AGENT_VERSION}; ${this.o.claudeVersion}`,
        busy: !!this.current,
        ...(this.current ? { jobId: this.current.id } : {}),
      });
      if (this.heartbeatFailing) this.log('heartbeat: the sync server answers again');
      this.heartbeatFailing = false;
    } catch (e) {
      if (!this.heartbeatFailing) this.log(`! heartbeat failed: ${e instanceof Error ? e.message : e}`);
      this.heartbeatFailing = true;
    }
  }

  private async poll() {
    if (this.current) await this.checkCancel();
    else await this.tick();
  }

  /** Looks for a queued job and runs the oldest one this bridge can claim. */
  private async tick(): Promise<void> {
    if (this.stopped || this.current) return;
    if (this.ticking) {
      this.retick = true;
      return;
    }
    this.ticking = true;
    try {
      let jobs: JobMeta[];
      try {
        jobs = await listJobs(this.o.conn, { active: true });
      } catch (e) {
        this.log(`! listing jobs failed: ${e instanceof Error ? e.message : e}`);
        return;
      }
      // Newest first from the server; taken in order: oldest first.
      const queued = jobs
        .map((j, i) => ({ j, i }))
        .filter(({ j }) => j.status === 'queued' && !j.cancelRequested)
        .sort((a, b) => (a.j.createdAt ?? 0) - (b.j.createdAt ?? 0) || b.i - a.i)
        .map(({ j }) => j);
      for (const j of queued) {
        if (this.stopped || this.current) return;
        let ok = false;
        try {
          ok = (await claimJob(this.o.conn, j.id, this.agentId)) !== null;
        } catch (e) {
          this.log(`! claiming ${j.id} failed: ${e instanceof Error ? e.message : e}`);
        }
        if (!ok) continue;
        const run: Running = { id: j.id, ending: null, claude: null };
        this.current = run;
        this.jobPromise = this.runJob(j, run).finally(() => {
          this.current = null;
          this.jobPromise = null;
          void this.heartbeat();
          void this.cleanup();
          void this.tick();
        });
        return;
      }
    } finally {
      this.ticking = false;
      if (this.retick) {
        this.retick = false;
        void this.tick();
      }
    }
  }

  private async checkCancel() {
    const run = this.current;
    if (!run || run.ending) return;
    try {
      const job = await getJob(this.o.conn, run.id);
      if (job.cancelRequested && this.current === run) this.end('cancel');
    } catch {
      // the next poll tries again
    }
  }

  private end(why: Ending) {
    const run = this.current;
    if (!run || run.ending) return;
    run.ending = why;
    this.log(`job ${run.id}: ${why === 'cancel' ? 'cancel requested' : why === 'timeout' ? `over ${this.o.maxMinutes} minutes` : 'agent stopping'}, stopping Claude Code`);
    run.claude?.kill(this.o.killGraceMs);
  }

  private async runJob(meta: JobMeta, run: Running): Promise<void> {
    const dir = join(this.o.workdir, meta.id);
    // The agent's cwd is `dir`; its file tools are confined there. Everything the bridge relies on is outside it.
    const own = join(this.o.workdir, BRIDGE_DIR, meta.id);
    const binDir = join(own, 'bin');
    const streamLog = join(own, 'stream.jsonl');
    const mapper = new ProgressMapper();
    let progressChain: Promise<unknown> = Promise.resolve();
    const progress = (l: ProgressLine) => {
      this.log(`job ${meta.id}: ${l.message}`);
      progressChain = progressChain.then(() =>
        reportProgress(this.o.conn, meta.id, { agentId: this.agentId, message: l.message, stage: l.stage })
          .then((r) => {
            // The answer tells whether the app asked to cancel: no need to wait for the event or the poll.
            if (r.cancelRequested && this.current === run) this.end('cancel');
          })
          .catch((e: unknown) => this.log(`! progress not sent: ${e instanceof Error ? e.message : e}`)),
      );
    };
    let mirror: LiveMirror | null = null;
    let finish: Omit<FinishBody, 'agentId'>;
    const timeout = setTimeout(() => this.end('timeout'), this.o.maxMinutes * 60_000);
    this.log(`job ${meta.id} (${meta.type}) claimed`);
    void this.heartbeat();
    try {
      if (!JOB_ID_RE.test(meta.id)) throw new Error(`Job id “${meta.id}” cannot be a folder name`);
      const job = await getJob(this.o.conn, meta.id);
      await mkdir(join(dir, ATTACHMENTS_DIR), { recursive: true, mode: 0o700 });
      await mkdir(binDir, { recursive: true, mode: 0o700 });
      const wrapper = join(binDir, 'designer');
      await writeFile(wrapper, designerWrapper(this.o.designerCommand ?? defaultDesignerCommand(), await realpath(dir)));
      await chmod(wrapper, 0o500);
      await chmod(binDir, 0o500);
      progress({ message: 'Preparing the project', stage: 'start' });

      // The project, pulled into the job folder and mirrored live (the same code as `designer live`).
      const path = join(dir, PROJECT_FILE);
      const quiet = { out: () => undefined, err: () => undefined };
      await syncPull(job.projectId, path, this.o.conn, quiet, dir);
      const doc: DesignDocument = parseFileDoc(await readFile(path, 'utf8'), path).doc;
      if (!doc.wireframe) throw new Error('The project is not a wireframe project');
      const attachments: string[] = [];
      for (const [i, a] of (job.attachments ?? []).entries()) {
        const local = safeAttachmentName(a.name, i);
        await writeFile(join(dir, ATTACHMENTS_DIR, local), (await getAttachment(this.o.conn, job.id, a.name)).bytes, { mode: 0o600 });
        attachments.push(`${ATTACHMENTS_DIR}/${local}`);
      }
      const prompt = renderPrompt(job, { doc, attachments, maxRounds: MAX_ROUNDS[job.type] ?? 3 });
      const skill = this.o.skillText ?? (await readFile(repoFile('skills/designer/SKILL.md'), 'utf8'));

      mirror = new LiveMirror({
        conn: this.o.conn,
        path,
        origin: this.o.origin,
        fetch: this.o.fetch,
        log: (s) => this.log(`job ${meta.id}: ${s.replace(/^\d{1,2}[:.]\d{2}[:.]\d{2}(\s?[AaPp]\.?[Mm]\.?)?\s/, '')}`),
        ...this.o.mirror,
      });
      await mirror.start();

      if (!run.ending) {
        const claude = startClaude({
          bin: this.o.claudeBin,
          cwd: dir,
          env: agentEnv(this.o.env, binDir, await realpath(dir)),
          prompt,
          appendSystemPrompt: systemPrompt(skill),
          onEvent: (e) => {
            void appendFile(streamLog, `${JSON.stringify(e)}\n`, { mode: 0o600 }).catch(() => undefined);
            for (const l of mapper.feed(e)) progress(l);
          },
        });
        run.claude = claude;
        if (run.ending) claude.kill(this.o.killGraceMs);
        const r = await claude.done;
        const rounds = mapper.buildRounds;
        const kept = rounds ? `The project keeps what was built (${rounds} build round${rounds === 1 ? '' : 's'}).` : 'Nothing was built.';
        if (run.ending === 'cancel') finish = { status: 'cancelled', summary: `Cancelled. ${kept}` };
        else if (run.ending === 'timeout') finish = { status: 'failed', error: `Stopped after ${this.o.maxMinutes} minutes (the agent's --max-minutes). ${kept}` };
        else if (run.ending === 'stop') finish = { status: 'failed', error: `The agent on ${this.o.name} was stopped before the job finished. ${kept}` };
        else if (r.result && !r.result.is_error && r.result.subtype === 'success' && r.code === 0) finish = { status: 'done', summary: summaryOf(r.result.result) || `Done (${rounds} build rounds).` };
        else {
          const why = r.result?.is_error ? summaryOf(r.result.result, 400) : summaryOf(r.stderr.split('\n').filter(Boolean).slice(-3).join(' '), 400);
          finish = { status: 'failed', error: `Claude Code failed (exit ${r.code ?? r.signal})${why ? `: ${why}` : ''}` };
        }
      } else {
        finish = run.ending === 'cancel' ? { status: 'cancelled', summary: 'Cancelled before Claude Code started.' } : { status: 'failed', error: 'Stopped before Claude Code started.' };
      }
    } catch (e) {
      finish = { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(timeout);
    }
    // The last edits go up (without the live mark) before the app hears the job is over.
    if (mirror) await mirror.stop().catch((e: unknown) => this.log(`! mirror: ${e instanceof Error ? e.message : e}`));
    // The app does not clear the live mark when a job ends: the bridge does, also when the job failed before the
    // mirror ran (or the mirror's last push did not land).
    await this.clearLiveMark(meta.projectId);
    await progressChain;
    try {
      await finishJob(this.o.conn, meta.id, { agentId: this.agentId, ...finish });
    } catch (e) {
      this.log(`! finishing ${meta.id} failed: ${e instanceof Error ? e.message : e}`);
    }
    this.finished.push({ id: meta.id, status: finish.status });
    this.log(`job ${meta.id}: ${finish.status}${finish.error ? ` — ${finish.error}` : ''}`);
  }

  /** Pushes the project without its `live` mark when the server copy still carries one (no-op otherwise). */
  private async clearLiveMark(projectId: string) {
    try {
      const rec = await getItem(this.o.conn, 'projects', projectId);
      if (rec.deleted || rec.data == null || !(rec.data as { live?: unknown }).live) return;
      const data = { ...(rec.data as DesignDocument) };
      delete data.live;
      const updatedAt = Math.max(Date.now(), rec.updatedAt + 1);
      await putItem(this.o.conn, 'projects', projectId, { name: rec.name, createdAt: rec.createdAt, updatedAt, deleted: false, base: rec.updatedAt, data: { ...data, updatedAt } });
    } catch (e) {
      if (!(e instanceof SyncError && e.status === 404)) this.log(`! could not clear the live mark of ${projectId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Job folders and the bridge's files of each job (wrapper, stream log) are kept a day for debugging, then deleted. */
  async cleanup(now = Date.now()): Promise<string[]> {
    const removed: string[] = [];
    const sweep = async (dir: string, prefix: string) => {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (name === 'agent-id' || name === BRIDGE_DIR || name === this.current?.id) continue;
        const p = join(dir, name);
        try {
          const s = await stat(p);
          if (now - s.mtimeMs < (this.o.keepMs ?? DAY)) continue;
          await chmod(join(p, 'bin'), 0o700).catch(() => undefined); // read-only, so its wrapper can be removed
          await rm(p, { recursive: true, force: true });
          removed.push(`${prefix}${name}`);
        } catch {
          // gone meanwhile
        }
      }
    };
    await sweep(this.o.workdir, '');
    await sweep(join(this.o.workdir, BRIDGE_DIR), `${BRIDGE_DIR}/`);
    return removed;
  }
}
