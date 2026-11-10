// Creating icon documents (New document → App icon) and toggling icon mode on the open one.
import { iconPresetDef } from '@/icon';
import type { DesignDocument, IconDocInfo, IconPreset } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';

/** Preset that matches an artboard size (used when an existing document becomes an icon). */
export function presetForArtboard(width: number, height: number): IconPreset {
  if (width !== height) return 'app-icon';
  if (width === 108) return 'android-adaptive';
  if (width === 1024) return 'ios';
  if (width === 32) return 'favicon-32';
  if (width === 16) return 'favicon-16';
  return 'app-icon';
}

/** New icon document (or the still-empty first document, reused). */
export async function createIconDocument(preset: IconPreset) {
  const def = iconPresetDef(preset);
  const icon: IconDocInfo = { preset, shape: 'auto' };
  const name = preset === 'app-icon' ? 'App icon' : def.label;
  const ds = useDocStore.getState();
  const pristine = ds.doc.children.length === 0 && ds.past.length === 0 && ds.future.length === 0;
  if (!pristine) await useProjectsStore.getState().create(name, { width: def.size, height: def.size });
  const doc = useDocStore.getState().doc;
  const next: DesignDocument = {
    ...doc,
    name: pristine && doc.name !== 'Untitled' ? doc.name : name,
    artboard: { ...doc.artboard, width: def.size, height: def.size, background: { kind: 'none' } },
    icon,
    updatedAt: Date.now(),
  };
  // A fresh document: replace it without an undo step, then save it right away.
  useDocStore.getState().load(next);
  useEditorStore.getState().setPanelTab('properties');
  useEditorStore.getState().fitRect({ x: 0, y: 0, width: def.size, height: def.size });
  await useProjectsStore.getState().rename(next.id, next.name);
  await useProjectsStore.getState().flush();
}

/** Marks the open document as an app icon (undoable). */
export function makeIconDocument() {
  const { doc, apply } = useDocStore.getState();
  if (doc.icon) return;
  const preset = presetForArtboard(doc.artboard.width, doc.artboard.height);
  apply(
    (d) => {
      d.icon = { preset, shape: 'auto' };
    },
    { label: 'Make app icon document' },
  );
  useEditorStore.getState().clearSelection();
  useEditorStore.getState().setPanelTab('properties');
}

/** Leaves icon mode (undoable): the artwork stays as it is. */
export function leaveIconMode() {
  useDocStore.getState().apply(
    (d) => {
      delete d.icon;
    },
    { label: 'Leave app icon mode' },
  );
}

export function setIconInfo(patch: Partial<IconDocInfo>, label: string) {
  useDocStore.getState().apply(
    (d) => {
      if (!d.icon) return;
      Object.assign(d.icon, patch);
      for (const k of Object.keys(patch) as (keyof IconDocInfo)[]) if (patch[k] === undefined) delete d.icon[k];
    },
    { label },
  );
}
