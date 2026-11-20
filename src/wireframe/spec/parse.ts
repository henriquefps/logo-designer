// Parses and validates a wireframe spec (./types.ts) into its normalized form. Pure. Collects every
// problem with its spec path (`screens[1].root[3].list-row.trailing: "arrow" is not one of none, …`)
// and throws one `SpecError` listing them all, so an agent fixes a spec in one round.
import { PLATFORM_IDS, type LayoutKind, type LayoutSize, type SceneNode, type ScreenPlatform } from '@/model';
import { validateDocument } from '@/io/projectFile';
import { getComponent, getComponents } from '../library/registry';
import type { AnyComponentDef, PropSpec } from '../library/types';
import { normalizeIconName } from '../icons';
import { MAX_REPEAT } from '../repeat';
import { SCREEN_STATUSES } from '../flows';
import {
  ALIGNS,
  COMMON_KEYS,
  CONTAINER_KEYS,
  CONTAINER_KINDS,
  FORM_KEYS,
  POSITIONS,
  RADII,
  RESERVED_KEYS,
  SpecError,
  STYLES,
  type NormCommon,
  type NormComponent,
  type NormFlow,
  type NormNode,
  type NormNote,
  type NormScreen,
  type NormSpec,
  type NormVariant,
  type SpecIssue,
} from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const show = (v: unknown) => (typeof v === 'string' ? `"${v}"` : v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : String(v));
const join = (path: string, key: string | number) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);
const oneOf = (v: unknown, options: readonly string[]) => `${show(v)} is not one of ${options.join(', ')}`;

/** The prop a string short form sets (`{ "button": "Save" }`): the first text prop. */
export function primaryTextProp(def: AnyComponentDef): string | undefined {
  return Object.entries(def.props as Record<string, PropSpec>).find(([, s]) => s.type === 'text' || s.type === 'multiline')?.[0];
}

/** The prop a list short form sets (`{ "tabs": ["A", "B"] }`): the first list prop. */
export function primaryListProp(def: AnyComponentDef): string | undefined {
  return Object.entries(def.props as Record<string, PropSpec>).find(([, s]) => s.type === 'list')?.[0];
}

/** Levenshtein distance ≤ 2 suggestions, for "did you mean". */
function suggest(word: string, options: readonly string[]): string {
  const d = (a: string, b: string) => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  };
  const best = options.map((o) => ({ o, s: d(word.toLowerCase(), o.toLowerCase()) })).filter((x) => x.s <= 2).sort((a, b) => a.s - b.s)[0];
  return best ? ` (did you mean "${best.o}"?)` : '';
}

class Parser {
  issues: SpecIssue[] = [];
  private kinds = getComponents().map((d) => d.kind);

  fail(path: string, message: string) {
    this.issues.push({ path, message });
  }

  // ---------- scalars ----------

  str(o: Obj, key: string, path: string, required = false): string | undefined {
    const v = o[key];
    if (v === undefined) {
      if (required) this.fail(join(path, key), 'is required');
      return undefined;
    }
    if (typeof v !== 'string') return void this.fail(join(path, key), `expected text, got ${show(v)}`);
    return v;
  }

