import { PlusIcon, ProhibitIcon, SquareIcon, TrashIcon, GradientIcon, CircleHalfIcon, InfoIcon } from '@phosphor-icons/react';
import { convertPaint, gradientVector, joinColor, splitColor, type GradientStop, type Paint } from '@/model';
import { GLYPH_COLOUR_NOTE, useGlyphPaint } from './glyphPaint';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ColorPicker } from '@/components/color/ColorPicker';
import { ColorField } from './ColorField';
import { NumberField } from './NumberField';

const KINDS: { kind: Paint['kind']; label: string; icon: typeof SquareIcon }[] = [
  { kind: 'none', label: 'None', icon: ProhibitIcon },
  { kind: 'solid', label: 'Solid color', icon: SquareIcon },
  { kind: 'linear', label: 'Linear gradient', icon: GradientIcon },
  { kind: 'radial', label: 'Radial gradient', icon: CircleHalfIcon },
];

function gradientCss(p: Extract<Paint, { stops: GradientStop[] }>) {
  const stops = [...p.stops].sort((a, b) => a.offset - b.offset).map((s) => `${s.color} ${Math.round(s.offset * 100)}%`);
  if (p.kind === 'radial') return `radial-gradient(circle, ${stops.join(', ')})`;
  return `linear-gradient(${(p.angle ?? 0) + 90}deg, ${stops.join(', ')})`;
}

/** The App icon colour note (Fill/Stroke sections, tool bar swatches). */
export function GlyphColourNote() {
  return (
    <p className="flex gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" data-slot="glyph-colour-note">
      <InfoIcon aria-hidden="true" className="mt-px size-4 shrink-0" />
      <span>{GLYPH_COLOUR_NOTE}</span>
    </p>
  );
}

/** Opacity of a paint's colour (solid alpha; gradients and none count as 1). */
const paintAlpha = (p: Paint) => (p.kind === 'solid' ? splitColor(p.color).opacity : 1);

/**
 * App icon documents: the glyph is one colour, so only "none" vs "paint" and the paint's opacity
 * matter (the colour itself is replaced by currentColor on export and white on the tile).
 */
function GlyphPaintEditor({ value, onChange, label, note }: { value: Paint; onChange: (p: Paint) => void; label: string; note: boolean }) {
  const on = value.kind !== 'none';
  const alpha = paintAlpha(value);
  const solidColor = value.kind === 'solid' ? value.color : '#ffffff';
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={on ? 'paint' : 'none'}
        onValueChange={(k) => k && onChange(k === 'none' ? { kind: 'none' } : { kind: 'solid', color: '#ffffff' })}
        aria-label={`${label} type`}
        className="w-full"
      >
        <ToggleGroupItem value="none" aria-label="None" className="flex-1 gap-1.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
          <ProhibitIcon />
          None
        </ToggleGroupItem>
        <ToggleGroupItem value="paint" aria-label="Glyph colour" className="flex-1 gap-1.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
          <SquareIcon weight="fill" />
          Glyph
        </ToggleGroupItem>
      </ToggleGroup>
      {on && (
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
          <span className="text-sm text-muted-foreground">Opacity</span>
          <NumberField
            ariaLabel={`${label} opacity`}
            value={Math.round(alpha * 100)}
            min={0}
            max={100}
            precision={0}
            suffix="%"
            onCommit={(v) => onChange({ kind: 'solid', color: joinColor(solidColor, v / 100) })}
          />
        </div>
      )}
      {note && <GlyphColourNote />}
    </div>
  );
}

/**
 * Edits a Paint: none / solid (color + alpha) / linear or radial gradient (stops, angle).
 * `inline` shows the full color picker for solid colors (used inside popovers). In app icon
 * documents it edits only none/paint and opacity (`note` adds the one-colour explanation).
 */
export function PaintEditor({
  value,
  onChange,
  label,
  inline = false,
  note = true,
  glyphMode,
}: {
  value: Paint;
  onChange: (p: Paint) => void;
  label: string;
  inline?: boolean;
  note?: boolean;
  /** Force (or turn off, e.g. the artboard background) the one-colour editor; default: icon documents. */
  glyphMode?: boolean;
}) {
  const iconDoc = useGlyphPaint();
  if (glyphMode ?? iconDoc) return <GlyphPaintEditor value={value} onChange={onChange} label={label} note={note} />;
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value.kind}
        onValueChange={(k) => k && onChange(convertPaint(value, k as Paint['kind']))}
        aria-label={`${label} type`}
        className="w-full"
      >
        {KINDS.map(({ kind, label: l, icon: Icon }) => (
          <Tooltip key={kind}>
            {/* Wrapper: TooltipTrigger's own data-state would override the item's data-state=on. */}
            <TooltipTrigger asChild>
              <span className="flex min-w-0 flex-1">
                <ToggleGroupItem value={kind} aria-label={l} className="flex-1 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
                  <Icon />
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent>{l}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      {value.kind === 'solid' &&
        (inline ? (
          <ColorPicker value={value.color} onChange={(color) => onChange({ kind: 'solid', color })} />
        ) : (
          <ColorField ariaLabel={label} value={value.color} onChange={(color) => onChange({ kind: 'solid', color })} />
        ))}
      {(value.kind === 'linear' || value.kind === 'radial') && <GradientEditor value={value} onChange={onChange} label={label} />}
    </div>
  );
}

function GradientEditor({
  value,
  onChange,
  label,
}: {
  value: Extract<Paint, { stops: GradientStop[] }>;
  onChange: (p: Paint) => void;
  label: string;
}) {
  const setStops = (stops: GradientStop[]) => onChange({ ...value, stops });
  const v = gradientVector(value.angle);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-6 rounded-md border border-input"
        style={{ backgroundImage: gradientCss(value) }}
        aria-hidden="true"
        data-vector={`${v.x1},${v.y1},${v.x2},${v.y2}`}
      />
      {value.kind === 'linear' && (
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
          <span className="text-sm text-muted-foreground">Angle</span>
          <NumberField
            ariaLabel={`${label} gradient angle`}
            value={value.angle ?? 0}
            suffix="°"
            precision={1}
            undoLabel="Gradient angle"
            onCommit={(angle) => onChange({ ...value, angle })}
          />
        </div>
      )}
      {value.stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-2">
          <ColorField
            className="min-w-0 flex-1"
            showAlpha={false}
            ariaLabel={`${label} stop ${i + 1}`}
            value={stop.color}
            onChange={(color) => setStops(value.stops.map((s, j) => (j === i ? { ...s, color } : s)))}
          />
          <NumberField
            className="w-18 shrink-0"
            ariaLabel={`${label} stop ${i + 1} position`}
            value={Math.round(stop.offset * 100)}
            suffix="%"
            min={0}
            max={100}
            precision={0}
            onCommit={(o) => setStops(value.stops.map((s, j) => (j === i ? { ...s, offset: o / 100 } : s)))}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove stop ${i + 1}`}
            disabled={value.stops.length <= 2}
            onClick={() => setStops(value.stops.filter((_, j) => j !== i))}
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          const sorted = [...value.stops].sort((a, b) => a.offset - b.offset);
          const last = sorted[sorted.length - 1];
          const prev = sorted[sorted.length - 2] ?? last;
          setStops([...value.stops, { offset: Math.min(1, (prev.offset + last.offset) / 2 + 0.0001), color: last.color }].sort((a, b) => a.offset - b.offset));
        }}
      >
        <PlusIcon data-icon="inline-start" />
        Add stop
      </Button>
    </div>
  );
}
