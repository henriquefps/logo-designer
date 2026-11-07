import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useDocStore } from '@/store/useDocStore';
import { NumberField } from '../../../shared/NumberField';
import { FieldRow, Section } from '../../../shared/Section';
import { common, editNodes } from '../../edit';
import type { SelectionContext } from '../../types';

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

const label = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).replace('-', ' ');

export function AppearanceSection({ ctx }: { ctx: SelectionContext }) {
  const opacity = common(ctx.nodes, (n) => n.opacity);
  const blend = common(ctx.nodes, (n) => n.blendMode ?? 'normal');
  const setOpacity = (v: number) => editNodes(ctx.ids, (n) => void (n.opacity = v), 'Opacity');
  return (
    <Section title="Appearance">
      <FieldRow label="Opacity">
        <Slider
          className="min-w-0 flex-1"
          aria-label="Opacity"
          min={0}
          max={100}
          step={1}
          value={[Math.round((opacity ?? 1) * 100)]}
          onPointerDown={() => useDocStore.getState().beginTransaction('Opacity')}
          onValueChange={([v]) => setOpacity(v / 100)}
          onValueCommit={() => useDocStore.getState().commitTransaction()}
        />
        <NumberField
          className="w-20 shrink-0"
          ariaLabel="Opacity percent"
          value={opacity === null ? null : Math.round(opacity * 100)}
          suffix="%"
          min={0}
          max={100}
          precision={0}
          onCommit={(v) => setOpacity(v / 100)}
        />
      </FieldRow>
      <FieldRow label="Blend">
        <Select value={blend ?? undefined} onValueChange={(m) => editNodes(ctx.ids, (n) => void (n.blendMode = m === 'normal' ? undefined : m), 'Blend mode')}>
          <SelectTrigger size="sm" className="w-full" aria-label="Blend mode">
            <SelectValue placeholder="Mixed" />
          </SelectTrigger>
          <SelectContent>
            {BLEND_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {label(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
    </Section>
  );
}
