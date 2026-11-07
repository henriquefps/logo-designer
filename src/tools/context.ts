import { hitTest } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { getTool } from './registry';
import type { ToolContext } from './types';

export const HIT_TOLERANCE_PX = 4;

export function switchTool(id: string) {
  const ed = useEditorStore.getState();
  if (ed.tool === id || !getTool(id)) return;
  const prev = getTool(ed.tool);
  prev?.onCancel?.(toolContext);
  prev?.onDeactivate?.(toolContext);
  ed.setTool(id);
  const next = getTool(id)!;
  useEditorStore.getState().setCursor(next.cursor);
  next.onActivate?.(toolContext);
}

export const toolContext: ToolContext = {
  doc: () => useDocStore.getState().doc,
  docStore: () => useDocStore.getState(),
  editor: () => useEditorStore.getState(),
  px: () => 1 / useEditorStore.getState().zoom,
  hitTest: (point, opts) =>
    hitTest(useDocStore.getState().doc, point, {
      deep: opts?.deep,
      tolerance: (opts?.tolerancePx ?? HIT_TOLERANCE_PX) / useEditorStore.getState().zoom,
    }),
  setTool: switchTool,
};
