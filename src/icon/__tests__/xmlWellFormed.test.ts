import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { buildIconSet } from '../iconSet';
import { resvgRenderer } from '../resvgRenderer';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

// aapt rejects XML comments containing `--` (Hoard 1.7.2), so every generated .xml is parsed strictly.
function parseStrict(path: string, xml: string) {
  const problems: string[] = [];
  const onError = (_level: string, msg: string) => problems.push(msg);
  const doc = new DOMParser({ onError } as never).parseFromString(xml, 'text/xml');
  expect(problems, `${path}: ${problems.join('; ')}`).toEqual([]);
  expect(doc.documentElement, path).toBeTruthy();
  for (const m of xml.matchAll(/<!--([\s\S]*?)-->/g)) {
    expect(m[1], `${path}: comment contains "--"`).not.toContain('--');
    expect(m[1].endsWith('-'), `${path}: comment ends with "-"`).toBe(false);
  }
  expect(xml.replace(/<!--[\s\S]*?-->/g, '')).not.toContain('--');
}

describe('generated XML is well-formed', () => {
  for (const name of ['sync', 'olmapkit']) {
    it(`parses every .xml of the ${name} icon set`, async () => {
      const result = await buildIconSet({ glyph: fixture(`glyph-${name}.svg`) }, resvgRenderer);
      const xmls = result.files.filter((f) => f.path.endsWith('.xml'));
      expect(xmls.map((f) => f.path)).toEqual(expect.arrayContaining(['android/res/drawable/ic_splash.xml', 'android/res/values/ic_launcher_background.xml']));
      for (const f of xmls) parseStrict(f.path, String(f.data));
    }, 60_000);
  }
  it('rejects a comment with -- (guard works)', () => {
    expect(() => parseStrict('x.xml', '<a><!-- bad --android --></a>')).toThrow();
  });
});
