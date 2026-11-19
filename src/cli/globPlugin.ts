// `import.meta.glob` for the CLI. Vite (app, Vitest) expands it at build time; Bun does not, so
// the `designer` CLI registers this loader before importing anything that uses a registry. It
// rewrites the eager form, `import.meta.glob<…>('./*/index.ts', { eager: true })`, in files named
// `registry.ts` into static imports of the matching files. Only the eager form is supported (every
// registry in src/ uses it).

interface BunLike {
  plugin: (p: { name: string; setup: (build: { onLoad: (o: { filter: RegExp }, cb: (args: { path: string }) => Promise<{ contents: string; loader: string }>) => void }) => void }) => void;
  Glob: new (pattern: string) => { scanSync: (o: { cwd: string }) => Iterable<string> };
  file: (path: string) => { text: () => Promise<string> };
}

const GLOB_CALL = /import\.meta\.glob(?:<[^>]*>)?\(\s*(['"])(.+?)\1\s*(?:,\s*\{[^)]*\})?\s*\)/g;

/** Rewrites the glob calls of one file's source (`dir` = the file's folder). Exported for tests. */
export function expandGlobs(source: string, dir: string, scan: (pattern: string, cwd: string) => string[]): string {
  if (!source.includes('import.meta.glob')) return source;
  const imports: string[] = [];
  let i = 0;
  const body = source.replace(GLOB_CALL, (_m, _q, pattern: string) => {
    const files = scan(pattern.replace(/^\.\//, ''), dir).sort();
    const entries = files.map((f) => {
      const rel = `./${f.replace(/\\/g, '/')}`;
      const name = `__glob_${i++}`;
      imports.push(`import * as ${name} from ${JSON.stringify(rel)};`);
      return `${JSON.stringify(rel)}: ${name}`;
    });
    return `({ ${entries.join(', ')} })`;
  });
  return `${imports.join('\n')}\n${body}`;
}

let installed = false;

/** Registers the loader with Bun (no-op elsewhere or when already installed). */
export function installGlobPlugin() {
  const bun = (globalThis as { Bun?: BunLike }).Bun;
  if (installed || !bun) return;
  installed = true;
  bun.plugin({
    name: 'designer-import-meta-glob',
    setup(build) {
      build.onLoad({ filter: /[\\/]registry\.tsx?$/ }, async (args) => {
        const dir = args.path.replace(/[\\/][^\\/]*$/, '');
        const source = await bun.file(args.path).text();
        const contents = expandGlobs(source, dir, (pattern, cwd) => [...new bun.Glob(pattern).scanSync({ cwd })]);
        return { contents, loader: args.path.endsWith('x') ? 'tsx' : 'ts' };
      });
    },
  });
}
