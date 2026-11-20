// New document, step 2: the options of the chosen mode. Every choice is a native radio group
// (Tab enters the group, arrows move and select), double-clicking a choice creates right away.
import { useId, type ReactNode } from 'react';
import { DesktopIcon, DeviceMobileIcon, DeviceTabletIcon, type Icon } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BRAND, GLYPH_DEFAULT } from '@/icon';
import { ICON_PRESETS } from '@/icon/presets';
import { HexColorField } from '@/iconMode/ui/HexColorField';
import { COLOUR_MODES, SHAPES } from '@/iconMode/ui/options';
import { cn } from '@/lib/utils';
import { SCREEN_PLATFORMS, type IconShapeSetting, type ScreenPlatform } from '@/model';
import { ARTBOARD_PRESETS } from '@/panels/properties/sections/artboard/presets';
import { NumberField } from '@/panels/shared/NumberField';
import { defaultName, MAX_SIDE, type FreeOptions, type IconOptions, type ModeOptions, type WireframeOptions } from './modes';

interface PanelProps<T extends ModeOptions> {
  options: T;
  onChange: (next: T) => void;
  /** Create with the current options (double-click on a choice). */
  onCreate: () => void;
  disabled?: boolean;
}

/** A selectable card: a visually hidden radio inside a label. */
function Choice({ name, checked, onSelect, onCreate, disabled, children, className }: { name: string; checked: boolean; onSelect: () => void; onCreate: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <label
      onDoubleClick={() => !disabled && onCreate()}
      className={cn(
        'relative flex min-h-14 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
        'has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:text-primary',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} disabled={disabled} className="sr-only" />
      {children}
    </label>
  );
}

function ChoiceText({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-foreground">{title}</span>
      <span className="truncate text-xs text-muted-foreground tabular-nums">{detail}</span>
    </span>
  );
}

function Group({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <h3 id={id} className="eyebrow">
        {label}
      </h3>
      <div role="radiogroup" aria-labelledby={id} className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
        {children}
      </div>
    </section>
  );
}

function NameField({ options, onChange, disabled }: { options: ModeOptions; onChange: (name: string) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Name</Label>
      <Input id={id} value={options.name} placeholder={defaultName(options)} disabled={disabled} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
    </div>
  );
}

/** A label + control row (stacks on narrow widths). */
function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-3 gap-y-1.5 sm:grid-cols-[8rem_1fr]">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{label}</Label>
      ) : (
        <span className="text-sm font-medium" aria-hidden="true">
          {label}
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Proportional outline of a size (fits a 40 × 40 box). */
function Ratio({ width, height, round }: { width: number; height: number; round?: boolean }) {
  const k = 32 / Math.max(width, height);
  return (
    <span className="flex size-10 shrink-0 items-center justify-center" aria-hidden="true">
      <span className={cn('border-2 border-current', round ? 'rounded-[9px]' : 'rounded-[3px]')} style={{ width: Math.max(8, width * k), height: Math.max(6, height * k) }} />
    </span>
  );
}

export function FreePanel({ options, onChange, onCreate, disabled }: PanelProps<FreeOptions>) {
  const name = useId();
  const custom = options.size === 'custom';
  const set = (patch: Partial<FreeOptions>) => onChange({ ...options, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <NameField options={options} onChange={(n) => set({ name: n })} disabled={disabled} />
      <Group label="Artboard">
        {ARTBOARD_PRESETS.map((p) => (
          <Choice key={p.id} name={name} checked={options.size === p.id} onSelect={() => set({ size: p.id, width: p.width, height: p.height })} onCreate={onCreate} disabled={disabled}>
            <Ratio width={p.width} height={p.height} />
            <ChoiceText title={p.label} detail={`${p.width} × ${p.height}`} />
          </Choice>
        ))}
        <Choice name={name} checked={custom} onSelect={() => set({ size: 'custom' })} onCreate={onCreate} disabled={disabled} className="col-span-2 sm:col-span-1">
          <Ratio width={Math.max(1, options.width)} height={Math.max(1, options.height)} />
          <ChoiceText title="Custom" detail={`${Math.round(options.width)} × ${Math.round(options.height)}`} />
        </Choice>
      </Group>
      {custom && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Custom size">
          <NumberField className="w-32" label="W" ariaLabel="Custom width" value={options.width} min={1} max={MAX_SIDE} precision={0} onCommit={(width) => set({ width })} disabled={disabled} />
          <NumberField className="w-32" label="H" ariaLabel="Custom height" value={options.height} min={1} max={MAX_SIDE} precision={0} onCommit={(height) => set({ height })} disabled={disabled} />
          <span className="text-xs text-muted-foreground">Up to {MAX_SIDE} px a side</span>
        </div>
      )}
      <p className="text-sm text-muted-foreground">You can change the size later in Properties → Artboard.</p>
    </div>
  );
}

export function IconPanel({ options, onChange, onCreate, disabled }: PanelProps<IconOptions>) {
  const name = useId();
  const shapeId = useId();
  const set = (patch: Partial<IconOptions>) => onChange({ ...options, ...patch });
  const full = options.colour === 'full-colour';
  return (
    <div className="flex flex-col gap-5">
      <NameField options={options} onChange={(n) => set({ name: n })} disabled={disabled} />
      <Group label="Format">
        {ICON_PRESETS.map((p) => (
          <Choice key={p.id} name={name} checked={options.preset === p.id} onSelect={() => set({ preset: p.id })} onCreate={onCreate} disabled={disabled}>
            <Ratio width={1} height={1} round />
            <ChoiceText title={p.label} detail={`${p.size} × ${p.size} · ${p.hint}`} />
          </Choice>
        ))}
      </Group>
      <section className="flex flex-col gap-3" aria-label="Look">
        <h3 className="eyebrow">Look</h3>
        <Row label="Shape" htmlFor={shapeId}>
          <Select value={options.shape} onValueChange={(v) => set({ shape: v as IconShapeSetting })} disabled={disabled}>
            <SelectTrigger id={shapeId} size="sm" className="w-full" aria-label="Glyph shape">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHAPES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.id === 'auto' ? 'Auto (from the glyph)' : s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Tile colour">
          <HexColorField value={options.tile} def={BRAND} label="Tile colour" onChange={(tile) => set({ tile })} />
        </Row>
        <Row label="Colour">
          <ToggleGroup type="single" variant="outline" size="sm" value={options.colour} onValueChange={(v) => v && set({ colour: v as IconOptions['colour'] })} aria-label="Colour mode" className="w-full" disabled={disabled}>
            {COLOUR_MODES.map((m) => (
              <ToggleGroupItem key={m.id} value={m.id} aria-label={m.label} className="flex-1 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
                {m.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
        {!full && (
          <Row label="Glyph colour">
            <HexColorField value={options.glyph} def={GLYPH_DEFAULT} label="Glyph colour" onChange={(glyph) => set({ glyph })} />
          </Row>
        )}
      </section>
      <p className="text-sm text-muted-foreground">Everything here can be changed later in Properties → App icon.</p>
    </div>
  );
}

const PLATFORM_ICONS: Record<ScreenPlatform, Icon> = { phone: DeviceMobileIcon, tablet: DeviceTabletIcon, desktop: DesktopIcon };

export function WireframePanel({ options, onChange, onCreate, disabled }: PanelProps<WireframeOptions>) {
  const name = useId();
  const set = (patch: Partial<WireframeOptions>) => onChange({ ...options, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <NameField options={options} onChange={(n) => set({ name: n })} disabled={disabled} />
      <Group label="First screen" className="grid-cols-1 sm:grid-cols-3">
        {SCREEN_PLATFORMS.map((p) => {
          const PlatformIcon = PLATFORM_ICONS[p.id];
          return (
            <Choice key={p.id} name={name} checked={options.platform === p.id} onSelect={() => set({ platform: p.id })} onCreate={onCreate} disabled={disabled}>
              <span className="flex size-10 shrink-0 items-center justify-center" aria-hidden="true">
                <PlatformIcon className="size-7" />
              </span>
              <ChoiceText title={p.label} detail={`${p.width} × ${p.minHeight}`} />
            </Choice>
          );
        })}
      </Group>
      <p className="text-sm text-muted-foreground">The canvas is infinite: add more screens, other platforms, components and the flow between screens once it is open.</p>
    </div>
  );
}
