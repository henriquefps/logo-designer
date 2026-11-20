// Wireframe commands for the app (New document → Wireframe, add screen, Duplicate as…). The
// document logic is in ./screens.ts (shared with the CLI); this file adds the stores.
import { isScreenNode, platformDef, type DesignDocument, type Id, type ScreenNode, type ScreenPlatform } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { addScreen, duplicateScreenAs, freePlatforms } from './screens';
import { fitTarget } from './view';

/** The empty wireframe document: no artboard in use, one phone screen. */
export function newWireframeDocument(base: DesignDocument, name = 'Wireframe', platform: ScreenPlatform = 'phone'): DesignDocument {
  const doc: DesignDocument = {
    ...base,
    name,
    artboard: { ...base.artboard, background: { kind: 'none' } },
    children: [],
    wireframe: { screens: [] },
    updatedAt: Date.now(),
  };
  delete doc.icon;
  addScreen(doc, { platform, x: 0, y: 0 });
  return doc;
}

/** New document → Wireframe (or the still-empty first document, reused): one screen of `platform` (phone by default). */
export async function createWireframeDocument(options: { name?: string; platform?: ScreenPlatform } = {}) {
  const wanted = options.name?.trim();
  const ds = useDocStore.getState();
  const pristine = ds.doc.children.length === 0 && ds.past.length === 0 && ds.future.length === 0;
  if (!pristine) await useProjectsStore.getState().create(wanted || 'Wireframe');
  const doc = useDocStore.getState().doc;
  const name = wanted || (pristine && doc.name !== 'Untitled' ? doc.name : 'Wireframe');
  const next = newWireframeDocument(doc, name, options.platform ?? 'phone');
  // A fresh document: replace it without an undo step (load runs the pipeline), then save it.
  useDocStore.getState().load(next);
  useEditorStore.getState().setSelection([]);
  useEditorStore.getState().setPanelTab('properties');
  useEditorStore.getState().fitRect(fitTarget(useDocStore.getState().doc));
  await useProjectsStore.getState().rename(next.id, next.name);
  await useProjectsStore.getState().flush();
}

/** The selected screen frame (exactly one selected object that is a frame), or null. */
export function selectedScreen(): ScreenNode | null {
  const { doc } = useDocStore.getState();
  const sel = useEditorStore.getState().selection;
  if (!doc.wireframe || sel.length !== 1) return null;
  const n = doc.children.find((c) => c.id === sel[0]);
  return n && isScreenNode(n) ? n : null;
}

/** Adds a new logical screen with one frame (at `at`, top-left, or right of everything) and selects it. */
export function addScreenCommand(platform: ScreenPlatform, at?: { x: number; y: number }): Id | null {
  if (!useDocStore.getState().doc.wireframe) return null;
  let id: Id | null = null;
  useDocStore.getState().apply(
    (d) => {
      id = addScreen(d, { platform, ...(at ? { x: Math.round(at.x), y: Math.round(at.y) } : {}) });
    },
    { label: `Add ${platformDef(platform).label.toLowerCase()} screen` },
  );
  if (id) useEditorStore.getState().setSelection([id]);
  return id;
}

/** "Duplicate as <platform>" for the selected screen. Returns the new frame id. */
export function duplicateSelectedScreenAs(platform: ScreenPlatform): Id | null {
  const frame = selectedScreen();
  if (!frame) return null;
  let id: Id | null = null;
  useDocStore.getState().apply(
    (d) => {
      id = duplicateScreenAs(d, frame.id, platform);
    },
    { label: `Duplicate as ${platformDef(platform).label.toLowerCase()}` },
  );
  if (id) {
    useEditorStore.getState().setSelection([id]);
    const f = useDocStore.getState().doc.children.find((n) => n.id === id);
    if (f && isScreenNode(f)) revealRect({ x: f.transform.x, y: f.transform.y, width: f.screen.width, height: f.screen.height });
  }
  return id;
}

/** Platforms the selected screen can still be duplicated as. */
export function duplicatablePlatforms(): ScreenPlatform[] {
  const frame = selectedScreen();
  return frame ? freePlatforms(useDocStore.getState().doc, frame.screen.screenId) : [];
}

/**
 * Changes a frame's platform (its width becomes the platform width). Refused when the logical
 * screen already has a frame for that platform.
 */
export function setScreenPlatform(frameId: Id, platform: ScreenPlatform): boolean {
  const { doc } = useDocStore.getState();
  const frame = doc.children.find((n) => n.id === frameId);
  if (!frame || !isScreenNode(frame) || frame.screen.platform === platform) return false;
  if (!freePlatforms(doc, frame.screen.screenId).includes(platform)) return false;
  useDocStore.getState().apply(
    (d) => {
      const f = d.children.find((n) => n.id === frameId);
      if (!f || f.type !== 'group' || !f.screen) return;
      f.screen.platform = platform;
      f.screen.width = platformDef(platform).width;
    },
    { label: 'Screen platform' },
  );
  return true;
}

/** Pans (and zooms out if needed) so `r` is visible. */
function revealRect(r: { x: number; y: number; width: number; height: number }) {
  const ed = useEditorStore.getState();
  const { width, height } = ed.viewport;
  if (!width || !height) return;
  const a = ed.screenToDoc({ x: 0, y: 0 });
  const b = ed.screenToDoc({ x: width, y: height });
  const inside = r.x >= a.x && r.y >= a.y && r.x + r.width <= b.x && r.y + r.height <= b.y;
  if (inside) return;
  ed.fitRect(fitTarget(useDocStore.getState().doc));
}
