import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { EyedropperIcon } from '@phosphor-icons/react';
import { joinColor, normalizeHex, splitColor, walk, type Paint } from '@/model';
import { hexToHsv, hexToRgb, hsvToHex, rgbToHex, type Hsv } from '@/lib/colorMath';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDocStore } from '@/store/useDocStore';
import { useRecentColors } from './recentColors';

// ---------------------------------------------------------------------------------------------
/** Solid colors used in the document (fills, strokes, gradient stops), most frequent first. */
function useDocumentColors(limit = 16): string[] {
  const doc = useDocStore((s) => s.doc);
  return useMemo(() => {
    const count = new Map<string, number>();
    const add = (c: string | undefined) => {
      const hex = c && normalizeHex(c);
      if (hex) count.set(hex, (count.get(hex) ?? 0) + 1);
    };
    const addPaint = (p: Paint | undefined) => {
      if (!p || p.kind === 'none') return;
      if (p.kind === 'solid') add(p.color);
      else p.stops.forEach((s) => add(s.color));
    };
    walk(doc.children, (n) => {
      if ('fill' in n) addPaint(n.fill);
      if ('stroke' in n) addPaint(n.stroke.paint);
    });
    addPaint(doc.artboard.background);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c]) => c);
  }, [doc, limit]);
}

// ---------------------------------------------------------------------------------------------

const checker = {
  backgroundImage: 'repeating-conic-gradient(var(--muted) 0% 25%, var(--card) 0% 50%)',
  backgroundSize: '8px 8px',
};

interface ColorPickerProps {
  /** #rrggbb or #rrggbbaa */
  value: string;
  onChange: (color: string) => void;
  showAlpha?: boolean;
  /** Group a drag into one undo step (default: the document transaction). */
  transactional?: boolean;
}

/**
 * Saturation/value square, hue and alpha sliders, hex + RGB inputs, eyedropper (where the
 * browser supports it), document colors and recent swatches. Drags are one undo step.
 */
export function ColorPicker({ value, onChange, showAlpha = true, transactional = true }: ColorPickerProps) {
  const { color, opacity } = splitColor(value);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
  const lastEmitted = useRef(color);
  const docColors = useDocumentColors();
  const recent = useRecentColors((s) => s.colors);
  const pushRecent = useRecentColors((s) => s.push);

  // Follow external changes without losing hue/saturation at gray/black.
  useEffect(() => {
    if (color !== lastEmitted.current) {
      lastEmitted.current = color;
      setHsv(hexToHsv(color));
    }
  }, [color]);

  const emit = (next: Hsv, alpha = opacity) => {
    setHsv(next);
    const hex = hsvToHex(next);
    lastEmitted.current = hex;
    onChange(joinColor(hex, alpha));
  };
  const emitHex = (hex: string, alpha = opacity) => {
    lastEmitted.current = hex;
    setHsv(hexToHsv(hex));
    onChange(joinColor(hex, alpha));
  };

  const begin = () => transactional && useDocStore.getState().beginTransaction('Change color');
  const end = () => {
    if (transactional) useDocStore.getState().commitTransaction();
    pushRecent(lastEmitted.current);
  };

  const pick = (hex: string) => {
    const parsed = splitColor(hex);
    emitHex(parsed.color, hex.length === 9 ? parsed.opacity : opacity);
    pushRecent(parsed.color);
  };

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const eyedrop = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const res = await new Ctor().open();
      const hex = normalizeHex(res.sRGBHex);
      if (hex) pick(hex);
    } catch {
      /* cancelled */
    }
  };

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  return (
    <div className="flex w-full flex-col gap-3" data-slot="color-picker">
      <Area2D
        ariaLabel="Saturation and brightness"
        x={hsv.s}
        y={1 - hsv.v}
        onStart={begin}
        onEnd={end}
        onMove={(x, y) => emit({ ...hsv, s: x, v: 1 - y })}
        style={{ backgroundColor: hueColor, backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)' }}
        thumbColor={color}
        onKey={(dx, dy) => emit({ ...hsv, s: clamp01(hsv.s + dx), v: clamp01(hsv.v - dy) })}
      />
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Slider1D
            ariaLabel="Hue"
            value={hsv.h / 360}
            onStart={begin}
            onEnd={end}
            onMove={(t) => emit({ ...hsv, h: Math.min(359.9, t * 360) })}
            background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
            thumbColor={hueColor}
            valueText={`${Math.round(hsv.h)}°`}
          />
          {showAlpha && (
            <Slider1D
              ariaLabel="Opacity"
              value={opacity}
              onStart={begin}
              onEnd={end}
              onMove={(t) => emit(hsv, Math.round(t * 100) / 100)}
              background={`linear-gradient(to right, transparent, ${color}), ${checker.backgroundImage}`}
              backgroundSize={`auto, ${checker.backgroundSize}`}
              thumbColor={value}
              valueText={`${Math.round(opacity * 100)}%`}
            />
          )}
        </div>
        {hasEyeDropper && (
          <Button variant="outline" size="icon" aria-label="Pick a color from the screen" onClick={() => void eyedrop()}>
            <EyedropperIcon />
          </Button>
        )}
      </div>
      <ColorInputs color={color} opacity={opacity} showAlpha={showAlpha} onHex={(hex) => pick(hex)} onAlpha={(a) => onChange(joinColor(color, a))} />
      {docColors.length > 0 && <SwatchRow label="Document" colors={docColors} onPick={pick} />}
      {recent.length > 0 && <SwatchRow label="Recent" colors={recent} onPick={pick} />}
    </div>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function usePointerDrag(onMove: (x: number, y: number) => void, onStart: () => void, onEnd: () => void) {
  const dragging = useRef(false);
  const at = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(clamp01((e.clientX - r.left) / Math.max(1, r.width)), clamp01((e.clientY - r.top) / Math.max(1, r.height)));
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.focus({ preventScroll: true });
      dragging.current = true;
      onStart();
      at(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => dragging.current && at(e),
    onPointerUp: () => {
      if (!dragging.current) return;
      dragging.current = false;
      onEnd();
    },
    onLostPointerCapture: () => {
      if (!dragging.current) return;
      dragging.current = false;
      onEnd();
    },
  };
}

function Area2D(p: {
  ariaLabel: string;
  x: number;
  y: number;
  onMove: (x: number, y: number) => void;
  onStart: () => void;
  onEnd: () => void;
  onKey: (dx: number, dy: number) => void;
  style: React.CSSProperties;
  thumbColor: string;
}) {
  const drag = usePointerDrag(p.onMove, p.onStart, p.onEnd);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={p.ariaLabel}
      aria-valuetext={`Saturation ${Math.round(p.x * 100)}%, brightness ${Math.round((1 - p.y) * 100)}%`}
      className="relative h-36 w-full cursor-crosshair touch-none rounded-md border border-input outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={p.style}
      {...drag}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.01;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        p.onKey(d[0], d[1]);
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-3.5 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
        style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, backgroundColor: p.thumbColor }}
      />
    </div>
  );
}

