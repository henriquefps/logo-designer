import { describe, expect, it } from 'vitest';
import { strokeWarning } from '../rules';

describe('strokeWarning', () => {
  it('does not warn at 0.049 T', () => expect(strokeWarning([0.049 * 128])).toBe(false));
  it('warns at 0.044 T', () => expect(strokeWarning([0.044 * 128])).toBe(true));
  it('does not warn for thick strokes (0.09 T)', () => expect(strokeWarning([0.09 * 128])).toBe(false));
  it('warns if any stroke is thin', () => expect(strokeWarning([9, 5])).toBe(true));
});
