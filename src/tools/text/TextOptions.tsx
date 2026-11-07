import type { Draft } from 'immer';
import { findNode, type SceneNode } from '@/model';
import { findFamily } from '@/fonts';
import { FontFamilyPicker } from '@/fonts/ui/FontFamilyPicker';
import { FontWeightField } from '@/fonts/ui/FontWeightField';
import { nearestWeight } from '@/fonts/weights';
import { NumberField } from '@/panels/shared/NumberField';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useTextDefaults } from './session';

/** Options bar: font, weight and size for new text (and the selected/edited text, if any). */
export function TextOptions() {
  const defaults = useTextDefaults();
  const selection = useEditorStore((s) => s.selection);
  const doc = useDocStore((s) => s.doc);
  const texts = selection.map((id) => findNode(doc, id)).filter((n) => n?.type === 'text');
  const first = texts[0]?.type === 'text' ? texts[0] : null;
  const family = first?.fontFamily ?? defaults.fontFamily;
  const weight = first?.fontWeight ?? defaults.fontWeight;
  const size = first?.fontSize ?? defaults.fontSize;

  const apply = (recipe: (n: Draft<SceneNode>) => void, label: string) => {
    if (texts.length) useDocStore.getState().updateNodes(texts.map((t) => t!.id), recipe, { label });
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="w-48 min-w-0">
        <FontFamilyPicker
          value={family}
          onChange={(f) => {
            const info = findFamily(f);
            const w = info ? nearestWeight(info, weight) : weight;
            defaults.set({ fontFamily: f, fontWeight: w });
            apply((n) => {
              if (n.type !== 'text') return;
              n.fontFamily = f;
              if (info) n.fontWeight = nearestWeight(info, n.fontWeight);
            }, 'Font');
          }}
        />
      </div>
      <div className="flex w-56 min-w-0 items-center gap-2 max-md:hidden">
        <FontWeightField
          family={family}
          value={weight}
          onChange={(w) => {
            defaults.set({ fontWeight: w });
            apply((n) => void (n.type === 'text' && (n.fontWeight = w)), 'Font weight');
          }}
        />
      </div>
      <NumberField
        ariaLabel="Font size"
        className="w-24 shrink-0"
        value={size}
        min={1}
        max={2000}
        suffix="px"
        undoLabel="Font size"
        onCommit={(v) => {
          defaults.set({ fontSize: v });
          apply((n) => void (n.type === 'text' && (n.fontSize = v)), 'Font size');
        }}
      />
    </div>
  );
}
