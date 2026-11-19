// Flow and screen-status commands for the app (flow handle, arrow selection, New screen, Properties).
// The document logic is in ./flows.ts (shared with the pipeline, the export and the tests); this file
// adds the stores.
import { create } from 'zustand';
import { isScreenNode, type Id, type ScreenStatus, type Vec } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { addFlow, newScreenFromFlow, removeFlow, setFlowLabel, setScreenStatus } from './flows';
import { logicalScreen } from './screens';

export interface FlowDrag {
  /** The source element. */
  fromId: Id;
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
  /** Drop point in document space (the new screen's top-left). */
  point: Vec;
  /** Drop point in canvas pixels (the menu's anchor). */
  screen: Vec;
}

interface FlowUiState {
  /** The selected arrow (exclusive with a node selection). */
  selected: Id | null;
  drag: FlowDrag | null;
  menu: FlowMenu | null;
  select: (id: Id | null) => void;
  setDrag: (drag: FlowDrag | null) => void;
  setMenu: (menu: FlowMenu | null) => void;
}

export const useFlowStore = create<FlowUiState>()((set) => ({
  selected: null,
  drag: null,
  menu: null,
  select: (selected) => set({ selected }),
  setDrag: (drag) => set({ drag }),
  setMenu: (menu) => set({ menu }),
}));

// A node selection replaces an arrow selection.
useEditorStore.subscribe((s, prev) => {
  if (s.selection !== prev.selection && s.selection.length && useFlowStore.getState().selected) useFlowStore.getState().select(null);
});

/** Selects an arrow (clears the node selection). */
export function selectFlow(id: Id | null) {
  if (id) useEditorStore.getState().clearSelection();
  useFlowStore.getState().select(id);
}

const screenName = (to: Id) => logicalScreen(useDocStore.getState().doc, to)?.name ?? 'screen';

export function addFlowCommand(fromId: Id, to: Id): Id | null {
  let id: Id | null = null;
  useDocStore.getState().apply((d) => void (id = addFlow(d, fromId, to)), { label: `Flow to ${screenName(to)}` });
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
export function newScreenFromFlowCommand(fromId: Id, at: Vec): Id | null {
  let frameId: Id | null = null;
  useDocStore.getState().apply((d) => void (frameId = newScreenFromFlow(d, fromId, at)?.frameId ?? null), { label: 'New screen from flow' });
  if (frameId) useEditorStore.getState().setSelection([frameId]);
  return frameId;
}

export function setScreenStatusCommand(frameId: Id, status: ScreenStatus | null) {
  const frame = useDocStore.getState().doc.children.find((n) => n.id === frameId);
  if (!frame || !isScreenNode(frame)) return;
  useDocStore.getState().apply((d) => void setScreenStatus(d, frame.screen.screenId, status), { label: 'Screen status' });
}
