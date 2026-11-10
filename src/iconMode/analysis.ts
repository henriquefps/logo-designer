// Live measurement of the open icon document with the ported build-icons.mjs code (src/icon):
// glyph fragment → offscreen canvas at 2048 px → ink box → the script's report. Debounced.
import { docToGlyphSpace, iconTile, inkBox, report } from '@/icon';
import { isPainted, walk, worldMatrix, type DesignDocument } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { glyphFragment } from './glyph';
import { canvasRasterize } from './renderer';
import { EMPTY_ANALYSIS, useIconStore } from './store';

export const ANALYSIS_DELAY = 250;

/** Stroke widths of the visible, non-reference glyph objects in the 128 space (as drawn). */
export function glyphStrokeWidths(doc: DesignDocument): number[] {
  if (!doc.icon) return [];
  const { k } = docToGlyphSpace(iconTile(doc.icon.preset, doc.artboard));
  const out: number[] = [];
  walk(doc.children, (node) => {
    if (!node.visible || node.reference) return false;
    if (!isPainted(node) || node.stroke.paint.kind === 'none' || node.stroke.width <= 0) return;
    const m = worldMatrix(doc, node.id);
    out.push(node.stroke.width * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * k);
  });
  return out;
}

/** Measures `doc` now (no debounce). */
export async function measureDocument(doc: DesignDocument) {
  const glyph = await glyphFragment(doc);
  if (!glyph) return { ...EMPTY_ANALYSIS, status: 'empty' as const };
  const box = await inkBox(glyph, canvasRasterize);
  if (!box) return { ...EMPTY_ANALYSIS, glyph, status: 'empty' as const };
  return { status: 'ready' as const, glyph, box, report: report(box, doc.icon?.shape ?? 'auto'), strokes: glyphStrokeWidths(doc) };
}

/** Keeps `useIconStore.analysis` in sync with the open document. Returns the unsubscribe. */
export function startIconAnalysis(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let run = 0;
  let last: DesignDocument | null = null;
  const schedule = (doc: DesignDocument) => {
    if (doc === last) return;
    last = doc;
    if (timer) clearTimeout(timer);
    if (!doc.icon) {
      useIconStore.getState().setAnalysis(EMPTY_ANALYSIS);
      return;
    }
    const prev = useIconStore.getState().analysis;
    if (prev.status !== 'measuring') useIconStore.getState().setAnalysis({ ...prev, status: prev.status === 'idle' ? 'measuring' : prev.status });
    timer = setTimeout(async () => {
      const id = ++run;
      try {
        const a = await measureDocument(doc);
        if (id === run) useIconStore.getState().setAnalysis(a);
      } catch (e) {
        if (id === run) useIconStore.getState().setAnalysis({ ...EMPTY_ANALYSIS, status: 'error', error: e instanceof Error ? e.message : 'Measurement failed.' });
      }
    }, ANALYSIS_DELAY);
  };
  schedule(useDocStore.getState().doc);
  const unsub = useDocStore.subscribe((s) => {
    if (s.txn) return; // measure after the gesture
    schedule(s.doc);
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}