function Slider1D(p: {
  ariaLabel: string;
  value: number;
  onMove: (t: number) => void;
  onStart: () => void;
  onEnd: () => void;
  background: string;
  backgroundSize?: string;
  thumbColor: string;
  valueText: string;
}) {
  const drag = usePointerDrag((x) => p.onMove(x), p.onStart, p.onEnd);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={p.ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p.value * 100)}
      aria-valuetext={p.valueText}
      className="relative h-3.5 w-full cursor-pointer touch-none rounded-full border border-input outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{ backgroundImage: p.background, backgroundSize: p.backgroundSize }}
      {...drag}
      onKeyDown={(e) => {
        const step = (e.shiftKey ? 10 : 1) / 100;
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        p.onMove(clamp01(p.value + d));
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-4 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
        style={{ left: `${p.value * 100}%`, backgroundColor: p.thumbColor }}
      />
    </div>
  );
}

function ColorInputs({
  color,
  opacity,
  showAlpha,
  onHex,
  onAlpha,
}: {
  color: string;
  opacity: number;
  showAlpha: boolean;
  onHex: (hex: string) => void;
  onAlpha: (a: number) => void;
}) {
  const rgb = hexToRgb(color);
  const field = 'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-1.5 text-center text-[0.8125rem] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';
  return (
    <div className={cn('grid gap-1.5', showAlpha ? 'grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))]' : 'grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))]')}>
      <LabeledInput label="Hex" key={`hex-${color}`} className={cn(field, 'font-mono uppercase')} defaultValue={color.slice(1)} onCommit={(v) => {
        const hex = normalizeHex(v);
        if (hex) onHex(hex.slice(0, 7));
      }} />
      {(['r', 'g', 'b'] as const).map((k) => (
        <LabeledInput
          key={`${k}-${color}`}
          label={k.toUpperCase()}
          className={field}
          defaultValue={String(Math.round(rgb[k]))}
          inputMode="numeric"
          onCommit={(v) => {
            const n = Number(v);
            if (Number.isFinite(n)) onHex(rgbToHex({ ...rgb, [k]: Math.min(255, Math.max(0, n)) }));
          }}
        />
      ))}
      {showAlpha && (
        <LabeledInput
          key={`a-${opacity}`}
          label="A %"
          className={field}
          defaultValue={String(Math.round(opacity * 100))}
          inputMode="numeric"
          onCommit={(v) => {
            const n = Number(v.replace('%', ''));
            if (Number.isFinite(n)) onAlpha(Math.min(100, Math.max(0, n)) / 100);
          }}
        />
      )}
    </div>
  );
}

function LabeledInput({
  label,
  defaultValue,
  onCommit,
  className,
  inputMode,
}: {
  label: string;
  defaultValue: string;
  onCommit: (v: string) => void;
  className: string;
  inputMode?: 'numeric';
}) {
  const skipBlur = useRef(false);
  return (
    <label className="flex min-w-0 flex-col items-center gap-1">
      <input
        aria-label={label === 'A %' ? 'Opacity percent' : label}
        className={className}
        defaultValue={defaultValue}
        inputMode={inputMode}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          if (skipBlur.current) skipBlur.current = false;
          else if (e.currentTarget.value !== defaultValue) onCommit(e.currentTarget.value.trim());
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            if (e.currentTarget.value !== defaultValue) onCommit(e.currentTarget.value.trim());
            skipBlur.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  );
}

function SwatchRow({ label, colors, onPick }: { label: string; colors: string[]; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            title={c.toUpperCase()}
            aria-label={`Use ${c.toUpperCase()}`}
            onClick={() => onPick(c)}
            className="size-6 rounded-md border border-input shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{ ...checker, backgroundImage: `linear-gradient(${c}, ${c}), ${checker.backgroundImage}`, backgroundSize: `auto, ${checker.backgroundSize}` }}
          />
        ))}
      </div>
    </div>
  );
}
