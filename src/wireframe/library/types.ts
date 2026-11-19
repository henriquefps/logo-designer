// The component contract (docs/wireframe-mode.md → Semantic components). One folder per kind,
// `src/wireframe/library/<kind>/index.ts`, `export default defineComponent({...})`; the registry
// discovers them. The component system workstream owns the library panel, the generated
// properties section and the real components; this file is the seam they build on.
import type { LayoutSize, ScreenPlatform, SceneNode } from '@/model';

interface PropBase {
  /** Field label in the properties panel. */
  label: string;
  /** One short hint under the field (optional). */
  help?: string;
  /**
   * Show the field only when other props have these values (all must match; an array = any of them), e.g.
   * `{ leading: 'icon' }` or `{ trailing: ['toggle', 'checkbox'] }`. Hidden props keep their value.
   */
  visibleWhen?: Readonly<Record<string, PropCondition>>;
}

export type PropScalar = string | number | boolean;
export type PropCondition = PropScalar | readonly PropScalar[];

export type PropSpec =
  | (PropBase & { type: 'text' | 'multiline'; default: string; placeholder?: string })
  /** An icon name from the app's icon libraries (`lucide:Heart`, `iconify:ph:heart`; '' = none). See src/wireframe/icons.ts. */
  | (PropBase & { type: 'icon'; default: string })
  | (PropBase & { type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string })
  | (PropBase & { type: 'boolean'; default: boolean })
  /** `labels` maps an option to its label in the panel (default: the option, capitalised). */
  | (PropBase & { type: 'choice'; options: readonly string[]; default: string; labels?: Readonly<Record<string, string>> })
  /** A list of strings (tab labels, table columns). `item` names one entry in the editor ("Tab"). */
  | (PropBase & { type: 'list'; default: readonly string[]; item?: string; min?: number; max?: number });

export type PropType = PropSpec['type'];

export type PropSpecs = Record<string, PropSpec>;

type PropValue<S extends PropSpec> = S extends { type: 'number' }
  ? number
  : S extends { type: 'boolean' }
    ? boolean
    : S extends { type: 'list' }
      ? string[]
      : string;

/** Resolved prop values: every prop present, typed by its spec. */
export type PropsOf<S extends PropSpecs> = { [K in keyof S]: PropValue<S[K]> };

/** The box a component is built for. `width` always; `height` when the parent fixes it. */
export interface BuildSize {
  width: number;
  height?: number;
}

export interface BuildResult {
  /** Children in the instance's local space (origin = top-left of the box). Ids are reassigned. */
  children: SceneNode[];
  /** The height the component takes (hug). */
  height: number;
  /** Components whose `sizing.width` is `hug`: the width their content needs (a button's label + padding). */
  width?: number;
}

/**
 * Where the library puts a new instance on a screen, when it should not just join the stack's flow:
 * `pinned-bottom` (bottom navigation, action bars) or `free` at an anchor (FAB bottom right, snackbar
 * bottom, bottom sheet at the bottom edge, dialog centred). Only applies when the target is a screen
 * (not a nested stack); the user can change the position afterwards (Properties → In stack).
 */
export type DefaultPlacement =
  | { position: 'pinned-bottom' }
  | { position: 'free'; anchor: 'bottom-right' | 'bottom' | 'bottom-edge' | 'center' };

export interface ComponentDef<S extends PropSpecs = PropSpecs> {
  kind: string;
  label: string;
  /** Where the library panel shows it first; 'all' = common. */
  platforms: readonly ScreenPlatform[] | 'all';
  category: string;
  /** Not listed in the library panel (stand-ins kept so older files load). Instances still load, render and edit. */
  hidden?: boolean;
  /** Extra words the library panel's search matches ("cta" for a button). */
  keywords?: readonly string[];
  /** Drives the generated properties section. */
  props: S;
  /** Default behaviour inside a stack. */
  /**
   * `bleed`: edge to edge in a stack (ignores the parent's cross-axis padding) unless the instance overrides it.
   * Set it on components that span the screen and pad their own content: list rows, top bars, tabs, section headers.
   */
  sizing: { width: LayoutSize; height: LayoutSize; bleed?: boolean };
  /** Default position of a new instance on a screen (absent = in the flow). See `DefaultPlacement`. */
  placement?: DefaultPlacement;
  /** Size of a new instance outside a stack (and of instances without `component.size`). */
  defaultSize: { width: number; height: number };
  /** Pure and deterministic: same props + size → same children. */
  build(props: PropsOf<S>, size: BuildSize): BuildResult;
  /** One line for the AI export, e.g. 'List row "Language" → value "English"'. */
  describe(props: PropsOf<S>): string;
}

