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
      {/* Same glyph as the app icon (scripts/glyph.svg). */}
      <svg viewBox="0 0 128 128" className="size-6 shrink-0" aria-hidden="true">
        <rect width="128" height="128" rx="28" fill="var(--primary)" />
        <g transform="translate(14 14) scale(0.78125)" stroke="var(--primary-foreground)" fill="none" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 102 H110" opacity={0.7} />
          <path d="M64 100 L38 60 C38 46 46 36 54 32 H74 C82 36 90 46 90 60 Z" />
          <path d="M64 100 V74" />
          <path d="M50 16 H78" />
          <g fill="var(--primary-foreground)" stroke="none">
            <rect x="8" y="92" width="20" height="20" rx="4" />
            <rect x="100" y="92" width="20" height="20" rx="4" />
            <circle cx="64" cy="60" r="6" />
          </g>
        </g>
      </svg>
    </span>
  );
}