  num(o: Obj, key: string, path: string, min = -Infinity, max = Infinity): number | undefined {
    const v = o[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v)) return void this.fail(join(path, key), `expected a number, got ${show(v)}`);
    if (v < min || v > max) return void this.fail(join(path, key), `${v} is out of range (${min}..${max})`);
    return v;
  }

  bool(o: Obj, key: string, path: string): boolean | undefined {
    const v = o[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'boolean') return void this.fail(join(path, key), `expected true or false, got ${show(v)}`);
    return v;
  }

  choice<T extends string>(o: Obj, key: string, path: string, options: readonly T[]): T | undefined {
    const v = o[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !options.includes(v as T)) return void this.fail(join(path, key), oneOf(v, options));
    return v as T;
  }

  layoutSize(o: Obj, key: string, path: string): LayoutSize | undefined {
    const v = o[key];
    if (v === undefined) return undefined;
    if (v === 'fill' || v === 'hug') return v;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    return void this.fail(join(path, key), `expected "fill", "hug" or a size in px, got ${show(v)}`);
  }

  unknownKeys(o: Obj, path: string, allowed: readonly string[]) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.fail(join(path, k), `unknown key${suggest(k, allowed)}`);
  }

  list(o: Obj, key: string, path: string, required = false): unknown[] | undefined {
    const v = o[key];
    if (v === undefined) {
      if (required) this.fail(join(path, key), 'is required');
      return undefined;
    }
    if (!Array.isArray(v)) return void this.fail(join(path, key), `expected a list, got ${show(v)}`);
    return v;
  }

  // ---------- nodes ----------

  common(o: Obj, path: string): NormCommon {
    const size = o.size;
    let box: NormCommon['size'];
    if (size !== undefined) {
      if (isObj(size) && typeof size.width === 'number' && typeof size.height === 'number' && size.width >= 0 && size.height >= 0) box = { width: size.width, height: size.height };
      else this.fail(join(path, 'size'), `expected { "width": n, "height": n }, got ${show(size)}`);
    }
    let scale: NormCommon['scale'];
    if (o.scale !== undefined) {
      const s = o.scale;
      if (Array.isArray(s) && s.length === 2 && s.every((x) => typeof x === 'number' && Number.isFinite(x) && x !== 0)) scale = [s[0], s[1]];
      else this.fail(join(path, 'scale'), `expected [scaleX, scaleY], got ${show(s)}`);
    }
    const opensRaw = o.opens;
    let opens: string[] = [];
    if (opensRaw !== undefined) {
      if (typeof opensRaw === 'string') opens = [opensRaw];
      else if (Array.isArray(opensRaw) && opensRaw.every((x) => typeof x === 'string')) opens = opensRaw as string[];
      else this.fail(join(path, 'opens'), `expected a screen name (or a list of them), got ${show(opensRaw)}`);
    }
    const id = this.str(o, 'id', path);
    if (id !== undefined && !id.trim()) this.fail(join(path, 'id'), 'is empty');
    return {
      path,
      id,
      name: this.str(o, 'name', path),
      hidden: this.bool(o, 'hidden', path) ?? false,
      locked: this.bool(o, 'locked', path) ?? false,
      opacity: this.num(o, 'opacity', path, 0, 1),
      width: this.layoutSize(o, 'width', path),
      height: this.layoutSize(o, 'height', path),
      position: this.choice(o, 'position', path, POSITIONS),
      bleed: this.bool(o, 'bleed', path),
      x: this.num(o, 'x', path),
      y: this.num(o, 'y', path),
      rotation: this.num(o, 'rotation', path),
      scale,
      size: box,
      opens,
      note: this.str(o, 'note', path),
    };
  }

  nodes(v: unknown, path: string): NormNode[] {
    if (!Array.isArray(v)) {
      this.fail(path, `expected a list of nodes, got ${show(v)}`);
      return [];
    }
    return v.map((n, i) => this.node(n, join(path, i))).filter((n): n is NormNode => !!n);
  }

  node(v: unknown, path: string): NormNode | null {
    if (!isObj(v)) {
      this.fail(path, `expected a node object (e.g. { "heading": "Title" }), got ${show(v)}`);
      return null;
    }
    const formKeys: readonly string[] = FORM_KEYS;
    const forms = Object.keys(v).filter((k) => formKeys.includes(k) || (!RESERVED_KEYS.has(k) && !!getComponent(k)));
    if (forms.length === 0) {
      const unknown = Object.keys(v).find((k) => !RESERVED_KEYS.has(k));
      if (unknown) this.fail(join(path, unknown), `unknown component kind${suggest(unknown, this.kinds)} (\`designer wf components\` lists them)`);
      else this.fail(path, 'needs one of: a component kind (e.g. "list-row"), "vstack", "hstack", "grid", "use", "group" or "node"');
      return null;
    }
    if (forms.length > 1) {
      this.fail(path, `has several node kinds (${forms.join(', ')}); a node is one thing (put the others in a stack)`);
      return null;
    }
    const form = forms[0];
    const c = this.common(v, path);
    const commonKeys: readonly string[] = COMMON_KEYS;
    if ((CONTAINER_KINDS as readonly string[]).includes(form)) {
      this.unknownKeys(v, path, [...commonKeys, ...CONTAINER_KEYS, form]);
      const repeat = this.num(v, 'repeat', path, 1, MAX_REPEAT);
      if (repeat !== undefined && !Number.isInteger(repeat)) this.fail(join(path, 'repeat'), 'expected a whole number');
      const columns = this.num(v, 'columns', path, 1, 12);
      if (columns !== undefined && form !== 'grid') this.fail(join(path, 'columns'), 'only grids have columns');
      return {
        ...c,
        form: 'container',
        kind: form as LayoutKind,
        gap: this.num(v, 'gap', path, 0),
        padding: this.num(v, 'padding', path, 0),
        align: this.choice(v, 'align', path, ALIGNS),
        columns,
        style: this.choice(v, 'style', path, STYLES),
        radius: this.choice(v, 'radius', path, RADII),
        repeat,
        children: this.nodes(v[form], join(path, form)),
      };
    }
    const containerOnly = Object.keys(v).filter((k) => (CONTAINER_KEYS as readonly string[]).includes(k));
    for (const k of containerOnly) this.fail(join(path, k), `only stacks and grids take "${k}"`);
    if (form === 'use') {
      this.unknownKeys(v, path, [...commonKeys, ...CONTAINER_KEYS, 'use']);
      const ref = this.str(v, 'use', path);
      return ref === undefined ? null : { ...c, form: 'use', ref };
    }
    if (form === 'group') {
      this.unknownKeys(v, path, [...commonKeys, ...CONTAINER_KEYS, 'group']);
      return { ...c, form: 'group', children: this.nodes(v.group, join(path, 'group')) };
    }
    if (form === 'node') {
      this.unknownKeys(v, path, [...CONTAINER_KEYS, 'node', 'id', 'opens', 'note']);
      const node = this.rawNode(v.node, join(path, 'node'));
      return node ? { ...c, form: 'node', node } : null;
    }
    if (form === 'kind') {
      this.unknownKeys(v, path, [...commonKeys, ...CONTAINER_KEYS, 'kind', 'props']);
      const kind = this.str(v, 'kind', path);
      if (kind === undefined) return null;
      if (v.props !== undefined && !isObj(v.props)) {
        this.fail(join(path, 'props'), `expected an object of props, got ${show(v.props)}`);
        return null;
      }
      return this.component(c, kind, (v.props as Obj | undefined) ?? {}, join(path, 'props'), join(path, 'kind'));
    }
    // A component short form: `{ "<kind>": props | "text" | ["list"] | null }`.
    const def = getComponent(form)!;
    this.unknownKeys(v, path, [...commonKeys, ...CONTAINER_KEYS, form]);
    const raw = v[form];
    const propsPath = join(path, form);
    let props: Obj;
    if (raw === null || raw === undefined) props = {};
    else if (typeof raw === 'string') {
      const key = primaryTextProp(def);
      if (!key) {
        this.fail(propsPath, `${def.kind} has no text prop to set from a string; use { "${def.kind}": { … } }`);
        return null;
      }
      props = { [key]: raw };
    } else if (Array.isArray(raw)) {
      const key = primaryListProp(def);
      if (!key) {
        this.fail(propsPath, `${def.kind} has no list prop to set from a list; use { "${def.kind}": { … } }`);
        return null;
      }
      props = { [key]: raw };
    } else if (isObj(raw)) props = raw;
    else {
      this.fail(propsPath, `expected the props object (or a string / a list short form), got ${show(raw)}`);
      return null;
    }
    return this.component(c, form, props, propsPath, propsPath);
  }

  component(c: NormCommon, kind: string, raw: Obj, propsPath: string, kindPath: string): NormNode | null {
    const def = getComponent(kind);
    if (!def) {
      this.fail(kindPath, `unknown component kind ${show(kind)}${suggest(kind, this.kinds)} (\`designer wf components\` lists them)`);
      return null;
    }
    const specs = def.props as Record<string, PropSpec>;
    const props: Obj = {};
    for (const [key, value] of Object.entries(raw)) {
      const spec = specs[key];
      const p = join(propsPath, key);
      if (!spec) {
        this.fail(p, `${def.kind} has no prop "${key}"${suggest(key, Object.keys(specs))}; props: ${Object.keys(specs).join(', ')}`);
        continue;
      }
      const ok = this.prop(spec, value, p);
      if (ok !== undefined) props[key] = ok;
    }
    if (def.hidden) this.fail(kindPath, `${def.kind} is not a library component (it only exists so old files load)`);
    return { ...c, form: 'component', kind: def.kind, props };
  }

  prop(spec: PropSpec, v: unknown, path: string): unknown {
    switch (spec.type) {
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) return void this.fail(path, `expected a number, got ${show(v)}`);
        if ((spec.min !== undefined && v < spec.min) || (spec.max !== undefined && v > spec.max)) return void this.fail(path, `${v} is out of range (${spec.min ?? '−∞'}..${spec.max ?? '∞'})`);
        return v;
      case 'boolean':
        return typeof v === 'boolean' ? v : void this.fail(path, `expected true or false, got ${show(v)}`);
      case 'choice':
        return typeof v === 'string' && spec.options.includes(v) ? v : void this.fail(path, oneOf(v, spec.options));
      case 'list':
        if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return void this.fail(path, `expected a list of strings, got ${show(v)}`);
        if (spec.min !== undefined && v.length < spec.min) return void this.fail(path, `needs at least ${spec.min} entries, got ${v.length}`);
        if (spec.max !== undefined && v.length > spec.max) return void this.fail(path, `at most ${spec.max} entries, got ${v.length}`);
        return [...v];
      case 'icon':
        return typeof v === 'string' ? normalizeIconName(v) : void this.fail(path, `expected an icon name (e.g. "heart", "lucide:Heart", "ph:heart"), got ${show(v)}`);
      default:
        return typeof v === 'string' ? v : void this.fail(path, `expected text, got ${show(v)}`);
    }
  }

  rawNode(v: unknown, path: string): SceneNode | null {
    if (!isObj(v)) {
      this.fail(path, `expected a project-file object, got ${show(v)}`);
      return null;
    }
    try {
      const doc = validateDocument({ schemaVersion: 1, artboard: { width: 1, height: 1 }, children: [v], wireframe: { screens: [] } });
      return doc.children[0] ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.fail(path, msg.replace(/children\[0\]\.?/g, '').replace(/^This project file is damaged at /, 'invalid object: '));
      return null;
    }
  }

  // ---------- top level ----------

  frameLayout(v: unknown, path: string): NormVariant['layout'] {
    if (v === undefined) return undefined;
    if (v === 'free' || v === null) return null;
    if (!isObj(v)) return void this.fail(path, `expected "free" or { kind, gap, padding, align, columns }, got ${show(v)}`);
    this.unknownKeys(v, path, ['kind', 'gap', 'padding', 'align', 'columns']);
    return {
      kind: this.choice(v, 'kind', path, CONTAINER_KINDS),
      gap: this.num(v, 'gap', path, 0),
      padding: this.num(v, 'padding', path, 0),
      align: this.choice(v, 'align', path, ALIGNS),
      columns: this.num(v, 'columns', path, 1, 12),
    };
  }

  variant(o: Obj, path: string, idKey: 'id' | 'frameId', fallbackPlatform?: ScreenPlatform): NormVariant | null {
    const platform = this.choice(o, 'platform', path, PLATFORM_IDS) ?? (o.platform === undefined ? fallbackPlatform : undefined);
    if (!platform) {
      if (o.platform === undefined) this.fail(join(path, 'platform'), `is required (${PLATFORM_IDS.join(', ')})`);
      return null;
    }
    return {
      path,
      platform,
      id: this.str(o, idKey, path),
      x: this.num(o, 'x', path),
      y: this.num(o, 'y', path),
      width: this.num(o, 'width', path, 1, 10000),
      layout: this.frameLayout(o.layout, join(path, 'layout')),
      root: o.root === undefined ? [] : this.nodes(o.root, join(path, 'root')),
    };
  }

  screen(v: unknown, path: string): NormScreen | null {
    if (!isObj(v)) {
      this.fail(path, `expected a screen object, got ${show(v)}`);
      return null;
    }
    const short = ['platform', 'frameId', 'x', 'y', 'width', 'layout', 'root'];
    const name = this.str(v, 'name', path, true);
    const status = v.status === null ? null : this.choice(v, 'status', path, SCREEN_STATUSES);
    let variants: NormVariant[] = [];
    if (v.variants !== undefined) {
      this.unknownKeys(v, path, ['name', 'id', 'status', 'variants']);
      const list = this.list(v, 'variants', path) ?? [];
      if (!list.length) this.fail(join(path, 'variants'), 'needs at least one variant');
      variants = list
        .map((x, i) => {
          const p = join(join(path, 'variants'), i);
          if (!isObj(x)) return void this.fail(p, `expected a variant object, got ${show(x)}`);
          this.unknownKeys(x, p, ['platform', 'id', 'x', 'y', 'width', 'layout', 'root']);
          return this.variant(x, p, 'id');
        })
        .filter((x): x is NormVariant => !!x);
      const seen = new Set<string>();
      variants.forEach((x) => {
        if (seen.has(x.platform)) this.fail(join(x.path, 'platform'), `a second ${x.platform} variant (one frame per platform)`);
        seen.add(x.platform);
      });
    } else {
      this.unknownKeys(v, path, ['name', 'id', 'status', ...short]);
      const one = this.variant(v, path, 'frameId', 'phone');
      if (one) variants = [one];
    }
    if (name === undefined) return null;
    if (!name.trim()) this.fail(join(path, 'name'), 'is empty');
    return { path, name: name.trim(), id: this.str(v, 'id', path), status, variants };
  }

  spec(v: unknown): NormSpec {
    if (!isObj(v)) {
      this.fail('', `a wireframe spec is a JSON object with "screens", got ${show(v)}`);
      return { screens: [] };
    }
    this.unknownKeys(v, '', ['$schema', 'version', 'name', 'components', 'screens', 'canvas', 'flows', 'notes']);
    const version = this.num(v, 'version', '');
    if (version !== undefined && version !== 1) this.fail('version', `this Designer reads version 1 specs (got ${version})`);
    const out: NormSpec = { name: this.str(v, 'name', ''), screens: [] };
    const components = this.list(v, 'components', '');
    if (components) {
      out.components = components
        .map((c, i): NormComponent | null => {
          const p = `components[${i}]`;
          if (!isObj(c)) return (this.fail(p, `expected { "name", "content" }, got ${show(c)}`), null);
          this.unknownKeys(c, p, ['name', 'id', 'content']);
          const name = this.str(c, 'name', p, true);
          if (c.content === undefined) this.fail(join(p, 'content'), 'is required (a stack or a group)');
          const content = c.content === undefined ? null : this.node(c.content, join(p, 'content'));
          if (content && content.form !== 'container' && content.form !== 'group') this.fail(join(p, 'content'), 'a shared component is a stack, a grid or a group');
          if (content && (content.id !== undefined || content.name !== undefined)) this.fail(join(p, 'content'), 'the content takes its id and name from the component (set them on the component)');
          return name && content ? { path: p, name: name.trim(), id: this.str(c, 'id', p), content } : null;
        })
        .filter((c): c is NormComponent => !!c);
    }
    const screens = this.list(v, 'screens', '', true) ?? [];
    out.screens = screens.map((s, i) => this.screen(s, `screens[${i}]`)).filter((s): s is NormScreen => !!s);
    const names = new Map<string, string>();
    for (const s of out.screens) {
      const k = s.name.toLowerCase();
      if (names.has(k)) this.fail(join(s.path, 'name'), `"${s.name}" is already the name of ${names.get(k)} (screen names are unique)`);
      else names.set(k, s.path);
    }
    if (v.canvas !== undefined) out.canvas = this.nodes(v.canvas, 'canvas');
    const flows = this.list(v, 'flows', '');
    if (flows) {
      out.flows = flows
        .map((f, i): NormFlow | null => {
          const p = `flows[${i}]`;
          if (!isObj(f)) return (this.fail(p, `expected { "from", "to" }, got ${show(f)}`), null);
          this.unknownKeys(f, p, ['id', 'from', 'to', 'label']);
          const from = this.str(f, 'from', p, true);
          const to = this.str(f, 'to', p, true);
          return from !== undefined && to !== undefined ? { path: p, id: this.str(f, 'id', p), from, to, label: this.str(f, 'label', p) } : null;
        })
        .filter((f): f is NormFlow => !!f);
    }
    const notes = this.list(v, 'notes', '');
    if (notes) {
      out.notes = notes
        .map((n, i): NormNote | null => {
          const p = `notes[${i}]`;
          if (!isObj(n)) return (this.fail(p, `expected { "text", "on"? }, got ${show(n)}`), null);
          this.unknownKeys(n, p, ['id', 'text', 'on', 'x', 'y']);
          const text = this.str(n, 'text', p, true);
          return text !== undefined ? { path: p, id: this.str(n, 'id', p), text, on: this.str(n, 'on', p), x: this.num(n, 'x', p), y: this.num(n, 'y', p) } : null;
        })
        .filter((n): n is NormNote => !!n);
    }
    this.checkIds(out);
    return out;
  }

  /** Ids given in the spec must be unique (nodes, frames, screens, components, flows, notes each in their own space). */
  checkIds(spec: NormSpec) {
    const nodeIds = new Map<string, string>();
    const claim = (id: string | undefined, path: string, space: Map<string, string>) => {
      if (id === undefined) return;
      const prev = space.get(id);
      if (prev) this.fail(path, `id "${id}" is already used at ${prev}`);
      else space.set(id, path);
    };
    const visit = (n: NormNode) => {
      claim(n.id, join(n.path, 'id'), nodeIds);
      if (n.form === 'container' || n.form === 'group') n.children.forEach(visit);
      if (n.form === 'node') claim(n.node.id, join(n.path, 'node.id'), nodeIds);
    };
    for (const s of spec.screens) {
      for (const v of s.variants) {
        claim(v.id, join(v.path, 'id'), nodeIds);
        v.root.forEach(visit);
      }
    }
    spec.canvas?.forEach(visit);
    spec.notes?.forEach((n) => claim(n.id, join(n.path, 'id'), nodeIds));
    const screenIds = new Map<string, string>();
    spec.screens.forEach((s) => claim(s.id, join(s.path, 'id'), screenIds));
    const symbolIds = new Map<string, string>();
    spec.components?.forEach((c) => claim(c.id, join(c.path, 'id'), symbolIds));
    const names = new Map<string, string>();
    spec.components?.forEach((c) => claim(c.name.toLowerCase(), join(c.path, 'name'), names));
    const flowIds = new Map<string, string>();
    spec.flows?.forEach((f) => claim(f.id, join(f.path, 'id'), flowIds));
    // Master content lives in its own id space (each instance prefixes it), but must be unique inside one master.
    for (const c of spec.components ?? []) {
      const own = new Map<string, string>();
      const inner = (n: NormNode) => {
        claim(n.id, join(n.path, 'id'), own);
        if (n.form === 'container' || n.form === 'group') n.children.forEach(inner);
      };
      if (c.content.form === 'container' || c.content.form === 'group') c.content.children.forEach(inner);
    }
  }
}

/** Parses a spec (already JSON-decoded). Throws `SpecError` with every problem found. */
export function parseSpec(input: unknown): NormSpec {
  const p = new Parser();
  const spec = p.spec(input);
  if (p.issues.length) throw new SpecError(p.issues);
  return spec;
}

/** Checks a spec without building it: the problems (empty = fine). */
export function checkSpec(input: unknown): SpecIssue[] {
  try {
    parseSpec(input);
    return [];
  } catch (e) {
    if (e instanceof SpecError) return e.issues;
    throw e;
  }
}
