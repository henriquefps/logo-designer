import { Kbd } from '@/components/ui/kbd';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { formatShortcut, getActions, MENUS } from '@/actions/registry';
import { getTools } from '@/tools/registry';

const EXTRA = [
  { label: 'Nudge selection (Shift ×10)', keys: ['←↑→↓'] },
  { label: 'Pan', keys: ['Space + drag'] },
  { label: 'Zoom', keys: [formatShortcut('mod+') + 'scroll', 'Pinch'] },
  { label: 'Constrain (draw, move, rotate 15°)', keys: ['Shift'] },
  { label: 'Resize: invert Keep proportions (corner and side handles)', keys: ['Shift + drag handle'] },
  { label: 'Resize from center / duplicate while moving', keys: ['Alt'] },
  { label: 'Select inside groups / no snapping', keys: [formatShortcut('mod+').replace(/\+$/, '')] },
  { label: 'Step into a group (select a child)', keys: ['Double-click'] },
  { label: 'Object actions', keys: ['Right-click'] },
  { label: 'Cancel', keys: ['Esc'] },
];

const PATHS = [
  { label: 'Edit points of the selected path', keys: ['↵', 'Double-click'] },
  { label: 'Pen: curve point / break handles', keys: ['Drag', 'Alt + drag'] },
  { label: 'Pen: close / finish path', keys: ['Click first point', '↵'] },
  { label: 'Node edit: add / delete point', keys: ['Click segment', 'Del'] },
  { label: 'Node edit: corner ↔ smooth', keys: ['Double-click anchor'] },
  { label: 'Node edit: corner handle', keys: ['Alt + drag handle'] },
];

/** Generated from the tool and action registries, so new commands show up automatically. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const sections = new Map<string, { label: string; keys: string[] }[]>();
  sections.set(
    'Tools',
    getTools()
      .filter((t) => t.shortcut)
      .map((t) => ({ label: t.label, keys: [t.shortcut!.toUpperCase()] })),
  );
  for (const a of getActions()) {
    if (!a.shortcut || a.id.startsWith('nudge.')) continue;
    const name = a.section ?? MENUS.find((m) => m.id === a.menu)?.label ?? 'Other';
    const list = Array.isArray(a.shortcut) ? a.shortcut : [a.shortcut];
    sections.set(name, [...(sections.get(name) ?? []), { label: a.label, keys: list.map(formatShortcut) }]);
  }
  sections.set('Canvas', EXTRA);
  sections.set('Pen & points', PATHS);
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Keyboard shortcuts</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Illustrator-style keys. ⌘ is Ctrl on Windows and Linux.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {[...sections.entries()].map(([name, items]) => (
            <section key={name} className="flex flex-col gap-1">
              <h3 className="eyebrow pb-1">{name}</h3>
              {items.map((it) => (
                <div key={it.label} className="flex min-h-8 items-center justify-between gap-3 text-sm">
                  <span>{it.label}</span>
                  <span className="flex shrink-0 gap-1">
                    {it.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </ResponsiveDialogBody>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
