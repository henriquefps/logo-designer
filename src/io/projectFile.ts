import type { DesignDocument } from '@/model';
import { downloadBlob, safeFileName } from './download';

export const PROJECT_EXTENSION = '.designer.json';

export function serializeProject(doc: DesignDocument): string {
  return JSON.stringify({ format: 'designer', ...doc }, null, 2);
}

/** Parses a `.designer.json` file. Throws with a readable message when invalid. */
export function parseProject(text: string): DesignDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const d = data as Partial<DesignDocument> & { format?: string };
  if (!d || typeof d !== 'object' || d.schemaVersion !== 1 || !Array.isArray(d.children) || !d.artboard) {
    throw new Error('This is not a Designer project file.');
  }
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: typeof d.id === 'string' ? d.id : `d${now.toString(36)}`,
    name: typeof d.name === 'string' ? d.name : 'Imported',
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : now,
    updatedAt: now,
    artboard: d.artboard,
    children: d.children,
  };
}

export function downloadProject(doc: DesignDocument) {
  downloadBlob(new Blob([serializeProject(doc)], { type: 'application/json' }), safeFileName(doc.name) + PROJECT_EXTENSION);
}
