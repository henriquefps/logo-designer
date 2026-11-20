// Flow and screen-status commands for the app (flow handle, arrow selection, New screen, Properties).
// The document logic is in ./flows.ts (shared with the pipeline, the export and the tests); this file
// adds the stores.
import { create } from 'zustand';
import { isScreenNode, type Id, type ScreenStatus, type Vec } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { addFlow, masterRef, newScreenFromFlow, removeFlow, setFlowLabel, setScreenStatus, type AddFlowOptions } from './flows';
import { logicalScreen } from './screens';
import { getSymbol } from './symbols';

export interface FlowDrag {
  /** The source element. */
  fromId: Id;
  /** The part of it the flow starts at (a bottom navigation item), if any. */
  part?: string;
  /** Where the preview line starts (the handle) and where the pointer is, document space. */
  start: Vec;
  point: Vec;
  /** The pointer in canvas pixels. */
  screen: Vec;
  /** The frame the flow would link to on release (null: empty canvas → menu). */
  overFrame: Id | null;
}

export interface FlowMenu {
  fromId: Id;
  part?: string;
  /** Drop point in document space (the new screen's top-left). */
  point: Vec;
  /** Drop point in canvas pixels (the menu's anchor). */
  screen: Vec;
  /**
   * Dropped on a screen from inside a shared component's instance: the logical screen to link, once the person says
   * where the link applies ("This screen only" / "Every screen using Tab bar"). Absent: dropped on empty canvas.
   */
  to?: Id;
}

/** A part of the selected instance under the pointer (its flow handle is shown). */
export interface HoverPart {
  nodeId: Id;
  key: string;
}

interface FlowUiState {
  /** The selected arrow (exclusive with a node selection). */
  selected: Id | null;
  drag: FlowDrag | null;
  menu: FlowMenu | null;
  hoverPart: HoverPart | null;
  select: (id: Id | null) => void;
  setDrag: (drag: FlowDrag | null) => void;
  setMenu: (menu: FlowMenu | null) => void;
  setHoverPart: (part: HoverPart | null) => void;
}

export const useFlowStore = create<FlowUiState>()((set) => ({
  selected: null,
  drag: null,
  menu: null,
  hoverPart: null,
  select: (selected) => set({ selected }),
  setDrag: (drag) => set({ drag }),
  setMenu: (menu) => set({ menu }),
  setHoverPart: (hoverPart) => set((s) => (s.hoverPart?.nodeId === hoverPart?.nodeId && s.hoverPart?.key === hoverPart?.key ? s : { hoverPart })),
}));

/**
 * The shared component a flow from `fromId` could be defined in (`fromId` is inside one of its instances), for the
 * "This screen only" / "Every screen using Tab bar" choice. Null outside instances.
 */
export function sharedScope(fromId: Id): { symbolId: Id; name: string } | null {
  const doc = useDocStore.getState().doc;
  const ref = masterRef(doc, fromId);
  const s = ref ? getSymbol(doc, ref.symbol) : null;
  return s ? { symbolId: s.id, name: s.name } : null;
}

// A node selection replaces an arrow selection.
useEditorStore.subscribe((s, prev) => {
  if (s.selection !== prev.selection && s.selection.length && useFlowStore.getState().selected) useFlowStore.getState().select(null);
  // A hovered part belongs to the selected instance.
  if (s.selection !== prev.selection && useFlowStore.getState().hoverPart) useFlowStore.getState().setHoverPart(null);
});

/** Selects an arrow (clears the node selection). */
export function selectFlow(id: Id | null) {
  if (id) useEditorStore.getState().clearSelection();
  useFlowStore.getState().select(id);
}

const screenName = (to: Id) => logicalScreen(useDocStore.getState().doc, to)?.name ?? 'screen';

export function addFlowCommand(fromId: Id, to: Id, opts: AddFlowOptions = {}): Id | null {
  let id: Id | null = null;
  useDocStore.getState().apply((d) => void (id = addFlow(d, fromId, to, undefined, opts)), { label: `Flow to ${screenName(to)}` });
  return id;
}

export function removeFlowCommand(flowId: Id) {
  useDocStore.getState().apply((d) => void removeFlow(d, flowId), { label: 'Remove flow' });
  if (useFlowStore.getState().selected === flowId) useFlowStore.getState().select(null);
}

export function setFlowLabelCommand(flowId: Id, label: string) {
  const flow = useDocStore.getState().doc.wireframe?.flows?.find((f) => f.id === flowId);
  if (!flow || (flow.label ?? '') === label.trim()) return;
  useDocStore.getState().apply((d) => void setFlowLabel(d, flowId, label), { label: 'Flow label' });
}

/** Menu → New screen: a frame at the drop point, named after the source, linked by a flow; selects it. */
export function newScreenFromFlowCommand(fromId: Id, at: Vec, opts: AddFlowOptions = {}): Id | null {
  let frameId: Id | null = null;
  useDocStore.getState().apply((d) => void (frameId = newScreenFromFlow(d, fromId, at, opts)?.frameId ?? null), { label: 'New screen from flow' });
  if (frameId) useEditorStore.getState().setSelection([frameId]);
  return frameId;
}

export function setScreenStatusCommand(frameId: Id, status: ScreenStatus | null) {
  const frame = useDocStore.getState().doc.children.find((n) => n.id === frameId);
  if (!frame || !isScreenNode(frame)) return;
  useDocStore.getState().apply((d) => void setScreenStatus(d, frame.screen.screenId, status), { label: 'Screen status' });
}
