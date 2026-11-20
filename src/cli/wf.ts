// `designer wf …`: wireframes from the command line through the spec format (docs/wireframe-spec.md):
// `wf build` (spec → project, or `--into` an existing one), `wf dump` (project → spec) and
// `wf components` (the catalog). The work is in src/wireframe/spec; this file is argument handling.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { DesignDocument } from '@/model';
import { serializeProject, validateDocument } from '@/io/projectFile';
import { buildFromSpec, dumpToSpec, SpecError, type SpecBuildResult } from '@/wireframe/spec';
import { suggest } from '@/wireframe/spec/parse';
import { catalogMarkdown, componentCatalog } from '@/wireframe/spec/catalog';
import { normalizeIconName, registerIcon, takeMissingIcons, ICON_GLYPH_SIZE } from '@/wireframe/icons';
import { materializeDocument } from '@/wireframe/pipeline';
import type { CliIO } from './main';
import { WfUsageError, wfViewCommand } from './wfView';
import { cliPath, SandboxError } from './sandbox';

export const WF_USAGE = `designer wf — wireframe projects from a spec (docs/wireframe-spec.md)

Usage: designer wf <command> [options]

  build <spec.json|-> [-o project.designer.json] [--into existing.designer.json]
                     spec → project, through the same pipeline as the app (components, stacks,
                     shared components, repeat, layout). Errors name the spec path, e.g.
                     screens[1].root[3].list-row.trailing: "arrow" is not one of none, chevron, …
                     --into updates that project by id: what the spec states wins, the geometry
                     it leaves out (positions, sizes, frame and note places) is kept, and only
                     what the spec no longer lists is removed. In place unless -o. Without -o
                     or --into the project goes to stdout
  dump <project> [-o spec.json] [--no-geometry]
                     project → spec (every node with its id, defaults left out), e.g. to read
                     what was edited by hand. --no-geometry leaves out positions and sizes, so
                     a later \`build --into\` keeps the ones in the project
  components [kind…] [--json]
                     the component catalog: kind, label, platforms, category, props (type,
                     default, options, visibleWhen, help), sizing, placement and an example;
                     Markdown, or JSON with --json. Kinds filter it

  sheet <project> [-o sheet.png] [--platform P] [--notes] [--scale S] [--max N]
                     one image of every frame as on the canvas: names, platform, status badges
                     and flow arrows; --notes adds the notes; long side <= --max (default 4096 px)
  compare <screenshot.png|jpg> <project> --screen N [--platform P] [-o out.png] [--grid N] [--overlay PCT]
                     the screenshot (scaled to the frame's width) and the rendered frame side by
                     side; --grid N = a thin grid every N px; --overlay 50 = a third panel with the
                     frame blended 50% over the screenshot

A spec in one breath: { "screens": [ { "name": "Settings", "root": [
  { "top-app-bar": "Settings" }, { "section-header": "GENERAL" },
  { "list-row": { "title": "Language", "trailing": "value", "value": "English" }, "opens": "Language" } ] },
  { "name": "Language", "root": [ { "top-app-bar": "Language" } ] } ] }
Schema: https://designer.hfps.dev/schema/wireframe-spec.schema.json
`;

class WfUsage extends Error {}

const OPTIONS = {
  output: { type: 'string', short: 'o' },
  into: { type: 'string' },
  json: { type: 'boolean' },
  'no-geometry': { type: 'boolean' },
  platform: { type: 'string' },
  screen: { type: 'string' },
  notes: { type: 'boolean' },
  scale: { type: 'string' },
  max: { type: 'string' },
  grid: { type: 'string' },
  overlay: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

async function read(path: string, io: CliIO): Promise<string> {
  if (path === '-') {
    if (!io.stdin) throw new WfUsage('stdin is not available');
    return io.stdin();
  }
  const file = await cliPath(io.env ?? process.env, io.cwd ?? process.cwd(), path, 'read');
  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new WfUsage(`Cannot read ${path}`);
  }
}

function json(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path}: not valid JSON (${e instanceof Error ? e.message : e})`, { cause: e });
  }
}

async function loadProject(path: string, io: CliIO): Promise<DesignDocument> {
  const warnings: string[] = [];
  const doc = validateDocument(json(await read(path, io), path), { warnings });
  for (const w of warnings) io.err(`warning: ${w}`);
  if (!doc.wireframe) throw new Error(`${path} is not a wireframe project (create one with \`designer wf build\` or \`designer new --preset wireframe\`)`);
  return doc;
}

async function write(text: string, output: string | undefined, io: CliIO, what: string) {
  if (!output || output === '-') {
    io.out(text.endsWith('\n') ? text.slice(0, -1) : text);
    return;
  }
  await writeFile(await cliPath(io.env ?? process.env, io.cwd ?? process.cwd(), output, 'write'), text);
  io.err(`Wrote ${what} to ${output}`);
}

/**
 * Loads the Lucide glyphs a build asked for (the kit draws a placeholder for icons not loaded yet; the app
 * would fill them in on open). Iconify icons need the network and are left to the app. Returns how many
 * loaded and a warning per name Lucide does not have (it stays a placeholder in the app too).
 */
