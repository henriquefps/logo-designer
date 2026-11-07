import { describe, expect, it } from 'vitest';
import { evalMath } from './evalMath';

describe('evalMath', () => {
  it('evaluates', () => {
    expect(evalMath('10*2')).toBe(20);
    expect(evalMath('(5 + 3) / 2')).toBe(4);
    expect(evalMath('-4.5')).toBe(-4.5);
    expect(evalMath('2+3*4')).toBe(14);
  });
  it('rejects junk', () => {
    expect(evalMath('alert(1)')).toBeNaN();
    expect(evalMath('2+')).toBeNaN();
  });
});
