// `designer` CLI: create, convert, check and share Designer projects without the browser UI.
// Runs under Bun (bin/designer.ts). Reuses src/model and src/io; see docs/agents.md.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { parseArgs, promisify, type ParseArgsConfig } from 'node:util';
import { createDocument, findNode, worldBounds, type DesignDocument, type Rect, type SceneNode } from '@/model';
import { applyKnockout, gapUnit, knockout, targetsBelow } from '@/vector/knockout';
import { loadPaper } from '@/vector/paperOps';
import { serializeProject, validateDocument } from '@/io/projectFile';
import { svgToDocument } from '@/io/svgDocument';
import { ensureSvgGeometry } from '@/io/svgImport';
import { exportSvg } from '@/io/svgExport';
import { exportGlyph, GLYPH_BOX } from '@/io/glyphExport';
import { APP_ORIGIN, buildImportLink, buildOpenLink, LINK_MAX_LENGTH, LINK_WARN_LENGTH, nameFromPath } from '@/io/shareLink';
import { CORS_HEADERS, galleryHtml, pickOpener, type GalleryItem } from './present';
import { describeKeyline, fitDocument, keylineOf } from './fit';
import { BRAND, normalizeTile } from '@/icon/rules';
import { ICON_PRESETS, ICON_SHAPES, isIconPreset, parsePreset, type IconSettings } from './presets';

export interface CliIO {
  out: (s: string) => void;
  err: (s: string) => void;
  /** Working directory for relative paths (tests). */
  cwd?: string;
  /** True when stdout is a terminal (the `link` warning). */
  isTTY?: boolean;
  /** Opens a URL in the default browser; false when there is no GUI opener (tests inject this). */
  openUrl?: (url: string) => Promise<boolean>;
  /** Reads stdin when a path is `-`. */
  stdin?: () => Promise<string>;
}

class UsageError extends Error {}

export const USAGE = `designer — Designer projects from the command line (https://designer.hfps.dev)

Usage: designer <command> [options]

  new [-o file] [--preset P] [--name N] [--tile #hex]
                                              empty project (P: ${ICON_PRESETS.join(' | ')} | WxH); --tile stores the
                                              tile colour in an app icon project
  from-svg <file.svg|-> [-o file] [--name N] [--icon P [--tile #hex]] [--no-fit]
                                              editable project from an SVG (shapes, paths, groups, gradients);
                                              with --icon the drawing is fitted to the keyline (--no-fit keeps it raw)
  fit <project> [-o file]                     scale + centre the glyph of an app icon project onto its keyline
                                              (same as 'Fit to keyline' in the app, strokes scale too; default:
                                              in place). Run it after manual changes or knockout
  to-svg <project> [-o file] [--glyph]        clean SVG (text outlined); --glyph = 128 box + currentColor
                                              fragment for scripts/build-icons.mjs
  to-png <project> --size N [-o file]         PNG N px wide (resvg)
  icons <project> -o <dir> [--small <project>] [--shape S] [--tile <#hex>] [--android <res>] [--ios <dir>] [--site <dir>]
                                              whole app icon set, same files and numbers as build-icons.mjs
                                              (docs-img/, site/, android/res/, ios/, review-sheet.png, README.txt);
                                              --tile <#hex>: tile colour for everything (default: the project's
                                              icon.tile, else the hfps blue #2063b0; olive repos: #5b7a3a);
                                              includes drawable/ic_splash.xml (Android 12+ splash VectorDrawable).
                                              --android/--ios/--site write that part straight into an app
                                              (res dir, ios dir, web root) instead of under -o; an existing
                                              values/ic_launcher_background.xml keeps its other colours
  validate <project…>                         check files; errors name the JSON path (a note when an
                                              icon project is off its keyline)
  info <project> [--json]                     artboard, tree summary and bounds, node ids and names; for icon
                                              projects whether the glyph is on its keyline
  knockout <project> --cutter <id|name>[,…] [--targets <id|name>,…] [--gap N|NT] [--outline-only] [-o file]
                                              cut the objects behind the cutter where it sits (its whole
                                              silhouette; --outline-only: only under its strokes), with a
                                              gap (default 0.03T on icon projects, 4 px elsewhere): plain
                                              editable paths instead of clipPaths or tile-coloured shapes
  link <project|svg> [--origin URL]           #open= link that imports the file in Designer
  link --url <url>                            ?import= link for a file on the web (raw.githubusercontent.com…)
  link <file> --github                        ?import= link to the file on GitHub (current branch, pushed)
  serve <project|svg> [--port 8765]           serve one file with CORS and print its ?import= link
  open <project|svg> [more…] [--no-wait]      open in Designer in the default browser, no link printed
                                              (several files, or no GUI: like present)
  present <files…> [--port 8765] [--no-open]  local gallery page (preview + "Open in Designer" per file);
                                              keeps running until Ctrl+C

Without -o, project/SVG output goes to stdout. Docs: docs/agents.md, docs/project-format.md.
`;

