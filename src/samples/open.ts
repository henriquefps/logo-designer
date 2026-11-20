// App side of samples: fetch the bundled file (precached by the PWA, so it works offline), validate it and
// open it as a new project copy (copy.ts). The canvas fits the content on open (useProjectsStore.activate).
import { parseProject } from '@/io/projectFile';
import { useDocStore } from '@/store/useDocStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { sampleCopy } from './copy';
import { sampleById, type SampleDef } from './registry';

/** Absolute URL of a file in public/ (the app is served at the site root). */
export const publicUrl = (path: string): string => `${import.meta.env.BASE_URL ?? '/'}${path}`;

export async function loadSample(sample: SampleDef): Promise<ReturnType<typeof parseProject>> {
  const res = await fetch(publicUrl(sample.file));
  if (!res.ok) throw new Error(`Could not load the ${sample.name} sample (${res.status}).`);
  return parseProject(await res.text());
}

/** Opens a sample as a new project (never over an existing one); returns the new project's id. */
export async function openSample(idOrSample: string | SampleDef): Promise<string> {
  const sample = typeof idOrSample === 'string' ? sampleById(idOrSample) : idOrSample;
  if (!sample) throw new Error(`Unknown sample “${String(idOrSample)}”.`);
  const doc = await loadSample(sample);
  // The still-empty document of a first visit (nothing drawn, no history) is not left behind, as with New.
  const ds = useDocStore.getState();
  const store = useProjectsStore.getState();
  const pristine = store.activeId && ds.doc.id === store.activeId && ds.doc.children.length === 0 && ds.past.length === 0 && ds.future.length === 0 ? store.activeId : null;
  const copy = sampleCopy(doc, sample, store.projects.filter((p) => p.id !== pristine).map((p) => p.name));
  const id = await store.importDocument(copy);
  if (pristine) await useProjectsStore.getState().remove(pristine);
  return id;
}
