import { newId, type Artboard, type DesignDocument, type IconDocInfo, type Paint, type SceneNode, type Stroke, type SubPath } from '@/model';
import { downloadBlob, safeFileName } from './download';

export const PROJECT_EXTENSION = '.designer.json';
export const PROJECT_FORMAT = 'designer';

/** Public JSON Schema of `.designer.json` (generated from `src/model/types.ts`, see docs/project-format.md). */
export const PROJECT_SCHEMA_URL = 'https://designer.hfps.dev/schema/designer-project.schema.json';

export function serializeProject(doc: DesignDocument): string {
  return JSON.stringify({ $schema: PROJECT_SCHEMA_URL, format: PROJECT_FORMAT, ...doc }, null, 2) + '\n';
}

// ---------- validation ----------
// Every check names the JSON path that is wrong (`children[2].fill.stops[0].color`) so a person or
// an agent writing the file by hand can fix it. Optional fields get their defaults.

class Invalid extends Error {}
const fail = (path: string, problem: string): never => {
  throw new Invalid(`${path || '(root)'}: ${problem}`);
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const show = (v: unknown) => {
  if (v === undefined) return 'nothing';
  const s = JSON.stringify(v);
  return s && s.length > 40 ? s.slice(0, 37) + '…' : String(s);
};
const at = (path: string, key: string | number) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);
const finite = (v: unknown, path: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(path, `expected a number, got ${show(v)}`);
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path, `expected a string, got ${show(v)}`));
const obj = (v: unknown, path: string): Obj => (isObj(v) ? v : fail(path, `expected an object, got ${show(v)}`));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, `expected an array, got ${show(v)}`));
/** Optional enum: missing → fallback; present but wrong → error listing the options. */
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T, path: string): T => {
  if (v === undefined) return fallback;
  return options.includes(v as T) ? (v as T) : fail(path, `expected one of ${options.map((o) => `"${o}"`).join(', ')}, got ${show(v)}`);
};
const color = (v: unknown, path: string) =>
  typeof v === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v.toLowerCase() : fail(path, `expected a color "#rrggbb" or "#rrggbbaa", got ${show(v)}`);

const PAINT_KINDS = ['none', 'solid', 'linear', 'radial'] as const;

function paint(v: unknown, path: string): Paint {
  const p = obj(v, path);
  switch (p.kind) {
    case 'none':
      return { kind: 'none' };
    case 'solid':
      return { kind: 'solid', color: color(p.color, at(path, 'color')) };
    case 'linear':
    case 'radial': {
      const list = arr(p.stops, at(path, 'stops'));
      if (!list.length) fail(at(path, 'stops'), 'a gradient needs at least one stop');
      const stops = list.map((s, i) => {
        const sp = at(at(path, 'stops'), i);
        const so = obj(s, sp);
        return { offset: Math.max(0, Math.min(1, finite(so.offset, at(sp, 'offset')))), color: color(so.color, at(sp, 'color')) };
      });
      if (p.kind === 'radial') return { kind: 'radial', stops };
      return { kind: 'linear', stops, angle: p.angle === undefined ? 0 : finite(p.angle, at(path, 'angle')) };
    }
    default:
      return fail(at(path, 'kind'), `expected one of ${PAINT_KINDS.map((k) => `"${k}"`).join(', ')}, got ${show(p.kind)}`);
  }
}

function stroke(v: unknown, path: string): Stroke {
  const s = obj(v, path);
  const dash = s.dash === undefined ? [] : arr(s.dash, at(path, 'dash'));
  return {
    paint: paint(s.paint, at(path, 'paint')),
    width: Math.max(0, finite(s.width, at(path, 'width'))),
    cap: oneOf(s.cap, ['butt', 'round', 'square'] as const, 'butt', at(path, 'cap')),
    join: oneOf(s.join, ['miter', 'round', 'bevel'] as const, 'miter', at(path, 'join')),
    dash: dash.map((d, i) => Math.max(0, finite(d, at(at(path, 'dash'), i)))),
  };
}

const vec = (v: unknown, path: string) => {
  const o = obj(v, path);
  return { x: finite(o.x, at(path, 'x')), y: finite(o.y, at(path, 'y')) };
};

