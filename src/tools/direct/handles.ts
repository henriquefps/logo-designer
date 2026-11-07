import type { SubPath } from '@/model';
import { anchorKey, parseKey, type AnchorRef } from '@/vector/pathEdit';

export interface VisibleHandle {
  ref: AnchorRef;
  which: 'in' | 'out';
}

/**
 * Handles shown in node edit: both handles of each selected anchor plus the neighbours' handles that
 * shape the adjacent segments (Illustrator-style).
 */
export function visibleHandles(subpaths: SubPath[], selected: string[]): VisibleHandle[] {
  const out = new Map<string, VisibleHandle>();
  const push = (ref: AnchorRef, which: 'in' | 'out') => {
    const p = subpaths[ref.s]?.points[ref.i];
    if (p?.[which]) out.set(`${anchorKey(ref)}:${which}`, { ref, which });
  };
  for (const k of selected) {
    const { s, i } = parseKey(k);
    const sp = subpaths[s];
    if (!sp?.points[i]) continue;
    const n = sp.points.length;
    push({ s, i }, 'in');
    push({ s, i }, 'out');
    if (i > 0 || sp.closed) push({ s, i: (i - 1 + n) % n }, 'out');
    if (i < n - 1 || sp.closed) push({ s, i: (i + 1) % n }, 'in');
  }
  return [...out.values()];
}
