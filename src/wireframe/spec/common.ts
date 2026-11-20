// Rules build.ts and dump.ts must agree on (defaults, what counts as generated), so a dump builds back
// into the same project.
import { walk, type GroupNode, type Id, type LayoutInfo, type SceneNode, type ScreenPlatform } from '@/model';
import { getComponent } from '../library/registry';
import { CONTAINER_PRESETS, LAYOUT_KIND_LABEL } from '../containers';
import { deepEqual } from '../repeat';

/** A layout without its materialized size (what a container *is*). */
export function layoutShape(l: LayoutInfo): LayoutInfo {
  const copy = { ...l };
  delete copy.size;
  return copy;
}

/** Name a node gets when the spec gives none: the component's label, the container preset's name, the master's name. */
export function defaultName(n: SceneNode, symbolName?: (id: Id) => string | undefined): string {
  if (n.type !== 'group') return n.name;
  if (n.symbol) return symbolName?.(n.symbol.id) ?? n.name;
  if (n.component) return getComponent(n.component.kind)?.label ?? n.name;
  if (n.layout) {
    const shape = layoutShape(n.layout);
    delete shape.repeat; // a repeating card container is still a card container
    return CONTAINER_PRESETS.find((p) => deepEqual(p.layout, shape))?.name ?? LAYOUT_KIND_LABEL[n.layout.kind];
  }
  return 'Group';
}

/** Whether the parent's layout places this child (its x / y and box are computed, not stated). Hidden children are never laid out. */
export const placedByLayout = (n: SceneNode, parentLays: boolean) => parentLays && n.visible && n.layoutItem?.position !== 'free';

/** True for a frame child that takes a default placement from its definition when the spec says nothing. */
export function hasDefaultPlacement(n: SceneNode): boolean {
  return n.type === 'group' && !!n.component && !!getComponent(n.component.kind)?.placement;
}

/**
 * The nodes a spec states (ids an agent can refer to): not the children a library component generates,
 * not repeat copies, not the content of a shared component instance (it comes from the master).
 */
export function sourceIds(nodes: SceneNode[]): Set<Id> {
  const out = new Set<Id>();
  walk(nodes, (n) => {
    if (n.repeatCopy) return false;
    out.add(n.id);
    if (n.type === 'group' && (n.component || n.symbol || n.note)) return false;
    return true;
  });
  return out;
}

export const isGroupNode = (n: SceneNode): n is GroupNode => n.type === 'group';

export type Platform = ScreenPlatform;
