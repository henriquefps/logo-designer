// Container commands for the app (docs/wireframe-mode.md → Phase 1.5): insert an empty stack / grid /
// card container from the library (click or drop, at any nesting depth), change a container's kind,
// its style and its repeat. Document logic: ./containers.ts, ./repeat.ts, ./layoutEdit.ts.
import { findNode, isScreenNode, type ContainerRadius, type ContainerStyle, type GroupNode, type Id, type LayoutKind, type Vec } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { clickTarget, frameAt, type Target } from './componentCommands';
import { containerPreset, EMPTY_CONTAINER, isStackNode, newContainer } from './containers';
import { FREE_GAP, FREE_MARGIN } from './instances';
import { setLayout } from './layoutCommands';
import { layoutDropTarget } from './layoutEdit';
import { placementArea } from './placement';
import { DEFAULT_REPEAT, MAX_REPEAT } from './repeat';
import { contentBottom } from './screens';

/** Width of a new container that no stack places (on a free screen: the screen minus margins). */
const FREE_WIDTH = 320;

/**
 * Inserts an empty container of a Layout preset (`vstack`, `hstack`, `grid`, `card`): at `at` (a
 * drop: into the innermost stack under the pointer, at that point) or into the selected container /
 * screen (a click). Selects it, so the next library click goes inside. Returns its id.
 */
export function insertContainer(presetId: string, at?: Vec): Id | null {
  const preset = containerPreset(presetId);
  const { doc } = useDocStore.getState();
  if (!preset || !doc.wireframe) return null;
  let node: GroupNode;
  let target: Target;
  const stack = at ? layoutDropTarget(doc, at) : null;
  if (stack) {
    node = newContainer(preset, { x: 0, y: 0 });
    target = { parentId: stack.containerId, index: stack.index, container: null };
  } else if (at) {
    const frame = frameAt(doc, at);
    if (frame) {
      const width = Math.max(EMPTY_CONTAINER.width, frame.screen.width - 2 * FREE_MARGIN);
      node = newContainer(preset, { x: FREE_MARGIN, y: Math.max(0, Math.round(at.y - frame.transform.y - EMPTY_CONTAINER.height / 2)) }, width);
      target = { parentId: frame.id, container: frame };
    } else {
      node = newContainer(preset, { x: Math.round(at.x - FREE_WIDTH / 2), y: Math.round(at.y - EMPTY_CONTAINER.height / 2) }, FREE_WIDTH);
      target = { parentId: null, container: null };
    }
  } else {
    target = clickTarget(doc);
    const c = target.container;
    if (c?.layout) node = newContainer(preset, { x: 0, y: 0 });
    else if (c && isScreenNode(c)) {
      const bottom = c.children.length ? contentBottom(c) : 0;
      node = newContainer(preset, { x: FREE_MARGIN, y: bottom ? bottom + FREE_GAP : FREE_MARGIN }, Math.max(EMPTY_CONTAINER.width, c.screen.width - 2 * FREE_MARGIN));
    } else {
      const area = placementArea();
      node = newContainer(preset, { x: Math.round(area.x + area.width / 2 - FREE_WIDTH / 2), y: Math.round(area.y + area.height / 2 - EMPTY_CONTAINER.height / 2) }, FREE_WIDTH);
    }
  }
  const [id] = useDocStore.getState().addNodes([node], { parentId: target.parentId, index: target.index, label: `Add ${preset.label.toLowerCase()}` });
  useEditorStore.getState().setSelection([id]);
  return id;
}

/** The selected stack / grid (exactly one, not a screen frame), or null. */
export function selectedContainer(): (GroupNode & { layout: NonNullable<GroupNode['layout']> }) | null {
  const { doc } = useDocStore.getState();
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const n = findNode(doc, sel[0]);
  return n && isStackNode(n) ? n : null;
}

const KIND_LABEL: Record<LayoutKind, string> = { vstack: 'vertical', hstack: 'horizontal', grid: 'grid' };

/** True when a selected container (or a screen with a layout) can become `kind`. */
export function canChangeKind(kind: LayoutKind): boolean {
  const { doc } = useDocStore.getState();
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return false;
  const n = findNode(doc, sel[0]);
  return !!n && n.type === 'group' && !!n.layout && !n.component && n.layout.kind !== kind;
}

/** Object → Change to horizontal / vertical / grid: the selected container keeps its children, gap, padding, style and repeat. */
export function changeKind(kind: LayoutKind): void {
  if (!canChangeKind(kind)) return;
  const id = useEditorStore.getState().selection[0];
  setLayout([id], { kind }, `Change to ${KIND_LABEL[kind]}`);
}

/** Sets a container's style (`none` removes it). */
export function setContainerStyle(ids: Id[], style: ContainerStyle) {
  useDocStore.getState().updateNodes(
    ids,
    (n) => {
      if (n.type !== 'group' || !n.layout || n.screen || n.component) return;
      if (style === 'none') delete n.layout.style;
      else n.layout.style = style;
    },
    { label: 'Container style' },
  );
}

/** Sets a container's corner radius (`none` removes it). */
export function setContainerRadius(ids: Id[], radius: ContainerRadius) {
  useDocStore.getState().updateNodes(
    ids,
    (n) => {
      if (n.type !== 'group' || !n.layout || n.screen || n.component) return;
      if (radius === 'none') delete n.layout.radius;
      else n.layout.radius = radius;
    },
    { label: 'Corner radius' },
  );
}

/**
 * Repeat first item: `count` items (template included), or off (`null`: the copies go, the template
 * stays). One undo step; the pipeline generates or removes the copies in it.
 */
export function setRepeat(ids: Id[], count: number | null) {
  useDocStore.getState().updateNodes(
    ids,
    (n) => {
      if (n.type !== 'group' || !n.layout || n.screen || n.component) return;
      if (count === null) delete n.layout.repeat;
      else n.layout.repeat = { count: Math.max(1, Math.min(MAX_REPEAT, Math.round(count))) };
    },
    { label: count === null ? 'Stop repeating' : 'Repeat first item' },
  );
}

/**
 * Shared components: "Content per instance" on a container inside an instance (its master's container). The
 * edit goes to the master like any other; from then on each instance keeps what it puts there.
 */
export function setSlot(id: Id, on: boolean) {
  useDocStore.getState().updateNodes(
    [id],
    (n) => {
      if (n.type !== 'group' || !n.layout || n.screen || n.component || n.symbol) return;
      if (on) n.layout.slot = true;
      else delete n.layout.slot;
    },
    { label: on ? 'Content per instance' : 'Shared content' },
  );
}

export { DEFAULT_REPEAT, MAX_REPEAT };
