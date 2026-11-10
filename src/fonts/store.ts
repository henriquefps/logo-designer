import { create } from 'zustand';
import type { TextNode } from '@/model';
import { newId } from '@/model';
import { BUNDLED_FAMILIES, bundledUrl, canonicalFamily } from './catalog';
import { chooseFace, type FaceChoice } from './layout';
import { inspectFont, parseFont, type LoadedFont } from './parse';
import { recordDeletion } from '@/sync/state';
import { deleteUpload, listUploads, readUploadData, renameUploadFamily, saveUpload, type UploadedFace } from './uploads';
import { FALLBACK_FAMILY, type FontFaceInfo, type FontFamilyInfo } from './types';

/**
 * Font registry: bundled + uploaded families, lazy loading (FontFace for the canvas, opentype.js
 * for measuring/outlining) and a `version` counter that bumps whenever a face finishes loading so
 * text re-renders with real metrics.
 */

export interface FontState {
  uploads: UploadedFace[];
  uploadsReady: boolean;
  version: number;
  /** Face keys that failed to load. */
  failed: string[];
  init: () => Promise<void>;
}

export const useFontStore = create<FontState>()((set, get) => ({
  uploads: [],
  uploadsReady: false,
  version: 0,
  failed: [],
  init: async () => {
    if (get().uploadsReady) return;
    try {
      set({ uploads: await listUploads(), uploadsReady: true });
    } catch {
      set({ uploadsReady: true });
    }
    bump();
  },
}));

const bump = () => useFontStore.setState((s) => ({ version: s.version + 1 }));

// ---------- families ----------

let familiesCache: { uploads: UploadedFace[]; list: FontFamilyInfo[] } | null = null;

function uploadedFamilies(uploads: UploadedFace[]): FontFamilyInfo[] {
  const map = new Map<string, FontFamilyInfo>();
  for (const u of uploads) {
    let fam = map.get(u.family);
    if (!fam) map.set(u.family, (fam = { family: u.family, source: 'upload', faces: [] }));
    fam.faces.push({ key: `upload:${u.id}`, family: u.family, weight: u.weight, style: u.style, metrics: u.metrics, opsz: u.opsz });
  }
  for (const f of map.values()) f.faces.sort((a, b) => a.weight[0] - b.weight[0] || a.style.localeCompare(b.style));
  return [...map.values()].sort((a, b) => a.family.localeCompare(b.family));
}

/** All families: uploaded first, then bundled. */
export function allFamilies(uploads = useFontStore.getState().uploads): FontFamilyInfo[] {
  if (familiesCache?.uploads !== uploads) familiesCache = { uploads, list: [...uploadedFamilies(uploads), ...BUNDLED_FAMILIES] };
  return familiesCache.list;
}

export function findFamily(name: string): FontFamilyInfo | null {
  const c = canonicalFamily(name).toLowerCase();
  return allFamilies().find((f) => f.family.toLowerCase() === c) ?? null;
}

export const fallbackFamily = () => BUNDLED_FAMILIES.find((f) => f.family === FALLBACK_FAMILY)!;

/** Prefix keeps our faces apart from system fonts with the same name. */
export const cssFamily = (family: string) => `dz ${family}`;
export const cssFontStack = (family: string) => `"${cssFamily(family)}", "${cssFamily(FALLBACK_FAMILY)}", sans-serif`;

export interface ResolvedText extends FaceChoice {
  family: FontFamilyInfo;
  /** The node's family isn't bundled or uploaded (rendered and outlined with the fallback). */
  missing: boolean;
}

export function resolveText(node: Pick<TextNode, 'fontFamily' | 'fontWeight' | 'fontStyle'>): ResolvedText {
  const found = findFamily(node.fontFamily);
  const family = found ?? fallbackFamily();
  const choice = chooseFace(family.faces, node.fontWeight, node.fontStyle) ?? chooseFace(fallbackFamily().faces, node.fontWeight, node.fontStyle)!;
  return { ...choice, family, missing: !found && useFontStore.getState().uploadsReady };
}

/** Families used by text in `nodes` that are neither bundled nor uploaded. */
export function missingFamilies(families: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const f of families) if (!findFamily(f)) out.add(f);
  return [...out].sort();
}

// ---------- loading ----------

const loaded = new Map<string, LoadedFont>();
const pending = new Map<string, Promise<LoadedFont | null>>();
const registered = new Map<string, FontFace>();

export const loadedFont = (key: string) => loaded.get(key) ?? null;

function faceInfo(key: string): FontFaceInfo | null {
  for (const f of allFamilies()) for (const face of f.faces) if (face.key === key) return face;
  return null;
}

