import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Centered Dialog on desktop, bottom Sheet below 768px (hfps-app-ui form-dialog rule).
const MobileCtx = createContext(false);

export function ResponsiveDialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  const mobile = useIsMobile();
  const Root = mobile ? Sheet : Dialog;
  return (
    <MobileCtx.Provider value={mobile}>
      <Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    </MobileCtx.Provider>
  );
}

export function ResponsiveDialogContent({ className, children }: { className?: string; children: ReactNode }) {
  const mobile = useContext(MobileCtx);
  if (mobile) {
    return (
      <SheetContent side="bottom" className={cn('max-h-[92dvh] gap-0 rounded-t-xl p-0', className)}>
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
        {children}
      </SheetContent>
    );
  }
  return <DialogContent className={cn('flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 p-0', className)}>{children}</DialogContent>;
}

export function ResponsiveDialogHeader({ children }: { children: ReactNode }) {
  const mobile = useContext(MobileCtx);
  const H = mobile ? SheetHeader : DialogHeader;
  return <H className="shrink-0 p-6 pb-4 text-left">{children}</H>;
}

export function ResponsiveDialogTitle({ children }: { children: ReactNode }) {
  const mobile = useContext(MobileCtx);
  const T = mobile ? SheetTitle : DialogTitle;
  return <T className="text-lg font-semibold">{children}</T>;
}

export function ResponsiveDialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  const mobile = useContext(MobileCtx);
  const D = mobile ? SheetDescription : DialogDescription;
  return <D className={className}>{children}</D>;
}

export function ResponsiveDialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4', className)}>{children}</div>;
}

export function ResponsiveDialogFooter({ children }: { children: ReactNode }) {
  const mobile = useContext(MobileCtx);
  if (mobile) {
    return (
      <SheetFooter className="shrink-0 flex-col gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&_button]:h-11 [&_button]:w-full">
        {children}
      </SheetFooter>
    );
  }
  return <DialogFooter className="shrink-0 border-t px-6 py-4">{children}</DialogFooter>;
}
