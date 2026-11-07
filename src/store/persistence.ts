import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { DesignDocument, Id } from '@/model';

/** Lightweight project listing kept separately so the list loads without reading every document. */
export interface ProjectMeta {
  id: Id;
  name: string;
  createdAt: number;
  updatedAt: number;
}

const META_KEY = 'projects';
const docKey = (id: Id) => `doc:${id}`;

let store: UseStore | null = null;
const db = () => (store ??= createStore('designer', 'kv'));

export async function loadProjectList(): Promise<ProjectMeta[]> {
  return ((await get<ProjectMeta[]>(META_KEY, db())) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProjectList(list: ProjectMeta[]): Promise<void> {
  await set(META_KEY, list, db());
}

export async function loadDocument(id: Id): Promise<DesignDocument | null> {
  return (await get<DesignDocument>(docKey(id), db())) ?? null;
}

export async function saveDocument(doc: DesignDocument): Promise<void> {
  await set(docKey(doc.id), doc, db());
}

export async function deleteDocument(id: Id): Promise<void> {
  await del(docKey(id), db());
}

const ACTIVE_KEY = 'designer.activeProject';
export function getActiveProjectId(): Id | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
export function setActiveProjectId(id: Id): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

export const metaOf = (doc: DesignDocument): ProjectMeta => ({
  id: doc.id,
  name: doc.name,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});
