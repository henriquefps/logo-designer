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
        <g transform="translate(17.318 15.059) scale(0.75294)" fill="var(--primary-foreground)" fillRule="evenodd">
          <path d="M44 14L58.16 38.78L58.16 48.118C44.381 48.237 33.344 57.918 27.174 69.649C27.113 69.766 27.053 69.883 26.994 70L12 70Z" opacity="0.45"/>
          <path d="M68 24L106 24C109.314 24 112 26.686 112 30L112 68C112 71.314 109.314 74 106 74L94.653 74C91.681 64.034 83.662 56.071 74.351 51.174C70.416 49.105 66.269 48.606 62 48.293L62 30C62 26.686 64.686 24 68 24Z" opacity="0.7"/>
          <circle cx="60" cy="84" r="32" fill="var(--primary-foreground)"/>
        </g>
      </svg>
    </span>
  );
}
