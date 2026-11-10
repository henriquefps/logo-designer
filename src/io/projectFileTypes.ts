// The `.designer.json` file shape, for the JSON Schema (scripts/gen-schema.ts) and docs. The file
// is a DesignDocument (including the optional app icon `icon` field, IconDocInfo in
// src/model/types.ts) plus a few top-level extras; see docs/project-format.md.
import type { DesignDocument, IconDocInfo, IconPreset, IconShapeSetting } from '@/model';

export type IconPresetId = IconPreset;
export type IconShapeId = IconShapeSetting;
/** Icon mode settings (optional). */
export type IconSettings = IconDocInfo;

/** A Designer project file (`*.designer.json`). */
export type DesignerProjectFile = DesignDocument & {
  /** Points editors at the JSON Schema: https://designer.hfps.dev/schema/designer-project.schema.json */
  $schema?: string;
  /** Always "designer". */
  format?: 'designer';
};
