// Component commands for the app: insert from the library (click / drop), edit a prop, Detach.
// Document logic is in ./instances.ts; this file adds the stores.
import { findNode, isComponentNode, isScreenNode, localBounds, locate, topmostIds, type ComponentNode, type DesignDocument, type GroupNode, type Id, type ScreenNode, type Vec } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { getComponent } from './library/registry';
import type { AnyComponentDef, PropSpec } from './library/types';
import { defaultProps } from './library/types';
import { ensureIcons } from './iconLoader';
import { appendPosition, detachInstance, dropPosition, newInstance } from './instances';
import { frameOf, frames } from './screens';
import { placementArea } from './placement';
import { layoutDropTarget } from './layoutEdit';

const iconProps = (def: AnyComponentDef, props: Record<string, unknown>) =>
  Object.entries(def.props as Record<string, PropSpec>)
    .filter(([, s]) => s.type === 'icon')
    .map(([k]) => String(props[k] ?? ''));

/** Width of a container's content box (frame width, else its current bounds). */
function containerWidth(n: GroupNode): number {
  if (isScreenNode(n)) return n.screen.width;
  return localBounds(n)?.width ?? 0;
}

interface Target {
  parentId: Id | null;
  /** Insert index in the parent's children (default: append). */
  index?: number;
  container: GroupNode | null;
}

/**
 * Where a click in the library inserts: into the selected container (a frame or a stack), after the
 * selected object inside one, else into the screen of the selection, else the screen in view.
 */
function clickTarget(doc: DesignDocument): Target {
  const sel = useEditorStore.getState().selection;
  if (sel.length === 1) {
    const loc = locate(doc, sel[0]);
    const n = loc?.node;
    if (n && n.type === 'group' && (isScreenNode(n) || (n.layout && !n.component))) return { parentId: n.id, container: n };
    const parent = loc && loc.parent !== doc ? (loc.parent as GroupNode) : null;
    if (parent?.layout) return { parentId: parent.id, index: loc!.index + 1, container: parent };
  }
  const frame = sel.map((id) => frameOf(doc, id)).find(Boolean) ?? frameInView(doc);
  return frame ? { parentId: frame.id, container: frame } : { parentId: null, container: null };
}

/** The frame that covers most of the visible area (or the first one). */
function frameInView(doc: DesignDocument): ScreenNode | null {
  const area = placementArea();
  let best: ScreenNode | null = null;
  let bestArea = 0;
  for (const f of frames(doc)) {
    const w = Math.min(area.x + area.width, f.transform.x + f.screen.width) - Math.max(area.x, f.transform.x);
    const h = Math.min(area.y + area.height, f.transform.y + f.screen.height) - Math.max(area.y, f.transform.y);
    if (w > 0 && h > 0 && w * h > bestArea) {
      best = f;
      bestArea = w * h;
    }
  }
  return best;
}

/** The topmost frame under a world point. */
function frameAt(doc: DesignDocument, p: Vec): ScreenNode | null {
  const list = frames(doc);
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    if (f.visible && p.x >= f.transform.x && p.x <= f.transform.x + f.screen.width && p.y >= f.transform.y && p.y <= f.transform.y + f.screen.height) return f;
  }
  return null;
}

/**
 * Inserts a new instance of `kind`: at `at` (world point, a drop) or appended to the selected
 * screen/container (a click). Selects it. Returns its id.
 */
export async function insertComponent(kind: string, at?: Vec): Promise<Id | null> {
  const def = getComponent(kind);
  if (!def || !useDocStore.getState().doc.wireframe) return null;
  const props = defaultProps(def);
  await ensureIcons(iconProps(def, props));
  const doc = useDocStore.getState().doc;
  let node: ComponentNode;
  let target: Target;
  const stack = at ? layoutDropTarget(doc, at) : null;
  if (stack) {
    // Dropped on a stack: inserted at that point; the layout places and sizes it.
    node = newInstance(def, { x: 0, y: 0 }, undefined, props);
    target = { parentId: stack.containerId, index: stack.index, container: null };
  } else if (at) {
    const frame = frameAt(doc, at);
    if (frame) {
      const pos = dropPosition(def, { x: at.x - frame.transform.x, y: at.y - frame.transform.y }, frame.screen.width);
      node = newInstance(def, pos, pos.width, props);
      target = { parentId: frame.id, container: frame };
    } else {
      node = newInstance(def, { x: at.x - def.defaultSize.width / 2, y: at.y - def.defaultSize.height / 2 }, undefined, props);
      target = { parentId: null, container: null };
    }
  } else {
    target = clickTarget(doc);
    if (target.container) {
      const pos = appendPosition(def, target.container, containerWidth(target.container));
      node = newInstance(def, target.container.layout ? { x: 0, y: 0 } : pos, pos.width, props);
    } else {
      const area = placementArea();
      node = newInstance(def, { x: area.x + area.width / 2 - def.defaultSize.width / 2, y: area.y + area.height / 2 - def.defaultSize.height / 2 }, undefined, props);
    }
  }
  const [id] = useDocStore.getState().addNodes([node], { parentId: target.parentId, index: target.index, label: `Add ${def.label.toLowerCase()}` });
  useEditorStore.getState().setSelection([id]);
  return id;
}

/** The selected component instance (exactly one selected object that is one), or null. */
export function selectedInstance(): ComponentNode | null {
  const { doc } = useDocStore.getState();
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const n = findNode(doc, sel[0]);
  return n && isComponentNode(n) ? n : null;
}

/** Sets one prop of an instance: one undo step, the pipeline rebuilds it. Loads icons first. */
export async function setComponentProp(id: Id, key: string, value: unknown) {
  const n = findNode(useDocStore.getState().doc, id);
  if (!n || !isComponentNode(n)) return;
  const def = getComponent(n.component.kind);
  const spec = def?.props[key] as PropSpec | undefined;
  if (spec?.type === 'icon' && typeof value === 'string') await ensureIcons([value]);
  const cur = n.component.props[key];
  if (JSON.stringify(cur ?? (spec ? (spec.type === 'list' ? [...spec.default] : spec.default) : undefined)) === JSON.stringify(value)) return;
  useDocStore.getState().updateNodes(
    [id],
    (d) => {
      if (d.type === 'group' && d.component) d.component.props[key] = structuredClone(value) as never;
    },
    { label: spec ? `Change ${spec.label.toLowerCase()}` : 'Change property' },
  );
}

/** Ids of selected instances (topmost). */
export function selectedInstanceIds(): Id[] {
  const { doc } = useDocStore.getState();
  if (!doc.wireframe) return [];
  return topmostIds(doc, useEditorStore.getState().selection).filter((id) => {
    const n = findNode(doc, id);
    return !!n && isComponentNode(n);
  });
}

/** Object → Detach component: the selected instances become plain groups of shapes (one undo step). */
export function detachSelected(): number {
  const ids = selectedInstanceIds();
  if (!ids.length) return 0;
  useDocStore.getState().updateNodes(ids, (n) => void detachInstance(n), { label: ids.length === 1 ? 'Detach component' : 'Detach components' });
  return ids.length;
}
