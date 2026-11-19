// Notes (docs/wireframe-mode.md → Notes): a top-level group with `note: { text, target? }` whose
// children (the sticky and its text) are generated from the text; rebuilt when `note` changed (or
// on load). Notes stay unscaled and unrotated (fixed width, auto height). When a settled change
// deleted a note's target, the note stays and becomes unattached.
import type { Draft } from 'immer';
import type { GroupNode, SceneNode } from '@/model';
import { buildNoteChildren, clearDanglingTargets } from '../../notes';
import { plain, type WireframeStep } from '../../types';

const step: WireframeStep = {
  id: 'notes',
  order: 150,
  run(d, ctx) {
    if (!d.children.some((n) => n.type === 'group' && n.note)) return;
    const snapshot = plain(d);
    snapshot.children.forEach((n, i) => {
      if (n.type !== 'group' || !n.note) return;
      const prev = ctx.previous(n.id) as GroupNode | null;
      const rebuild = ctx.phase === 'load' || !prev || prev.note !== n.note;
      const t = n.transform;
      const flat = t.rotation === 0 && t.scaleX === 1 && t.scaleY === 1;
      if (!rebuild && flat) return;
      const draft = d.children[i] as Draft<GroupNode>;
      if (!flat) {
        draft.transform.rotation = 0;
        draft.transform.scaleX = 1;
        draft.transform.scaleY = 1;
      }
      if (rebuild) {
        const children = buildNoteChildren(n.id, n.note!.text);
        if (JSON.stringify(children) !== JSON.stringify(n.children)) draft.children = children as Draft<SceneNode>[];
      }
    });
    if (ctx.phase !== 'change') clearDanglingTargets(d as never);
  },
};

export default step;
