import { CaretDownIcon } from '@phosphor-icons/react';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';

/** Current project name; opens the Projects dialog. */
export function ProjectTitle() {
  const name = useDocStore((s) => s.doc.name);
  return (
    <button
      type="button"
      className="flex h-9 min-w-0 items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={() => useEditorStore.getState().openDialog('projects')}
      title="Projects"
    >
      <span className="truncate">{name}</span>
      <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function AppMark() {
  return (
    <span className="flex items-center gap-2 px-1.5" aria-label="Designer">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="var(--primary)" />
        <path d="M7 17 L12 6 L17 17 M9.2 13 H14.8" fill="none" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