// Each definition keeps its own prop types; the registry only sees the erased shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponentDef = ComponentDef<any>;

export function defineComponent<const S extends PropSpecs>(def: ComponentDef<S>): ComponentDef<S> {
  return def;
}

const show = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? 'a list' : v === null ? 'null' : typeof v === 'object' ? 'an object' : String(v));

/**
 * Checks one value against its spec. Returns the value to use and, when the value was not usable as
 * is, why (the caller turns it into a warning). `undefined` (prop not set) is fine: the default.
 */
export function checkProp(spec: PropSpec, v: unknown): { value: unknown; problem?: string } {
  if (v === undefined) return { value: spec.type === 'list' ? [...spec.default] : spec.default };
  switch (spec.type) {
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { value: spec.default, problem: `expected a number, got ${show(v)}` };
      const c = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, v));
      return c === v ? { value: v } : { value: c, problem: `${v} is out of range (${spec.min ?? '−∞'}..${spec.max ?? '∞'}), using ${c}` };
    }
    case 'boolean':
      return typeof v === 'boolean' ? { value: v } : { value: spec.default, problem: `expected true or false, got ${show(v)}` };
    case 'list': {
      if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return { value: [...spec.default], problem: `expected a list of strings, got ${show(v)}` };
      if (spec.max !== undefined && v.length > spec.max) return { value: v.slice(0, spec.max), problem: `at most ${spec.max} entries, got ${v.length}` };
      return { value: [...v] };
    }
    case 'choice':
      return typeof v === 'string' && spec.options.includes(v)
        ? { value: v }
        : { value: spec.default, problem: `expected one of ${spec.options.map((o) => `"${o}"`).join(', ')}, got ${show(v)}` };
    default:
      return typeof v === 'string' ? { value: v } : { value: spec.default, problem: `expected text, got ${show(v)}` };
  }
}

/**
 * Validates raw props (a file, the CLI, an AI). Bad values are replaced by the default (numbers out of
 * range are clamped) and reported; unknown keys are kept untouched (a newer version may use them).
 * `props` is what to store: the raw object minus the bad values, with clamped numbers.
 */
export function validateProps(def: AnyComponentDef, raw: Record<string, unknown>): { props: Record<string, unknown>; problems: { key: string; message: string }[] } {
  const props: Record<string, unknown> = { ...raw };
  const problems: { key: string; message: string }[] = [];
  for (const [key, spec] of Object.entries(def.props as PropSpecs)) {
    if (raw[key] === undefined) continue;
    const r = checkProp(spec, raw[key]);
    if (!r.problem) continue;
    problems.push({ key, message: `${r.problem}; ${spec.type === 'number' && typeof raw[key] === 'number' ? 'clamped' : 'using the default'}` });
    if (spec.type === 'number' && typeof raw[key] === 'number' && Number.isFinite(raw[key])) props[key] = r.value;
    else if (spec.type === 'list' && Array.isArray(raw[key]) && (raw[key] as unknown[]).every((x) => typeof x === 'string')) props[key] = r.value;
    else delete props[key];
  }
  return { props, problems };
}

/** Prop values with defaults filled in and wrong types replaced by the default. Never throws. */
export function resolveProps<S extends PropSpecs>(def: ComponentDef<S>, raw: Record<string, unknown>): PropsOf<S> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(def.props)) out[key] = checkProp(spec, raw?.[key]).value;
  return out as PropsOf<S>;
}

/** Default values of every prop (what a new instance starts with). */
export const defaultProps = <S extends PropSpecs>(def: ComponentDef<S>): PropsOf<S> => resolveProps(def, {});

/** Whether a prop's field applies, given the resolved values of the other props (`visibleWhen`). */
export function isPropVisible(spec: PropSpec, props: Readonly<Record<string, unknown>>): boolean {
  if (!spec.visibleWhen) return true;
  return Object.entries(spec.visibleWhen).every(([key, cond]) => {
    const v = props[key];
    return Array.isArray(cond) ? cond.includes(v as PropScalar) : v === cond;
  });
}
