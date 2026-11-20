// The demo videos' wireframe fixtures (scripts/demo/fixtures/) stay valid specs: a fixture that stops building breaks a
// recording only minutes into it, with the real agent already running.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFromSpec } from '../build';

const fixture = (path: string) => JSON.parse(readFileSync(join(__dirname, '../../../../scripts/demo/fixtures', path), 'utf8'));

describe('Roam Settings fixture (the promo)', () => {
  const spec = fixture('roam/settings-current.spec.json');

  it('builds into one long current phone screen, in English', () => {
    const { doc, warnings } = buildFromSpec(spec);
    expect(warnings).toEqual([]);
    expect(doc.wireframe?.screens.map((s) => [s.name, s.status])).toEqual([['Settings', 'current']]);
    expect(JSON.stringify(spec)).not.toMatch(/[ãçéêíóõú]|Configura/);
  });

  it('has 40–60 items in several mixed-up sections', () => {
    const kinds: string[] = [];
    const sections: string[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        for (const [k, v] of Object.entries(n)) {
          if (k === 'list-row' || k === 'button') kinds.push(k);
          if (k === 'section-header') sections.push(String(v));
          walk(v);
        }
      }
    };
    walk(spec.screens[0].root);
    expect(kinds.length).toBeGreaterThanOrEqual(40);
    expect(kinds.length).toBeLessThanOrEqual(60);
    expect(sections.length).toBeGreaterThanOrEqual(6);
  });
});
