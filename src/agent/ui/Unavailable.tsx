import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A disabled control with the reason as its tooltip (a disabled button gets no pointer events, so the wrapper is the
 * trigger). With no reason, the child is shown as is.
 */
export function WhyDisabled({ reason, children, side = 'top', className = 'inline-flex' }: { reason: string | null; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; className?: string }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={className} data-agent-unavailable={reason}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-64">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}
