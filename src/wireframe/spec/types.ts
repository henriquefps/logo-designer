// The wireframe spec format (docs/wireframe-spec.md, docs/wireframe-mode.md → Phase 3 → A1): a
// compact JSON an agent writes and reads. Screens the way a person thinks of them (a tree of library
// components, stacks, shared components), not coordinates. `buildFromSpec` (./build.ts) turns it into
// a project through the app's own pipeline; `dumpToSpec` (./dump.ts) turns a project back into one.
//
// These types describe what a hand-written spec may contain (short forms included). The parser
// (./parse.ts) normalizes it into the `Norm*` types below, which build.ts consumes.
import type { ContainerRadius, ContainerStyle, LayoutAlign, LayoutJustify, LayoutKind, LayoutSize, SceneNode, ScreenPlatform, ScreenStatus } from '@/model';

export const SPEC_VERSION = 1;
export const SPEC_SCHEMA_URL = 'https://designer.hfps.dev/schema/wireframe-spec.schema.json';

/** A whole project. Only `screens` is required. */
export interface WireframeSpec {
  $schema?: string;
  /** Format version (1). */
  version?: number;
  /** Project name. */
  name?: string;
  /** Shared components (masters), used on screens with `{ "use": "<name>" }`. */
  components?: SpecComponent[];
  /** Logical screens, in order. */
  screens: SpecScreen[];
  /** Top-level objects that are not in a screen or a note (rare). */
  canvas?: SpecNode[];
  /** Flow arrows: tapping `from` opens the screen `to`. */
  flows?: SpecFlow[];
  /** Sticky notes, optionally attached to a node (`on`). */
  notes?: SpecNote[];
}

/** A shared component master: its content is a container (or a group). */
export interface SpecComponent {
  name: string;
  id?: string;
  content: SpecNode;
}

/** Root layout of a frame: a vertical stack by default (platform padding / gap); `"free"` = no stack. */
export type SpecFrameLayout = 'free' | { kind?: LayoutKind; gap?: number; padding?: number; align?: LayoutAlign; justify?: LayoutJustify; columns?: number };

/** One frame (platform variant) of a logical screen. */
export interface SpecVariant {
  platform: ScreenPlatform;
  /** The frame's node id. */
  id?: string;
  /** Top-left on the canvas (default: right of everything). */
  x?: number;
  y?: number;
  /** Frame width (default: the platform's). */
  width?: number;
  layout?: SpecFrameLayout;
  /** The frame's content, in stack order. */
  root?: SpecNode[];
}

/**
 * A logical screen. Short form (one frame): `platform`, `frameId`, `x`, `y`, `width`, `layout`, `root`
 * directly on the screen. Several platforms: `variants`.
 */
export interface SpecScreen {
  name: string;
  /** The logical screen's id. */
  id?: string;
  status?: ScreenStatus | null;
  platform?: ScreenPlatform;
  frameId?: string;
  x?: number;
  y?: number;
  width?: number;
  layout?: SpecFrameLayout;
  root?: SpecNode[];
  variants?: SpecVariant[];
}

/**
 * `from`: a node id or a path ("Settings/Language", "Settings@tablet/Language"), optionally ending at a part of a
 * component (`#Files` by label, `#item:2` by key); a path whose head is a shared component's name links inside its
 * master (every instance). `to`: a screen name or id.
 */
export interface SpecFlow {
  id?: string;
  from: string;
  to: string;
  label?: string;
}

export interface SpecNote {
  id?: string;
  text: string;
  /** The node it is attached to: an id or a path. Absent = a free note. */
  on?: string;
  x?: number;
  y?: number;
}

/**
 * A node of a screen tree. Exactly one form key:
 * - a library component: `{ "<kind>": { ...props } }`, `{ "<kind>": "text" }` (the first text prop),
 *   `{ "<kind>": ["a", "b"] }` (the first list prop), or `{ "kind": "<kind>", "props": { … } }`;
 * - a container: `{ "vstack" | "hstack" | "grid": [ ...children ], gap, padding, align, justify, columns, style, radius, repeat, slot }`
 *   (`slot: true` in a shared component's content: "Content per instance");
 * - a shared component instance: `{ "use": "<component name or id>" }`, with what this instance puts in the master's
 *   slot (`content: [ … ]`; several slots: `slots: { "<slot name>": [ … ] }`) and its own text
 *   (`text: { "<node name or path>": "…" }`, or `{ "<node>": { "<prop>": "…" } }`);
 * - a plain group: `{ "group": [ ...children ] }`;
 * - any other object, as stored in the project file: `{ "node": { ... } }`.
 * Plus the common keys below.
 */
export type SpecNode = Record<string, unknown>;

