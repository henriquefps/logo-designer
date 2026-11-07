import { DotsThreeIcon, PencilSimpleIcon, TrashIcon, UploadSimpleIcon, WarningIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { createText, rectCenter, type TextNode } from '@/model';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  BUNDLED_FAMILIES,
  FALLBACK_FAMILY,
  findFamily,
  missingFamilies,
  removeUpload,
  renameFamily,
  reportUpload,
  uploadFontFiles,
  useFontStore,
  type FontFamilyInfo,
} from '@/fonts';
import { documentFamilies, replaceFamilyInDocument } from '@/fonts/docFonts';
import { FontFamilyPicker, FontPreviewName } from '@/fonts/ui/FontFamilyPicker';
import { nearestWeight, weightLabel } from '@/fonts/weights';
import { pickFiles } from '@/io/download';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';

const ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';

const CATEGORY: Record<string, string> = { sans: 'Sans serif', serif: 'Serif', display: 'Display', script: 'Script', mono: 'Monospace' };

/** Applies a family to the selected texts, or adds a sample text in that font at the artboard center. */
function applyFamily(family: FontFamilyInfo) {
  const ds = useDocStore.getState();
  const ed = useEditorStore.getState();
  const texts = ed.selection.map((id) => ds.findNode(id)).filter((n): n is TextNode => n?.type === 'text' && !n.locked);
  if (texts.length) {
    ds.updateNodes(
      texts.map((t) => t.id),
      (n) => {
        if (n.type !== 'text') return;
        n.fontFamily = family.family;
        n.fontWeight = nearestWeight(family, n.fontWeight);
      },
      { label: 'Font' },
    );
    return;
  }
  const ab = ds.doc.artboard;
  const c = rectCenter({ x: 0, y: 0, width: ab.width, height: ab.height });
  const fontSize = Math.round(Math.min(ab.width, ab.height) / 10);
  const node = createText({
    text: family.family,
    fontFamily: family.family,
    fontWeight: nearestWeight(family, 400),
    fontSize,
    align: 'center',
    transform: { x: c.x, y: c.y - (fontSize * 1.2) / 2 },
  });
  ds.addNodes([node], { label: 'Add text' });
  ed.setSelection([node.id]);
}

export function FontsSource() {
  const uploads = useFontStore((s) => s.uploads);
  const ready = useFontStore((s) => s.uploadsReady);
  const doc = useDocStore((s) => s.doc);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const uploadedFamilies = useMemo(() => {
    const map = new Map<string, typeof uploads>();
    for (const u of uploads) map.set(u.family, [...(map.get(u.family) ?? []), u]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [uploads]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when uploads change too
  const missing = useMemo(() => (ready ? missingFamilies(documentFamilies(doc)) : []), [doc, ready, uploads]);

  const upload = async () => {
    const files = await pickFiles(ACCEPT, true);
    if (!files.length) return;
    setBusy(true);
    try {
      reportUpload(await uploadFontFiles(files));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (from: string, to: string) => {
    setRenaming(null);
    try {
      const name = await renameFamily(from, to);
      if (name) replaceFamilyInDocument(from, name, 'Rename font');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename the font.');
    }
  };

  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-2 border-b px-4 py-3">
        <Button variant="outline" className="h-8 w-full" disabled={busy} onClick={() => void upload()}>
          <UploadSimpleIcon data-icon="inline-start" />
          {busy ? 'Adding fonts…' : 'Upload fonts'}
        </Button>
        <p className="text-xs text-muted-foreground">TTF, OTF, WOFF or WOFF2. You can also drop font files on the canvas. Fonts stay in this browser.</p>
      </section>

      {missing.length > 0 && (
        <section className="flex flex-col gap-3 border-b px-4 py-3" aria-label="Missing fonts">
          <h3 className="eyebrow flex items-center gap-1.5">
            <WarningIcon className="text-warning" /> Missing in this project
          </h3>
          {missing.map((m) => (
            <div key={m} className="flex flex-col gap-1.5">
              <span className="truncate text-sm font-medium" title={m}>
                {m}
              </span>
              <FontFamilyPicker
                value={m}
                onChange={(f) => {
                  const n = replaceFamilyInDocument(m, f);
                  toast.success(`Replaced “${m}” with ${f} in ${n} text${n === 1 ? '' : 's'}.`);
                }}
              />
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col border-b py-3" aria-label="Uploaded fonts">
        <h3 className="eyebrow px-4 pb-1">Uploaded</h3>
        {uploadedFamilies.length === 0 && <p className="px-4 py-2 text-sm text-muted-foreground">No uploaded fonts yet.</p>}
        <ul className="flex flex-col">
          {uploadedFamilies.map(([family, faces]) => (
            <li key={family} className="flex items-center gap-2 py-1.5 pr-2 pl-4 hover:bg-muted/50">
              {renaming === family ? (
                <input
                  autoFocus
                  aria-label="Font name"
                  defaultValue={family}
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  onBlur={(e) => void rename(family, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={() => findFamily(family) && applyFamily(findFamily(family)!)}>
                  <FontPreviewName family={family} className="max-w-full text-base" />
                  <span className="max-w-full truncate text-xs text-muted-foreground" title={faces.map((f) => f.fileName).join(', ')}>
                    {faces.map((f) => (f.weight[0] === f.weight[1] ? weightLabel(f.weight[0]) : `Variable ${f.weight[0]}–${f.weight[1]}`) + (f.style === 'italic' ? ' italic' : '')).join(' · ')}
                  </span>
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${family}`}>
                    <DotsThreeIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setRenaming(family)}>
                    <PencilSimpleIcon />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(family)}>
                    <TrashIcon />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col py-3" aria-label="Bundled fonts">
        <h3 className="eyebrow px-4 pb-1">Included</h3>
        <p className="px-4 pb-2 text-xs text-muted-foreground">Click a font to use it on the selected text, or to add a sample.</p>
        <ul className="flex flex-col">
          {BUNDLED_FAMILIES.map((f) => (
            <li key={f.family}>
              <button type="button" className="flex w-full min-w-0 items-center gap-2 px-4 py-1.5 text-left hover:bg-muted/50" onClick={() => applyFamily(f)}>
                <FontPreviewName family={f.family} className="min-w-0 flex-1 text-base" />
                <span className="shrink-0 text-xs text-muted-foreground">{f.category ? CATEGORY[f.category] : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the font from this browser. Texts that use it will show {FALLBACK_FAMILY} instead until you upload it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const faces = uploads.filter((u) => u.family === deleting);
                setDeleting(null);
                void Promise.all(faces.map((f) => removeUpload(f.id)));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
