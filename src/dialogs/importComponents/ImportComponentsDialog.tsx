// Library → My components → Import from project…: pick a source (component kits first: kit samples and projects
// marked "Use as component kit"; then the other local projects with shared components), tick its components (all by default) and import them into the open wireframe.
// Logic: src/wireframe/symbolImportCommands.ts (app) and src/wireframe/symbolImport.ts (pure).
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import type { DesignDocument, Id } from '@/model';
import { SymbolName, SymbolPreview } from '@/panels/assets/sources/wireframe/SymbolPreview';
import { componentSources, importComponentsCommand, loadImportSource, sourceKey as key, type ImportSourceRef } from '@/wireframe/symbolImportCommands';
import { withNested } from '@/wireframe/symbolImport';
import { cn } from '@/lib/utils';

export function ImportComponentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [sources, setSources] = useState<ImportSourceRef[] | null>(null);
  const [picked, setPicked] = useState<string>('');
  // The source read for `picked` (null doc: it could not be read); another key = still loading.
  const [loaded, setLoaded] = useState<{ key: string; doc: DesignDocument | null } | null>(null);
  const [checked, setChecked] = useState<Set<Id>>(new Set());

  // The sources: kits, then the local projects that have shared components (each project is read once).
  useEffect(() => {
    if (!open) return;
    let live = true;
    void componentSources({ excludeActive: true }).then((list) => {
      if (!live) return;
      setSources(list);
      setPicked((p) => (p && list.some((r) => key(r) === p) ? p : list[0] ? key(list[0]) : ''));
    });
    return () => {
      live = false;
    };
  }, [open]);

  useEffect(() => {
    const ref = sources?.find((r) => key(r) === picked);
    if (!ref) return;
    let live = true;
    void loadImportSource(ref).then((d) => {
      if (!live) return;
      setLoaded({ key: key(ref), doc: d });
      setChecked(new Set((d?.wireframe?.symbols ?? []).map((s) => s.id)));
    });
    return () => {
      live = false;
    };
  }, [picked, sources]);

  const doc = loaded?.key === picked ? loaded.doc : null;
  const loading = !!picked && loaded?.key !== picked;
  const symbols = useMemo(() => doc?.wireframe?.symbols ?? [], [doc]);
  // Masters a ticked one nests come along anyway: the import brings `implied` (ticked + nested), not just the ticked.
  const implied = useMemo(() => new Set(withNested(symbols, [...checked]).map((s) => s.id)), [symbols, checked]);
  const along = implied.size - checked.size;
  const kits = sources?.filter((r) => r.kit) ?? [];
  const projects = sources?.filter((r) => !r.kit) ?? [];

  const toggle = (id: Id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    if (!doc || !checked.size) return;
    importComponentsCommand(doc, [...checked]);
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Import components</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Copies shared components from a component kit or another project into My components. Ones this project already has are reused, not duplicated.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-components-source">From</Label>
            {sources && !sources.length ? (
              <p className="text-sm text-muted-foreground">No other project has shared components yet.</p>
            ) : (
              <Select value={picked} onValueChange={setPicked} disabled={!sources}>
                <SelectTrigger id="import-components-source" className="w-full" data-testid="import-components-source">
                  <SelectValue placeholder={sources ? 'Choose a project' : 'Looking for projects…'} />
                </SelectTrigger>
                <SelectContent>
                  {kits.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Component kits</SelectLabel>
                      {kits.map((r) => (
                        <SelectItem key={key(r)} value={key(r)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {projects.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Your projects</SelectLabel>
                      {projects.map((r) => (
                        <SelectItem key={key(r)} value={key(r)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          {picked && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Components</span>
                {symbols.length > 0 && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setChecked(checked.size === symbols.length ? new Set() : new Set(symbols.map((s) => s.id)))}>
                    {checked.size === symbols.length ? 'Select none' : 'Select all'}
                  </button>
                )}
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !doc ? (
                <p className="text-sm text-muted-foreground">Could not read this project.</p>
              ) : !symbols.length ? (
                <p className="text-sm text-muted-foreground">This project has no shared components.</p>
              ) : (
                <ul className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3" data-testid="import-components-list">
                  {symbols.map((s) => {
                    const on = checked.has(s.id);
                    const along = !on && implied.has(s.id);
                    return (
                      <li key={s.id}>
                        <label className={cn('relative flex h-full cursor-pointer flex-col gap-1.5 rounded-md border bg-card p-1.5 hover:border-ring', on && 'border-primary bg-primary/5')}>
                          <span className="flex h-20 items-center overflow-hidden rounded-sm border bg-white">
                            <SymbolPreview symbol={s} symbols={symbols} className="max-h-full" />
                          </span>
                          {/* On the preview's corner: the name below gets the card's whole width. */}
                          <input type="checkbox" checked={on} onChange={() => toggle(s.id)} aria-label={s.name} className="absolute top-2.5 left-2.5 size-3.5 accent-primary" />
                          <SymbolName name={s.name} className="px-0.5" />
                          {along && <span className="px-0.5 text-xs text-muted-foreground">Comes along (used inside another)</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!doc || !checked.size} data-testid="import-components-submit">
            {checked.size ? `Import ${implied.size}${along ? ` (${along} come${along === 1 ? 's' : ''} along)` : ''}` : 'Import'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
