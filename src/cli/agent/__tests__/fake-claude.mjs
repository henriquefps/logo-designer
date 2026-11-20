#!/usr/bin/env node
// A stand-in for Claude Code in the bridge's tests (bridge.test.ts): answers `--version` and `auth status`, and for
// `-p` emits stream-json like the real one, edits project.designer.json like a `wf build --into` would, and records
// what it was given (args, prompt, environment) in .fake-claude.json. FAKE_CLAUDE_MODE: ok | hang | fail.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE ?? 'ok';
if (args[0] === '--version') {
  console.log('2.1.999 (Claude Code)');
  process.exit(0);
}
if (args[0] === 'auth' && args[1] === 'status') {
  console.log(JSON.stringify({ loggedIn: process.env.FAKE_CLAUDE_LOGGED_OUT ? false : true, authMethod: 'claude.ai' }));
  process.exit(0);
}
if (!args.includes('-p')) {
  console.error('fake claude: expected -p');
  process.exit(2);
}

let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
writeFileSync(
  '.fake-claude.json',
  JSON.stringify({ args, prompt, cwd: process.cwd(), key: process.env.DESIGNER_SYNC_KEY ?? null, url: process.env.DESIGNER_SYNC_URL ?? null, path0: (process.env.PATH ?? '').split(':')[0], sandbox: process.env.DESIGNER_SANDBOX_ROOT ?? null }),
);
const emit = (e) => process.stdout.write(`${JSON.stringify(e)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (text) => emit({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
let n = 0;
const tool = (name, input, result, isError = false) => {
  const id = `toolu_${++n}`;
  emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
  emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: result, is_error: isError }] } });
};

emit({ type: 'system', subtype: 'init', tools: ['Bash', 'Read', 'Write', 'Edit'] });
say('Reading the project first. Then I will plan.');
tool('Bash', { command: 'designer wf dump project.designer.json --no-geometry -o spec.json' }, 'SECRET TOOL OUTPUT: Wrote spec');

if (mode === 'hang') {
  // A command that keeps running: the bridge must kill the whole tree.
  const child = spawn('sleep', ['300'], { stdio: 'ignore' });
  writeFileSync('.fake-child.pid', String(child.pid));
  say('Working on a long step.');
  setInterval(() => undefined, 1000);
  await new Promise(() => undefined);
}
if (mode === 'fail') {
  emit({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'API Error: overloaded' });
  process.exit(1);
}

tool('Write', { file_path: `${process.cwd()}/spec.json`, content: '{}' }, 'File created');
tool('Bash', { command: 'curl -s https://example.com' }, 'Permission to use Bash has been denied because Claude Code is running in dontAsk mode.', true);
// What `wf build --into` does to the file: a change the live mirror pushes.
const doc = JSON.parse(readFileSync('project.designer.json', 'utf8'));
doc.name = `${doc.name} + agent`;
writeFileSync('project.designer.json', JSON.stringify(doc, null, 2));
tool('Bash', { command: 'designer wf build spec.json --into project.designer.json' }, 'Built 1 screen');
await sleep(Number(process.env.FAKE_CLAUDE_SETTLE_MS ?? 300));
tool('Bash', { command: 'designer wf build spec.json --into project.designer.json' }, 'Built 1 screen');
tool('Read', { file_path: `${process.cwd()}/sheet.png` }, '[image]');
say('I filled the screen.\n\nIt has a list of trips and a back button.');
emit({ type: 'result', subtype: 'success', is_error: false, result: 'I filled the screen.\n\nIt has a list of trips and a back button.', num_turns: 6 });
process.exit(0);
