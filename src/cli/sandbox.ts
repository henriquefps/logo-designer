// The CLI's sandbox for `designer agent` (docs/agents.md → AI agent bridge → Security model). The bridge runs the
// agent's `designer` with DESIGNER_SANDBOX_ROOT=<job folder>; then:
// - only the commands the agent may run work (wf, screen, to-png, validate, info, help): no servers, browsers,
//   sync or network, even if the bridge's wrapper were bypassed;
// - every file the CLI reads or writes (inputs, -o, --into, --dir, screenshots, …) must resolve inside that folder,
//   following symlinks (realpath), else the command stops with a clear error;
// - rendered SVG keeps only `data:` and `#` references (resvg would otherwise embed any local image file named in a
//   project, e.g. `href="/home/…/private.png"`, into the PNG);
// - fetch serves only the bundled font files: no network.
import { lstatSync, realpathSync } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const SANDBOX_ENV = 'DESIGNER_SANDBOX_ROOT';
/** Commands that run in the sandbox (the bridge's wrapper passes the same list). */
export const SANDBOX_COMMANDS = ['wf', 'screen', 'to-png', 'validate', 'info', 'help', '--help', '-h'];

export class SandboxError extends Error {}

/** The sandbox root (real path) when the environment sets one, else null. A root that does not exist is an error. */
export function sandboxRoot(env: { [k: string]: string | undefined } = process.env): string | null {
  const raw = env[SANDBOX_ENV];
  if (raw === undefined || raw === '') return null;
  if (!isAbsolute(raw)) throw new SandboxError(`${SANDBOX_ENV} must be an absolute path, got “${raw}”`);
  try {
    if (!lstatSync(raw).isDirectory()) throw new Error('not a directory');
    return realpathSync(raw);
  } catch {
    throw new SandboxError(`${SANDBOX_ENV} (${raw}) is not a folder`);
  }
}

/** True when `p` (absolute, real) is `root` or inside it. */
export function isInside(root: string, p: string): boolean {
  const rel = relative(root, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * The real path `path` (relative to `cwd`) stands for: the nearest part of it that exists, resolved through every
 * symlink, plus the parts that do not exist yet (those cannot be symlinks). Throws SandboxError when it is outside
 * `root`. Returns the path to use (the real one).
 */
export async function confine(root: string, cwd: string, path: string, what: 'read' | 'write'): Promise<string> {
  const abs = resolve(cwd, path);
  let existing = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      await lstat(existing);
      break;
    } catch {
      const up = dirname(existing);
      if (up === existing) break;
      rest.unshift(basename(existing));
      existing = up;
    }
  }
  let real: string;
  try {
    real = join(await realpath(existing), ...rest);
  } catch {
    // It exists (lstat) but cannot be resolved: a dangling or looping link, which could later point anywhere.
    throw new SandboxError(`designer: cannot ${what} ${path}: a broken link (the agent's sandbox refuses it)`);
  }
  if (!isInside(root, real)) {
    throw new SandboxError(`designer: cannot ${what} ${path}: it is outside the job folder (${root}). In the agent's sandbox the CLI only reads and writes files inside it.`);
  }
  return real;
}

/** Keeps only `data:` and same-document (`#…`) references in an SVG about to be rendered; refuses a DTD. */
export function sandboxSvg(svg: string): string {
  if (/<!(DOCTYPE|ENTITY)/i.test(svg)) throw new SandboxError('designer: an SVG with a DOCTYPE or ENTITY cannot be rendered in the agent sandbox');
  return svg.replace(/(\s(?:xlink:)?href\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre: string, _q: string, d?: string, s?: string) => {
    const v = d ?? s ?? '';
    return /^(#|data:)/i.test(v) ? m : `${pre}""`;
  });
}

/** The fetch the CLI gets in the sandbox: bundled font files only (a file under `fontsDir`), never the network. */
export function sandboxFetch(fontsDir: string, readFile: (p: string) => Promise<Uint8Array>): typeof fetch {
  const f = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith('file://') ? new URL(url).pathname : url.startsWith('/') ? url : null;
    if (path) {
      let real: string;
      try {
        real = await realpath(decodeURIComponent(path));
      } catch {
        return new Response(null, { status: 404 });
      }
      if (isInside(fontsDir, real) && /\.(ttf|otf|woff2?)$/i.test(real)) return new Response(new Uint8Array(await readFile(real)));
      return new Response(null, { status: 403, statusText: 'outside the bundled fonts (agent sandbox)' });
    }
    throw new TypeError(`designer: no network in the agent sandbox (${url.slice(0, 80)})`);
  };
  return f as typeof fetch;
}

/** The path the CLI should open for `path`: confined to the sandbox when there is one, else just resolved. */
export async function cliPath(env: { [k: string]: string | undefined }, cwd: string, path: string, what: 'read' | 'write'): Promise<string> {
  const root = sandboxRoot(env);
  return root ? confine(root, cwd, path, what) : resolve(cwd, path);
}

/** An SVG about to be rendered by resvg: sanitized in the sandbox, unchanged otherwise. */
export const cliSvg = (env: { [k: string]: string | undefined }, svg: string) => (sandboxRoot(env) ? sandboxSvg(svg) : svg);
