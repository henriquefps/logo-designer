/**
 * A file importer (SVG, images, legacy projects). Put each in `src/io/importers/<id>/index.ts`
 * with `default: Importer`. File > Import runs the importer with `id === 'svg'`; dropped files
 * go to the first importer whose `accept` matches.
 */
export interface Importer {
  id: string;
  label: string;
  /** File input accept string, e.g. '.svg,image/svg+xml'. */
  accept: string;
  /** Imports files into the active document (adds nodes, selects them). */
  importFiles: (files: File[]) => Promise<void>;
  /** Optional: handles pasted text (e.g. SVG markup). Return true when handled. */
  importText?: (text: string) => Promise<boolean>;
}