const COMMON: ParseArgsConfig['options'] = {
  output: { type: 'string', short: 'o' },
  name: { type: 'string' },
  preset: { type: 'string' },
  icon: { type: 'string' },
  glyph: { type: 'boolean' },
  size: { type: 'string' },
  json: { type: 'boolean' },
  origin: { type: 'string' },
  url: { type: 'string' },
  github: { type: 'boolean' },
  port: { type: 'string' },
  'no-open': { type: 'boolean' },
  'no-fit': { type: 'boolean' },
  'no-wait': { type: 'boolean' },
  small: { type: 'string' },
  android: { type: 'string' },
  ios: { type: 'string' },
  site: { type: 'string' },
  shape: { type: 'string' },
  tile: { type: 'string' },
  cutter: { type: 'string' },
  targets: { type: 'string' },
  gap: { type: 'string' },
  'outline-only': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

type Values = Record<string, string | boolean | undefined>;

const str = (v: Values, k: string) => (typeof v[k] === 'string' ? (v[k] as string) : undefined);

async function readInput(path: string, io: CliIO): Promise<string> {
  if (path === '-') {
    if (!io.stdin) throw new UsageError('stdin is not available');
    return io.stdin();
  }
  try {
    return await readFile(resolve(io.cwd ?? process.cwd(), path), 'utf8');
  } catch {
    throw new UsageError(`Cannot read ${path}`);
  }
}

async function emit(text: string | Uint8Array, output: string | undefined, io: CliIO, what: string) {
  if (!output || output === '-') {
    if (typeof text !== 'string') throw new UsageError('Binary output needs -o <file>');
    io.out(text.endsWith('\n') ? text.slice(0, -1) : text);
    return;
  }
  await writeFile(resolve(io.cwd ?? process.cwd(), output), text);
  io.err(`Wrote ${what} to ${output}`);
}

/** Project JSON, with the app icon `icon` field when given. */
function serializeWithIcon(doc: DesignDocument, icon?: IconSettings | null): string {
  return serializeProject(icon ? { ...doc, icon } : doc);
}

const isSvgText = (t: string) => t.trimStart().startsWith('<');

/** build-icons glyph fragments (no <svg> root, drawn in a 128 box) get a 128 viewBox. */
export function wrapGlyphFragment(text: string): { text: string; wrapped: boolean } {
  const body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*>/, '').trim();
  if (/^<svg[\s>]/i.test(body)) return { text, wrapped: false };
  return { text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}">\n${body}\n</svg>`, wrapped: true };
}

