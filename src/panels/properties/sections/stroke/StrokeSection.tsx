import type { Draft } from 'immer';
import { isPainted, type LineCap, type LineJoin, type SceneNode, type Stroke } from '@/model';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumberField } from '../../../shared/NumberField';
import { PaintEditor } from '../../../shared/PaintEditor';
import { FieldRow, Section } from '../../../shared/Section';
import { editNodes } from '../../edit';
import type { SelectionContext } from '../../types';

const CAPS: LineCap[] = ['butt', 'round', 'square'];
const JOINS: LineJoin[] = ['miter', 'round', 'bevel'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StrokeSection({ ctx }: { ctx: SelectionContext }) {
  const painted = ctx.nodes.filter(isPainted);
  const stroke = painted[0].stroke;
  const ids = painted.map((n) => n.id);
  const set = (patch: Partial<Stroke>, label = 'Stroke') =>
    editNodes(ids, (n: Draft<SceneNode>) => void ('stroke' in n && Object.assign(n.stroke, patch)), label);
  const hasStroke = stroke.paint.kind !== 'none';
  return (
    <Section title="Stroke">
      <PaintEditor
        label="Stroke"
        note={false}
        value={stroke.paint}
        onChange={(paint) => set(stroke.width > 0 || paint.kind === 'none' ? { paint } : { paint, width: 1 })}
      />
      {hasStroke && (
        <>
          <FieldRow label="Width">
            <NumberField ariaLabel="Stroke width" value={stroke.width} min={0} step={0.5} undoLabel="Stroke width" onCommit={(width) => set({ width }, 'Stroke width')} />
          </FieldRow>
          <FieldRow label="Cap">
            <Select value={stroke.cap} onValueChange={(v) => set({ cap: v as LineCap })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Stroke cap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {cap(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Join">
            <Select value={stroke.join} onValueChange={(v) => set({ join: v as LineJoin })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Stroke join">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOINS.map((j) => (
                  <SelectItem key={j} value={j}>
                    {cap(j)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Dash">
            <Input
              key={stroke.dash.join(' ')}
              aria-label="Dash pattern"
              className="h-8 font-mono text-[0.8125rem]"
              placeholder="e.g. 4 2"
              defaultValue={stroke.dash.join(' ')}
              onBlur={(e) => {
                const dash = e.currentTarget.value
                  .split(/[\s,]+/)
                  .map(Number)
                  .filter((n) => Number.isFinite(n) && n >= 0);
                if (dash.join(' ') !== stroke.dash.join(' ')) set({ dash }, 'Dash');
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </FieldRow>
        </>
      )}
    </Section>
  );
}
