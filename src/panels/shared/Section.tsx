import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A titled block inside a panel, separated by a hairline. */
export function Section({ title, actions, children, className }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3 border-b px-4 py-3 last:border-b-0', className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Label + control row. */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}
