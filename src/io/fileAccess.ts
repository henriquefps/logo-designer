// Save in place: File → Open project file keeps the file handle (Chrome/Edge, File System Access
// API) and Cmd/Ctrl+S writes back to that same `.designer.json`. Handles are remembered per project
// in IndexedDB (the browser may ask for permission again after a reload). Elsewhere: download.
import type { DesignDocument, Id } from '@/model';
import { deleteFileHandle, loadFileHandle, saveFileHandle } from '@/store/persistence';
import { downloadBlob, pickFiles, safeFileName } from './download';
import { parseProject, PROJECT_EXTENSION, serializeProject } from './projectFile';

/** The parts of FileSystemFileHandle we use (lib.dom lacks the pickers and permissions). */
export interface FileHandleLike {
  readonly kind?: 'file';
  readonly name: string;
  getFile(): Promise<Blob & { name?: string }>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}
export interface FileAccessDeps {
  showOpenFilePicker?: (o: { types: PickerType[]; excludeAcceptAllOption?: boolean; id?: string }) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (o: { types: PickerType[]; suggestedName: string; id?: string }) => Promise<FileHandleLike>;
  loadHandle: (id: Id) => Promise<FileHandleLike | null>;
  saveHandle: (id: Id, h: FileHandleLike) => Promise<void>;
  deleteHandle: (id: Id) => Promise<void>;
  download: (text: string, fileName: string) => void;
  pickFile: () => Promise<File | null>;
}

const PROJECT_TYPES: PickerType[] = [{ description: 'Designer project', accept: { 'application/json': [PROJECT_EXTENSION, '.json'] } }];

export function browserDeps(): FileAccessDeps {
  const w = window as unknown as Pick<FileAccessDeps, 'showOpenFilePicker' | 'showSaveFilePicker'>;
  return {
    showOpenFilePicker: typeof w.showOpenFilePicker === 'function' ? w.showOpenFilePicker.bind(window) : undefined,
    showSaveFilePicker: typeof w.showSaveFilePicker === 'function' ? w.showSaveFilePicker.bind(window) : undefined,
    loadHandle: (id) => loadFileHandle<FileHandleLike>(id).catch(() => null),
    saveHandle: (id, h) => saveFileHandle(id, h).catch(() => undefined),
    deleteHandle: (id) => deleteFileHandle(id).catch(() => undefined),
    download: (text, fileName) => downloadBlob(new Blob([text], { type: 'application/json' }), fileName),
    pickFile: async () => (await pickFiles(`${PROJECT_EXTENSION},.json,application/json`))[0] ?? null,
  };
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
export const projectFileName = (doc: DesignDocument) => safeFileName(doc.name) + PROJECT_EXTENSION;

async function canWrite(h: FileHandleLike): Promise<boolean> {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

async function write(h: FileHandleLike, doc: DesignDocument) {
  const w = await h.createWritable();
  await w.write(serializeProject(doc));
  await w.close();
}

export type SaveResult = { kind: 'saved'; fileName: string } | { kind: 'downloaded'; fileName: string } | { kind: 'cancelled' };

/** Save as…: picks a new file (remembered for this project), or downloads where unsupported. */
export async function saveProjectAs(doc: DesignDocument, deps: FileAccessDeps): Promise<SaveResult> {
  if (!deps.showSaveFilePicker) {
    deps.download(serializeProject(doc), projectFileName(doc));
    return { kind: 'downloaded', fileName: projectFileName(doc) };
  }
  let h: FileHandleLike;
  try {
    h = await deps.showSaveFilePicker({ types: PROJECT_TYPES, suggestedName: projectFileName(doc), id: 'designer-project' });
  } catch (e) {
    if (isAbort(e)) return { kind: 'cancelled' };
    throw e;
  }
  await write(h, doc);
  await deps.saveHandle(doc.id, h);
  return { kind: 'saved', fileName: h.name };
}

/**
 * Save (Cmd/Ctrl+S): writes back to the file this project was opened from or last saved to; the
 * first time (or when permission is refused) it behaves like Save as….
 */
export async function saveProject(doc: DesignDocument, deps: FileAccessDeps): Promise<SaveResult> {
  const h = deps.showSaveFilePicker || deps.showOpenFilePicker ? await deps.loadHandle(doc.id) : null;
  if (h) {
    const ok = await canWrite(h).catch(() => false);
    if (ok) {
      try {
        await write(h, doc);
        return { kind: 'saved', fileName: h.name };
      } catch (e) {
        // File moved or deleted: forget it and ask where to save.
        if (!(e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'NotAllowedError'))) throw e;
        await deps.deleteHandle(doc.id);
      }
    }
  }
  return saveProjectAs(doc, deps);
}

export interface OpenResult {
  doc: DesignDocument;
  /** Handle to remember for the project once it has its id (null: plain file input). */
  handle: FileHandleLike | null;
  fileName: string;
}

/** File → Open project file. Null when cancelled. Throws a readable error for invalid files. */
export async function openProjectFile(deps: FileAccessDeps): Promise<OpenResult | null> {
  if (deps.showOpenFilePicker) {
    let handles: FileHandleLike[];
    try {
      handles = await deps.showOpenFilePicker({ types: PROJECT_TYPES, id: 'designer-project' });
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
    const h = handles[0];
    if (!h) return null;
    const file = await h.getFile();
    return { doc: parseProject(await file.text()), handle: h, fileName: h.name };
  }
  const file = await deps.pickFile();
  if (!file) return null;
  return { doc: parseProject(await file.text()), handle: null, fileName: file.name };
}