/** Keys every node form accepts. */
export const COMMON_KEYS = ['id', 'name', 'hidden', 'locked', 'opacity', 'width', 'height', 'position', 'bleed', 'alignSelf', 'x', 'y', 'rotation', 'scale', 'size', 'opens', 'note'] as const;
/** Form keys that are not component kinds. */
export const CONTAINER_KINDS = ['vstack', 'hstack', 'grid'] as const;
export const FORM_KEYS = ['kind', 'use', 'group', 'node', ...CONTAINER_KINDS] as const;
/** Keys only containers take. */
export const CONTAINER_KEYS = ['gap', 'padding', 'align', 'justify', 'columns', 'style', 'radius', 'repeat', 'slot'] as const;
/** Keys only shared component instances (`use`) take. */
export const USE_KEYS = ['content', 'slots', 'text'] as const;
/** Names a component kind can never take (they mean something else in a node). */
// (`USE_KEYS` are not reserved: `text` is also a component kind; next to `use` it means the instance's text.)
export const RESERVED_KEYS: ReadonlySet<string> = new Set<string>([...COMMON_KEYS, ...FORM_KEYS, ...CONTAINER_KEYS, 'props']);

export const POSITIONS = ['flow', 'pinned-bottom', 'free'] as const;
export const ALIGNS: readonly LayoutAlign[] = ['start', 'center', 'end', 'stretch'];
export const JUSTIFIES: readonly LayoutJustify[] = ['start', 'center', 'end', 'space-between'];
export const STYLES: readonly ContainerStyle[] = ['none', 'outline', 'filled', 'outline-filled'];
export const RADII: readonly ContainerRadius[] = ['none', 'small', 'large'];

// ---------- normalized (parser output) ----------

/** What every normalized node carries. `path` is the spec path, for messages. */
export interface NormCommon {
  path: string;
  id?: string;
  name?: string;
  hidden: boolean;
  locked: boolean;
  opacity?: number;
  width?: LayoutSize;
  height?: LayoutSize;
  position?: 'flow' | 'pinned-bottom' | 'free';
  bleed?: boolean;
  alignSelf?: LayoutAlign;
  x?: number;
  y?: number;
  rotation?: number;
  scale?: [number, number];
  size?: { width: number; height: number };
  /** Screens this node opens; `part` (a part label or key) for `"opens": { "<part>": "<screen>" }`. */
  opens: { to: string; part?: string }[];
  note?: string;
}

export type NormNode =
  | (NormCommon & { form: 'component'; kind: string; props: Record<string, unknown> })
  | (NormCommon & {
      form: 'container';
      kind: LayoutKind;
      gap?: number;
      padding?: number;
      align?: LayoutAlign;
      justify?: LayoutJustify;
      columns?: number;
      style?: ContainerStyle;
      radius?: ContainerRadius;
      repeat?: number;
      slot?: boolean;
      children: NormNode[];
    })
  | (NormCommon & {
      form: 'use';
      ref: string;
      /** What this instance puts in the master's slots (`slot` undefined = `content`: the only slot). */
      fills?: { slot?: string; path: string; children: NormNode[] }[];
      /** Its own text: node (name, path or id in the master) → the primary text prop's value, or prop → value. */
      text?: { node: string; path: string; value: string | Record<string, string> }[];
    })
  | (NormCommon & { form: 'group'; children: NormNode[] })
  | (NormCommon & { form: 'node'; node: SceneNode });

export interface NormVariant {
  path: string;
  platform: ScreenPlatform;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  /** null = free content (no stack); undefined = the platform default. */
  layout?: null | { kind?: LayoutKind; gap?: number; padding?: number; align?: LayoutAlign; justify?: LayoutJustify; columns?: number };
  root: NormNode[];
}

export interface NormScreen {
  path: string;
  name: string;
  id?: string;
  status?: ScreenStatus | null;
  variants: NormVariant[];
}

export interface NormComponent {
  path: string;
  name: string;
  id?: string;
  content: NormNode;
}

export interface NormFlow {
  path: string;
  id?: string;
  from: string;
  to: string;
  label?: string;
}

export interface NormNote {
  path: string;
  id?: string;
  text: string;
  on?: string;
  x?: number;
  y?: number;
}

export interface NormSpec {
  name?: string;
  components?: NormComponent[];
  screens: NormScreen[];
  canvas?: NormNode[];
  flows?: NormFlow[];
  notes?: NormNote[];
}

/** One problem in a spec, at a spec path (`screens[1].root[3].list-row.trailing`). */
export interface SpecIssue {
  path: string;
  message: string;
}

/** A spec that cannot be built: every problem found, each with its spec path. */
export class SpecError extends Error {
  readonly issues: SpecIssue[];
  constructor(issues: SpecIssue[]) {
    super(issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('\n'));
    this.issues = issues;
    this.name = 'SpecError';
  }
}
