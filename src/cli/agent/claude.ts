// Running Claude Code headless for a job (docs/wireframe-mode.md → Phase 4 → The bridge, step 3): `claude -p`
// with stream-json output, in the job folder, with its tools restricted to the `designer` CLI and file tools
// confined to that folder. Checked for real against Claude Code 2.1 (docs/agents.md → AI agent bridge).
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

export class AgentSetupError extends Error {}

/**
 * Bash patterns the agent may run. Everything else (other commands, `designer live`, `sync`, `serve`, `open`,
 * `present`, chained commands, substitutions) is denied without asking: `--permission-mode dontAsk`.
 */
export const ALLOWED_DESIGNER = ['wf', 'screen', 'to-png', 'validate', 'info'] as const;
export const ALLOWED_TOOLS = [...ALLOWED_DESIGNER.map((c) => `Bash(designer ${c} *)`), 'Read', 'Write', 'Edit'];
/** The built-in tools that exist at all in the session (no WebFetch, WebSearch, Task, Glob, Grep, …). */
export const TOOLS = 'Bash,Read,Write,Edit';

/** Variables the agent never sees: the sync server's address and key stay with the bridge. */
export const SECRET_ENV = ['DESIGNER_SYNC_KEY', 'SYNC_API_KEY', 'DESIGNER_SYNC_URL'];

export function claudeArgs(appendSystemPrompt: string): string[] {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--tools',
    TOOLS,
    '--allowedTools',
    ...ALLOWED_TOOLS,
    // Nothing outside the allow list runs, and nobody is asked.
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    // Ignores the user's and project's settings files (their allow rules must not widen this list) and confines the
    // file tools to the working directory.
    '--restricted',
    // No CLAUDE.md, skills, plugins, hooks or MCP servers of the person's setup.
    '--safe-mode',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--append-system-prompt',
    appendSystemPrompt,
  ];
}

/** The environment of the agent: ours without the sync secrets, with the job's `designer` wrapper first on PATH. */
export function agentEnv(env: NodeJS.ProcessEnv, binDir: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  for (const k of SECRET_ENV) delete out[k];
  out.PATH = `${binDir}${env.PATH ? `:${env.PATH}` : ''}`;
  return out;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: ChildProcess;
    try {
      child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: null, stdout, stderr, error: e as NodeJS.ErrnoException });
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, error });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Refuses to start without a usable Claude Code: `claude --version` must run, and `claude auth status` (JSON) must say
 * `loggedIn: true`. Neither call costs a model request. Returns the version line.
 */
export async function checkClaude(bin: string, env: NodeJS.ProcessEnv): Promise<string> {
  const v = await run(bin, ['--version'], env, 30_000);
  if (v.error?.code === 'ENOENT') {
    throw new AgentSetupError(
      `Claude Code (\`${bin}\`) was not found. Install it (https://claude.com/claude-code), log in once with \`claude\`, then start the agent again (or pass --claude PATH).`,
    );
  }
  if (v.error || v.code !== 0) throw new AgentSetupError(`\`${bin} --version\` failed: ${(v.error?.message ?? v.stderr.trim()) || `exit ${v.code}`}`);
  const version = v.stdout.trim().split('\n')[0];
  const a = await run(bin, ['auth', 'status'], env, 30_000);
  let loggedIn: boolean;
  try {
    loggedIn = (JSON.parse(a.stdout) as { loggedIn?: boolean }).loggedIn === true;
  } catch {
    throw new AgentSetupError(`Could not read \`${bin} auth status\` (Claude Code ${version}; the agent needs 2.1 or later): ${a.stderr.trim() || a.stdout.trim() || `exit ${a.code}`}`);
  }
  if (!loggedIn) {
    throw new AgentSetupError(`Claude Code is not logged in on this machine. Run \`claude\` once and log in (or \`claude auth login\`), then start the agent again.`);
  }
  return version;
}

/** One line of `--output-format stream-json`. Only the fields the bridge reads. */
export interface StreamEvent {
  type: string;
  subtype?: string;
  message?: { content?: unknown };
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  duration_ms?: number;
  total_cost_usd?: number;
}

export interface ClaudeRun {
  /** Resolves when the process has exited (after `kill` too). */
  done: Promise<{ code: number | null; signal: NodeJS.Signals | null; result: StreamEvent | null; stderr: string }>;
  /** Kills the whole process tree (Claude Code and the commands it started): SIGTERM, then SIGKILL after `graceMs`. */
  kill: (graceMs?: number) => void;
  pid: number | undefined;
}

export interface StartClaude {
  bin: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  appendSystemPrompt: string;
  onEvent: (e: StreamEvent) => void;
}

/** Starts `claude -p` in its own process group (so the tree can be killed); the prompt goes in on stdin. */
export function startClaude(o: StartClaude): ClaudeRun {
  const child = spawn(o.bin, claudeArgs(o.appendSystemPrompt), { cwd: o.cwd, env: o.env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let result: StreamEvent | null = null;
  child.stderr?.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  child.stdin?.on('error', () => undefined); // the process may die before reading it
  child.stdin?.end(o.prompt);
  const lines = createInterface({ input: child.stdout! });
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let e: StreamEvent;
    try {
      e = JSON.parse(line) as StreamEvent;
    } catch {
      return; // not a stream-json line
    }
    if (e.type === 'result') result = e;
    try {
      o.onEvent(e);
    } catch {
      // a broken progress handler never stops the job
    }
  });
  const done = new Promise<Awaited<ClaudeRun['done']>>((resolve) => {
    let spawnError: Error | null = null;
    child.on('error', (e) => (spawnError = e));
    child.on('close', (code, signal) => {
      if (killTimer) clearTimeout(killTimer);
      // Whatever Claude Code left running in its group (a command it started) goes with it.
      signalGroup('SIGKILL', false);
      resolve({ code, signal, result, stderr: spawnError ? `${spawnError.message}\n${stderr}` : stderr });
    });
  });
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  const signalGroup = (sig: NodeJS.Signals, leaderToo = true) => {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, sig);
    } catch {
      if (!leaderToo) return; // the group is empty
      try {
        child.kill(sig);
      } catch {
        // already gone
      }
    }
  };
  return {
    done,
    pid: child.pid,
    kill: (graceMs = 5_000) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      signalGroup('SIGTERM');
      killTimer ??= setTimeout(() => signalGroup('SIGKILL'), graceMs);
    },
  };
}
