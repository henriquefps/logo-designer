import { getTool } from '@/tools/registry';
import { useEditorStore } from '@/store/useEditorStore';

/** Contextual bar under the menu: the active tool's Options component, or its hint. */
export function OptionsBar() {
  const toolId = useEditorStore((s) => s.tool);
  const tool = getTool(toolId);
  if (!tool) return null;
  const Options = tool.Options;
  return (
    <div className="flex h-11 min-w-0 items-center gap-3 overflow-hidden px-3">
      <span className="shrink-0 text-sm font-medium">{tool.label}</span>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
      {Options ? <Options /> : <span className="truncate text-sm text-muted-foreground">{tool.hint}</span>}
    </div>
  );
}
