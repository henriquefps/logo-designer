// The CLI's sandbox for the agent (sandbox.ts): every file inside the job folder, only the agent's commands, no
// network, no local images pulled into a render.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { main } from './main';
import { confine, isInside, SANDBOX_ENV, sandboxFetch, sandboxRoot, sandboxSvg, SandboxError } from './sandbox';

let base = '';
let root = '';
let outside = '';

const SPEC = JSON.stringify({ name: 'S', screens: [{ name: 'Home', platform: 'phone', root: [{ 'top-app-bar': 'Home' }] }] });

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'designer-sandbox-')));
  root = join(base, 'job');
  outside = join(base, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(join(outside, 'secret.designer.json'), '{"secret": true}');
  await writeFile(join(outside, 'shot.png'), 'PNG');
  await writeFile(join(root, 'spec.json'), SPEC);
  await symlink(join(outside, 'secret.designer.json'), join(root, 'link.json'));
  await symlink(outside, join(root, 'out-dir'));
  await symlink(join(base, 'missing'), join(root, 'dangling.json'));
});

async function cli(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: root, env: { [SANDBOX_ENV]: root } });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('confine', () => {
  it('allows paths inside the root, existing or not', async () => {
    expect(await confine(root, root, 'spec.json', 'read')).toBe(join(root, 'spec.json'));
    expect(await confine(root, root, 'new/deeper/x.png', 'write')).toBe(join(root, 'new/deeper/x.png'));
    expect(await confine(root, root, root, 'write')).toBe(root);
  });

  it('refuses paths outside, by .., absolute, through a symlink (file or folder) or a dangling link', async () => {
    for (const p of ['../outside/secret.designer.json', join(outside, 'x'), '/etc/hostname', `${process.env.HOME}/.zshrc`, 'link.json', 'out-dir/new.png', 'out-dir/secret.designer.json', 'dangling.json']) {
      await expect(confine(root, root, p, 'write'), p).rejects.toBeInstanceOf(SandboxError);
      await expect(confine(root, root, p, 'read'), p).rejects.toBeInstanceOf(SandboxError);
    }
  });

  it('isInside is not fooled by a sibling with the same prefix', () => {
    expect(isInside('/a/job', '/a/job')).toBe(true);
    expect(isInside('/a/job', '/a/job/x')).toBe(true);
    expect(isInside('/a/job', '/a/job2/x')).toBe(false);
    expect(isInside('/a/job', '/a/..job')).toBe(false);
    expect(isInside('/a/job', '/a/job/..x')).toBe(true);
  });

  it('reads the root from the environment', () => {
    expect(sandboxRoot({})).toBeNull();
    expect(sandboxRoot({ [SANDBOX_ENV]: root })).toBe(root);
    expect(() => sandboxRoot({ [SANDBOX_ENV]: 'relative' })).toThrow(SandboxError);
    expect(() => sandboxRoot({ [SANDBOX_ENV]: join(base, 'nope') })).toThrow(SandboxError);
  });
});

