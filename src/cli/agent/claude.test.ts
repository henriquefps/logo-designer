import { describe, expect, it } from 'vitest';
import { claudeArgs, denyAllButDesigner, DENIED_TOOLS } from './claude';

/** The rule syntax of Claude Code, as far as the deny list uses it: `*` matches anything, `\x` is a literal x. */
function matches(rule: string, command: string): boolean {
  const body = rule.slice('Bash('.length, -1);
  let re = '^';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') re += body[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (body[i] === '*') re += '.*';
    else re += body[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${re}$`).test(command);
}
const denied = (c: string) => DENIED_TOOLS.some((r) => matches(r, c));

describe('the Bash deny list', () => {
  it('denies every command that does not start with `designer ` — Claude Code’s read-only ones included', () => {
    for (const c of ['cat spec.json', 'grep -n x spec.json', 'sed -n 1p spec.json', 'head -c 5 a', 'tail a', 'ls', 'ls -la', 'find . -name a', 'wc -c a', 'echo hi', 'pwd', 'whoami', 'FOO=1 cat a', '(cat a)', '/bin/cat a', '$(echo x)', '[ -f a ]', 'de x', 'designe x', 'designerx wf', 'designer-fake x', 'Designer wf']) {
      expect(denied(c), c).toBe(true);
    }
  });

  it('leaves `designer ` commands to the allow rules', () => {
    for (const c of ['designer wf components heading', 'designer to-png a.json -o a.png', 'designer live a.json', 'designer ']) {
      expect(denied(c), c).toBe(false);
    }
  });

  it('is built around the start it is given and stays a few hundred rules', () => {
    expect(denyAllButDesigner('x ').every((r) => r.startsWith('Bash('))).toBe(true);
    expect(DENIED_TOOLS.length).toBeGreaterThan(500);
    expect(DENIED_TOOLS.length).toBeLessThan(1500);
    // `designer:*` is the old spelling of `designer *`: it must not be among the denies.
    expect(DENIED_TOOLS).not.toContain('Bash(designer:*)');
  });

  it('goes to Claude Code after --disallowedTools, with the allow list and dontAsk', () => {
    const a = claudeArgs('prompt');
    const i = a.indexOf('--disallowedTools');
    expect(i).toBeGreaterThan(-1);
    expect(a.slice(i + 1, i + 1 + DENIED_TOOLS.length)).toEqual(DENIED_TOOLS);
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    expect(a).toContain('Bash(designer wf *)');
  });
});