function subpaths(v: unknown, path: string): SubPath[] {
  return arr(v, path).map((raw, i) => {
    const sp = at(path, i);
    const o = obj(raw, sp);
    const pp = at(sp, 'points');
    return {
      closed: o.closed === true,
      points: arr(o.points, pp).map((rp, j) => {
        const ptPath = at(pp, j);
        const p = obj(rp, ptPath);
        const out: SubPath['points'][number] = {
          x: finite(p.x, at(ptPath, 'x')),
          y: finite(p.y, at(ptPath, 'y')),
          type: oneOf(p.type, ['corner', 'smooth', 'symmetric'] as const, 'corner', at(ptPath, 'type')),
        };
        if (p.in !== undefined) out.in = vec(p.in, at(ptPath, 'in'));
        if (p.out !== undefined) out.out = vec(p.out, at(ptPath, 'out'));
        return out;
      }),
    };
  });
}

export const NODE_TYPES = ['group', 'path', 'rect', 'ellipse', 'polygon', 'text', 'image'] as const;

function node(v: unknown, ids: Set<string>, depth: number, path: string): SceneNode {
  if (depth > 64) fail(path, 'groups are nested too deep (max 64)');
  const o = obj(v, path);
  const type = str(o.type, at(path, 'type'));
  if (!(NODE_TYPES as readonly string[]).includes(type)) {
    fail(at(path, 'type'), `unknown node type "${type}" (expected one of ${NODE_TYPES.join(', ')})`);
  }
  const k = (key: string) => at(path, key);
  let id = typeof o.id === 'string' && o.id ? o.id : newId();
  if (ids.has(id)) id = newId();
  ids.add(id);
  const tp = k('transform');
  const t = o.transform === undefined ? {} : obj(o.transform, tp);
  const base = {
    id,
    name: typeof o.name === 'string' ? o.name : type,
    visible: o.visible !== false,
    locked: o.locked === true,
    ...(o.reference === true ? { reference: true } : {}),
    opacity: o.opacity === undefined ? 1 : Math.max(0, Math.min(1, finite(o.opacity, k('opacity')))),
    ...(typeof o.blendMode === 'string' ? { blendMode: o.blendMode } : {}),
    transform: {
      x: finite(t.x ?? 0, at(tp, 'x')),
      y: finite(t.y ?? 0, at(tp, 'y')),
      rotation: finite(t.rotation ?? 0, at(tp, 'rotation')),
      scaleX: finite(t.scaleX ?? 1, at(tp, 'scaleX')),
      scaleY: finite(t.scaleY ?? 1, at(tp, 'scaleY')),
    },
  };
  const painted = () => ({
    fill: o.fill === undefined ? ({ kind: 'none' } as Paint) : paint(o.fill, k('fill')),
    stroke: o.stroke === undefined ? NO_STROKE() : stroke(o.stroke, k('stroke')),
  });
  switch (type) {
    case 'group':
      return { ...base, type, children: arr(o.children, k('children')).map((c, i) => node(c, ids, depth + 1, at(k('children'), i))) };
    case 'path':
      return { ...base, type, ...painted(), subpaths: subpaths(o.subpaths, k('subpaths')), fillRule: oneOf(o.fillRule, ['nonzero', 'evenodd'] as const, 'nonzero', k('fillRule')) };
    case 'rect':
      return { ...base, type, ...painted(), width: finite(o.width, k('width')), height: finite(o.height, k('height')), radius: Math.max(0, finite(o.radius ?? 0, k('radius'))) };
    case 'ellipse':
      return { ...base, type, ...painted(), rx: finite(o.rx, k('rx')), ry: finite(o.ry, k('ry')) };
    case 'polygon': {
      const p = { ...base, type, ...painted(), sides: Math.max(3, Math.round(finite(o.sides, k('sides')))), radius: finite(o.radius, k('radius')) };
      return o.innerRadius === undefined ? p : { ...p, innerRadius: finite(o.innerRadius, k('innerRadius')) };
    }
    case 'text':
      return {
        ...base,
        type,
        ...painted(),
        text: str(o.text, k('text')),
        fontFamily: o.fontFamily === undefined ? 'Inter' : str(o.fontFamily, k('fontFamily')),
        fontWeight: finite(o.fontWeight ?? 400, k('fontWeight')),
        fontStyle: oneOf(o.fontStyle, ['normal', 'italic'] as const, 'normal', k('fontStyle')),
        fontSize: finite(o.fontSize, k('fontSize')),
        letterSpacing: finite(o.letterSpacing ?? 0, k('letterSpacing')),
        lineHeight: finite(o.lineHeight ?? 1.2, k('lineHeight')),
        align: oneOf(o.align, ['left', 'center', 'right'] as const, 'left', k('align')),
      };
    default: // image
      return { ...base, type: 'image', href: str(o.href, k('href')), width: finite(o.width, k('width')), height: finite(o.height, k('height')) };
  }
}

