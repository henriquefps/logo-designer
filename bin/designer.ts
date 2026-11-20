#!/usr/bin/env bun
// `designer` CLI entry: `bun run designer …` in the repo, or
// `bunx --bun github:henriquefps/logo-designer designer …` anywhere. See docs/agents.md.
// The glob loader goes first: registries (wireframe components and pipeline steps) use
// `import.meta.glob`, which only Vite expands; so everything else is imported after it.
import { writeSync } from 'node:fs';
import { installGlobPlugin } from '../src/cli/globPlugin.ts';

installGlobPlugin();
const { setupHeadless } = await import('../src/cli/env.ts');
const { main } = await import('../src/cli/main.ts');

await setupHeadless();
// `bunx … designer <cmd>` passes the bin name along; accept it.
const args = process.argv.slice(2);
if (args[0] === 'designer') args.shift();
// Output is written synchronously, all of it, before `process.exit`. With `console.log`, a big stdout
// into a pipe came out cut (`designer to-svg big.json | wc -c` printed 65537); `process.stdout.write`
// and `Bun.write(Bun.stdout, …)` cut or repeated 64 KB chunks the same way (Bun 1.4).
function writeAll(fd: number, s: string) {
  const bytes = Buffer.from(s + '\n');
  for (let off = 0; off < bytes.length; ) {
    try {
      off += writeSync(fd, bytes, off, bytes.length - off);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e;
      Bun.sleepSync(1); // a non-blocking pipe that is full: wait for the reader
    }
  }
}
const code = await main(args, {
  out: (s) => writeAll(1, s),
  err: (s) => writeAll(2, s),
  isTTY: !!process.stdout.isTTY,
  stdin: async () => {
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    return text;
  },
});
process.exit(code);
