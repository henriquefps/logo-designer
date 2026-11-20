import { describe, expect, it } from 'vitest';
import { ProgressMapper, summaryOf } from './progress';

const assistant = (...content: unknown[]) => ({ type: 'assistant', message: { content } });
const bash = (command: string) => assistant({ type: 'tool_use', name: 'Bash', input: { command } });

describe('stream → progress', () => {
  it('maps each step to a short line and counts build rounds', () => {
    const m = new ProgressMapper();
    const feed = (e: object) => m.feed(e as never).map((l) => `${l.stage}: ${l.message}`);
    expect(feed({ type: 'system', subtype: 'init' })).toEqual(['start: Claude Code started']);
    expect(feed(assistant({ type: 'text', text: '**Reading** the `screenshot` first. Then the catalog.\nMore.' }))).toEqual(['thinking: Reading the screenshot first.']);
    expect(feed(assistant({ type: 'tool_use', name: 'Read', input: { file_path: '/w/job/attachments/shot.png' } }))).toEqual(['reading: Reading the screenshot']);
    expect(feed(bash('designer wf components'))).toEqual(['reading: Looking up library components']);
    expect(feed(bash('designer wf dump project.designer.json --no-geometry -o spec.json'))).toEqual(['reading: Reading the project (wf dump)']);
    expect(feed(assistant({ type: 'tool_use', name: 'Write', input: { file_path: '/w/job/spec.json', content: '{"secret": 1}' } }))).toEqual(['writing: Writing the spec']);
    expect(feed(assistant({ type: 'tool_use', name: 'Edit', input: { file_path: '/w/job/spec.json' } }))).toEqual(['writing: Editing the spec']);
    expect(feed(bash('designer wf build spec.json --into project.designer.json'))).toEqual(['building: Round 1: building into the project']);
    expect(feed(bash('designer wf compare attachments/shot.png project.designer.json --screen "Settings" --overlay 50 -o compare.png'))).toEqual(['checking: Checking with wf compare']);
    expect(feed(assistant({ type: 'tool_use', name: 'Read', input: { file_path: '/w/job/compare.png' } }))).toEqual(['checking: Looking at compare.png']);
    expect(feed(bash('designer wf build spec.json --into project.designer.json'))).toEqual(['building: Round 2: building into the project']);
    expect(feed(bash('designer wf sheet project.designer.json -o sheet.png'))).toEqual(['checking: Rendering the flow sheet']);
    expect(feed(bash('designer screen project.designer.json --name Home --platform tablet'))).toEqual(['building: Adding a screen frame']);
    expect(feed(bash('curl -s https://example.com'))).toEqual(['thinking: Running a command']);
    expect(m.buildRounds).toBe(2);
  });

  it('never forwards tool output; a refused command is one neutral line', () => {
    const m = new ProgressMapper();
    const result = (content: unknown, is_error: boolean) => ({ type: 'user', message: { content: [{ type: 'tool_result', content, is_error }] } });
    expect(m.feed(result('SECRET listing of /', false) as never)).toEqual([]);
    expect(m.feed(result('Permission to use Bash has been denied because …', true) as never)).toEqual([{ message: 'A command the agent is not allowed to run was refused', stage: 'refused' }]);
    expect(m.feed(result('spec error at screens[0]', true) as never)).toEqual([]);
    expect(m.feed({ type: 'result', subtype: 'success', result: 'Done' } as never)).toEqual([]);
  });

  it('drops a line equal to the previous one and clips long text', () => {
    const m = new ProgressMapper();
    expect(m.feed(bash('designer wf dump a.json') as never)).toHaveLength(1);
    expect(m.feed(bash('designer wf dump a.json') as never)).toHaveLength(0);
    const [l] = m.feed(assistant({ type: 'text', text: 'x'.repeat(500) }) as never);
    expect(l.message.length).toBe(140);
  });

  it('summary: one paragraph, bounded', () => {
    expect(summaryOf('Built the screen.\n\n- a list\n- a back button\n')).toBe('Built the screen. - a list - a back button');
    expect(summaryOf('y'.repeat(3000)).length).toBe(1500);
    expect(summaryOf(undefined)).toBe('');
    expect(summaryOf('- **Top bar:** a `back` button')).toBe('- Top bar: a back button');
  });
});
