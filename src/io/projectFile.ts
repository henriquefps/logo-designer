import { newId, type Artboard, type DesignDocument, type Paint, type SceneNode, type Stroke, type SubPath } from '@/model';
import { downloadBlob, safeFileName } from './download';

export const PROJECT_EXTENSION = '.designer.json';
export const PROJECT_FORMAT = 'designer';

export function serializeProject(doc: DesignDocument): string {
  return JSON.stringify({ format: PROJECT_FORMAT, ...doc }, null, 2);
}

// ---------- validation ----------

class Invalid extends Error {}
const fail = (where: string): never => {
  throw new Invalid(where);
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, where: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(where));
const str = (v: unknown, where: string): string => (typeof v === 'string' ? v : fail(where));
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const color = (v: unknown, where: string) => (typeof v === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v.toLowerCase() : fail(where));

function paint(v: unknown, where: string): Paint {
  if (!isObj(v)) return fail(where);
  switch (v.kind) {
    case 'none':
      return { kind: 'none' };
    case 'solid':
      return { kind: 'solid', color: color(v.color, where) };
    case 'linear':
    case 'radial': {
      if (!Array.isArray(v.stops) || !v.stops.length) return fail(where);
      const stops = v.stops.map((s) => {
        if (!isObj(s)) return fail(where);
        return { offset: Math.max(0, Math.min(1, finite(s.offset, where))), color: color(s.color, where) };
      });
      if (v.kind === 'radial') return { kind: 'radial', stops };
      return { kind: 'linear', stops, angle: typeof v.angle === 'number' && Number.isFinite(v.angle) ? v.angle : 0 };
    }
    default:
      return fail(where);
  }
}

function stroke(v: unknown, where: string): Stroke {
  if (!isObj(v)) return fail(where);
  return {
    paint: paint(v.paint, where),
    width: Math.max(0, finite(v.width, where)),
    cap: oneOf(v.cap, ['butt', 'round', 'square'] as const, 'butt'),
    join: oneOf(v.join, ['miter', 'round', 'bevel'] as const, 'miter'),
    dash: Array.isArray(v.dash) ? v.dash.filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0) : [],
  };
}

const vec = (v: unknown, where: string) => (isObj(v) ? { x: finite(v.x, where), y: finite(v.y, where) } : fail(where));

function subpaths(v: unknown, where: string): SubPath[] {
  if (!Array.isArray(v)) return fail(where);
  return v.map((sp) => {
    if (!isObj(sp) || !Array.isArray(sp.points)) return fail(where);
    return {
      closed: !!sp.closed,
      points: sp.points.map((p) => {
        if (!isObj(p)) return fail(where);
        const out: SubPath['points'][number] = {
          x: finite(p.x, where),
          y: finite(p.y, where),
          type: oneOf(p.type, ['corner', 'smooth', 'symmetric'] as const, 'corner'),
        };
        if (p.in !== undefined) out.in = vec(p.in, where);
        if (p.out !== undefined) out.out = vec(p.out, where);
        return out;
      }),
    };
  });
}

function node(v: unknown, ids: Set<string>, depth: number): SceneNode {
  if (depth > 64) fail('nesting too deep');
  if (!isObj(v)) return fail('node');
  const type = str(v.type, 'node type');
  const where = `${type} node`;
  let id = typeof v.id === 'string' && v.id ? v.id : newId();
  if (ids.has(id)) id = newId();
  ids.add(id);
  const t = isObj(v.transform) ? v.transform : fail(where);
  const base = {
    id,
    name: typeof v.name === 'string' ? v.name : type,
    visible: v.visible !== false,
    locked: v.locked === true,
    ...(v.reference === true ? { reference: true } : {}),
    opacity: typeof v.opacity === 'number' && Number.isFinite(v.opacity) ? Math.max(0, Math.min(1, v.opacity)) : 1,
    ...(typeof v.blendMode === 'string' ? { blendMode: v.blendMode } : {}),
    transform: {
      x: finite(t.x, where),
      y: finite(t.y, where),
      rotation: finite(t.rotation ?? 0, where),
      scaleX: finite(t.scaleX ?? 1, where),
      scaleY: finite(t.scaleY ?? 1, where),
    },
  };
  const painted = () => ({ fill: paint(v.fill, where), stroke: stroke(v.stroke, where) });
  switch (type) {
    case 'group':
      if (!Array.isArray(v.children)) return fail(where);
      return { ...base, type, children: v.children.map((c) => node(c, ids, depth + 1)) };
    case 'path':
      return { ...base, type, ...painted(), subpaths: subpaths(v.subpaths, where), fillRule: oneOf(v.fillRule, ['nonzero', 'evenodd'] as const, 'nonzero') };
    case 'rect':
      return { ...base, type, ...painted(), width: finite(v.width, where), height: finite(v.height, where), radius: Math.max(0, finite(v.radius ?? 0, where)) };
    case 'ellipse':
      return { ...base, type, ...painted(), rx: finite(v.rx, where), ry: finite(v.ry, where) };
    case 'polygon': {
      const p = { ...base, type, ...painted(), sides: Math.max(3, Math.round(finite(v.sides, where))), radius: finite(v.radius, where) };
      return v.innerRadius === undefined ? p : { ...p, innerRadius: finite(v.innerRadius, where) };
    }
    case 'text':
      return {
        ...base,
        type,
        ...painted(),
        text: str(v.text, where),
        fontFamily: str(v.fontFamily, where),
        fontWeight: finite(v.fontWeight, where),
        fontStyle: oneOf(v.fontStyle, ['normal', 'italic'] as const, 'normal'),
        fontSize: finite(v.fontSize, where),
        letterSpacing: finite(v.letterSpacing ?? 0, where),
        lineHeight: finite(v.lineHeight ?? 1.2, where),
        align: oneOf(v.align, ['left', 'center', 'right'] as const, 'left'),
      };
    case 'image':
      return { ...base, type, href: str(v.href, where), width: finite(v.width, where), height: finite(v.height, where) };
    default:
      return fail(`unknown node type “${type}”`);
  }
}

function artboard(v: unknown): Artboard {
  if (!isObj(v)) return fail('artboard');
  const width = finite(v.width, 'artboard');
  const height = finite(v.height, 'artboard');
  if (width <= 0 || height <= 0) fail('artboard size');
  return { width, height, background: paint(v.background, 'artboard background') };
}

/**
 * Validates and normalizes a document object (project files, migrated data). Throws a readable
 * message when it is not a Designer document or is damaged. Duplicate node ids are renewed.
 */
export function validateDocument(data: unknown): DesignDocument {
  const d = isObj(data) ? data : null;
  if (!d || !('schemaVersion' in d) || !Array.isArray(d.children) || !d.artboard) {
    throw new Error('This is not a Designer project file.');
  }
  if (typeof d.schemaVersion === 'number' && d.schemaVersion > 1) {
    throw new Error('This project was made with a newer version of Designer.');
  }
  if (d.schemaVersion !== 1) throw new Error('This is not a Designer project file.');
  try {
    const ids = new Set<string>();
    const now = Date.now();
    return {
      schemaVersion: 1,
      id: typeof d.id === 'string' ? d.id : newId('d'),
      name: typeof d.name === 'string' && d.name.trim() ? d.name : 'Imported',
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : now,
      updatedAt: now,
      artboard: artboard(d.artboard),
      children: d.children.map((c) => node(c, ids, 0)),
    };
  } catch (e) {
    if (e instanceof Invalid) throw new Error(`This project file is damaged (${e.message}).`, { cause: e });
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
