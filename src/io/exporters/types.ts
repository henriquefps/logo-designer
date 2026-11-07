import type { ComponentType } from 'react';
import type { DesignDocument, Id } from '@/model';

export interface ExportRequest {
  doc: DesignDocument;
  /** Empty = whole artboard. */
  selection: Id[];
  scope: 'artboard' | 'selection';
}

/**
 * An export format. Put each in `src/io/exporters/<id>/index.ts` with `default: Exporter`.
 * The Export dialog lists every registered exporter.
 */
export interface Exporter {
  id: string;
  label: string;
  extension: string;
  order?: number;
  /** Optional settings UI rendered in the Export dialog; it owns its own state. */
  Options?: ComponentType;
  run: (req: ExportRequest) => Promise<void>;
}
