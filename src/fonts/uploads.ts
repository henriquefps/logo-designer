import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { FontFormat } from './parse';
import type { FontMetrics, FontStyle, WeightRange } from './types';

/**
 * User fonts live only in this browser: IndexedDB database `designer-fonts`, store `fonts`.
 * `index` holds the metadata list; `data:<id>` holds the sfnt bytes (WOFF2 is stored decompressed,
 * so opening a project never needs the decoder again).
 */
export interface UploadedFace {
  id: string;
  family: string;
  subfamily: string;
  weight: WeightRange;
  style: FontStyle;
  metrics: FontMetrics;
  opsz?: [number, number];
  fileName: string;
  format: FontFormat;
  size: number;
  addedAt: number;
  /** Set when the family is renamed, so the rename syncs (the effective time is `updatedAt ?? addedAt`). */
  updatedAt?: number;
}

let store: UseStore | null = null;
const db = () => (store ??= createStore('designer-fonts', 'fonts'));

export async function listUploads(): Promise<UploadedFace[]> {
  return ((await get<UploadedFace[]>('index', db())) ?? []).filter((f) => f && f.id && f.family);
}

async function writeIndex(list: UploadedFace[]) {
  await set('index', list, db());
}

export async function saveUpload(face: UploadedFace, data: ArrayBuffer): Promise<void> {
  await set(`data:${face.id}`, data, db());
  const list = await listUploads();
  await writeIndex([...list.filter((f) => f.id !== face.id), face]);
}

export const readUploadData = (id: string) => get<ArrayBuffer>(`data:${id}`, db());

export async function deleteUpload(id: string): Promise<void> {
  await writeIndex((await listUploads()).filter((f) => f.id !== id));
  await del(`data:${id}`, db());
}

/** Renames a whole family (all its faces). */
export async function renameUploadFamily(from: string, to: string): Promise<void> {
  await writeIndex((await listUploads()).map((f) => (f.family === from ? { ...f, family: to, updatedAt: Date.now() } : f)));
}
