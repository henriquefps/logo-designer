import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import type { Vec } from '@/model/types';
import { bundledSvg } from './catalog';
import { fetchIconifySvg, splitId } from './iconify';
import { svgToNodes } from './svgToNodes';
import { useIconOptions, useIconPrefs } from './stores';

export interface IconRef {
  source: 'lucide' | 'phosphor' | 'iconify';
  /** lucide/phosphor: component name. iconify: "prefix:name". */
  id: string;
}

export const refKey = (r: IconRef) => `${r.source}:${r.id}`;
export function parseRefKey(key: string): IconRef | null {
  const i = key.indexOf(':');
  const source = key.slice(0, i);
  if (source !== 'lucide' && source !== 'phosphor' && source !== 'iconify') return null;
  return { source, id: key.slice(i + 1) };
}

const displayName = (r: IconRef) => (r.source === 'iconify' ? splitId(r.id)[1] : r.id);

export const DEFAULT_ICON_RATIO = 0.25;

/** Inserts the icon as editable path/group nodes, centered at `at` (default: artboard center). */
export async function insertIcon(ref: IconRef, at?: Vec): Promise<boolean> {
  const o = useIconOptions.getState();
  const doc = useDocStore.getState().doc;
  const size = o.size ?? Math.round(Math.min(doc.artboard.width, doc.artboard.height) * DEFAULT_ICON_RATIO);
  const svg = ref.source === 'iconify' ? await fetchIconifySvg(ref.id) : await bundledSvg(ref.source, ref.id, o.weight);
  const node = svgToNodes(svg, { color: o.color, size, strokeWidth: o.strokeWidth, name: displayName(ref) });
  if (!node) return false;
  const current = useDocStore.getState().doc.artboard;
  const p = at ?? { x: current.width / 2, y: current.height / 2 };
  node.transform = { ...node.transform, x: p.x, y: p.y };
  const [id] = useDocStore.getState().addNodes([node], { label: `Add icon ${node.name}` });
  useEditorStore.getState().setSelection([id]);
  useIconPrefs.getState().pushRecent(refKey(ref));
  return true;
}
