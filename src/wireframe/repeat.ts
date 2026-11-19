// Repeat: lists of anything (docs/wireframe-mode.md → Phase 1.5, R4). A container with
// `layout.repeat: { count }` repeats its first child (the template): the `repeat` step generates
// `count − 1` copies right after it, materialized like component children, inside the same undo step.
//
// - A copy is a deep clone of the template whose root carries `repeatCopy: { template, index }`.
//   Ids are the template's ids behind a prefix, `<template id>~r<index>~<original id>`: a pure prefix,
//   so the ids the components step gives an instance's children (`<instance id>~<i>`) stay the same
//   whether a copy was cloned or rebuilt, and running the pipeline twice changes nothing.
// - Copies are read-only: clicking one selects the template (hitTest), Layers lists them as
//   "Copy 2…n". Other children of a repeating container stay after the copies.
// - Turning repeat off, or deleting the template, removes the copies. Copies that end up anywhere
//   else (pasted, unwrapped from a container that no longer repeats) are removed too.
import type { GroupNode, Id, LayoutInfo, SceneNode } from '@/model';

/** Most items a repeat makes (performance bar: 10 screens × ~100 components). */
export const MAX_REPEAT = 50;
/** Count a new repeat starts with. */
export const DEFAULT_REPEAT = 3;

/** Number of items (template included), 1 when the container does not repeat. */
export function repeatCount(l: LayoutInfo | undefined): number {
  if (!l?.repeat) return 1;
  const c = Math.round(l.repeat.count);
  return Number.isFinite(c) ? Math.max(1, Math.min(MAX_REPEAT, c)) : 1;
}

/** True when the node is a generated copy (its root). */
export const isRepeatCopy = (n: SceneNode): boolean => !!n.repeatCopy;

/** Id prefix of the `index`-th copy of `templateId`. */
export const copyPrefix = (templateId: Id, index: number) => `${templateId}~r${index}~`;

/** The template of a repeating container: its first child that is not a copy (undefined when empty or not repeating). */
export function repeatTemplate(c: GroupNode): SceneNode | undefined {
  if (!c.layout?.repeat || c.screen || c.component) return undefined;
  return c.children.find((n) => !n.repeatCopy);
}

function withPrefix(n: SceneNode, prefix: string): SceneNode {
  const id = prefix + n.id;
  return n.type === 'group' ? { ...n, id, children: n.children.map((c) => withPrefix(c, prefix)) } : { ...n, id };
}

/**
 * The `index`-th copy of `template` (plain node). `transform`: keep this root transform (the existing
 * copy's, which the layout placed), so an unchanged copy compares equal and is not rewritten.
 */
export function makeCopy(template: SceneNode, index: number, transform?: SceneNode['transform']): SceneNode {
  const copy = withPrefix(structuredClone(template), copyPrefix(template.id, index));
  if (transform) copy.transform = transform;
  copy.repeatCopy = { template: template.id, index };
  return copy;
}

/**
 * The children a container should have (plain nodes): `[template, copy 2…n, …other children]` when
 * it repeats, without copies otherwise. Existing nodes are reused (same objects) when they are already
 * right, so callers can compare by identity. Returns null when nothing changes.
 */
export function repeatChildren(c: GroupNode): SceneNode[] | null {
  const kids = c.children;
  const copies = kids.filter((n) => n.repeatCopy);
  const others = kids.filter((n) => !n.repeatCopy);
  const template = repeatTemplate(c);
  if (!template) return copies.length ? others : null;
  const count = repeatCount(c.layout);
  const next: SceneNode[] = [template];
  for (let k = 2; k <= count; k++) {
    const existing = copies.find((n) => n.repeatCopy!.template === template.id && n.repeatCopy!.index === k);
    const want = makeCopy(template, k, existing?.transform);
    next.push(existing && deepEqual(existing, want) ? existing : want);
  }
  next.push(...others.slice(1));
  return next.length === kids.length && next.every((n, i) => n === kids[i]) ? null : next;
}

/** Structural equality of plain JSON values (key order does not matter). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Where a node sits in a repeat: `{ template, index }` for a copy (or anything inside one), null otherwise. */
export function copyOf(path: readonly SceneNode[]): { template: Id; index: number } | null {
  for (const n of path) if (n.repeatCopy) return n.repeatCopy;
  return null;
}