describe('the CLI in the sandbox', () => {
  it('runs the agent’s commands on files inside the job folder', async () => {
    expect((await cli('wf', 'build', 'spec.json', '-o', 'p.designer.json')).code).toBe(0);
    expect((await cli('wf', 'dump', 'p.designer.json', '-o', 'dump.json')).code).toBe(0);
    expect((await cli('wf', 'build', 'spec.json', '--into', 'p.designer.json')).code).toBe(0);
    expect((await cli('screen', 'p.designer.json', '--name', 'Two')).code).toBe(0);
    expect((await cli('validate', 'p.designer.json')).code).toBe(0);
    expect((await cli('info', 'p.designer.json')).code).toBe(0);
    expect((await cli('to-png', 'p.designer.json', '--screen', 'Home', '-o', 'home.png')).code).toBe(0);
    expect((await cli('wf', 'sheet', 'p.designer.json', '-o', 'sheet.png')).code).toBe(0);
    expect(existsSync(join(root, 'home.png')) && existsSync(join(root, 'sheet.png'))).toBe(true);
  });

  it('refuses commands that are not the agent’s: servers, browsers, sync, other conversions', async () => {
    for (const cmd of ['live', 'sync', 'serve', 'open', 'present', 'agent', 'link', 'new', 'from-svg', 'to-svg', 'icons', 'export-ai', 'knockout']) {
      const r = await cli(cmd, 'p.designer.json');
      expect(r.code, cmd).toBe(2);
      expect(r.err).toContain('not available in the agent');
    }
  });

  it('refuses to read or write outside the job folder, whatever the option', async () => {
    const cases: string[][] = [
      ['wf', 'build', 'spec.json', '-o', join(outside, 'zshrc')],
      ['wf', 'build', 'spec.json', '-o', '../outside/x.json'],
      ['wf', 'build', 'spec.json', '--into', join(outside, 'secret.designer.json')],
      ['wf', 'build', join(outside, 'secret.designer.json')],
      ['wf', 'dump', '/etc/hostname'],
      ['wf', 'dump', 'link.json'],
      ['wf', 'dump', 'p.designer.json', '-o', 'out-dir/spec.json'],
      ['wf', 'components', '-o', join(outside, 'cat.md')],
      ['wf', 'compare', join(outside, 'shot.png'), 'p.designer.json', '--screen', 'Home', '-o', 'c.png'],
      ['wf', 'sheet', 'p.designer.json', '-o', join(outside, 's.png')],
      ['validate', '/etc/hostname'],
      ['info', 'link.json'],
      ['screen', 'p.designer.json', '--name', 'X', '-o', join(outside, 'p.json')],
      ['to-png', 'p.designer.json', '-o', join(outside, 'dir')],
      ['to-png', 'p.designer.json', '--screen', 'Home', '-o', 'out-dir/home.png'],
      ['to-png', join(outside, 'secret.designer.json'), '--size', '10'],
    ];
    for (const argv of cases) {
      const r = await cli(...argv);
      expect(r.code, argv.join(' ')).toBe(1);
      expect(`${r.out}\n${r.err}`, argv.join(' ')).toMatch(/outside the job folder|broken link/); // validate reports on stdout
    }
    expect(existsSync(join(outside, 'zshrc'))).toBe(false);
    expect(existsSync(join(outside, 'dir'))).toBe(false);
    expect(existsSync(join(outside, 'home.png'))).toBe(false);
    expect(await readFile(join(outside, 'secret.designer.json'), 'utf8')).toBe('{"secret": true}');
  });

  it('a project naming a local image file does not get it rendered', async () => {
    const svg = '<svg><image href="/home/me/private.png"/><image xlink:href=\'file:///etc/x.png\'/><use href="#a"/><image href="data:image/png;base64,AA"/><feImage href=" /x"/></svg>';
    expect(sandboxSvg(svg)).toBe('<svg><image href=""/><image xlink:href=""/><use href="#a"/><image href="data:image/png;base64,AA"/><feImage href=""/></svg>');
    expect(() => sandboxSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "/etc/passwd">]><svg/>')).toThrow(SandboxError);
  });
});

describe('fetch in the sandbox', () => {
  it('serves bundled fonts only and never the network', async () => {
    const fonts = join(base, 'fonts');
    await mkdir(fonts);
    await writeFile(join(fonts, 'a.ttf'), 'FONT');
    await writeFile(join(outside, 'b.ttf'), 'OTHER');
    const f = sandboxFetch(fonts, async (p) => new Uint8Array(await readFile(p)));
    expect(await (await f(join(fonts, 'a.ttf'))).text()).toBe('FONT');
    expect((await f(join(outside, 'b.ttf'))).status).toBe(403);
    expect((await f(`file://${join(fonts, '../outside/b.ttf')}`)).status).toBe(403);
    expect((await f(join(fonts, 'missing.ttf'))).status).toBe(404);
    await expect(f('https://example.com/')).rejects.toThrow(/no network/);
    await expect(f('http://127.0.0.1:3051/api/projects')).rejects.toThrow(/no network/);
  });
});
