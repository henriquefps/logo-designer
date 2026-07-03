import { useEffect, useState } from 'react';
import { KeyboardIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: [string, string][] = [
  [`${mod} Z`, 'Undo'],
  [`${mod} Shift Z`, 'Redo'],
  [`${mod} A`, 'Select all'],
  [`${mod} D`, 'Duplicate selection'],
  ['Delete / Backspace', 'Remove selection'],
  ['Arrow keys', 'Nudge selection (1px)'],
  ['Shift + Arrow keys', 'Nudge selection (10px)'],
  ['Escape', 'Deselect / cancel drawing'],
  ['Space + drag', 'Pan canvas'],
  ['Scroll / pinch', 'Zoom canvas'],
];

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '?' && !isEditableTarget(e.target)) setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <KeyboardIcon className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
