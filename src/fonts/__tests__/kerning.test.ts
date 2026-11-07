import { describe, expect, it } from 'vitest';
import { readGposKerning } from '../kerning';
import { parseFont } from '../parse';
import { fontBytes } from './helpers';

describe('readGposKerning', () => {
  it('reads kerning hidden in extension lookups (Inter, Montserrat, Playfair)', async () => {
    for (const file of ['inter-variable.ttf', 'montserrat-variable.ttf', 'playfair-display-variable.ttf']) {
      const font = await parseFont(fontBytes(file));
      const k = (a: string, b: string) => font.kerning(font.glyphFor(a), font.glyphFor(b));
      expect(font.kern, file).not.toBeNull();
      expect(k('A', 'V'), file).toBeLessThan(0);
      expect(k('T', 'o'), file).toBeLessThan(0);
      expect(k('H', 'H'), file).toBe(0);
    }
  });

  it('matches opentype.js where opentype.js can read the table', async () => {
    const font = await parseFont(fontBytes('space-grotesk-variable.ttf'));
    const a = font.glyphFor('A');
    const v = font.glyphFor('V');
    const t = font.glyphFor('T');
    const o = font.glyphFor('o');
    expect(font.kerning(a, v)).toBe(-55);
    expect(font.kerning(t, o)).toBe(-103);
  });

  it('returns null for fonts without GPOS kern and for junk', () => {
    expect(readGposKerning(fontBytes('jetbrains-mono-variable.ttf'))).toBeNull();
    expect(readGposKerning(new ArrayBuffer(8))).toBeNull();
  });
});
