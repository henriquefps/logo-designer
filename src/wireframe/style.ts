// The one lo-fi wireframe style (decided in docs/wireframe-mode.md): black, white and a few greys,
// Inter, 1 px strokes. Components and screen frames take every colour from here; no themes, no
// per-component styling. Notes are the only thing with an accent colour.

export const WF = {
  /** Text and strong strokes. */
  ink: '#111111',
  /** Secondary text, icons. */
  inkMuted: '#6b6b6b',
  /** Default strokes (component outlines, dividers). */
  line: '#c8c8c8',
  /** Filled placeholders: image boxes, grey text bars. */
  fill: '#e6e6e6',
  /** Light surfaces (cards, fields). */
  surface: '#f4f4f4',
  /** Screen background. */
  paper: '#ffffff',
  /** Screen frame border (canvas only; exports have no border). */
  frame: '#d0d0d0',
  /** Notes: the one accent colour. A soft yellow sticky that reads on a light and a dark canvas. */
  note: '#fde68a',
  noteEdge: '#e0c04c',
  noteInk: '#3d3200',
  /** Connector line from a note to its target (canvas overlay). */
  noteLine: '#d4a72c',
  font: 'Inter',
  strokeWidth: 1,
} as const;

/** Text styles (Inter). Components pick one by name; sizes are px, line height is a multiple. */
export const WF_TEXT = {
  title: { size: 28, weight: 700, lineHeight: 1.25 },
  heading: { size: 22, weight: 600, lineHeight: 1.3 },
  subheading: { size: 18, weight: 600, lineHeight: 1.3 },
  body: { size: 16, weight: 400, lineHeight: 1.4 },
  label: { size: 14, weight: 500, lineHeight: 1.3 },
  caption: { size: 12, weight: 400, lineHeight: 1.3 },
} as const;

export type WfTextStyle = keyof typeof WF_TEXT;

/** Spacing scale (padding, gaps) and corner radii. */
export const WF_SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const WF_RADIUS = { sm: 4, md: 8, lg: 12, pill: 9999 } as const;

/** Standard heights of tappable things (buttons, rows, fields). */
export const WF_SIZE = {
  /** Buttons and text fields. */
  control: 44,
  /** Compact controls (chips, small buttons). */
  controlSmall: 32,
  /** A one-line list row; two lines get `rowTall`. */
  row: 56,
  rowTall: 72,
  /** Icons inside controls and rows. */
  icon: 20,
  /** Avatars in rows. */
  avatar: 40,
} as const;

/** The colours a component may use, by role. */
export type WfTone = 'ink' | 'inkMuted' | 'line' | 'fill' | 'surface' | 'paper';
