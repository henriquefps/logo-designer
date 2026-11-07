import { describe, expect, it } from 'vitest';
import { baselineOffset, chooseFace, layoutText, lineWidthFrom, matchWeight } from '../layout';
import type { FontFaceInfo } from '../types';
import { familyWeights, nearestWeight, weightRange } from '../weights';

const metrics = { unitsPerEm: 1000, ascender: 800, descender: -200 };

describe('layout', () => {
  it('puts the baseline where CSS puts it in the line box', () => {
    // content = 1em = 100; line box 120 → 10 half-leading + 80 ascent.
    expect(baselineOffset(metrics, 100, 1.2)).toBeCloseTo(90);
    expect(baselineOffset(metrics, 100, 1)).toBeCloseTo(80);
  });

  it('lays out lines with alignment and line height', () => {
    const w = (s: string) => s.length * 10;
    const node = { text: 'abcd\nab', fontSize: 20, lineHeight: 1.5, align: 'center' as const };
    const l = layoutText(node, metrics, w);
    expect(l.width).toBe(40);
    expect(l.height).toBe(60);
    expect(l.lines.map((x) => x.x)).toEqual([-20, -10]);
    expect(l.lines[1].baseline - l.lines[0].baseline).toBe(30);
    expect(layoutText({ ...node, align: 'right' }, metrics, w).lines.map((x) => x.x)).toEqual([-40, -20]);
    expect(layoutText({ ...node, align: 'left' }, metrics, w).lines.map((x) => x.x)).toEqual([0, 0]);
    expect(layoutText({ ...node, text: '' }, metrics, w)).toMatchObject({ width: 0, height: 30 });
  });

  it('adds letter spacing and kerning only between characters', () => {
    expect(lineWidthFrom(3, () => 10, () => -2, 5)).toBe(30 - 4 + 10);
    expect(lineWidthFrom(1, () => 10, () => -2, 5)).toBe(10);
  });
});

const face = (weight: [number, number], style: 'normal' | 'italic' = 'normal'): FontFaceInfo => ({
  key: `${weight.join('-')}-${style}`,
  family: 'X',
  weight,
  style,
  metrics,
});

describe('font matching', () => {
  const statics = [face([300, 300]), face([400, 400]), face([700, 700]), face([900, 900])];
  const pick = (w: number) => matchWeight(statics, w)!.weight[0];

  it('follows CSS weight matching', () => {
    expect(pick(400)).toBe(400);
    expect(pick(500)).toBe(400); // 400–500: up to 500 first, then down
    expect(pick(600)).toBe(700); // above 500: up first
    expect(pick(350)).toBe(300); // below 400: down first
    expect(pick(200)).toBe(300); // nothing below: go up
    expect(matchWeight([face([100, 900])], 650)!.weight).toEqual([100, 900]);
  });

  it('chooses italic faces and falls back to synthetic italic', () => {
    const fam = [face([400, 400]), face([400, 400], 'italic'), face([700, 700])];
    expect(chooseFace(fam, 400, 'italic')).toMatchObject({ face: { style: 'italic' }, syntheticItalic: false });
    expect(chooseFace(fam, 700, 'italic')).toMatchObject({ face: { style: 'italic' }, weight: 400 });
    expect(chooseFace([face([100, 900])], 1000, 'italic')).toMatchObject({ weight: 900, syntheticItalic: true });
  });

  it('lists weights of variable and static families', () => {
    const variable = { family: 'V', source: 'bundled' as const, faces: [face([300, 700])] };
    expect(familyWeights(variable)).toEqual([300, 400, 500, 600, 700]);
    expect(weightRange(variable)).toEqual([300, 700]);
    expect(nearestWeight(variable, 900)).toBe(700);
    expect(nearestWeight(variable, 450)).toBe(450);
    const st = { family: 'S', source: 'upload' as const, faces: statics };
    expect(nearestWeight(st, 650)).toBe(700);
  });
});

describe('stripStyleWords', async () => {
  const { stripStyleWords } = await import('../parse');
  it('drops trailing weight words only', () => {
    expect(stripStyleWords('Space Grotesk Light')).toBe('Space Grotesk');
    expect(stripStyleWords('Foo Semi Bold')).toBe('Foo');
    expect(stripStyleWords('Bold')).toBe('Bold');
    expect(stripStyleWords('Lightning Sans')).toBe('Lightning Sans');
  });
});
