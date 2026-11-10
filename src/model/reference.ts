import type { DesignDocument, Id, SceneNode } from './types';
import { walk } from './tree';

/**
 * A reference node is ONE state: tracing layer = `reference: true` + `locked: true`.
 * It is drawn but never hit-tested, snapped to or exported, and it has no separate "lock".
 * Files from older versions could hold `reference: true, locked: false` (the Layers lock toggle
 * only cleared `locked`); those are repaired on load by keeping the reference and locking it.
 */
export const isReference = (n: SceneNode) => n.reference === true;

/** Sets or clears the reference state on a node in place, keeping `locked` consistent with it. */
export function applyReference(n: SceneNode, on: boolean): void {
  if (on) {
    n.reference = true;
    n.locked = true;
  } else {
    delete n.reference;
    n.locked = false;
  }
}

/**
 * Visible non-image reference nodes: the ones SVG/PNG export silently skips and that are probably
 * not meant as tracing layers (reference images are expected to be left out). Counts a reference
 * group once. `selection` limits the count to those subtrees (selection-scope export).
 */
export function skippedReferenceNodes(doc: DesignDocument, selection?: Id[]): SceneNode[] {
  const out: SceneNode[] = [];
  const inScope = selection ? new Set(selection) : null;
  const visit = (nodes: SceneNode[], scoped: boolean) => {
    for (const n of nodes) {
      if (!n.visible) continue;
      const here = scoped || !inScope || inScope.has(n.id);
      if (n.reference) {
        if (here && n.type !== 'image') out.push(n);
        continue;
      }
      if (n.type === 'group') visit(n.children, here);
    }
  };
  visit(doc.children, false);
  return out;
}

/** Notice text for export UIs/CLI, or null when nothing non-image is left out. */
export function skippedReferenceNotice(nodes: SceneNode[]): string | null {
  if (!nodes.length) return null;
  const n = nodes.length;
  return `${n} reference object${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} not exported (${nodes
    .slice(0, 3)
    .map((x) => `“${x.name}”`)
    .join(', ')}${n > 3 ? ', …' : ''}). Turn off “Use as reference” on ${n === 1 ? 'it' : 'them'} to include ${n === 1 ? 'it' : 'them'}.`;
}

/** All reference nodes in the document (any type, any depth). */
export function allReferences(doc: DesignDocument): SceneNode[] {
  const out: SceneNode[] = [];
  walk(doc.children, (n) => void (n.reference && out.push(n)));
  return out;
}