/** Reads a project file (or SVG, converted) into a validated document (with its `icon` field). */
async function loadDoc(path: string, io: CliIO): Promise<{ doc: DesignDocument; icon: IconSettings | null; svg: boolean }> {
  const text = await readInput(path, io);
  if (isSvgText(text)) {
    await ensureSvgGeometry(text);
    return { doc: svgToDocument(text, nameFromPath(path)).doc, icon: null, svg: true };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${path}: not valid JSON (${e instanceof Error ? e.message : e})`, { cause: e });
  }
  const doc = validateDocument(data);
  return { doc, icon: doc.icon ?? null, svg: false };
}

const requireArg = (pos: string[], what: string) => {
  if (!pos[0]) throw new UsageError(`Missing ${what}`);
  return pos[0];
};

/** --tile <#hex>: validated, normalised to #rrggbb; undefined when absent. */
function tileArg(v: Values): string | undefined {
  const t = str(v, 'tile');
  if (t === undefined) return undefined;
  const n = normalizeTile(t);
  if (!n) throw new UsageError(`--tile must be a hex colour like #2063b0 (got “${t}”)`);
  return n;
}

function iconFor(v: Values): IconSettings | null {
  const p = str(v, 'icon');
  const tile = tileArg(v);
  if (!p) {
    if (tile) throw new UsageError('--tile needs --icon <preset> here (the tile colour is stored in an app icon project)');
    return null;
  }
  if (!isIconPreset(p)) throw new UsageError(`--icon must be one of ${ICON_PRESETS.join(', ')}`);
  return { preset: p, shape: 'auto', ...(tile && tile !== BRAND ? { tile } : {}) };
}

// ---------- info ----------

const fmt = (x: number) => String(Math.round(x * 100) / 100);
const fmtRect = (r: Rect | null) => (r ? `x ${fmt(r.x)} y ${fmt(r.y)} w ${fmt(r.width)} h ${fmt(r.height)}` : 'empty');

function describe(n: SceneNode): string {
  switch (n.type) {
    case 'rect':
      return `${n.width}×${n.height}${n.radius ? ` r${n.radius}` : ''}`;
    case 'ellipse':
      return `rx ${n.rx} ry ${n.ry}`;
    case 'polygon':
      return `${n.sides} sides${n.innerRadius !== undefined ? ' (star)' : ''}`;
    case 'path':
      return `${n.subpaths.length} subpath(s), ${n.subpaths.reduce((a, s) => a + s.points.length, 0)} points`;
    case 'text':
      return JSON.stringify(n.text.length > 30 ? n.text.slice(0, 29) + '…' : n.text) + ` ${n.fontFamily} ${n.fontSize}px`;
    case 'image':
      return `${n.width}×${n.height}`;
    case 'group':
      return `${n.children.length} children`;
  }
}

interface InfoNode {
  id: string;
  type: string;
  name: string;
  bounds: Rect | null;
  hidden?: true;
  reference?: true;
  children?: InfoNode[];
}

async function info(doc: DesignDocument) {
  const { ensureTextFont } = await import('@/fonts/store');
  const texts: SceneNode[] = [];
  const walk = (ns: SceneNode[]) => ns.forEach((c) => (c.type === 'group' ? walk(c.children) : c.type === 'text' && texts.push(c)));
  walk(doc.children);
  for (const t of texts) if (t.type === 'text') await ensureTextFont(t).catch(() => null);
  const lines: string[] = [];
  const tree = (ns: SceneNode[], depth: number): InfoNode[] =>
    ns.map((c) => {
      const b = worldBounds(doc, c.id);
      const flags = `${c.visible ? '' : ' hidden'}${c.reference ? ' reference' : ''}`;
      lines.push(`${'  '.repeat(depth + 1)}${c.type} “${c.name}” ${describe(c)} — ${fmtRect(b)}${flags} [${c.id}]`);
      return {
        id: c.id,
        type: c.type,
        name: c.name,
        bounds: b,
        ...(c.visible ? {} : { hidden: true as const }),
        ...(c.reference ? { reference: true as const } : {}),
        ...(c.type === 'group' ? { children: tree(c.children, depth + 1) } : {}),
      };
    });
  const nodes = tree(doc.children, 0);
  const all = doc.children.map((c) => worldBounds(doc, c.id)).filter((b): b is Rect => !!b);
  const content = all.length
    ? all.reduce((a, b) => {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
      })
    : null;
  return { nodes, lines, content };
}

// ---------- knockout ----------

/** Resolves `id` or `name` tokens (comma-separated) to node ids. Names must be unique. */
export function resolveNodeRefs(doc: DesignDocument, spec: string, what: string): string[] {
  const all: SceneNode[] = [];
  const walk = (ns: SceneNode[]) => ns.forEach((c) => (all.push(c), c.type === 'group' && walk(c.children)));
  walk(doc.children);
  return spec
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((token) => {
      const byId = all.find((n) => n.id === token);
      if (byId) return byId.id;
      const byName = all.filter((n) => n.name === token);
      if (byName.length === 1) return byName[0].id;
      if (byName.length > 1) throw new UsageError(`${what} “${token}” matches ${byName.length} objects; use an id: ${byName.map((n) => n.id).join(', ')} (see \`designer info\`)`);
      throw new UsageError(`${what} “${token}”: no object with that id or name (see \`designer info\`)`);
    });
}

/** --gap: document units, or a tile fraction with a T suffix (`0.03T`, icon projects). */
function parseGap(v: string | undefined, doc: DesignDocument): number | undefined {
  if (v === undefined) return undefined;
  const m = v.trim().match(/^([\d.]+)\s*(t)?$/i);
  const n = m ? Number(m[1]) : NaN;
  if (!m || !(n >= 0)) throw new UsageError('--gap must be a number ≥ 0 (document units), or e.g. 0.03T (tile fraction)');
  if (!m[2]) return n;
  if (!doc.icon) throw new UsageError('--gap …T needs an app icon project (it is a fraction of the tile)');
  return gapUnit(doc).toDoc(n);
}

async function runKnockout(doc: DesignDocument, values: Values, io: CliIO): Promise<DesignDocument> {
  const cutterSpec = str(values, 'cutter');
  if (!cutterSpec) throw new UsageError('knockout needs --cutter <id|name>');
  const cutters = resolveNodeRefs(doc, cutterSpec, 'cutter');
  const targetSpec = str(values, 'targets');
  const targets = targetSpec ? resolveNodeRefs(doc, targetSpec, 'target') : undefined;
  const gap = parseGap(str(values, 'gap'), doc);
  // Text takes part through its glyph outlines.
  const { textToPaths } = await import('@/fonts/outline');
  const hasText = (n: SceneNode): boolean => (n.type === 'group' ? n.children.some(hasText) : n.type === 'text');
  const outline = async (n: SceneNode): Promise<SceneNode> => {
    if (n.type === 'text') return n.visible ? { ...(await textToPaths(n)), id: n.id } : n;
    if (n.type !== 'group' || !hasText(n)) return n;
    return { ...n, children: await Promise.all(n.children.map(outline)) };
  };
  const ids = [...cutters, ...(targets ?? targetsBelow(doc, cutters))];
  const resolved = new Map<string, SceneNode>();
  for (const id of ids) {
    const n = findNode(doc, id);
    if (n && hasText(n)) resolved.set(id, await outline(n));
  }
  const scope = await loadPaper();
  const r = knockout(scope, doc, { cutters, targets, gap, resolved, outlineOnly: !!values['outline-only'] });
  const name = (id: string) => `“${findNode(doc, id)?.name ?? id}”`;
  const unit = gapUnit(doc);
  const gapText = doc.icon ? `${fmt(r.gap)} units = ${Math.round(unit.fromDoc(r.gap) * 1000) / 1000}T` : `${fmt(r.gap)} px`;
  io.err(
    [
      `Knockout by ${cutters.map(name).join(', ')} (gap ${gapText}):`,
      r.replace.length ? `  cut: ${r.replace.map((n) => name(n.id)).join(', ')}` : '  cut: nothing (the cutter does not touch the targets)',
      ...(r.remove.length ? [`  removed (entirely under the cutter): ${r.remove.map(name).join(', ')}`] : []),
      ...(r.untouched.length ? [`  untouched: ${r.untouched.map(name).join(', ')}`] : []),
    ].join('\n'),
  );
  return applyKnockout(doc, r);
}

// ---------- serve ----------

/** Serves one file with CORS (+ Private Network Access) headers; resolves once listening. */
export async function startServer(path: string, port: number, io: Pick<CliIO, 'cwd'>) {
  const { createServer } = await import('node:http');
  const file = resolve(io.cwd ?? process.cwd(), path);
  await readFile(file); // fail early
  const name = basename(file);
  const type = name.endsWith('.svg') ? 'image/svg+xml' : 'application/json';
  const server = createServer((req, res) => {
    const headers = CORS_HEADERS;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers).end();
      return;
    }
    if (req.url?.split('?')[0] !== `/${encodeURIComponent(name)}`) {
      res.writeHead(404, headers).end('not found');
      return;
    }
    readFile(file).then(
      (buf) => res.writeHead(200, { ...headers, 'Content-Type': type }).end(buf),
      () => res.writeHead(404, headers).end('gone'),
    );
  });
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(port, 'localhost', ok));
  const actual = (server.address() as { port: number }).port;
  return { server, url: `http://localhost:${actual}/${encodeURIComponent(name)}` };
}

