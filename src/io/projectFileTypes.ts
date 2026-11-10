// The `.designer.json` file shape, for the JSON Schema (scripts/gen-schema.ts) and docs. The file
// is a DesignDocument plus a few top-level extras; see docs/project-format.md.
import type { DesignDocument } from '@/model';

export type IconPresetId = 'app-icon' | 'android-adaptive' | 'ios' | 'favicon-32' | 'favicon-16';
export type IconShapeId = 'auto' | 'circle' | 'square' | 'wide' | 'tall';

/** Icon mode settings (optional). */
export interface IconSettings {
  preset: IconPresetId;
  shape: IconShapeId;
  /** Project used for the 16/32 px favicon glyph instead of this one. */
  smallGlyphProjectId?: string;
}

/** A Designer project file (`*.designer.json`). */
export type DesignerProjectFile = DesignDocument & {
  /** Points editors at the JSON Schema: https://designer.hfps.dev/schema/designer-project.schema.json */
  $schema?: string;
  /** Always "designer". */
  format?: 'designer';
  icon?: IconSettings;
};
