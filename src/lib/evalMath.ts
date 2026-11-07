/** Evaluates simple arithmetic ("10*2", "(5+3)/2", "-4") without eval. Returns NaN when invalid. */
export function evalMath(input: string): number {
  const s = input.replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const number = (): number => {
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) throw new Error('number');
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number => {
    if (peek() === '-') {
      i++;
      return -factor();
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (s[i++] !== ')') throw new Error('paren');
      return v;
    }
    return number();
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = s[i++] === '*' ? v * factor() : v / factor();
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = s[i++] === '+' ? v + term() : v - term();
    return v;
  };
  try {
    const v = expr();
    return i === s.length ? v : Number.NaN;
  } catch {
    return Number.NaN;
  }
}
