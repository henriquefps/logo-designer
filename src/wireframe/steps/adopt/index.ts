// Screens own what is on them: when a change settles (end of a drag, paste, a nudge), an object
// whose centre now lies on a screen frame becomes that frame's child, and a child dragged off its
// frame goes back to the canvas (or onto the frame it was dropped on). World positions are kept.
// Only top-level objects and direct children of frames move this way, only when their transform
// changed (or they are new), and never when the change itself reparented them (Layers drag).
import { fromTransform, invert, isScreenNode, multiply, rectCenter, rectContains, toTransform, worldBounds, type Id, type ScreenNode, type SceneNode } from '@/model';
import type { Draft } from 'immer';
import { frameRect } from '../../screens';
import type { WireframeStep } from '../../types';

const step: WireframeStep = {
  id: 'adopt',
  order: 50,
  phases: ['settle'],
  run(d, ctx) {
    const doc = ctx.input;
    const before = ctx.before;
    if (!before) return;
    const screens = doc.children.filter(isScreenNode);
    if (!screens.length && !doc.children.some(isScreenNode)) return;
    // Parent (null = canvas) of the top two levels before the change.
    const prevParent = new Map<Id, Id | null>();
    for (const n of before.children) {
      prevParent.set(n.id, null);
      if (isScreenNode(n)) for (const c of n.children) prevParent.set(c.id, n.id);
    }
    const candidates: { node: SceneNode; parent: ScreenNode | null }[] = [];
    const consider = (node: SceneNode, parent: ScreenNode | null) => {
      if (isScreenNode(node) || node.note || node.locked) return; // notes stay on the canvas
      // Children placed by the frame's stack belong to the layout (dragging them out is the select tool's job).
      if (parent?.layout && node.layoutItem?.position !== 'free') return;
      const prev = ctx.previous(node.id);
      if (!prev) {
        if (parent === null && !prevParent.has(node.id)) candidates.push({ node, parent });
        return;
      }
      if (prevParent.get(node.id) !== (parent?.id ?? null)) return; // reparented by this change
      if (prev.transform !== node.transform) candidates.push({ node, parent });
    };
    for (const n of doc.children) {
      if (isScreenNode(n)) n.children.forEach((c) => consider(c, n));
      else consider(n, null);
    }
    if (!candidates.length) return;
    const moves: { id: Id; from: ScreenNode | null; to: ScreenNode | null; node: SceneNode }[] = [];
    for (const { node, parent } of candidates) {
      const b = worldBounds(doc, node.id);
      if (!b) continue;
      const c = rectCenter(b);
      const target = [...screens].reverse().find((s) => rectContains(frameRect(s), c)) ?? null;
      if ((target?.id ?? null) !== (parent?.id ?? null)) moves.push({ id: node.id, from: parent, to: target, node });
    }
    if (!moves.length) return;
    const ident = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const frameMatrix = (s: ScreenNode | null) => (s ? fromTransform(s.transform) : ident);
    for (const m of moves) {
      const fromList = (m.from ? (d.children.find((n) => n.id === m.from!.id) as Draft<ScreenNode>).children : d.children) as Draft<SceneNode>[];
      const index = fromList.findIndex((n) => n.id === m.id);
      if (index < 0) continue;
      fromList.splice(index, 1);
      const t = toTransform(multiply(invert(frameMatrix(m.to)), multiply(frameMatrix(m.from), fromTransform(m.node.transform))));
      const moved = { ...m.node, transform: t } as SceneNode;
      const toList = (m.to ? (d.children.find((n) => n.id === m.to!.id) as Draft<ScreenNode>).children : d.children) as Draft<SceneNode>[];
      toList.push(moved as Draft<SceneNode>);
    }
  },
};

export default step;
