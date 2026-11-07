import type { Paint, Vec } from './types';

/** Splits #rgb, #rrggbb or #rrggbbaa into an opaque #rrggbb and an opacity (0..1). */
export function splitColor(color: string): { color: string; opacity: number } {
  const hex = normalizeHex(color);
  if (!hex) return { color: '#000000', opacity: 1 };
  if (hex.length === 9) return { color: hex.slice(0, 7), opacity: Math.round((parseInt(hex.slice(7), 16) / 255) * 1000) / 1000 };
  return { color: hex, opacity: 1 };
}

/** Joins #rrggbb and an opacity into #rrggbb (opaque) or #rrggbbaa. */
export function joinColor(color: string, opacity: number): string {
  const base = (normalizeHex(color) ?? '#000000').slice(0, 7);
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return a >= 255 ? base : base + a.toString(16).padStart(2, '0');
}

/** Lowercase #rrggbb / #rrggbbaa, or null when invalid. Accepts #rgb/#rgba and missing '#'. */
export function normalizeHex(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3,4}$/.test(s)) s = '#' + [...s.slice(1)].map((c) => c + c).join('');
  return /^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(s) ? s : null;
}

/** Gradient vector in objectBoundingBox units for a linear angle (0° = left → right, 90° = top → bottom). */
export function gradientVector(angle = 0): { x1: number; y1: number; x2: number; y2: number } {
  const r = (angle * Math.PI) / 180;
  const dx = Math.cos(r) / 2;
  const dy = Math.sin(r) / 2;
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return { x1: round(0.5 - dx), y1: round(0.5 - dy), x2: round(0.5 + dx), y2: round(0.5 + dy) };
}

/** A representative solid color for a paint (first stop of a gradient), or null for none. */
export function paintPrimaryColor(p: Paint): string | null {
  if (p.kind === 'solid') return p.color;
  if (p.kind === 'none') return null;
  return p.stops[0]?.color ?? null;
}

/** Converts a paint to another kind, keeping its colors where possible. */
export function convertPaint(p: Paint, kind: Paint['kind']): Paint {
  if (p.kind === kind) return p;
  const primary = paintPrimaryColor(p) ?? '#000000';
  if (kind === 'none') return { kind: 'none' };
  if (kind === 'solid') return { kind: 'solid', color: primary };
  const stops =
    p.kind === 'linear' || p.kind === 'radial'
      ? p.stops
      : [
          { offset: 0, color: primary },
          { offset: 1, color: '#ffffff' },
        ];
  return kind === 'linear' ? { kind, stops, angle: p.kind === 'linear' ? p.angle ?? 0 : 0 } : { kind, stops };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
