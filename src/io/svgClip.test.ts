// clip-path / mask → real geometry on import. The Hoard C1 knockout glyph (a clipPath cuts the back
// file where the front file sits) must import cut, and render like the original SVG.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { createDocument, walk, type PathNode, type SceneNode } from '@/model';
import { loadPaper } from '@/vector/paperOps';
import { parseSvg, svgNeedsGeometry } from './svgImport';
import { svgToDocument } from './svgDocument';
import { exportGlyph } from './glyphExport';
import { wrapGlyphFragment } from '@/cli/main';
import { setupHeadless } from '@/cli/env';

const fixture = readFileSync(join(__dirname, '__fixtures__', 'hoard-c1k.svg'), 'utf8');
const PX = 512;

/** Alpha channel of an SVG fragment drawn in the 128 box (as build-icons.mjs renders the glyph). */
function alpha(fragment: string): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" style="color:#000">${fragment}</svg>`;
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: PX }, background: 'rgba(0,0,0,0)' }).render();
  const px = img.pixels; // a getter that copies: read it once
  const out = new Uint8Array(PX * PX);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3];
  return out;
}

function diff(a: Uint8Array, b: Uint8Array) {
  let big = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > 96) big++;
  }
  return { bigShare: big / a.length, mean: sum / a.length };
}

const leaves = (nodes: SceneNode[]) => {
  const out: SceneNode[] = [];
  walk(nodes, (n) => void (n.type !== 'group' && out.push(n)));
  return out;
};

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

let scope: paper.PaperScope;
beforeAll(async () => {
  // The CLI's headless setup: happy-dom's DOMParser in the node environment.
  await setupHeadless();
  scope = await loadPaper();
});

describe('clip-path import', () => {
  it('detects markup that needs the geometry engine', () => {
    expect(svgNeedsGeometry(fixture)).toBe(true);
    expect(svgNeedsGeometry(svg('<rect width="1" height="1"/>'))).toBe(false);
    expect(svgNeedsGeometry(svg('<g mask="url(#m)"/>'))).toBe(true);
  });

  it('imports hoard-c1k.svg with the back file cut, rendering like the original', async () => {
    const { text } = wrapGlyphFragment(fixture);
    const { doc, warnings } = svgToDocument(text, 'Hoard C1k');
    expect(warnings).toEqual([]);
    const glyph = await exportGlyph({ ...doc, icon: undefined });
    expect(glyph).not.toMatch(/clip-path|clipPath|mask/);
    const original = alpha(fixture);
    const imported = alpha(glyph);
    const d = diff(original, imported);
    // Anti-aliasing differences along edges only.
    expect(d.bigShare).toBeLessThan(0.002);
    expect(d.mean).toBeLessThan(1.5);
    // Sanity: without the clip the back file is visibly different (the test can fail).
    const unclipped = alpha(fixture.replace(/ clip-path="[^"]*"/, ''));
    expect(diff(original, unclipped).bigShare).toBeGreaterThan(0.005);
    // The back file is a plain, editable filled path keeping its opacity.
    const back = leaves(doc.children).find((n) => n.opacity === 0.45) as PathNode;
    expect(back.type).toBe('path');
    expect(back.stroke.paint.kind).toBe('none');
    expect(back.fill.kind).toBe('solid');
  });

  it('clips with userSpaceOnUse, objectBoundingBox and transforms', () => {
    // Left half of a 100×100 square, by a clip in user space.
    const user = parseSvg(
      svg('<defs><clipPath id="c"><rect width="50" height="100"/></clipPath></defs><rect width="100" height="100" fill="#f00" clip-path="url(#c)"/>'),
      { paper: scope },
    );
    const p = user.nodes[0] as PathNode;
    expect(p.type).toBe('path');
    // objectBoundingBox: left half of the element's box, wherever it is; the element's transform applies.
    const obb = parseSvg(
      svg(
        '<defs><clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="0.5" height="1"/></clipPath></defs><rect x="10" y="10" width="40" height="40" transform="translate(20 0)" clip-path="url(#c)"/>',
      ),
      { paper: scope },
    );
    const doc = createDocument({ children: obb.nodes });
    const b = leaves(doc.children)[0] as PathNode;
    const xs = b.subpaths.flatMap((s) => s.points.map((q) => q.x + b.transform.x));
    expect(Math.min(...xs)).toBeCloseTo(30, 3);
    expect(Math.max(...xs)).toBeCloseTo(50, 3);
  });

  it('respects clip-rule evenodd and removes content outside the clip', () => {
    const r = parseSvg(
      svg(
        '<defs><clipPath id="c"><path clip-rule="evenodd" d="M0 0H100V100H0Z M40 40H60V60H40Z"/></clipPath></defs>' +
          '<g clip-path="url(#c)"><rect x="30" y="30" width="40" height="40"/><rect x="45" y="45" width="10" height="10"/></g>',
      ),
      { paper: scope },
    );
    const ls = leaves(r.nodes);
    // The small rect lies inside the hole: gone. The bigger one gets a hole.
    expect(ls).toHaveLength(1);
    expect((ls[0] as PathNode).subpaths).toHaveLength(2);
  });

  it('keeps content that is entirely inside the clip unchanged (still a stroke)', () => {
    const r = parseSvg(
      svg('<defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs><path clip-path="url(#c)" d="M20 20H80" stroke="#000" stroke-width="4" fill="none"/>'),
      { paper: scope },
    );
    const p = r.nodes[0] as PathNode;
    expect(p.stroke.paint.kind).toBe('solid');
  });

  it('turns a solid white/black mask into geometry, and keeps gradient masks unmasked with a warning', () => {
    const solidMask = parseSvg(
      svg(
        '<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><circle cx="50" cy="50" r="10" fill="#000"/></mask></defs>' +
          '<rect x="20" y="20" width="60" height="60" mask="url(#m)"/>',
      ),
      { paper: scope },
    );
    expect(solidMask.warnings).toEqual([]);
    expect((solidMask.nodes[0] as PathNode).subpaths).toHaveLength(2); // square with a round hole

    const gradientMask = parseSvg(
      svg(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="m"><rect width="100" height="100" fill="url(#g)"/></mask></defs>' +
          '<rect x="20" y="20" width="60" height="60" mask="url(#m)"/>',
      ),
      { paper: scope },
    );
    expect(gradientMask.nodes[0].type).toBe('rect');
    expect(gradientMask.warnings.join(' ')).toMatch(/Masks with gradients/);
  });

  it('warns and keeps the content when the geometry engine is not available', () => {
    const r = parseSvg(svg('<defs><clipPath id="c"><rect width="50" height="100"/></clipPath></defs><rect width="100" height="100" clip-path="url(#c)"/>'), { paper: null });
    expect(r.nodes[0].type).toBe('rect');
    expect(r.warnings.join(' ')).toMatch(/geometry engine/);
  });
});
