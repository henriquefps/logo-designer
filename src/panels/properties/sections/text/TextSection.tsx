import { TextAlignCenterIcon, TextAlignLeftIcon, TextAlignRightIcon, TextItalicIcon, WarningIcon } from '@phosphor-icons/react';
import type { Draft } from 'immer';
import type { SceneNode, TextNode } from '@/model';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { findFamily, FALLBACK_FAMILY, useFontStore } from '@/fonts';
import { FontFamilyPicker } from '@/fonts/ui/FontFamilyPicker';
import { FontWeightField } from '@/fonts/ui/FontWeightField';
import { nearestWeight } from '@/fonts/weights';
import { outlineSelection } from '@/fonts/outlineSelection';
import { NumberField } from '../../../shared/NumberField';
import { FieldRow, Section } from '../../../shared/Section';
import { common, editNodes } from '../../edit';
import type { SelectionContext } from '../../types';

type TextPatch = Partial<Pick<TextNode, 'fontFamily' | 'fontWeight' | 'fontStyle' | 'fontSize' | 'letterSpacing' | 'lineHeight' | 'align'>>;

const ALIGNS = [
  { value: 'left', label: 'Align left', icon: TextAlignLeftIcon },
  { value: 'center', label: 'Align center', icon: TextAlignCenterIcon },
  { value: 'right', label: 'Align right', icon: TextAlignRightIcon },
] as const;

export function TextSection({ ctx }: { ctx: SelectionContext }) {
  const texts = ctx.nodes.filter((n): n is TextNode => n.type === 'text');
  useFontStore((s) => s.uploads);
  const ready = useFontStore((s) => s.uploadsReady);
  const ids = texts.map((t) => t.id);
  const set = (patch: TextPatch, label: string) => editNodes(ids, (n: Draft<SceneNode>) => void (n.type === 'text' && Object.assign(n, patch)), label);

  const family = common(texts, (t) => t.fontFamily);
  const weight = common(texts, (t) => t.fontWeight);
  const italic = texts.every((t) => t.fontStyle === 'italic');
  const align = common(texts, (t) => t.align);
  const missing = ready ? [...new Set(texts.map((t) => t.fontFamily).filter((f) => !findFamily(f)))] : [];

  return (
    <Section
      title="Text"
      actions={
        <Button variant="ghost" size="sm" className="h-7" onClick={() => void outlineSelection()}>
          Create outlines
        </Button>
      }
    >
      {missing.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <WarningIcon className="mt-0.5 shrink-0 text-warning" />
          <p>
            {missing.map((m) => `“${m}”`).join(', ')} {missing.length === 1 ? 'is' : 'are'} not available. Showing {FALLBACK_FAMILY}; upload the font in Assets → Fonts or pick another.
          </p>
        </div>
      )}
      <FieldRow label="Font">
        <FontFamilyPicker
          value={family}
          onChange={(f) => {
            const info = findFamily(f);
            editNodes(
              ids,
              (n: Draft<SceneNode>) => {
                if (n.type !== 'text') return;
                n.fontFamily = f;
                if (info) n.fontWeight = nearestWeight(info, n.fontWeight);
              },
              'Font',
            );
          }}
        />
      </FieldRow>
      <FieldRow label="Weight">
        <FontWeightField family={family} value={weight} onChange={(w) => set({ fontWeight: w }, 'Font weight')} />
      </FieldRow>
      <FieldRow label="Size">
        <NumberField ariaLabel="Font size" value={common(texts, (t) => t.fontSize)} min={1} max={2000} step={1} suffix="px" undoLabel="Font size" onCommit={(v) => set({ fontSize: v }, 'Font size')} />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex shrink-0">
              <Toggle
                variant="outline"
                size="sm"
                aria-label="Italic"
                pressed={italic}
                onPressedChange={(p) => set({ fontStyle: p ? 'italic' : 'normal' }, 'Italic')}
                className="data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                <TextItalicIcon />
              </Toggle>
            </span>
          </TooltipTrigger>
          <TooltipContent>Italic (synthetic slant when the font has no italic)</TooltipContent>
        </Tooltip>
      </FieldRow>
      <FieldRow label="Spacing">
        <NumberField ariaLabel="Letter spacing" value={common(texts, (t) => t.letterSpacing)} step={0.5} suffix="px" undoLabel="Letter spacing" onCommit={(v) => set({ letterSpacing: v }, 'Letter spacing')} />
      </FieldRow>
      <FieldRow label="Line height">
        <NumberField ariaLabel="Line height" value={common(texts, (t) => t.lineHeight)} min={0.1} max={10} step={0.05} suffix="×" undoLabel="Line height" onCommit={(v) => set({ lineHeight: v }, 'Line height')} />
      </FieldRow>
      <FieldRow label="Align">
        <ToggleGroup type="single" variant="outline" size="sm" value={align ?? ''} onValueChange={(v) => v && set({ align: v as TextNode['align'] }, 'Text align')} aria-label="Text alignment" className="w-full">
          {ALIGNS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label} className="flex-1 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
              <Icon />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldRow>
    </Section>
  );
}
