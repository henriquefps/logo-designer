import { useState } from 'react';
import { AngleIcon, ArrowsHorizontalIcon, ArrowsVerticalIcon, LinkSimpleIcon, LinkSimpleBreakIcon } from '@phosphor-icons/react';
import { rotationAbout, scaleAbout, selectionBounds, translation } from '@/model';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runAction } from '@/actions/registry';
import { getSelectionFrame } from '@/canvas/selectionFrame';
import { NumberField } from '../../../shared/NumberField';
import { Section } from '../../../shared/Section';
import { editNodes, transformNodes } from '../../edit';
import type { SelectionContext } from '../../types';

export function TransformSection({ ctx }: { ctx: SelectionContext }) {
  const [lockRatio, setLockRatio] = useState(false);
  const box = selectionBounds(ctx.doc, ctx.ids);
  const frame = getSelectionFrame(ctx.doc, ctx.ids);
  if (!box || !frame) return null;
  const locked = ctx.nodes.every((n) => n.locked);
  const ids = ctx.ids;
  const topLeft = frame.corners[0];

  const resize = (w: number | null, h: number | null) => {
    let kx = w !== null && frame.width ? w / frame.width : 1;
    let ky = h !== null && frame.height ? h / frame.height : 1;
    if (lockRatio) {
      if (w !== null) ky = kx;
      else kx = ky;
    }
    transformNodes(ids, scaleAbout(kx, ky, topLeft, frame.rotation), 'Resize');
  };

  return (
    <Section title="Transform">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" ariaLabel="X position" value={box.x} disabled={locked} undoLabel="Move" onCommit={(x) => transformNodes(ids, translation(x - box.x, 0), 'Move')} />
        <NumberField label="Y" ariaLabel="Y position" value={box.y} disabled={locked} undoLabel="Move" onCommit={(y) => transformNodes(ids, translation(0, y - box.y), 'Move')} />
        <NumberField label="W" ariaLabel="Width" value={frame.width} min={0.01} disabled={locked} undoLabel="Resize" onCommit={(w) => resize(w, null)} />
        <div className="flex items-center gap-1">
          <NumberField
            className="min-w-0 flex-1"
            label="H"
            ariaLabel="Height"
            value={frame.height}
            min={0.01}
            disabled={locked}
            undoLabel="Resize"
            onCommit={(h) => resize(null, h)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={lockRatio} onPressedChange={setLockRatio} aria-label="Keep proportions">
                {lockRatio ? <LinkSimpleIcon /> : <LinkSimpleBreakIcon />}
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Keep proportions</TooltipContent>
          </Tooltip>
        </div>
        <NumberField
          label={<AngleIcon />}
          ariaLabel="Rotation"
          value={Math.round(frame.rotation * 100) / 100}
          suffix="°"
          disabled={locked}
          undoLabel="Rotate"
          onCommit={(deg) => transformNodes(ids, rotationAbout(deg - frame.rotation, frame.center), 'Rotate')}
        />
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Flip horizontal" disabled={locked} onClick={() => runAction('object.flipH')}>
                <ArrowsHorizontalIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Flip horizontal</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Flip vertical" disabled={locked} onClick={() => runAction('object.flipV')}>
                <ArrowsVerticalIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Flip vertical</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {ctx.nodes.length === 1 && ctx.nodes[0].type === 'rect' && (
        <NumberField
          label="R"
          ariaLabel="Corner radius"
          value={ctx.nodes[0].radius}
          min={0}
          undoLabel="Corner radius"
          onCommit={(r) => transformRadius(ids[0], r)}
        />
      )}
    </Section>
  );
}

function transformRadius(id: string, r: number) {
  editNodes([id], (n) => void (n.type === 'rect' && (n.radius = r)), 'Corner radius');
}
