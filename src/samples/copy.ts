// Opening a sample always makes a new project: a fresh id and a name no other project has
// ("Roam (sample)", "Roam (sample) 2", …), never the bundled file's identity. Pure; the app (open.ts) and the
// CLI (`designer new --sample`) both use it.
import { newId, type DesignDocument } from '@/model';
import type { SampleDef } from './registry';

export const sampleBaseName = (s: Pick<SampleDef, 'name'>): string => `${s.name} (sample)`;

/** "<base>", or "<base> 2", "<base> 3"… when a project already has that name. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** The project a sample opens as: the bundled document with a new id, a unique name and fresh timestamps. */
export function sampleCopy(doc: DesignDocument, sample: Pick<SampleDef, 'name'>, takenNames: Iterable<string> = [], now = Date.now()): DesignDocument {
  // A sample is never live and never linked to a file or a sync record of the original.
  const copy = structuredClone(doc);
  delete copy.live;
  return { ...copy, id: newId('d'), name: uniqueName(sampleBaseName(sample), takenNames), createdAt: now, updatedAt: now };
}
