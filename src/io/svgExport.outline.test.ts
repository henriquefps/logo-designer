import { describe, expect, it, vi } from 'vitest';
import { createDocument, createGroup, createPath, createText, solid, type TextNode } from '@/model';
import { exportSvg } from './svgExport';

// The real textToPaths needs font files; here it returns one square glyph with the text's paint.
vi.mock('@/fonts/outline', () => ({
  textToPaths: async (node: TextNode) => {
    if (node.text === 'broken') throw new Error('font missing');
    return createGroup({
      name: node.text,
      transform: { ...node.transform },
      children: [createPath({ subpaths: [{ closed: true, points: [{ x: 0, y: 0, type: 'corner' }, { x: 10, y: 0, type: 'corner' }, { x: 10, y: 10, type: 'corner' }] }], fill: node.fill })],
    });
  },
}));

describe('svgExport text outlining', () => {
  it('uses fonts/outline textToPaths: paths instead of <text>', async () => {
    const d = createDocument({ children: [createText({ text: 'Hi', fill: solid('#ff0000'), transform: { x: 5, y: 6 } })] });
    const { svg } = await exportSvg(d);
    expect(svg).not.toContain('<text');
    expect(svg).toContain('<g transform="translate(5 6)">');
    expect(svg).toContain('<path d="M0 0L10 0L10 10Z" fill="#ff0000"');
  });

  it('falls back to <text> when outlining fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = createDocument({ children: [createText({ text: 'broken' })] });
    const { svg } = await exportSvg(d);
    expect(svg).toContain('<text');
    warn.mockRestore();
  });
});
