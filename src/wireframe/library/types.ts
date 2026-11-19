// The component contract (docs/wireframe-mode.md → Semantic components). One folder per kind,
// `src/wireframe/library/<kind>/index.ts`, `export default defineComponent({...})`; the registry
// discovers them. The component system workstream owns the library panel, the generated
// properties section and the real components; this file is the seam they build on.
import type { LayoutSize, ScreenPlatform, SceneNode } from '@/model';

export type PropSpec =
  | { type: 'text' | 'multiline' | 'icon'; label: string; default: string }
  | { type: 'number'; label: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'choice'; label: string; options: readonly string[]; default: string }
  | { type: 'list'; label: string; default: readonly string[] };

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
}

export interface ComponentDef<S extends PropSpecs = PropSpecs> {
  kind: string;
  label: string;
  /** Where the library panel shows it first; 'all' = common. */
  platforms: readonly ScreenPlatform[] | 'all';
  category: string;
  /** Drives the generated properties section. */
  props: S;
  /** Default behaviour inside a stack. */
  sizing: { width: LayoutSize; height: LayoutSize };
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

/** Prop values with defaults filled in and wrong types replaced by the default. */
export function resolveProps<S extends PropSpecs>(def: ComponentDef<S>, raw: Record<string, unknown>): PropsOf<S> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(def.props)) {
    const v = raw[key];
    switch (spec.type) {
      case 'number':
        out[key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, v)) : spec.default;
        break;
      case 'boolean':
        out[key] = typeof v === 'boolean' ? v : spec.default;
        break;
      case 'list':
        out[key] = Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...v] : [...spec.default];
        break;
      case 'choice':
        out[key] = typeof v === 'string' && spec.options.includes(v) ? v : spec.default;
        break;
      default:
        out[key] = typeof v === 'string' ? v : spec.default;
    }
  }
  return out as PropsOf<S>;
}
