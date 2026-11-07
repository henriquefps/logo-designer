import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumberField } from '../../../shared/NumberField';
import { PaintEditor } from '../../../shared/PaintEditor';
import { FieldRow, Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';
import { ARTBOARD_PRESETS } from './presets';


export function ArtboardSection({ ctx }: { ctx: SelectionContext }) {
  const { width, height, background } = ctx.doc.artboard;
  const preset = ARTBOARD_PRESETS.find((p) => p.width === width && p.height === height)?.id ?? 'custom';
  const setArtboard = useDocStore((s) => s.setArtboard);
  const resize = (w: number, h: number) => {
    setArtboard({ width: w, height: h }, { label: 'Artboard size' });
    useEditorStore.getState().fitRect({ x: 0, y: 0, width: w, height: h });
  };
  return (
    <>
      <Section title="Artboard">
        <Select
          value={preset}
          onValueChange={(id) => {
            const p = ARTBOARD_PRESETS.find((x) => x.id === id);
            if (p) resize(p.width, p.height);
          }}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Artboard size preset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARTBOARD_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="W" ariaLabel="Artboard width" value={width} min={1} max={16384} precision={0} onCommit={(w) => resize(w, height)} />
          <NumberField label="H" ariaLabel="Artboard height" value={height} min={1} max={16384} precision={0} onCommit={(h) => resize(width, h)} />
        </div>
      </Section>
      <Section title="Background">
        <PaintEditor label="Background" value={background} onChange={(p) => setArtboard({ background: p }, { label: 'Artboard background' })} />
      </Section>
      <Section title="Document">
        <FieldRow label="Objects">
          <span className="text-sm tabular-nums">{countNodes(ctx.doc.children)}</span>
        </FieldRow>
      </Section>
    </>
  );
}

function countNodes(nodes: SelectionContext['doc']['children']): number {
  return nodes.reduce((n, c) => n + 1 + (c.type === 'group' ? countNodes(c.children) : 0), 0);
}
