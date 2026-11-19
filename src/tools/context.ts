import { hitTest } from '@/model';
import { screenLabelAt } from '@/wireframe/screens';
import { LABEL_STRIP_PX } from '@/wireframe/canvas/labels';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { getTool } from './registry';
import type { ToolContext } from './types';

export const HIT_TOLERANCE_PX = 4;

export function switchTool(id: string) {
  const ed = useEditorStore.getState();
  const tool = getTool(id);
  if (ed.tool === id || !tool || (tool.when && !tool.when(useDocStore.getState().doc))) return;
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
  hitTest: (point, opts) => {
    const doc = useDocStore.getState().doc;
    const zoom = useEditorStore.getState().zoom;
    // A screen's name label (wireframe documents) picks the frame, like Figma: the way to grab a
    // screen whose content covers it.
    const label = doc.wireframe ? screenLabelAt(doc, point, LABEL_STRIP_PX / zoom) : null;
    if (label) return label;
    return hitTest(doc, point, { deep: opts?.deep, tolerance: (opts?.tolerancePx ?? HIT_TOLERANCE_PX) / zoom });
  },
  setTool: switchTool,
};