const NO_STROKE = (): Stroke => ({ paint: { kind: 'none' }, width: 1, cap: 'butt', join: 'miter', dash: [] });

function artboard(v: unknown): Artboard {
  const a = obj(v, 'artboard');
  const width = finite(a.width, 'artboard.width');
  const height = finite(a.height, 'artboard.height');
  if (width <= 0) fail('artboard.width', 'must be greater than 0');
  if (height <= 0) fail('artboard.height', 'must be greater than 0');
  return { width, height, background: a.background === undefined ? { kind: 'none' } : paint(a.background, 'artboard.background') };
}

/** Optional app icon marker (`icon`): see src/icon and docs/project-format.md. */
function iconInfo(v: unknown, path: string): { icon?: IconDocInfo } {
  if (v === undefined || v === null) return {};
  const o = obj(v, path);
  const icon: IconDocInfo = {
    preset: oneOf(o.preset, ['app-icon', 'android-adaptive', 'ios', 'favicon-32', 'favicon-16'] as const, 'app-icon', at(path, 'preset')),
    shape: oneOf(o.shape, ['auto', 'circle', 'square', 'wide', 'tall'] as const, 'auto', at(path, 'shape')),
  };
  if (o.smallGlyphProjectId !== undefined) {
    const id = str(o.smallGlyphProjectId, at(path, 'smallGlyphProjectId'));
    if (id) icon.smallGlyphProjectId = id;
  }
  return { icon };
}

/**
 * Validates and normalizes a document object (project files, migrated data, CLI input). Throws a
 * readable message naming the JSON path that is wrong. Duplicate node ids are renewed; optional
 * fields (ids, names, opacity, transform parts, stroke, fill…) get their defaults.
 */
export function validateDocument(data: unknown): DesignDocument {
  const d = isObj(data) ? data : null;
  if (!d || !('schemaVersion' in d) || !Array.isArray(d.children) || !d.artboard) {
    throw new Error('This is not a Designer project file (it needs "schemaVersion": 1, "artboard" and "children").');
  }
  if (typeof d.schemaVersion === 'number' && d.schemaVersion > 1) {
    throw new Error('This project was made with a newer version of Designer.');
  }
  if (d.schemaVersion !== 1) throw new Error('This is not a Designer project file ("schemaVersion" must be 1).');
  try {
    const ids = new Set<string>();
    const now = Date.now();
    return {
      schemaVersion: 1,
      id: typeof d.id === 'string' && d.id ? d.id : newId('d'),
      name: typeof d.name === 'string' && d.name.trim() ? d.name : 'Imported',
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : now,
      updatedAt: now,
      artboard: artboard(d.artboard),
      children: d.children.map((c, i) => node(c, ids, 0, `children[${i}]`)),
      ...iconInfo(d.icon, 'icon'),
    };
  } catch (e) {
    if (e instanceof Invalid) throw new Error(`This project file is damaged at ${e.message}.`, { cause: e });
    throw e;
  }
}

/** Parses a `.designer.json` file. Throws with a readable message when invalid. */
export function parseProject(text: string): DesignDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  return validateDocument(data);
}

export function downloadProject(doc: DesignDocument) {
  downloadBlob(new Blob([serializeProject(doc)], { type: 'application/json' }), safeFileName(doc.name) + PROJECT_EXTENSION);
}