async function serve(path: string, port: number, origin: string, io: CliIO): Promise<never> {
  const { url } = await startServer(path, port, io);
  io.out(buildImportLink(url, { origin }));
  io.err(`Serving ${path} at ${url} (CORS on). Open the link above; Ctrl+C to stop.`);
  return new Promise<never>(() => {});
}

// ---------- open / present ----------

/** Launches the OS default browser; false when this environment has no GUI opener. */
async function defaultOpenUrl(url: string): Promise<boolean> {
  const opener = pickOpener(process.platform, process.env, url);
  if (!opener) return false;
  return new Promise<boolean>((ok) => {
    const child = execFile(opener.command, opener.args, (e) => ok(!e));
    child.once('error', () => ok(false));
  });
}

interface Presented {
  name: string;
  file: string;
  doc: DesignDocument;
  svg: string;
}

/** A tiny local server: gallery at `/`, the files and SVG previews with CORS. Resolves once listening. */
export async function startGallery(paths: string[], port: number, origin: string, io: Pick<CliIO, 'cwd'>) {
  const { createServer } = await import('node:http');
  const cwd = io.cwd ?? process.cwd();
  const files: Presented[] = [];
  for (const p of paths) {
    const { doc } = await loadDoc(p, { out: () => {}, err: () => {}, cwd });
    files.push({ name: doc.name, file: resolve(cwd, p), doc, svg: (await exportSvg(doc)).svg });
  }
  const urlName = (i: number) => `${i}/${encodeURIComponent(basename(files[i].file))}`;
  const server = createServer((req, res) => {
    const headers = CORS_HEADERS;
    if (req.method === 'OPTIONS') return void res.writeHead(204, headers).end();
    const path = req.url?.split('?')[0] ?? '/';
    const preview = path.match(/^\/preview\/(\d+)\.svg$/);
    const file = path.match(/^\/files\/(\d+)\/[^/]+$/);
    if (path === '/') {
      const actual = (server.address() as { port: number }).port;
      const items: GalleryItem[] = files.map((f, i) => ({
        name: f.name,
        width: f.doc.artboard.width,
        height: f.doc.artboard.height,
        previewUrl: `/preview/${i}.svg`,
        importLink: buildImportLink(`http://localhost:${actual}/files/${urlName(i)}`, { origin }),
      }));
      return void res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }).end(galleryHtml(items));
    }
    if (preview && files[+preview[1]]) return void res.writeHead(200, { ...headers, 'Content-Type': 'image/svg+xml' }).end(files[+preview[1]].svg);
    if (file && files[+file[1]]) {
      const f = files[+file[1]].file;
      return void readFile(f).then(
        (buf) => res.writeHead(200, { ...headers, 'Content-Type': f.endsWith('.svg') ? 'image/svg+xml' : 'application/json' }).end(buf),
        () => res.writeHead(404, headers).end('gone'),
      );
    }
    res.writeHead(404, headers).end('not found');
  });
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(port, 'localhost', ok));
  const url = `http://localhost:${(server.address() as { port: number }).port}/`;
  return { server, url, names: files.map((f) => f.name) };
}

