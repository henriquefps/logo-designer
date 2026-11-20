// Opens a sample from the UI with feedback: a toast with the new project's name, or the error.
import { toast } from 'sonner';
import { useProjectsStore } from '@/store/useProjectsStore';
import { openSample } from './open';
import type { SampleDef } from './registry';

/** True when the sample was opened. */
export async function openSampleWithToast(sample: SampleDef): Promise<boolean> {
  try {
    const id = await openSample(sample);
    const name = useProjectsStore.getState().projects.find((p) => p.id === id)?.name ?? sample.name;
    toast.success(`Opened “${name}”`, { description: 'A copy of the sample, saved with your projects.' });
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not open the sample.');
    return false;
  }
}
