import { describe, expect, it } from 'vitest';
import { boundsIn, createText, fromTransform, linear, solid, type GroupNode, type SceneNode, type TextNode } from '@/model';
import { BUNDLED_FAMILIES } from '../catalog';
import { chooseFace } from '../layout';
import { fontLineWidth } from '../measure';
import { commandsToSubpaths, outlineWithFont } from '../outline';
import { parseFont } from '../parse';
import { fontBytes } from './helpers';

const interFaces = BUNDLED_FAMILIES.find((f) => f.family === 'Inter')!.faces;
const inter = await parseFont(fontBytes('inter-variable.ttf'));

const text = (init: Partial<TextNode> = {}) => createText({ text: 'Hi', fontFamily: 'Inter', fontSize: 100, fill: solid('#112233'), ...init });
const outline = (node: TextNode) => outlineWithFont(node, inter, chooseFace(interFaces, node.fontWeight, node.fontStyle)!) as GroupNode;
const box = (n: SceneNode) => boundsIn(n, fromTransform(n.transform))!;

describe('commandsToSubpaths', () => {
  it('turns quadratics into cubics and merges the repeated start point on close', () => {
    const sp = commandsToSubpaths([
      { type: 'M', x: 0, y: 0 },
      { type: 'Q', x1: 30, y1: 0, x: 30, y: 30 },
      { type: 'L', x: 0, y: 0 },
      { type: 'Z' },
      { type: 'M', x: 50, y: 50 },
      { type: 'L', x: 60, y: 50 },
    ]);
    expect(sp).toHaveLength(2);
    expect(sp[0].closed).toBe(true);
    expect(sp[0].points).toHaveLength(2);
    expect(sp[0].points[0].out).toEqual({ x: 20, y: 0 });
    expect(sp[0].points[1].in).toEqual({ x: 30, y: 10 });
    expect(sp[1]).toMatchObject({ closed: false, points: [{ x: 50, y: 50 }, { x: 60, y: 50 }] });
  });
});

describe('outlineWithFont', () => {
  it('makes one path per glyph with the text paint and transform', () => {
    const node = text({ transform: { x: 10, y: 20, rotation: 15, scaleX: 1, scaleY: 1 } });
    const g = outline(node);
    expect(g.type).toBe('group');
    expect(g.children).toHaveLength(2);
    expect(g.transform).toEqual(node.transform);
    for (const c of g.children) expect(c).toMatchObject({ type: 'path', fill: { kind: 'solid', color: '#112233' }, fillRule: 'nonzero' });
  });

  it('uses one compound path for gradients', () => {
    expect(outline(text({ text: 'Hello', fill: linear('#000000', '#ffffff') })).children).toHaveLength(1);
  });

  it('sits in the measured box: baseline, width, alignment', () => {
    const node = text({ text: 'HH', transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
    const b = box(outline(node));
    const w = fontLineWidth(inter, 'HH', node, chooseFace(interFaces, 400, 'normal')!);
    // Inter cap height ≈ 0.727em; baseline = (120 - 121.2)/2 + 96.9 ≈ 96.3.
    expect(b.y + b.height).toBeCloseTo(96.3, 0);
    expect(b.height).toBeGreaterThan(70);
    expect(b.width).toBeLessThan(w);
    expect(b.width).toBeGreaterThan(w * 0.7);
    const centered = box(outline({ ...node, align: 'center' }));
    expect(centered.x + centered.width / 2).toBeCloseTo(0, 0);
    const right = box(outline({ ...node, align: 'right' }));
    expect(right.x + right.width).toBeLessThan(0);
    expect(right.x + right.width).toBeGreaterThan(-15);
  });

  it('applies variable weight, letter spacing, kerning and line height', () => {
    const regular = box(outline(text({ text: 'mmm' })));
    const black = box(outline(text({ text: 'mmm', fontWeight: 900 })));
    expect(black.width).toBeGreaterThan(regular.width + 5);
    const spaced = box(outline(text({ text: 'mmm', letterSpacing: 20 })));
    expect(spaced.width).toBeCloseTo(regular.width + 40, 0);
    const av = box(outline(text({ text: 'AV' })));
    const ah = box(outline(text({ text: 'AH' })));
    expect(av.width).toBeLessThan(ah.width);
    const two = box(outline(text({ text: 'H\nH', lineHeight: 2 })));
    expect(two.height).toBeGreaterThan(200);
  });

  it('slants synthetic italic around each baseline', () => {
    const upright = box(outline(text({ text: 'I' })));
    const italic = box(outline(text({ text: 'I', fontStyle: 'italic' })));
    expect(italic.width).toBeGreaterThan(upright.width + 10);
    expect(italic.y + italic.height).toBeCloseTo(upright.y + upright.height, 1);
  });
});
