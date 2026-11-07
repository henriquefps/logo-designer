// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  boundsIn,
  createDocument,
  createEllipse,
  createGroup,
  createPath,
  createPolygon,
  createRect,
  createText,
  defaultStroke,
  fromTransform,
  linear,
  solid,
  type GroupNode,
  type PathNode,
  type RectNode,
  type SceneNode,
} from '@/model';
import { parsePathData } from './svg/pathData';
import { exportSvg } from './svgExport';
import { parseSvg } from './svgImport';

const close = (a: number, b: number, eps = 1e-2) => expect(Math.abs(a - b)).toBeLessThan(eps);
const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const worldBox = (n: SceneNode) => boundsIn(n, fromTransform(n.transform))!;

describe('parseSvg', () => {
  it('rejects non-SVG', () => {
    expect(() => parseSvg('<html></html>')).toThrow(/not a valid SVG/);
    expect(() => parseSvg('<svg')).toThrow();
  });

  it('reads size from viewBox and offsets the origin', () => {
    const r = parseSvg(svg('<rect x="10" y="20" width="30" height="40"/>', 'viewBox="10 20 50 60" width="500"'));
    expect(r.width).toBe(50);
    expect(r.height).toBe(60);
    const rect = r.nodes[0] as RectNode;
    expect(rect.type).toBe('rect');
    expect(worldBox(rect)).toEqual({ x: 0, y: 0, width: 30, height: 40 });
  });

  it('maps primitives with fill, stroke and opacity', () => {
    const r = parseSvg(
      svg(
        '<rect x="0" y="0" width="10" height="10" rx="2" fill="#f00" stroke="blue" stroke-width="3" opacity="0.5" fill-opacity="0.5"/>' +
          '<circle cx="50" cy="50" r="10"/><ellipse cx="5" cy="5" rx="4" ry="2" fill="none"/>' +
          '<line x1="0" y1="0" x2="10" y2="10" stroke="black"/>' +
          '<polygon points="0,0 10,0 5,5"/><polyline points="0 0 1 1 2 0" fill="none" stroke="#000"/>',
      ),
    );
    const [rect, circle, ellipse, line, polygon, polyline] = r.nodes;
    expect(rect).toMatchObject({ type: 'rect', width: 10, height: 10, radius: 2, opacity: 0.5, fill: { kind: 'solid', color: '#ff000080' } });
    expect((rect as RectNode).stroke).toMatchObject({ paint: { kind: 'solid', color: '#0000ff' }, width: 3 });
    expect(circle).toMatchObject({ type: 'ellipse', rx: 10, ry: 10, transform: { x: 50, y: 50 }, fill: { kind: 'solid', color: '#000000' } });
    expect(ellipse).toMatchObject({ type: 'ellipse', rx: 4, ry: 2, fill: { kind: 'none' } });
    expect(line).toMatchObject({ type: 'path', fill: { kind: 'none' } });
    expect((polygon as PathNode).subpaths[0]).toMatchObject({ closed: true });
    expect((polyline as PathNode).subpaths[0]).toMatchObject({ closed: false });
  });

  it('inherits styles from groups and applies <style> classes and style=""', () => {
    const r = parseSvg(
      svg(
        '<style>.a { fill: #00ff00 } #b { stroke: red; stroke-width: 2 } rect { fill: blue }</style>' +
          '<g fill="#123456"><path d="M0 0H10V10Z"/><path class="a" d="M0 0H10V10Z"/><path id="b" d="M0 0H1" style="fill: none"/><rect width="1" height="1"/></g>',
      ),
    );
    const g = r.nodes[0] as GroupNode;
    const [p1, p2, p3, rect] = g.children as PathNode[];
    expect(p1.fill).toEqual({ kind: 'solid', color: '#123456' });
    expect(p2.fill).toEqual({ kind: 'solid', color: '#00ff00' });
    expect(p3.fill).toEqual({ kind: 'none' });
    expect(p3.stroke).toMatchObject({ paint: { kind: 'solid', color: '#ff0000' }, width: 2 });
    expect(rect.fill).toEqual({ kind: 'solid', color: '#0000ff' });
  });

  it('resolves currentColor, rgb() and named colors', () => {
    const r = parseSvg(svg('<g color="rgb(255, 0, 0)"><path d="M0 0H1V1Z" fill="currentColor"/><path d="M0 0H1V1Z" fill="teal"/></g>'));
    const [a, b] = (r.nodes[0] as GroupNode).children as PathNode[];
    expect(a.fill).toEqual({ kind: 'solid', color: '#ff0000' });
    expect(b.fill).toEqual({ kind: 'solid', color: '#008080' });
    const icon = parseSvg(svg('<path d="M0 0H1" stroke="currentColor"/>'), { currentColor: '#336699' });
    expect((icon.nodes[0] as PathNode).stroke.paint).toEqual({ kind: 'solid', color: '#336699' });
  });

  it('reads linear/radial gradients (with href inheritance)', () => {
    const r = parseSvg(
      svg(
        '<defs><linearGradient id="base"><stop offset="0" stop-color="#000"/><stop offset="100%" stop-color="#fff" stop-opacity=".5"/></linearGradient>' +
          '<linearGradient id="v" href="#base" x1="0" y1="0" x2="0" y2="1"/>' +
          '<radialGradient id="r"><stop offset="0" style="stop-color:red"/><stop offset="1" stop-color="blue"/></radialGradient></defs>' +
          '<rect width="10" height="10" fill="url(#v)"/><rect width="10" height="10" fill="url(#r)"/><rect width="1" height="1" fill="url(#missing) red"/>',
      ),
    );
    const [a, b, c] = r.nodes as RectNode[];
    expect(a.fill).toEqual({
      kind: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff80' },
      ],
    });
    expect(b.fill).toMatchObject({ kind: 'radial', stops: [{ color: '#ff0000' }, { color: '#0000ff' }] });
    expect(c.fill).toEqual({ kind: 'solid', color: '#ff0000' });
  });

  it('keeps decomposable group transforms and bakes skew into points', () => {
    const r = parseSvg(
      svg(
        '<g transform="translate(10 20) rotate(45) scale(2)"><rect width="10" height="10"/></g>' +
          '<g transform="matrix(1 0 1 1 0 0)"><rect width="10" height="10"/></g>',
      ),
    );
    const [g1, g2] = r.nodes as GroupNode[];
    expect(g1.transform.x).toBe(10);
    close(g1.transform.rotation, 45);
    close(g1.transform.scaleX, 2);
    expect(g1.children[0]).toMatchObject({ type: 'rect', width: 10, transform: { x: 5, y: 5 } });
    // Skewed: identity group, rect baked into a path (a parallelogram).
    expect(g2.transform).toMatchObject({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const p = g2.children[0] as PathNode;
    expect(p.type).toBe('path');
    expect(p.subpaths[0].points.map((q) => [q.x, q.y])).toEqual([
      [0, 0],
      [10, 0],
      [20, 10],
      [10, 10],
    ]);
  });

  it('bakes element transforms into path points and scales stroke width', () => {
    const r = parseSvg(svg('<path d="M0 0H10" stroke="#000" stroke-width="2" transform="scale(3)"/>'));
    const p = r.nodes[0] as PathNode;
    expect(p.subpaths[0].points.map((q) => q.x)).toEqual([0, 30]);
    expect(p.stroke.width).toBe(6);
  });

  it('expands <use> of elements and symbols', () => {
    const r = parseSvg(
      svg(
        '<defs><path id="tri" d="M0 0H10V10Z" fill="red"/><symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></defs>' +
          '<use href="#tri" x="50" y="0"/><use xlink:href="#s" x="0" y="50" width="20" height="20" xmlns:xlink="http://www.w3.org/1999/xlink"/>',
      ),
    );
    expect(r.nodes).toHaveLength(2);
    const tri = r.nodes[0] as PathNode;
    expect(tri.subpaths[0].points[0]).toMatchObject({ x: 50, y: 0 });
    expect(tri.fill).toEqual({ kind: 'solid', color: '#ff0000' });
    const sym = r.nodes[1] as GroupNode;
    expect(worldBox(sym)).toEqual({ x: 0, y: 50, width: 20, height: 20 });
  });

  it('survives recursive <use>', () => {
    const r = parseSvg(svg('<g id="a"><use href="#a"/><rect width="1" height="1"/></g>'));
    expect(r.nodes).toHaveLength(1);
  });

  it('skips hidden and non-rendered content', () => {
    const r = parseSvg(
      svg('<rect width="1" height="1" display="none"/><clipPath id="c"><rect width="5" height="5"/></clipPath><title>t</title><rect width="2" height="2" visibility="hidden"/>'),
    );
    expect(r.nodes).toHaveLength(1);
    expect(r.nodes[0].visible).toBe(false);
  });

  it('reads text best effort', () => {
    const r = parseSvg(
      svg('<text x="10" y="50" font-size="20" font-family="\'Space Grotesk Variable\', sans-serif" font-weight="bold" text-anchor="middle" fill="#333">Hello <tspan>world</tspan></text>'),
    );
    expect(r.nodes[0]).toMatchObject({
      type: 'text',
      text: 'Hello world',
      fontSize: 20,
      fontFamily: 'Space Grotesk Variable',
      fontWeight: 700,
      align: 'center',
      transform: { x: 10, y: 50 - 0.9 * 20 },
    });
  });

  it('reads images', () => {
    const r = parseSvg(svg('<image href="data:image/png;base64,AAAA" x="10" y="10" width="20" height="10"/>'));
    expect(r.nodes[0]).toMatchObject({ type: 'image', width: 20, height: 10, transform: { x: 20, y: 15 } });
  });

  it('nested svg places its viewBox', () => {
    const r = parseSvg(svg('<svg x="10" y="10" width="20" height="20" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'));
    expect(worldBox(r.nodes[0])).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });
});

describe('export → import round-trip', () => {
  const doc = createDocument({
    artboard: { width: 200, height: 100, background: solid('#ffeeaa') },
    children: [
      createRect({ width: 40, height: 20, radius: 4, transform: { x: 30, y: 20 }, fill: linear('#ff0000', '#0000ff', 45), stroke: defaultStroke(solid('#000000'), 2) }),
      createRect({ width: 40, height: 20, transform: { x: 100, y: 50, rotation: 30 } }),
      createEllipse({ rx: 15, ry: 10, transform: { x: 150, y: 30 }, opacity: 0.5 }),
      createPolygon({ sides: 5, radius: 20, innerRadius: 10, transform: { x: 60, y: 70, rotation: 15 } }),
      createGroup({
        transform: { x: 10, y: 10, scaleX: 2, scaleY: 2 },
        children: [createPath({ subpaths: parsePathData('M0 0C10 0 10 10 20 10L20 20Z'), fill: solid('#00ff0080'), fillRule: 'evenodd' })],
      }),
      createRect({ visible: false }),
    ],
  });

  it('keeps every visible node with the same world bounds', async () => {
    const { svg: out } = await exportSvg(doc);
    expect(out).toContain('viewBox="0 0 200 100"');
    expect(out).not.toContain('data-node-id');
    const back = parseSvg(out);
    // Background rect + 5 visible nodes (hidden skipped).
    expect(back.nodes).toHaveLength(6);
    expect(back.nodes[0]).toMatchObject({ type: 'rect', width: 200, height: 100, fill: { kind: 'solid', color: '#ffeeaa' } });
    const originals = doc.children.filter((c) => c.visible);
    originals.forEach((orig, i) => {
      const a = worldBox(orig);
      const b = worldBox(back.nodes[i + 1]);
      close(a.x, b.x);
      close(a.y, b.y);
      close(a.width, b.width);
      close(a.height, b.height);
    });
    const rect = back.nodes[1] as RectNode;
    expect(rect.fill).toMatchObject({ kind: 'linear', angle: 45 });
    expect(rect.stroke.width).toBe(2);
    expect(back.nodes[3].opacity).toBe(0.5);
    const group = back.nodes[5] as GroupNode;
    expect((group.children[0] as PathNode).fillRule).toBe('evenodd');
    expect((group.children[0] as PathNode).fill).toEqual({ kind: 'solid', color: '#00ff0080' });
  });

  it('rounds numbers and dedupes gradients with short ids', async () => {
    const d = createDocument({
      artboard: { width: 10, height: 10, background: { kind: 'none' } },
      children: [
        createRect({ width: 1 / 3, height: 1, transform: { x: 1.23456789, y: 2 }, fill: linear('#000000', '#ffffff') }),
        createRect({ width: 1, height: 1, fill: linear('#000000', '#ffffff') }),
      ],
    });
    const { svg: out } = await exportSvg(d);
    expect(out).toContain('width="0.333"');
    expect(out).toContain('x="1.068"');
    expect(out.match(/<linearGradient/g)).toHaveLength(1);
    expect(out).toContain('fill="url(#g1)"');
    expect(out).not.toMatch(/\d\.\d{4,}/);
  });

  it('exports the selection with padding and ancestor transforms', async () => {
    const child = createRect({ width: 10, height: 10, transform: { x: 5, y: 5 } });
    const g = createGroup({ transform: { x: 100, y: 100 }, children: [child] });
    const d = createDocument({ children: [g, createRect()] });
    const res = await exportSvg(d, { scope: 'selection', selection: [child.id], padding: 2 });
    expect(res.viewBox).toEqual({ x: 98, y: 98, width: 14, height: 14 });
    expect(res.svg).toContain('matrix(1 0 0 1 100 100)');
    const back = parseSvg(res.svg);
    // viewBox origin moves to 0,0 on import: the rect sits at padding offset.
    const box = boundsIn(back.nodes[0], fromTransform(back.nodes[0].transform))!;
    expect(box).toEqual({ x: 2, y: 2, width: 10, height: 10 });
    await expect(exportSvg(d, { scope: 'selection', selection: [] })).rejects.toThrow();
  });

  it('falls back to <text> without the fonts module', async () => {
    const d = createDocument({ children: [createText({ text: 'A & B\nline 2', transform: { x: 10, y: 10 } })] });
    const { svg: out } = await exportSvg(d);
    expect(out).toContain('A &amp; B');
    const back = parseSvg(out);
    expect(back.nodes[1]).toMatchObject({ type: 'text', text: 'A & B\nline 2', transform: { x: 10, y: 10 } });
  });
});
