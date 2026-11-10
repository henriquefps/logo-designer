#!/usr/bin/env bun
// `designer` CLI entry: `bun run designer …` in the repo, or
// `bunx --bun github:henriquefps/logo-designer designer …` anywhere. See docs/agents.md.
import { setupHeadless } from '../src/cli/env.ts';
import { main } from '../src/cli/main.ts';

await setupHeadless();
const code = await main(process.argv.slice(2), {
  out: (s) => console.log(s),
  err: (s) => console.error(s),
  stdin: async () => {
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    return text;
  },
});
process.exit(code);
