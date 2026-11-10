// Document → glyph fragment for scripts/build-icons.mjs: the artboard mapped onto a 128 × 128 box,
// every color replaced by `currentColor`, no <svg> wrapper (the script wraps it), text outlined.
// Fallback until the icon mode ships its own glyph exporter; see docs/agents.md.
import type { DesignDocument } from '@/model';
import { n, exportSvg } from './svgExport';

export const GLYPH_BOX = 128;

export async function exportGlyph(doc: DesignDocument, opts: { comment?: string } = {}): Promise<string> {
  const { svg } = await exportSvg(doc, { background: false });
  const { width, height } = doc.artboard;
  const k = GLYPH_BOX / Math.max(width, height);
  const tx = (GLYPH_BOX - width * k) / 2;
  const ty = (GLYPH_BOX - height * k) / 2;
  let body = svg
    .replace(/^<svg[^>]*>\n?/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<defs>[\s\S]*?<\/defs>\n?/g, '')
    // Colors (solid or gradient refs) → currentColor; "none" stays.
    .replace(/\b(fill|stroke|stop-color|color)="(?!none")[^"]*"/g, '$1="currentColor"')
    .replace(/\s(fill|stroke)-opacity="[^"]*"/g, '');
  body = body
    .split('\n')
    .map((l) => l.replace(/^ {2}/, ''))
    .join('\n')
    .trim();
  const identity = Math.abs(k - 1) < 1e-9 && Math.abs(tx) < 1e-9 && Math.abs(ty) < 1e-9;
  if (!identity) {
    const t = `${tx || ty ? `translate(${n(tx)} ${n(ty)}) ` : ''}scale(${n(k)})`;
    body = `<g transform="${t}">\n${body.replace(/^/gm, '  ')}\n</g>`;
  }
  const comment = opts.comment ?? `${doc.name}: glyph in a ${GLYPH_BOX} box, \`currentColor\` is replaced by the build script. Made with Designer.`;
  return `<!-- ${comment.replace(/--/g, '-')} -->\n${body}\n`;
}
