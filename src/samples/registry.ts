// Sample projects shipped with the app (public/samples/), opened from New document and Help → Open sample
// project…, and by `designer new --sample <id>`. To add one: drop `<id>.designer.json` and a small thumbnail
// into public/samples/ and add an entry here (README → Samples). Pure data, no React: the CLI imports it too.
import type { DesignMode } from '@/dialogs/newDocument/modes';

export interface SampleDef {
  /** Stable id, used by `designer new --sample <id>` and the UI's test ids. */
  id: string;
  /** Short name ("Roam"); a copy is named "<name> (sample)". */
  name: string;
  /** One line: what it shows. */
  description: string;
  /** The New document mode it belongs to (the sample is offered on that mode's step). */
  mode: DesignMode;
  /** The project file, relative to the site root (public/). */
  file: string;
  /** A small preview image, relative to the site root (public/). */
  thumbnail: string;
  /** Offered as a component kit (like a project with `wireframe.kit`): New document can start from its shared components, and Import components lists it first. */
  kit?: boolean;
}

export const SAMPLES: readonly SampleDef[] = [
  {
    id: 'roam',
    name: 'Roam',
    description: 'A trip planner, with flows and an agent-reorganized Settings',
    mode: 'wireframe',
    file: 'samples/roam.designer.json',
    thumbnail: 'samples/roam.thumb.png',
  },
];

export const sampleById = (id: string): SampleDef | undefined => SAMPLES.find((s) => s.id === id);
export const samplesFor = (mode: DesignMode): SampleDef[] => SAMPLES.filter((s) => s.mode === mode);
/** Samples offered as component kits (`kit: true`). */
export const kitSamples = (): SampleDef[] => SAMPLES.filter((s) => s.kit);