async function loadIcons(keys: string[]): Promise<{ loaded: number; warnings: string[] }> {
  const lucide = [...new Set(keys.map(normalizeIconName))].filter((k) => k.startsWith('lucide:'));
  const warnings: string[] = [];
  if (!lucide.length) return { loaded: 0, warnings };
  let loaded = 0;
  try {
    const [{ bundledSvg, kebab, lucideNames }, { svgToNodes }] = await Promise.all([import('@/assets-icons/catalog'), import('@/assets-icons/svgToNodes')]);
    for (const key of lucide) {
      try {
        const node = svgToNodes(await bundledSvg(key.slice(7)), { color: '#000000', size: ICON_GLYPH_SIZE, name: key });
        if (node) {
          registerIcon(key, node);
          loaded++;
        }
      } catch {
        const name = kebab(key.slice(7));
        const names = await lucideNames();
        const close = suggest(name, names);
        const containing = names.filter((n) => n.includes(name)).slice(0, 3);
        const hint = close || (containing.length ? ` (names with "${name}": ${containing.map((n) => `"${n}"`).join(', ')})` : '');
        warnings.push(`icon "${name}" is not a Lucide icon, so it is drawn as a placeholder${hint}; names: https://lucide.dev/icons`);
      }
    }
  } catch {
    // No icon libraries here: placeholders until the app opens the file.
  }
  return { loaded, warnings };
}

async function build(spec: unknown, into: DesignDocument | null): Promise<SpecBuildResult> {
  takeMissingIcons();
  let r = buildFromSpec(spec, into);
  const icons = await loadIcons(takeMissingIcons());
  if (icons.loaded) r = buildFromSpec(spec, into);
  return { ...r, warnings: [...r.warnings, ...icons.warnings] };
}

function summaryLine(r: SpecBuildResult, into: boolean): string {
  const s = r.summary;
  const base = `${s.screens} screen${s.screens === 1 ? '' : 's'} (${s.frames} frame${s.frames === 1 ? '' : 's'}), ${s.nodes} nodes`;
  return into ? `${base}: ${s.added} added, ${s.removed} removed, ${s.kept} kept` : base;
}

/** Runs `designer wf <args>`; returns the exit code. */
export async function wfMain(argv: string[], io: CliIO): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    io.out(WF_USAGE);
    return cmd ? 0 : 1;
  }
  let values: { output?: string; into?: string; json?: boolean; 'no-geometry'?: boolean; help?: boolean; [k: string]: string | boolean | undefined };
  let pos: string[];
  try {
    const parsed = parseArgs({ args: rest, options: OPTIONS, allowPositionals: true, strict: true });
    values = parsed.values as typeof values;
    pos = parsed.positionals;
  } catch (e) {
    io.err(`${e instanceof Error ? e.message : e}\n\n${WF_USAGE}`);
    return 2;
  }
  if (values.help) {
    io.out(WF_USAGE);
    return 0;
  }
  try {
    switch (cmd) {
      case 'build': {
        if (pos.length !== 1) throw new WfUsage('wf build takes one spec file (or - for stdin)');
        if (values.json || values['no-geometry']) throw new WfUsage('--json / --no-geometry are not build options');
        const spec = json(await read(pos[0], io), pos[0]);
        const into = values.into ? await loadProject(values.into, io) : null;
        const r = await build(spec, into);
        for (const w of r.warnings) io.err(`warning: ${w}`);
        const dest = values.output ?? values.into;
        io.err(`${values.into ? `Updated ${values.into}` : 'Built'}: ${summaryLine(r, !!values.into)}`);
        await write(serializeProject(r.doc), dest, io, 'wireframe project');
        return 0;
      }
      case 'dump': {
        if (pos.length !== 1) throw new WfUsage('wf dump takes one project file (or - for stdin)');
        if (values.into || values.json) throw new WfUsage('--into / --json are not dump options');
        const doc = await loadProject(pos[0], io);
        const spec = dumpToSpec(doc, { geometry: !values['no-geometry'] });
        await write(JSON.stringify(spec, null, 2) + '\n', values.output, io, 'spec');
        return 0;
      }
      case 'components': {
        if (values.into || values['no-geometry']) throw new WfUsage('--into / --no-geometry are not components options');
        const cat = componentCatalog();
        if (pos.length) {
          const unknown = pos.filter((k) => !cat.components.some((c) => c.kind === k));
          if (unknown.length) throw new Error(`no component ${unknown.map((k) => `“${k}”`).join(', ')} (\`designer wf components\` lists them)`);
          cat.components = cat.components.filter((c) => pos.includes(c.kind));
        }
        if (values.json) await write(JSON.stringify(cat, null, 2) + '\n', values.output, io, 'catalog');
        else await write(catalogMarkdown(cat) + '\n', values.output, io, 'catalog');
        return 0;
      }
      case 'sheet':
      case 'compare':
        try {
          return await wfViewCommand(cmd, pos, values, values.output, {
            loadDoc: async (p) => materializeDocument(await loadProject(p, io)),
            readBytes: async (p) => {
              const file = await cliPath(io.env ?? process.env, io.cwd ?? process.cwd(), p, 'read');
              return new Uint8Array(await readFile(file).catch(() => { throw new WfUsage(`Cannot read ${p}`); }));
            },
            write: async (p, b) => writeFile(await cliPath(io.env ?? process.env, io.cwd ?? process.cwd(), p, 'write'), b),
            err: io.err,
          });
        } catch (e) {
          if (e instanceof WfUsageError) throw new WfUsage(e.message);
          throw e;
        }
      default:
        throw new WfUsage(`Unknown wf command “${cmd}”`);
    }
  } catch (e) {
    if (e instanceof WfUsage) {
      io.err(`${e.message}\n\nRun \`designer wf help\` for usage.`);
      return 2;
    }
    if (e instanceof SandboxError) {
      io.err(e.message);
      return 1;
    }
    if (e instanceof SpecError) {
      io.err(`Error: the spec has ${e.issues.length} problem${e.issues.length === 1 ? '' : 's'}:\n${e.issues.map((i) => `  ${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n')}`);
      return 1;
    }
    io.err(`Error: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
}
