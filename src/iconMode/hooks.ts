import { useEffect, useMemo, useState } from 'react';
import { inkBox, type IconSources, type PlacedGlyph } from '@/icon';
import type { DesignDocument } from '@/model';
import { loadDocument } from '@/store/persistence';
import { useDocStore } from '@/store/useDocStore';
import { glyphFragment } from './glyph';
import { canvasRasterize } from './renderer';
import { useIconStore } from './store';

export const GLYPH_FILTER_ID = 'icon-glyph-paint';

/** Filter for the artwork group: the glyph previews in the tile's glyph colour. */
export function useIconGlyphFilter(): string | undefined {
  const on = useDocStore((s) => !!s.doc.icon);
  const showTile = useIconStore((s) => s.showTile);
  return on && showTile ? `url(#${GLYPH_FILTER_ID})` : undefined;
}

/** The linked small glyph (favicon), measured; null when none is linked. */
export function useSmallGlyph(doc: DesignDocument): PlacedGlyph | null {
  const id = doc.icon?.smallGlyphProjectId;
  const [state, setState] = useState<{ id: string; glyph: PlacedGlyph | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void (async () => {
      const small = await loadDocument(id);
      const src = small ? await glyphFragment(small) : '';
      const box = src ? await inkBox(src, canvasRasterize) : null;
      if (alive) setState({ id, glyph: src && box ? { src, box } : null });
    })().catch(() => alive && setState({ id, glyph: null }));
    return () => {
      alive = false;
    };
  }, [id]);
  return id && state?.id === id ? state.glyph : null;
}

/** Sources for the preview builders from the live analysis (null until measured). */
export function useIconSources(doc: DesignDocument): IconSources | null {
  const a = useIconStore((s) => s.analysis);
  const small = useSmallGlyph(doc);
  return useMemo(() => {
    if (a.status !== 'ready' || !a.box || !a.report) return null;
    return { glyph: { src: a.glyph, box: a.box }, shape: a.report.shape, ...(small ? { small } : {}) };
  }, [a, small]);
}
