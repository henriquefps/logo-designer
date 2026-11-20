// A sample as a card: thumbnail, "Sample: <name>", its one-line description. Used by New document (the
// mode's step) and Help → Open sample project….
import { cn } from '@/lib/utils';
import { publicUrl } from './open';
import type { SampleDef } from './registry';

export function SampleCard({ sample, onOpen, disabled, className }: { sample: SampleDef; onOpen: (s: SampleDef) => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      data-sample={sample.id}
      disabled={disabled}
      onClick={() => onOpen(sample)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border bg-card p-2.5 text-left outline-none transition-colors',
        'hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        <img src={publicUrl(sample.thumbnail)} alt="" className="size-full object-cover object-top" loading="lazy" decoding="async" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">Sample: {sample.name}</span>
        <span className="text-sm text-muted-foreground">{sample.description}</span>
      </span>
    </button>
  );
}
