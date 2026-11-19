// Logical screens ↔ frames, and frame geometry (docs/wireframe-mode.md → Screens):
// - every frame's `screenId` names a logical screen (unknown ids, e.g. pasted frames, get one);
// - at most one frame per platform per logical screen: a second one (a plain duplicate) becomes
//   its own logical screen "<name> copy";
// - renaming a frame renames its logical screen; every variant carries the logical name;
// - logical screens without frames are removed;
// - frames stay axis-aligned and unscaled, height = max(platform minimum, content).
import { newId, platformDef, type GroupNode, type ScreenNode } from '@/model';
import type { Draft } from 'immer';
import { screenHeight, uniqueScreenName } from '../../screens';
import { plain, type WireframeStep } from '../../types';

const step: WireframeStep = {
  id: 'screens',
  order: 900,
  run(d, ctx) {
    const wf = d.wireframe;
    if (!wf) return;
    const all = d.children.filter((n) => n.type === 'group' && !!(n as GroupNode).screen) as Draft<ScreenNode>[];
    // Frames that existed before keep their logical screen; new ones (copies) yield.
    const ordered = [...all.filter((f) => ctx.previous(f.id)), ...all.filter((f) => !ctx.previous(f.id))];
    const used = new Map<string, Set<string>>();
    for (const f of ordered) {
      let logical = wf.screens.find((s) => s.id === f.screen.screenId);
      if (!logical) {
        logical = { id: f.screen.screenId || newId('s'), name: f.name.trim() || 'Screen' };
        if (f.screen.screenId !== logical.id) f.screen.screenId = logical.id;
        wf.screens.push(logical);
      }
      const platforms = used.get(logical.id) ?? new Set<string>();
      if (platforms.has(f.screen.platform)) {
        const name = uniqueScreenName(d, `${logical.name} copy`);
        logical = { id: newId('s'), name };
        wf.screens.push(logical);
        f.screen.screenId = logical.id;
        used.set(logical.id, new Set([f.screen.platform]));
        f.name = name;
        continue;
      }
      platforms.add(f.screen.platform);
      used.set(logical.id, platforms);
      // A frame renamed (Layers, Properties) renames its logical screen.
      const prev = ctx.previous(f.id);
      if (prev && prev.name !== f.name && f.name.trim() && f.name !== logical.name) logical.name = f.name.trim();
    }
    if (wf.screens.some((s) => !used.has(s.id))) wf.screens = wf.screens.filter((s) => used.has(s.id));
    for (const f of all) {
      const logical = wf.screens.find((s) => s.id === f.screen.screenId)!;
      if (f.name !== logical.name) f.name = logical.name;
      const t = f.transform;
      if (t.rotation !== 0 || t.scaleX !== 1 || t.scaleY !== 1) {
        f.screen.width *= Math.abs(t.scaleX);
        f.transform = { x: t.x, y: t.y, rotation: 0, scaleX: 1, scaleY: 1 };
      }
      const width = Math.max(1, Math.round(f.screen.width * 100) / 100);
      if (f.screen.width !== width) f.screen.width = width;
      if (!platformDef(f.screen.platform)) f.screen.platform = 'phone';
      const height = screenHeight(plain(f) as ScreenNode);
      if (f.screen.height !== height) f.screen.height = height;
    }
  },
};

export default step;
