import type { LayoutAlign, LayoutSize, SceneNode } from '@/model';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { itemSizing, type Position } from '@/wireframe/layout';
import { layoutParent } from '@/wireframe/layoutEdit';
import { setLayoutItem } from '@/wireframe/layoutCommands';
import { NumberField } from '../../../shared/NumberField';
import { FieldRow, Section } from '../../../shared/Section';
import { common } from '../../edit';
import type { SelectionContext } from '../../types';

type Mode = 'fill' | 'hug' | 'fixed';
const modeOf = (s: LayoutSize): Mode => (typeof s === 'number' ? 'fixed' : s);

/** Size the node has now (for "Fixed": start from it). */
function currentSize(n: SceneNode, dim: 'width' | 'height'): number {
  if (n.type === 'group') {
    const s = n.component?.size ?? n.layout?.size;
    if (s) return Math.round(s[dim]);
  }
  return 100;
}

const isPlain = (n: SceneNode) => !(n.type === 'group' && (n.component || n.layout));

function SizeRow({ ctx, dim }: { ctx: SelectionContext; dim: 'width' | 'height' }) {
  const sized = ctx.nodes.filter((n) => !isPlain(n));
  const label = dim === 'width' ? 'Width' : 'Height';
  if (!sized.length) return null;
  const mode = common(sized, (n) => modeOf(itemSizing(n)[dim]));
  const fixed = common(sized, (n) => {
    const v = itemSizing(n)[dim];
    return typeof v === 'number' ? v : null;
  });
  const ids = sized.map((n) => n.id);
  const setMode = (m: Mode) => {
    if (m === 'fixed') {
      // Each node keeps its current size.
      for (const n of sized) setLayoutItem([n.id], { [dim]: currentSize(n, dim) }, `${label}: fixed`);
    } else setLayoutItem(ids, { [dim]: m }, `${label}: ${m}`);
  };
  return (
    <FieldRow label={label}>
      <div className="flex w-full gap-2">
        <Select value={mode ?? ''} onValueChange={(m) => setMode(m as Mode)}>
          <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label={`${label} sizing`}>
            <SelectValue placeholder="Mixed" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fill">Fill</SelectItem>
            <SelectItem value="hug">Hug</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
          </SelectContent>
        </Select>
        {mode === 'fixed' && (
          <NumberField className="w-24" ariaLabel={`Fixed ${dim}`} value={fixed} min={0} max={100000} precision={0} suffix="px" onCommit={(v) => setLayoutItem(ids, { [dim]: v }, label)} undoLabel={label} />
        )}
      </div>
    </FieldRow>
  );
}

export function LayoutItemSection({ ctx }: { ctx: SelectionContext }) {
  const inFrame = ctx.ids.every((id) => !!layoutParent(ctx.doc, id)?.screen);
  const position = common(ctx.nodes, (n) => itemSizing(n).position);
  const plainOnly = ctx.nodes.every(isPlain);
  // Edge to edge applies to stacks (not grids), for children in the flow.
  const kinds = new Set(ctx.ids.map((id) => layoutParent(ctx.doc, id)?.layout.kind));
  const crossBleed = !kinds.has('grid') && position !== 'free' && position !== 'pinned-bottom';
  const bleed = common(ctx.nodes, (n) => itemSizing(n).bleed);
  const alignSelf = common(ctx.nodes, (n) => n.layoutItem?.alignSelf ?? 'default');
  return (
    <Section title="In stack">
      <SizeRow ctx={ctx} dim="width" />
      <SizeRow ctx={ctx} dim="height" />
      {crossBleed && (
        <FieldRow label="Edge to edge">
          <div className="flex w-full items-center gap-2">
            <Switch
              aria-label="Edge to edge"
              checked={bleed === true}
              onCheckedChange={(v) => setLayoutItem(ctx.ids, { bleed: v }, v ? 'Edge to edge' : 'Inside the padding')}
            />
            <span className="text-xs text-muted-foreground">{bleed === null ? 'Mixed' : `Ignores the stack's ${kinds.has('hstack') && !kinds.has('vstack') ? 'top and bottom' : 'side'} padding`}</span>
          </div>
        </FieldRow>
      )}
      {position !== 'free' && position !== 'pinned-bottom' && (
        <FieldRow label="Align self">
          <Select value={alignSelf ?? ''} onValueChange={(a) => setLayoutItem(ctx.ids, { alignSelf: a === 'default' ? undefined : (a as LayoutAlign) }, 'Align in stack')}>
            <SelectTrigger size="sm" className="w-full" aria-label="Align in stack">
              <SelectValue placeholder="Mixed" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Like the stack</SelectItem>
              <SelectItem value="start">Start</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="end">End</SelectItem>
              <SelectItem value="stretch">Stretch</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      )}
      <FieldRow label="Position">
        <Select value={position ?? ''} onValueChange={(p) => setLayoutItem(ctx.ids, { position: p as Position }, 'Position in stack')}>
          <SelectTrigger size="sm" className="w-full" aria-label="Position in stack">
            <SelectValue placeholder="Mixed" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flow">In the flow</SelectItem>
            {(inFrame || position === 'pinned-bottom') && <SelectItem value="pinned-bottom">Pinned to bottom</SelectItem>}
            <SelectItem value="free">Free (absolute)</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      {plainOnly && <p className="text-xs text-muted-foreground">Shapes keep their own size; the stack only moves them.</p>}
    </Section>
  );
}
