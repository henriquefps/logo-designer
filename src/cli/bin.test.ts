// The real `designer` binary (bin/designer.ts under Bun), for what only a separate process shows.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('bin/designer.ts', () => {
  it('writes all of a big stdout into a slow pipe, byte for byte', async () => {
    // Regression: `designer to-svg big.json | wc -c` sometimes printed 65537 (console.log + process.exit
    // dropped what the pipe had not taken yet; Bun's async stdout writes also repeated 64 KB chunks).
    const dir = await mkdtemp(join(tmpdir(), 'designer-bin-'));
    const rects = Array.from({ length: 4000 }, (_, i) => `<rect x="${i % 100}" y="${Math.floor(i / 100)}" width="1" height="1" fill="#2f6fb5"/>`).join('');
    await writeFile(join(dir, 'big.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">${rects}</svg>`);
    const bin = join(root, 'bin/designer.ts');
    execFileSync('bun', [bin, 'to-svg', 'big.svg', '-o', 'file.svg'], { cwd: dir, stdio: 'ignore' });
    const expected = (await readFile(join(dir, 'file.svg'), 'utf8')).trimEnd();
    expect(expected.length).toBeGreaterThan(200_000);
    for (let i = 0; i < 3; i++) {
      // A slow reader: the pipe fills up while the CLI is finishing.
      execFileSync('sh', ['-c', `bun "${bin}" to-svg big.svg | (sleep 0.5; cat) > piped.svg`], { cwd: dir, stdio: 'ignore' });
      expect((await readFile(join(dir, 'piped.svg'), 'utf8')).trimEnd()).toBe(expected);
    }
  }, 60_000);
});