async function present(paths: string[], port: number, origin: string, noOpen: boolean, io: CliIO): Promise<never> {
  const { url } = await startGallery(paths, port, origin, io);
  io.out(url);
  const opened = !noOpen && (await (io.openUrl ?? defaultOpenUrl)(url));
  io.err(
    `Gallery of ${paths.length} file(s) at ${url}${opened ? ' (opened in the browser)' : noOpen ? '' : ' — no GUI browser here; open that URL on this machine (SSH: forward the port)'}. Ctrl+C to stop; keep it running until the import is done.`,
  );
  return new Promise<never>(() => {});
}

// ---------- github raw URL ----------

const run = promisify(execFile);

async function githubRawUrl(path: string, io: CliIO): Promise<string> {
  const abs = resolve(io.cwd ?? process.cwd(), path);
  const git = (...args: string[]) => run('git', args, { cwd: dirname(abs) }).then((r) => r.stdout.trim());
  const remote = await git('remote', 'get-url', 'origin').catch(() => '');
  const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error('--github needs a git checkout whose origin is on github.com');
  const top = await git('rev-parse', '--show-toplevel');
  const branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
  const ref = branch === 'HEAD' ? await git('rev-parse', 'HEAD') : branch;
  const rel = relative(top, abs).split('\\').join('/');
  const dirty = await git('status', '--porcelain', '--', abs).catch(() => '');
  if (dirty) io.err(`Warning: ${rel} has changes that are not committed; the link serves what is pushed.`);
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${ref.split('/').map(encodeURIComponent).join('/')}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

// ---------- main ----------

/** Runs one CLI invocation; returns the exit code. */
export async function main(argv: string[], io: CliIO): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    io.out(USAGE);
    return cmd ? 0 : 1;
  }
  let values: Values;
  let pos: string[];
  try {
    const parsed = parseArgs({ args: rest, options: COMMON, allowPositionals: true, strict: true });
    values = parsed.values as Values;
    pos = parsed.positionals;
  } catch (e) {
    io.err(`${e instanceof Error ? e.message : e}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    io.out(USAGE);
    return 0;
  }
  const output = str(values, 'output');
  const origin = str(values, 'origin') ?? APP_ORIGIN;
  try {
    switch (cmd) {
      case 'new': {
        const p = parsePreset(str(values, 'preset') ?? '1024x1024');
        const doc = createDocument({
          name: str(values, 'name') ?? (output ? nameFromPath(output) : 'Untitled'),
          artboard: { width: p.width, height: p.height, background: p.icon ? { kind: 'none' } : { kind: 'solid', color: '#ffffff' } },
        });
        const tile = tileArg(values);
        if (tile && !p.icon) throw new UsageError('--tile needs an app icon preset (--preset app-icon | …)');
        await emit(serializeWithIcon(doc, p.icon ? { preset: p.icon, shape: 'auto', ...(tile && tile !== BRAND ? { tile } : {}) } : null), output, io, 'project');
        return 0;
      }
      case 'from-svg': {
        const path = requireArg(pos, 'SVG file');
        const icon = iconFor(values);
        const raw = wrapGlyphFragment(await readInput(path, io));
        if (raw.wrapped) io.err(`Note: ${path} has no <svg> root; read as a glyph fragment in a ${GLYPH_BOX} × ${GLYPH_BOX} box.`);
        const text = raw.text;
        const name = str(values, 'name') ?? (path === '-' ? (output ? nameFromPath(output) : 'Imported') : nameFromPath(path));
        await ensureSvgGeometry(text);
        const { doc, warnings } = svgToDocument(text, name);
        for (const w of warnings) io.err(`Warning: ${w}`);
        let out = doc;
        let note = '';
        if (icon && !values['no-fit']) {
          const fitted = await fitDocument({ ...doc, icon }).catch((e: unknown) => {
            io.err(`Note: not fitted to the keyline (${e instanceof Error ? e.message : e}).`);
            return null;
          });
          if (fitted) {
            out = fitted.doc;
            note = `, fitted to the keyline: ${describeKeyline(fitted.before)} → ${describeKeyline(fitted.after)}`;
          }
        }
        await emit(serializeWithIcon(out, icon), output, io, `project (${doc.artboard.width}×${doc.artboard.height}, ${doc.children.length} top-level objects${note})`);
        return 0;
      }
      case 'fit': {
        const path = requireArg(pos, 'project file');
        const { doc, icon, svg } = await loadDoc(path, io);
        if (svg || !icon) throw new Error(`${path} is not an app icon project (create one with \`designer new --preset app-icon\`, or \`from-svg --icon app-icon\`)`);
        const r = await fitDocument(doc);
        io.err(`before: ${describeKeyline(r.before)}\nafter:  ${describeKeyline(r.after)}`);
        const dest = output ?? (path === '-' ? undefined : path);
        await emit(serializeWithIcon(r.doc, icon), dest, io, 'fitted project');
        return 0;
      }
      case 'to-svg': {
        const { doc } = await loadDoc(requireArg(pos, 'project file'), io);
        const svg = values.glyph ? await exportGlyph(doc) : (await exportSvg(doc)).svg;
        await emit(svg, output, io, values.glyph ? 'glyph' : 'SVG');
        return 0;
      }
      case 'to-png': {
        const path = requireArg(pos, 'project file');
        const size = Number(str(values, 'size'));
        if (!(size > 0 && size <= 16384)) throw new UsageError('--size N is required (1..16384 px)');
        const { doc } = await loadDoc(path, io);
        const { svg } = await exportSvg(doc);
        const { Resvg } = await import('@resvg/resvg-js');
        const png = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(size) }, font: { loadSystemFonts: false } }).render().asPng();
        const out = output ?? path.replace(/(\.designer)?\.(json|svg)$/i, '') + `-${Math.round(size)}.png`;
        await emit(new Uint8Array(png), out, io, 'PNG');
        return 0;
      }
      case 'icons': {
        const path = requireArg(pos, 'project file');
        const targets = { 'android/res/': str(values, 'android'), 'ios/': str(values, 'ios'), 'site/': str(values, 'site') };
        if (!output && !Object.values(targets).some(Boolean)) throw new UsageError('icons needs -o <dir> (or --android / --ios / --site)');
        const shape = str(values, 'shape');
        const tileFlag = tileArg(values);
        if (shape && !(ICON_SHAPES as readonly string[]).includes(shape)) throw new UsageError(`--shape must be one of ${ICON_SHAPES.join(', ')}`);
        const { doc } = await loadDoc(path, io);
        const glyph = await exportGlyph(doc);
        if (!glyph) throw new Error(`${path}: the glyph is empty`);
        const smallPath = str(values, 'small');
        const small = smallPath ? await exportGlyph((await loadDoc(smallPath, io)).doc) : undefined;
        const { buildIconSet } = await import('@/icon/iconSet');
        const { mergeLauncherBackground } = await import('@/icon/outputs');
        const { resvgRenderer } = await import('@/icon/resvgRenderer');
        const base = (doc.name || 'icon').replace(/[\\/:*?"<>|]+/g, '-');
        const tile = tileFlag ?? doc.icon?.tile ?? BRAND;
        const result = await buildIconSet(
          { glyph, small, tile, shape: (shape as IconSettings['shape'] | undefined) ?? doc.icon?.shape ?? 'auto', extra: [{ path: `${base}.designer.json`, data: serializeProject(doc) }] },
          resvgRenderer,
        );
        const cwd = io.cwd ?? process.cwd();
        let written = 0;
        for (const f of result.files) {
          const hit = Object.entries(targets).find(([prefix, dir]) => dir && f.path.startsWith(prefix));
          const root = hit ? resolve(cwd, hit[1]!) : output ? resolve(cwd, output) : null;
          if (!root) continue;
          const target = join(root, hit ? f.path.slice(hit[0].length) : f.path);
          await mkdir(dirname(target), { recursive: true });
          let data = f.data;
          if (f.path === 'android/res/values/ic_launcher_background.xml') data = mergeLauncherBackground(await readFile(target, 'utf8').catch(() => null), tile);
          await writeFile(target, data);
          written++;
        }
        io.out([...result.report.lines, ...result.notes].join('\n'));
        io.err(`Wrote ${written} files to ${[output, ...Object.values(targets)].filter(Boolean).join(', ')}`);
        return 0;
      }
      case 'validate': {
        if (!pos.length) throw new UsageError('Missing project file');
        let failed = 0;
        for (const path of pos) {
          try {
            const { doc, svg } = await loadDoc(path, io);
            if (svg) throw new Error('this is an SVG, not a project (use `designer from-svg`)');
            let count = 0;
            const walk = (ns: SceneNode[]) => ns.forEach((c) => (count++, c.type === 'group' && walk(c.children)));
            walk(doc.children);
            io.out(`ok   ${path}: “${doc.name}”, ${doc.artboard.width}×${doc.artboard.height}, ${count} objects`);
            const k = await keylineOf(doc).catch(() => null);
            if (k && !k.onKeyline) io.out(`     note: the glyph is off its keyline (${describeKeyline(k)}); run \`designer fit ${path}\` (exports fit automatically, only the canvas is off)`);
          } catch (e) {
            failed++;
            io.out(`FAIL ${path}: ${e instanceof Error ? e.message : e}`);
          }
        }
        return failed ? 1 : 0;
      }
      case 'info': {
        const { doc, icon } = await loadDoc(requireArg(pos, 'project file'), io);
        const r = await info(doc);
        const keyline = await keylineOf(doc).catch(() => null);
        if (values.json) {
          io.out(JSON.stringify({ name: doc.name, artboard: doc.artboard, icon, ...(keyline ? { keyline } : {}), contentBounds: r.content, nodes: r.nodes }, null, 2));
          return 0;
        }
        const bg = doc.artboard.background.kind === 'none' ? 'transparent' : doc.artboard.background.kind === 'solid' ? doc.artboard.background.color : doc.artboard.background.kind;
        io.out(
          [
            `“${doc.name}” — artboard ${doc.artboard.width}×${doc.artboard.height}, background ${bg}${icon ? `, icon ${icon.preset}/${icon.shape}` : ''}`,
            `content bounds: ${fmtRect(r.content)}`,
            ...(keyline ? [`keyline: ${describeKeyline(keyline)}${keyline.onKeyline ? '' : ' — run `designer fit`'}`] : []),
            ...r.lines,
          ].join('\n'),
        );
        return 0;
      }
      case 'knockout': {
        const path = requireArg(pos, 'project file');
        const { doc, icon } = await loadDoc(path, io);
        const out = await runKnockout(doc, values, io);
        await emit(serializeWithIcon(out, icon), output, io, 'project');
        return 0;
      }
      case 'link': {
        const url = str(values, 'url');
        if (url) {
          io.out(buildImportLink(url, { origin }));
          return 0;
        }
        const path = requireArg(pos, 'project or SVG file');
        if (values.github) {
          io.out(buildImportLink(await githubRawUrl(path, io), { origin }));
          return 0;
        }
        const text = await readInput(path, io);
        let link: string;
        if (isSvgText(text)) {
          svgToDocument(text, 'check'); // throws when it is not SVG
          link = await buildOpenLink(text.trim(), { origin, name: str(values, 'name') ?? nameFromPath(path) });
        } else {
          const { doc } = await loadDoc(path, io);
          if (str(values, 'name')) doc.name = str(values, 'name')!;
          // Compact JSON: smaller link. Same content as the file.
          link = await buildOpenLink(JSON.stringify(doc), { origin });
        }
        if (link.length > LINK_MAX_LENGTH) {
          throw new Error(`The link would be ${Math.round(link.length / 1024)} KB, above Chrome's 2 MB URL limit. Commit the file and use \`designer link ${path} --github\`, or \`designer serve ${path}\`.`);
        }
        if (io.isTTY) io.err('Long link — prefer `designer open` or `designer present`; don\'t paste #open= links into chat.');
        if (link.length > LINK_WARN_LENGTH) io.err(`Warning: the link is ${Math.round(link.length / 1024)} KB; some chat apps cut long links. Prefer --github or serve if it fails.`);
        io.out(link);
        return 0;
      }
      case 'serve': {
        const path = requireArg(pos, 'project or SVG file');
        const port = Number(str(values, 'port') ?? 8765);
        return await serve(path, port, origin, io);
      }
      case 'present': {
        if (!pos.length) throw new UsageError('Missing project or SVG file(s)');
        return await present(pos, Number(str(values, 'port') ?? 8765), origin, !!values['no-open'], io);
      }
      case 'open': {
        if (!pos.length) throw new UsageError('Missing project or SVG file');
        if (pos.length > 1) return await present(pos, Number(str(values, 'port') ?? 8765), origin, !!values['no-open'], io);
        const { doc, svg } = await loadDoc(pos[0], io);
        const text = svg ? (await readInput(pos[0], io)).trim() : JSON.stringify(doc);
        const link = await buildOpenLink(text, { origin, ...(svg ? { name: nameFromPath(pos[0]) } : {}) });
        if (link.length > LINK_MAX_LENGTH) throw new Error(`The file is too big for an open link (${Math.round(link.length / 1024)} KB); use \`designer present ${pos[0]}\`.`);
        if (!(await (io.openUrl ?? defaultOpenUrl)(link))) {
          io.err('No GUI browser available here; serving a local page instead.');
          return await present(pos, Number(str(values, 'port') ?? 8765), origin, true, io);
        }
        io.out(`Opened '${doc.name}' in Designer — confirm the import in the browser.`);
        return 0;
      }
      default:
        throw new UsageError(`Unknown command “${cmd}”`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`${e.message}\n\nRun \`designer help\` for usage.`);
      return 2;
    }
    io.err(`Error: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
}