async function bytesFor(key: string): Promise<ArrayBuffer | null> {
  if (key.startsWith('bundled:')) {
    const url = bundledUrl(key);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Font ${url}: HTTP ${res.status}`);
    return res.arrayBuffer();
  }
  return (await readUploadData(key.slice('upload:'.length))) ?? null;
}

/** Loads a face for the canvas (FontFace) and for metrics/outlines (opentype). Cached. */
export function ensureFace(key: string): Promise<LoadedFont | null> {
  const done = loaded.get(key);
  if (done) return Promise.resolve(done);
  let p = pending.get(key);
  if (p) return p;
  p = (async () => {
    const info = faceInfo(key);
    if (!info) return null;
    try {
      const bytes = await bytesFor(key);
      if (!bytes) throw new Error('font data not found');
      const font = await parseFont(bytes);
      if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
        const ff = new FontFace(cssFamily(info.family), bytes.slice(0), {
          weight: info.weight[0] === info.weight[1] ? String(info.weight[0]) : `${info.weight[0]} ${info.weight[1]}`,
          style: info.style,
        });
        await ff.load();
        document.fonts.add(ff);
        registered.set(key, ff);
      }
      loaded.set(key, font);
      return font;
    } catch (err) {
      console.warn('[fonts] failed to load', key, err);
      useFontStore.setState((s) => ({ failed: [...s.failed, key] }));
      return null;
    } finally {
      pending.delete(key);
      bump();
    }
  })();
  pending.set(key, p);
  return p;
}

/** Same as ensureFace but safe to call during render (defers any state change). */
export function requestFace(key: string) {
  if (loaded.has(key) || pending.has(key) || useFontStore.getState().failed.includes(key)) return;
  queueMicrotask(() => void ensureFace(key));
}

/** Loads the face a text node needs. Resolves once outlines/metrics are available. */
export async function ensureTextFont(node: Pick<TextNode, 'fontFamily' | 'fontWeight' | 'fontStyle'>) {
  await useFontStore.getState().init();
  const r = resolveText(node);
  const font = await ensureFace(r.face.key);
  return { resolved: r, font };
}

function unregister(key: string) {
  const ff = registered.get(key);
  if (ff && typeof document !== 'undefined') document.fonts.delete(ff);
  registered.delete(key);
  loaded.delete(key);
}

// ---------- uploads ----------

const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
export const isFontFile = (f: File) => FONT_EXT.test(f.name) || /^font\/|application\/(x-)?font/.test(f.type);

export interface UploadResult {
  added: UploadedFace[];
  errors: string[];
}

export async function uploadFontFiles(files: File[]): Promise<UploadResult> {
  await useFontStore.getState().init();
  const added: UploadedFace[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      const { info, sfnt, font } = await inspectFont(buf, file.name);
      let family = info.family;
      if (BUNDLED_FAMILIES.some((b) => b.family.toLowerCase() === family.toLowerCase())) family = `${family} (custom)`;
      const existing = useFontStore.getState().uploads;
      // Same family + style + weight replaces the old file.
      const dup = existing.find((u) => u.family === family && u.style === info.style && u.weight[0] === info.weight[0] && u.weight[1] === info.weight[1]);
      const face: UploadedFace = {
        id: dup?.id ?? newId(),
        family,
        subfamily: info.subfamily,
        weight: info.weight,
        style: info.style,
        metrics: info.metrics,
        opsz: info.opsz,
        fileName: file.name,
        format: info.format,
        size: buf.byteLength,
        addedAt: Date.now(),
      };
      await saveUpload(face, sfnt);
      if (dup) unregister(`upload:${dup.id}`);
      useFontStore.setState((s) => ({ uploads: [...s.uploads.filter((u) => u.id !== face.id), face] }));
      loaded.set(`upload:${face.id}`, font);
      added.push(face);
      void registerLoadedUpload(face, sfnt);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `${file.name}: could not read this font.`);
    }
  }
  bump();
  return { added, errors };
}

async function registerLoadedUpload(face: UploadedFace, sfnt: ArrayBuffer) {
  if (typeof FontFace === 'undefined') return;
  try {
    const ff = new FontFace(cssFamily(face.family), sfnt.slice(0), {
      weight: face.weight[0] === face.weight[1] ? String(face.weight[0]) : `${face.weight[0]} ${face.weight[1]}`,
      style: face.style,
    });
    await ff.load();
    document.fonts.add(ff);
    registered.set(`upload:${face.id}`, ff);
  } catch (err) {
    console.warn('[fonts] FontFace failed', face.fileName, err);
  }
  bump();
}

export async function removeUpload(id: string) {
  await recordDeletion('fonts', id); // so the deletion reaches the other devices
  await deleteUpload(id);
  unregister(`upload:${id}`);
  useFontStore.setState((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) }));
  bump();
}

/** Renames an uploaded family. Returns the final name (made unique). */
export async function renameFamily(from: string, to: string): Promise<string | null> {
  const name = to.trim();
  if (!name || name === from) return null;
  if (allFamilies().some((f) => f.family.toLowerCase() === name.toLowerCase() && f.family !== from)) {
    throw new Error(`A font named “${name}” already exists.`);
  }
  await renameUploadFamily(from, name);
  const faces = useFontStore.getState().uploads.filter((u) => u.family === from);
  for (const f of faces) unregister(`upload:${f.id}`);
  useFontStore.setState((s) => ({ uploads: s.uploads.map((u) => (u.family === from ? { ...u, family: name, updatedAt: Date.now() } : u)) }));
  bump();
  return name;
}

/** Sync: re-reads the uploaded fonts from storage after faces were added, changed or removed by a pull. */
export async function reloadUploads(changedIds: string[]) {
  for (const id of changedIds) unregister(`upload:${id}`);
  useFontStore.setState({ uploads: await listUploads(), uploadsReady: true });
  bump();
}
