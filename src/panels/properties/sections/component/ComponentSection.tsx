// Generated from the component's definition: one field per prop (docs/wireframe-mode.md → Semantic
// components). Every edit is one undo step; the pipeline rebuilds the instance.
import { useEffect, useState } from 'react';
import { LinkBreakIcon, MinusCircleIcon, PlusIcon, ShapesIcon, XIcon } from '@phosphor-icons/react';
import { isComponentNode, type ComponentNode } from '@/model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ResponsiveDialog, ResponsiveDialogBody, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ResponsiveDialog';
import { IconsPanel } from '@/assets-icons/IconsPanel';
import { NodeRenderer } from '@/canvas/renderers/NodeRenderer';
import { getComponent } from '@/wireframe/library/registry';
import { isPropVisible, resolveProps, type PropSpec } from '@/wireframe/library/types';
import { detachSelected, setComponentProp } from '@/wireframe/componentCommands';
import { ensureIcons } from '@/wireframe/iconLoader';
import { iconDisplayName, iconGlyph, normalizeIconName, recolor } from '@/wireframe/icons';
import { cn } from '@/lib/utils';
import { NumberField } from '../../../shared/NumberField';
import { FieldRow, Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

const textareaClass =
  'min-h-20 w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const optionLabel = (spec: Extract<PropSpec, { type: 'choice' }>, o: string) => spec.labels?.[o] ?? o.charAt(0).toUpperCase() + o.slice(1).replace(/-/g, ' ');

export function ComponentSection({ ctx }: { ctx: SelectionContext }) {
  const node = ctx.nodes[0];
  if (!node || !isComponentNode(node)) return null;
  return <InstanceFields key={node.id} node={node} />;
}

function InstanceFields({ node }: { node: ComponentNode }) {
  const def = getComponent(node.component.kind);
  if (!def) return null;
  const props = resolveProps(def, node.component.props);
  const set = (key: string, value: unknown) => void setComponentProp(node.id, key, value);
  return (
    <Section
      title={def.label}
      actions={
        <Button size="sm" variant="ghost" onClick={() => detachSelected()} title="Turn into a plain group of shapes (⌥⌘B)">
          <LinkBreakIcon data-icon="inline-start" />
          Detach
        </Button>
      }
    >
      {Object.entries(def.props as Record<string, PropSpec>)
        .filter(([, spec]) => isPropVisible(spec, props))
        .map(([key, spec]) => (
        <PropField key={key} id={`${node.id}-${key}`} spec={spec} value={props[key]} onChange={(v) => set(key, v)} />
      ))}
      <p className="text-xs text-muted-foreground" title="How the AI export describes this component">
        {def.describe(props)}
      </p>
    </Section>
  );
}

function PropField({ id, spec, value, onChange }: { id: string; spec: PropSpec; value: unknown; onChange: (v: unknown) => void }) {
  const field = (() => {
    switch (spec.type) {
      case 'text':
        return <TextInput id={id} label={spec.label} value={String(value)} placeholder={spec.placeholder} onCommit={onChange} />;
      case 'multiline':
        return <TextArea id={id} label={spec.label} value={String(value)} placeholder={spec.placeholder} onCommit={onChange} />;
      case 'number':
        return (
          <NumberField
            ariaLabel={spec.label}
            value={Number(value)}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            precision={spec.step && spec.step < 1 ? 2 : 0}
            suffix={spec.unit}
            undoLabel={`Change ${spec.label.toLowerCase()}`}
            onCommit={onChange}
          />
        );
      case 'boolean':
        return <Switch id={id} aria-label={spec.label} checked={Boolean(value)} onCheckedChange={onChange} />;
      case 'choice':
        return (
          <Select value={String(value)} onValueChange={onChange}>
            <SelectTrigger id={id} size="sm" className="w-full" aria-label={spec.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spec.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {optionLabel(spec, o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'icon':
        return <IconField label={spec.label} value={String(value)} onChange={onChange} />;
      case 'list':
        return null;
    }
  })();
  if (spec.type === 'list') return <ListEditor spec={spec} value={value as string[]} onChange={onChange} />;
  return (
    <div className="flex flex-col gap-1">
      <FieldRow label={spec.label}>{field}</FieldRow>
      {spec.help && <p className="pl-22 text-xs text-muted-foreground">{spec.help}</p>}
    </div>
  );
}

/** Commits on blur / Enter; Escape restores. One undo step per commit. */
function TextInput({ id, label, value, placeholder, onCommit }: { id: string; label: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
  return (
    <Input
      key={value}
      id={id}
      className="h-8"
      aria-label={label}
      placeholder={placeholder}
      defaultValue={value}
      onBlur={(e) => e.currentTarget.value !== value && onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Enter adds a line; commits on blur or ⌘Enter. */
function TextArea({ id, label, value, placeholder, onCommit }: { id: string; label: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
  return (
    <textarea
      key={value}
      id={id}
      aria-label={label}
      className={textareaClass}
      placeholder={placeholder}
      defaultValue={value}
      onBlur={(e) => e.currentTarget.value !== value && onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** The cached glyph of an icon key, drawn small (loads it first). */
export function IconGlyph({ name, className }: { name: string; className?: string }) {
  const key = normalizeIconName(name);
  const [, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    if (key) void ensureIcons([key]).then(() => live && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [key]);
  const glyph = key ? iconGlyph(key) : null;
  if (!glyph) return <ShapesIcon className={cn('size-4 text-muted-foreground', className)} />;
  return (
    <svg aria-hidden viewBox="-12 -12 24 24" className={cn('size-4 text-foreground', className)}>
      <NodeRenderer node={recolor(glyph, 'currentColor')} />
    </svg>
  );
}

function IconField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="h-8 min-w-0 flex-1 justify-start" aria-label={`${label}: ${value ? iconDisplayName(value) : 'none'}`} onClick={() => setOpen(true)}>
        {value ? <IconGlyph name={value} /> : <ShapesIcon className="text-muted-foreground" />}
        <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? iconDisplayName(value) : 'None'}</span>
      </Button>
      {value && (
        <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Remove ${label.toLowerCase()}`} title="No icon" onClick={() => onChange('')}>
          <XIcon />
        </Button>
      )}
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Choose an icon</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-sm text-muted-foreground">From the same libraries as the Icons panel.</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="px-0">
            <IconsPanel
              onPick={(key) => {
                setOpen(false);
                onChange(key);
              }}
            />
          </ResponsiveDialogBody>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}

/** A list of strings: edit in place (commit on blur), add, remove, reorder by retyping. One undo step per change. */
function ListEditor({ spec, value, onChange }: { spec: Extract<PropSpec, { type: 'list' }>; value: string[]; onChange: (v: string[]) => void }) {
  const item = spec.item ?? 'Item';
  const canAdd = spec.max === undefined || value.length < spec.max;
  const canRemove = value.length > (spec.min ?? 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{spec.label}</span>
        <Button size="sm" variant="ghost" disabled={!canAdd} onClick={() => onChange([...value, `${item} ${value.length + 1}`])}>
          <PlusIcon data-icon="inline-start" />
          Add {item.toLowerCase()}
        </Button>
      </div>
      {value.map((v, i) => (
        <div key={`${i}-${v}`} className="flex items-center gap-2">
          <Input
            className="h-8"
            aria-label={`${item} ${i + 1}`}
            defaultValue={v}
            onBlur={(e) => {
              const next = e.currentTarget.value;
              if (next !== v) onChange(value.map((x, j) => (j === i ? next : x)));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label={`Remove ${item.toLowerCase()} ${i + 1}`}
            disabled={!canRemove}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <MinusCircleIcon />
          </Button>
        </div>
      ))}
      {spec.help && <p className="text-xs text-muted-foreground">{spec.help}</p>}
    </div>
  );
}
