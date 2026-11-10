import { useState } from 'react';
import { ArrowsInIcon, CheckCircleIcon, DownloadSimpleIcon, WarningIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { fit, iconPresetDef, isFaviconPreset, strokeWarning, type IconShapeArg } from '@/icon';
import type { IconShapeSetting } from '@/model';
import { FieldRow, Section } from '@/panels/shared/Section';
import type { SelectionContext } from '@/panels/properties/types';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { fitToKeyline } from '../commands';
import { leaveIconMode, setIconInfo } from '../document';
import { isOnKeyline, keylineFill } from '../fit';
import { useIconStore } from '../store';
import { IconPreview } from './IconPreview';
import { useIconSources } from '../hooks';

const SHAPES: { id: IconShapeSetting; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'circle', label: 'Circle (0.64 T)' },
  { id: 'square', label: 'Square (0.60 T)' },
  { id: 'wide', label: 'Wide (0.68 T)' },
  { id: 'tall', label: 'Tall (0.68 T)' },
];

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <FieldRow label={label}>
      <span className={warn ? 'text-sm font-medium text-destructive tabular-nums' : 'text-sm tabular-nums'}>{value}</span>
    </FieldRow>
  );
}

/** Icon panel: shape, live measurements and warnings (build-icons.mjs numbers), fit, preview, export. */
export function IconSection({ ctx }: { ctx: SelectionContext }) {
  const doc = ctx.doc;
  const icon = doc.icon!;
  const analysis = useIconStore((s) => s.analysis);
  const { showKeylines, showTile, light, setPrefs } = useIconStore();
  const projects = useProjectsStore((s) => s.projects);
  const sources = useIconSources(doc);
  const [fitting, setFitting] = useState(false);
  const fav = isFaviconPreset(icon.preset);
  const { box, report } = analysis;

  const onKeyline = box ? isOnKeyline(doc, box) : false;
  const fill = box ? keylineFill(doc, box) : null;
  const s128 = box && report ? fit(box, 128, report.long).s : 1;
  // Stroke check: only the width after the fit (what the user sees) counts.
  const drawn = analysis.strokes;
  const fitted = drawn.map((w) => w * s128);
  const strokeOut = strokeWarning(fitted);
  const span = (ws: number[]) => {
    const lo = Math.min(...ws),
      hi = Math.max(...ws);
    return hi - lo > 0.05 ? `${lo.toFixed(1)}–${hi.toFixed(1)}` : lo.toFixed(1);
  };

  const runFit = async () => {
    setFitting(true);
    try {
      if (await fitToKeyline()) toast.success('Glyph fitted to the keyline');
    } finally {
      setFitting(false);
    }
  };

  return (
    <>
      <Section
        title={icon.preset === 'app-icon' ? 'App icon' : `App icon · ${iconPresetDef(icon.preset).label}`}
        actions={
          analysis.status === 'measuring' ? (
            <span className="text-xs text-muted-foreground">Measuring…</span>
          ) : onKeyline ? (
            <Badge variant="secondary">
              <CheckCircleIcon data-icon="inline-start" />
              On keyline
            </Badge>
          ) : null
        }
      >
        <FieldRow label="Shape">
          <Select value={icon.shape} onValueChange={(v) => setIconInfo({ shape: v as IconShapeArg }, 'Icon shape')}>
            <SelectTrigger size="sm" className="w-full" aria-label="Glyph shape">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHAPES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.id === 'auto' && report ? `Auto (${report.shape})` : s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        {analysis.status === 'empty' && <p className="text-sm text-muted-foreground">Draw the glyph inside the tile, or import an SVG. Its colours become currentColor on export.</p>}
        {analysis.status === 'error' && <p className="text-sm text-destructive">{analysis.error}</p>}

        {box && report && fill !== null && (
          <>
            <Stat label="Long side" value={`${(Math.max(box.w, box.h) / 128).toFixed(2)} T → ${fill.toFixed(2)} T`} />
            <Stat label="Glyph" value={`${pct(report.w)} × ${pct(report.h)} of T`} warn={report.warnings.some((w) => w.includes('short side'))} />
            <Stat label="Ink" value={pct(report.coverage, 1)} warn={report.coverage < 0.08 || report.coverage > 0.32} />
            {!fav && <Stat label="Android" value={`${report.halfDiag.toFixed(1)} dp half-diagonal`} warn={report.halfDiag > 33} />}
            {drawn.length > 0 && <Stat label="Strokes" value={`${span(fitted)} units after fit (drawn ${span(drawn)})`} warn={strokeOut} />}
            <p className="text-xs text-muted-foreground">Numbers after the fit, as build-icons.mjs prints them. Ink 8–32%{drawn.length ? ', strokes target 0.05–0.07 T = 6.4–9 units after fitting' : ''}.</p>
            {(report.warnings.length > 0 || strokeOut) && (
              <ul className="flex flex-col gap-1.5" aria-label="Warnings">
                {report.warnings.map((w) => (
                  <li key={w} className="flex gap-1.5 text-sm text-destructive">
                    <WarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{w.replace(/^\s*!\s*/, '')}</span>
                  </li>
                ))}
                {strokeOut && (
                  <li className="flex gap-1.5 text-sm text-destructive">
                    <WarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>strokes: target 0.05–0.07 T (6.4–9 units after fitting); thinner than 0.045 T looks like a hairline. Use round caps and joins</span>
                  </li>
                )}
              </ul>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => void runFit()} disabled={fitting || !box || onKeyline}>
            <ArrowsInIcon data-icon="inline-start" />
            Fit to keyline
          </Button>
          <Button size="sm" variant="outline" onClick={() => useEditorStore.getState().openDialog('exportIcon')}>
            <DownloadSimpleIcon data-icon="inline-start" />
            Export icon…
          </Button>
        </div>
      </Section>

      {sources && !fav && (
        <Section title="Preview">
          <IconPreview sources={sources} compact />
        </Section>
      )}

      <Section title="Icon view">
        <FieldRow label="Keylines">
          <Switch aria-label="Show keylines" checked={showKeylines} onCheckedChange={(v) => setPrefs({ showKeylines: v })} />
        </FieldRow>
        <FieldRow label="Tile">
          <Switch aria-label="Show the tile under the glyph" checked={showTile} onCheckedChange={(v) => setPrefs({ showTile: v })} />
        </FieldRow>
        <FieldRow label="Light">
          <Switch aria-label="Light variant" checked={light} onCheckedChange={(v) => setPrefs({ light: v })} />
        </FieldRow>
        {!fav && (
          <FieldRow label="Favicon">
            <Select
              value={icon.smallGlyphProjectId ?? 'none'}
              onValueChange={(v) => setIconInfo({ smallGlyphProjectId: v === 'none' ? undefined : v }, 'Small glyph')}
            >
              <SelectTrigger size="sm" className="w-full" aria-label="Small glyph project for favicons">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Same glyph</SelectItem>
                {projects
                  .filter((p) => p.id !== doc.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FieldRow>
        )}
        <Button size="sm" variant="ghost" className="self-start" onClick={leaveIconMode}>
          Leave app icon mode
        </Button>
      </Section>
    </>
  );
}
