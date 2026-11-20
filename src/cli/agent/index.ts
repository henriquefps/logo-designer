// `designer agent`: argument handling and the run loop around AgentBridge (bridge.ts).
import { hostname, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Connection } from '@/sync/api';
import { AgentBridge, type AgentOptions } from './bridge';
import { AgentSetupError, checkClaude } from './claude';

export { AgentSetupError } from './claude';

export interface AgentArgs {
  conn: Connection;
  name?: string;
  workdir?: string;
  maxMinutes?: string;
  claude?: string;
  origin: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  out: (s: string) => void;
  err: (s: string) => void;
  signal: AbortSignal;
  /** Tests: extra bridge options (rhythms, fetch, the designer command). */
  extra?: Partial<AgentOptions>;
}

export const defaultWorkdir = (env: NodeJS.ProcessEnv) => join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'designer-agent');

export async function runAgent(a: AgentArgs): Promise<number> {
  const maxMinutes = a.maxMinutes === undefined ? 15 : Number(a.maxMinutes);
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) throw new AgentSetupError(`--max-minutes must be a positive number, got “${a.maxMinutes}”`);
  const claudeBin = a.claude ?? a.env.DESIGNER_AGENT_CLAUDE ?? 'claude';
  const claudeVersion = await checkClaude(claudeBin, a.env);
  const name = a.name?.trim() || hostname();
  const workdir = a.workdir ? resolve(a.cwd, a.workdir) : defaultWorkdir(a.env);
  const bridge = new AgentBridge({
    conn: a.conn,
    name,
    workdir,
    maxMinutes,
    claudeBin,
    claudeVersion,
    env: a.env,
    origin: a.origin,
    log: a.err,
    ...a.extra,
  });
  await bridge.start();
  a.out(`Agent “${name}” (${bridge.agentId}) online on ${a.conn.url} with ${claudeVersion}.`);
  a.out(`Waiting for jobs from the Designer app; one at a time, at most ${maxMinutes} min each. Job folders: ${workdir} (kept a day). Ctrl+C to stop.`);
  await new Promise<void>((r) => {
    if (a.signal.aborted) return r();
    a.signal.addEventListener('abort', () => r(), { once: true });
  });
  await bridge.stop();
  a.err(`Stopped. ${bridge.finished.length} job${bridge.finished.length === 1 ? '' : 's'} run.`);
  return 0;
}
