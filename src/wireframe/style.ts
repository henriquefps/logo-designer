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
