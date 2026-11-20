import { describe, expect, it } from 'vitest';
import { coordsFor, parseFont } from '../parse';
import { contoursToCommands, normalizeCoords, openVariableGlyf } from '../gvar';
import { fontBytes } from './helpers';
import fixture from './fixtures/gvar-outlines.json';

// Reference outlines produced by fontTools' instancer (scripts/fonts/gen-gvar-fixture.py).
type Ref = { coords: [number, number][]; ends: number[]; on: boolean[]; advance: number };
const refs = fixture as unknown as Record<string, Ref>;

describe('variable outlines (glyf + gvar)', () => {
  const byFont = new Map<string, Awaited<ReturnType<typeof parseFont>>>();
  const load = async (name: string) => {
    if (!byFont.has(name)) byFont.set(name, await parseFont(fontBytes(`${name}.ttf`)));
    return byFont.get(name)!;
  };

  it.each(Object.keys(refs))('%s matches fontTools', async (key) => {
    const [name, loc, ch] = key.split('|');
    const font = await load(name);
    const ref = refs[key];
    const open = openVariableGlyf(fontBytes(`${name}.ttf`), font.axes)!;
    expect(open).not.toBeNull();
    const contours = open(font.glyphFor(ch).index, JSON.parse(loc))!;
    expect(contours).not.toBeNull();
    const pts = contours.flat();
    expect(pts).toHaveLength(ref.coords.length);
    expect(contours.map((c) => c.length)).toEqual(ref.ends.map((e, i) => e - (i ? ref.ends[i - 1] : -1)));
    pts.forEach((p, i) => {
      expect(Math.abs(p.x - ref.coords[i][0]), `${ch} point ${i} x`).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y - ref.coords[i][1]), `${ch} point ${i} y`).toBeLessThanOrEqual(1);
      expect(p.on).toBe(ref.on[i]);
    });
    // HVAR advance (fractional, not rounded) agrees with the instance's hmtx within its rounding.
    const adv = font.advance(font.glyphFor(ch), coordsFor(font, JSON.parse(loc).wght ?? 400, JSON.parse(loc).opsz));
    expect(Math.abs(adv - ref.advance)).toBeLessThanOrEqual(1);
  });

  it('draws the Inter "D" at weight 600 as a heavy letter (regression: it came out as a thin hook)', async () => {
    const font = await load('inter-variable');
    const width = (w: number) => {
      const cmds = font.glyphPath(font.glyphFor('D'), 0, 0, 1000, coordsFor(font, w, 28)).commands;
      const xs = cmds.filter((c): c is typeof c & { x: number } => 'x' in c).map((c) => c.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    // A bolder D is wider, not narrower, and its outline has both the outer shape and the counter.
    expect(width(600)).toBeGreaterThan(width(400));
    const contours = openVariableGlyf(fontBytes('inter-variable.ttf'), font.axes)!(font.glyphFor('D').index, { wght: 600, opsz: 28 })!;
    expect(contours).toHaveLength(2);
  });

  it('normalizes through avar and clamps to the axis range', async () => {
    const font = await load('inter-variable');
    expect(normalizeCoords(font.axes, null, { wght: 400, opsz: 14 })).toEqual([0, 0]);
    const n = normalizeCoords(font.axes, null, { wght: 5000, opsz: 1 });
    expect(n).toEqual([0, 1]); // opsz clamps to its default (14 = min), wght to the max
  });

  it('turns TrueType contours into path commands (implied on-curve points included)', () => {
    const cmds = contoursToCommands(
      [[{ x: 0, y: 0, on: false }, { x: 100, y: 0, on: false }, { x: 100, y: 100, on: false }, { x: 0, y: 100, on: false }]],
      100,
      10,
      200,
      100,
    );
    expect(cmds[0]).toEqual({ type: 'M', x: 10, y: 150 }); // virtual start: midpoint of the first and last points
    expect(cmds.filter((c) => c.type === 'Q')).toHaveLength(4);
    expect(cmds.at(-1)).toEqual({ type: 'Z' });
  });
});
