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
  /**
   * `auto`: the prop may also hold the string `'auto'` (a navigation's selected item that follows the screen, see
   * `ComponentDef.selectFromPart`). `auto.default`: an unset prop (a new instance) is `'auto'`. Builds never see
   * `'auto'`: `resolveProps` replaces it with what the pipeline resolved, else `default`.
   */
  | (PropBase & { type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string; auto?: AutoSpec })
  | (PropBase & { type: 'boolean'; default: boolean })
  /** `labels` maps an option to its label in the panel (default: the option, capitalised). */
  | (PropBase & { type: 'choice'; options: readonly string[]; default: string; labels?: Readonly<Record<string, string>> })
  /** A list of strings (tab labels, table columns). `item` names one entry in the editor ("Tab"). */
  | (PropBase & { type: 'list'; default: readonly string[]; item?: string; min?: number; max?: number });

export type PropType = PropSpec['type'];

/** A number prop that can follow the screen (`'auto'`). */
export interface AutoSpec {
  /** Option label in the properties panel ("Follows the screen"). */
  label: string;
  /** New instances (and unset props) are `'auto'`. */
  default?: boolean;
}

export const AUTO = 'auto';

/**
 * A piece of a component's drawing a person taps (a bottom navigation item, a tab, a back button, a dialog
 * action): flows can start at it (docs/wireframe-mode.md → Links from parts of a component).
 */
export interface ComponentPart {
  /**
   * Stable key. Items of a list prop: `<prefix>:<index>` (0-based index into the list, the prefix declared in
   * `partLists`, e.g. `item:2`); fixed pieces: a name (`back`, `primary`, `action:1`).
   */
  key: string;
  /** What it says (the list entry, the button text, "Back"): shown in the UI, matched by the spec format. */
  label: string;
  /** In the instance's local space (origin = its top-left), inside the built box. */
  rect: { x: number; y: number; width: number; height: number };
}

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

/** The box a component is built for. `width` always; `height` when the parent or the user fixes it (only for components with `resizable.height`). */
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
  /**
   * Which axes the user can size (defaults: width true, height false). A resizable height means `build()` uses
   * `size.height` when given: the surface fills the box, the content keeps its natural place, and the box
   * never gets shorter than the content. A fixed axis has no handle and a read-only W/H field ("Height
   * follows the content"); the layout ignores any size set for it. See `resizableAxes`.
   */
  resizable?: { width?: boolean; height?: boolean };
  /** Size of a new instance outside a stack (and of instances without `component.size`). */
  defaultSize: { width: number; height: number };
  /** Pure and deterministic: same props + size → same children. */
  build(props: PropsOf<S>, size: BuildSize): BuildResult;
  /**
   * One line for the AI export, e.g. 'List row "Language" → value "English"'. `opens`: the part flows of this
   * instance ("→ opens Arquivos" by part key); a component that writes them inline (`describeItems`) reads them
   * with `opens.take(key)`, the export lists the ones it did not take under the line.
   */
  describe(props: PropsOf<S>, opens?: PartOpens): string;
  /**
   * The parts a person taps, for the size the instance was built at (only what is drawn: an item cut by the
   * width has no part). Pure, like `build`, and the rects lie inside the build's box (the contract test).
   */
  parts?(props: PropsOf<S>, size: { width: number; height: number }): ComponentPart[];
  /**
   * List props whose entries are parts: key prefix → prop (`{ item: 'labels' }`). Flows on those parts are
   * remapped when the list changes (reorder, rename, removal; `remapPartKey`).
   */
  partLists?: Readonly<Record<string, string>>;
  /**
   * For props with `auto` (`selected`): the value a part stands for (`item:2` → 3), or null when that part
   * does not select anything. The pipeline uses it to draw selected the item that opens the current screen.
   */
  selectFromPart?(props: PropsOf<S>, key: string): number | null;
}

/** Part flows handed to `describe`: the text to write for a part ("→ opens Arquivos"), marked as used once read. */
export interface PartOpens {
  take(key: string): string | undefined;
  /** Whether part `key` has flows (without marking it written). */
  has(key: string): boolean;
}

/** The axes of a definition the user can size, defaults applied. */
export const resizableAxes = (def: Pick<AnyComponentDef, 'resizable'>): { width: boolean; height: boolean } => ({ width: def.resizable?.width ?? true, height: def.resizable?.height ?? false });

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
  if (v === undefined) return { value: spec.type === 'list' ? [...spec.default] : spec.type === 'number' && spec.auto?.default ? AUTO : spec.default };
  switch (spec.type) {
    case 'number': {
      if (v === AUTO && spec.auto) return { value: AUTO };
      if (typeof v !== 'number' || !Number.isFinite(v)) return { value: spec.auto?.default ? AUTO : spec.default, problem: `expected a number${spec.auto ? ' or "auto"' : ''}, got ${show(v)}` };
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

/**
 * Prop values with defaults filled in and wrong types replaced by the default, ready for `build` / `describe`.
 * `'auto'` becomes `resolved[key]` (what the pipeline worked out for the instance, `component.resolved`), else the
 * prop's `default`. Never throws.
 */
export function resolveProps<S extends PropSpecs>(def: ComponentDef<S>, raw: Record<string, unknown>, resolved?: Readonly<Record<string, number>>): PropsOf<S> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(def.props)) {
    const v = checkProp(spec, raw?.[key]).value;
    out[key] = v === AUTO && spec.type === 'number' ? (resolved?.[key] ?? spec.default) : v;
  }
  return out as PropsOf<S>;
}

/** Prop values as stored on an instance: like `resolveProps`, but `'auto'` stays `'auto'`. */
export function storedProps(def: AnyComponentDef, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(def.props as PropSpecs)) out[key] = checkProp(spec, raw?.[key]).value;
  return out;
}

/** Default values of every prop, resolved for building (`'auto'` → the first item). */
export const defaultProps = <S extends PropSpecs>(def: ComponentDef<S>): PropsOf<S> => resolveProps(def, {});

/** What a new instance stores: the defaults, `'auto'` kept (a new bottom navigation follows the screen). */
export const initialProps = (def: AnyComponentDef): Record<string, unknown> => storedProps(def, {});

/** True when the stored value of `key` is `'auto'` (set, or unset with an `auto.default` spec). */
export function isAutoProp(def: AnyComponentDef, raw: Record<string, unknown>, key: string): boolean {
  const spec = (def.props as PropSpecs)[key];
  return !!spec && spec.type === 'number' && !!spec.auto && checkProp(spec, raw?.[key]).value === AUTO;
}

/** Props of `def` that can be `'auto'`. */
export const autoProps = (def: AnyComponentDef): string[] => Object.entries(def.props as PropSpecs).filter(([, s]) => s.type === 'number' && !!s.auto).map(([k]) => k);

/** The parts of an instance (none for components without `parts`; never throws). */
export function partsOf(def: AnyComponentDef, raw: Record<string, unknown>, size: { width: number; height: number }, resolved?: Readonly<Record<string, number>>): ComponentPart[] {
  if (!def.parts) return [];
  try {
    return def.parts(resolveProps(def, raw, resolved), size);
  } catch {
    return [];
  }
}

/** Whether a prop's field applies, given the resolved values of the other props (`visibleWhen`). */
export function isPropVisible(spec: PropSpec, props: Readonly<Record<string, unknown>>): boolean {
  if (!spec.visibleWhen) return true;
  return Object.entries(spec.visibleWhen).every(([key, cond]) => {
    const v = props[key];
    return Array.isArray(cond) ? cond.includes(v as PropScalar) : v === cond;
  });
}
