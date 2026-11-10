import { useEditorStore } from '@/store/useEditorStore';
import { useDocStore } from '@/store/useDocStore';
import { topmostIds } from '@/model';
import { LinkSimpleBreakIcon, LinkSimpleIcon } from '@phosphor-icons/react';
import { Toggle } from '@/components/ui/toggle';
import { AlignButtons } from '@/panels/shared/AlignButtons';

/** Options bar for the select tool: quick align/distribute for the selection. */
export function SelectOptions() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useDocStore((s) => s.doc);
  const keep = useEditorStore((s) => s.keepProportions);
  if (!selection.length) return <span className="text-sm text-muted-foreground">Click to select, drag to move. Shift adds to the selection.</span>;
  const ids = topmostIds(doc, selection);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
        {ids.length} selected
      </span>
      <AlignButtons ids={ids} compact />
      <Toggle
        size="sm"
        pressed={keep}
        onPressedChange={(on) => useEditorStore.getState().setViewPrefs({ keepProportions: on })}
        aria-label="Keep proportions"
        title="Keep proportions (Shift while dragging a handle inverts it)"
      >
        {keep ? <LinkSimpleIcon /> : <LinkSimpleBreakIcon />}
      </Toggle>
    </div>
  );
}
