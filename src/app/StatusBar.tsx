import { CloudCheckIcon, CloudArrowUpIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { findNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { runAction } from '@/actions/registry';

const fmt = (n: number) => Math.round(n).toString();

export function SaveIndicator() {
  const state = useProjectsStore((s) => s.saveState);
  if (state === 'error')
    return (
      <span className="flex items-center gap-1 text-destructive">
        <WarningCircleIcon className="size-4" /> Not saved
      </span>
    );
  if (state === 'pending' || state === 'saving')
    return (
      <span className="flex items-center gap-1">
        <CloudArrowUpIcon className="size-4" /> Saving…
      </span>
    );
  return (
    <span className="flex items-center gap-1">
      <CloudCheckIcon className="size-4" /> Saved
    </span>
  );
}

export function StatusBar() {
  const zoom = useEditorStore((s) => s.zoom);
  const pointer = useEditorStore((s) => s.pointer);
  const selection = useEditorStore((s) => s.selection);
  const doc = useDocStore((s) => s.doc);
  const selLabel =
    selection.length === 0
      ? 'No selection'
      : selection.length === 1
        ? (findNode(doc, selection[0])?.name ?? '1 object')
        : `${selection.length} objects`;
  return (
    <div className="flex h-8 items-center gap-4 px-3 text-xs text-muted-foreground tabular-nums">
      <button type="button" className="rounded-sm px-1 hover:text-foreground" onClick={() => runAction('view.fit')} title="Fit artboard">
        {Math.round(zoom * 100)}%
      </button>
      <span className="w-28">{pointer ? `X ${fmt(pointer.x)}  Y ${fmt(pointer.y)}` : ''}</span>
      <span className="min-w-0 flex-1 truncate">{selLabel}</span>
      <span>
        {doc.artboard.width} × {doc.artboard.height}
      </span>
      <SaveIndicator />
    </div>
  );
}
