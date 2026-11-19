// The wireframe component library (docs/wireframe-mode.md → Library): components by category, the
// selected screen's platform first, a search box. Click inserts into the selected screen/stack; drag
// drops at a point on the canvas.
import { useEffect, useMemo, useState } from 'react';
import { CaretDownIcon, CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { platformDef, type ScreenPlatform, type SceneNode } from '@/model';
import { Input } from '@/components/ui/input';
import { NodeRenderer } from '@/canvas/renderers/NodeRenderer';
import { Section } from '@/panels/shared/Section';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { insertComponent } from '@/wireframe/componentCommands';
import { ensureIcons } from '@/wireframe/iconLoader';
import { getComponents } from '@/wireframe/library/registry';
import { defaultProps, type AnyComponentDef, type PropSpec } from '@/wireframe/library/types';
import { libraryFor, type LibraryGroup } from '@/wireframe/libraryIndex';
import { frameOf, frames } from '@/wireframe/screens';
import { WF } from '@/wireframe/style';
import { cn } from '@/lib/utils';

export const COMPONENT_DRAG_MIME = 'application/x-designer-component';

const PREVIEW_WIDTH = 390;

const withIds = (nodes: SceneNode[], prefix: string): SceneNode[] =>
  nodes.map((n, i) => {
    const id = `${prefix}-${i}`;
    return n.type === 'group' ? { ...n, id, children: withIds(n.children, id) } : { ...n, id };
  });

const defaultIcons = (def: AnyComponentDef) =>
  Object.values(def.props as Record<string, PropSpec>)
    .filter((s) => s.type === 'icon')
    .map((s) => String(s.default));

/** The default instance drawn small, on white (like a screen). */
function Preview({ def, iconsReady }: { def: AnyComponentDef; iconsReady: number }) {
  const built = useMemo(() => {
    let width = Math.min(def.defaultSize.width, PREVIEW_WIDTH);
    try {
      const props = defaultProps(def);
      let r = def.build(props, { width });
      // Hug-width components (a button): draw them at the width their content needs.
      if (def.sizing.width === 'hug' && r.width && r.width !== width) {
        width = Math.min(r.width, PREVIEW_WIDTH);
        r = def.build(props, { width });
      }
      return { width, height: r.height, children: withIds(r.children, `lib-${def.kind}`) };
    } catch {
      return null;
    }
    // iconsReady: rebuild once the default icons are loaded.
  }, [def, iconsReady]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!built) return <div className="h-12" />;
  const pad = 8;
  return (
    <svg
      aria-hidden
      viewBox={`${-pad} ${-pad} ${built.width + pad * 2} ${built.height + pad * 2}`}
      className="mx-auto block h-auto max-h-20 w-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ background: WF.paper }}
    >
      {built.children.map((c) => (
        <NodeRenderer key={c.id} node={c} />
      ))}
    </svg>
  );
}

function insert(kind: string, at?: { x: number; y: number }) {
  insertComponent(kind, at).then(
    (id) => id || toast.error('Could not insert the component'),
    () => toast.error('Could not insert the component'),
  );
}

/** Dropping a library item on the canvas inserts it at the drop point. */
function useCanvasDrop() {
  useEffect(() => {
    const canvasOf = (e: DragEvent) => ((e.target as Element | null)?.closest?.('[data-slot="canvas"]') as HTMLElement | null) ?? null;
    const isComponent = (e: DragEvent) => !!e.dataTransfer?.types.includes(COMPONENT_DRAG_MIME);
    const onOver = (e: DragEvent) => {
      if (!isComponent(e) || !canvasOf(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      const canvas = canvasOf(e);
      if (!canvas || !isComponent(e)) return;
      e.preventDefault();
      const kind = e.dataTransfer?.getData(COMPONENT_DRAG_MIME);
      if (!kind) return;
      const r = canvas.getBoundingClientRect();
      insert(kind, useEditorStore.getState().screenToDoc({ x: e.clientX - r.left, y: e.clientY - r.top }));
    };
    document.addEventListener('dragover', onOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);
}

/** Platform of the selected screen; else the only platform the document uses; else null (all). */
function useActivePlatform(): ScreenPlatform | null {
  const selection = useEditorStore((s) => s.selection);
  return useDocStore((s) => {
    for (const id of selection) {
      const f = frameOf(s.doc, id);
      if (f) return f.screen.platform;
    }
    const used = new Set(frames(s.doc).map((f) => f.screen.platform));
    return used.size === 1 ? [...used][0] : null;
  });
}

function Item({ def, iconsReady }: { def: AnyComponentDef; iconsReady: number }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(COMPONENT_DRAG_MIME, def.kind);
      }}
      onClick={() => insert(def.kind)}
      title={`Insert ${def.label.toLowerCase()} (or drag it onto a screen)`}
      className={cn(
        'group/item flex flex-col gap-1.5 rounded-md border bg-card p-1.5 text-left outline-none hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        // Wide components (rows, bars) get the whole line; small ones share it.
        def.sizing.width === 'fill' && 'min-[340px]:col-span-2',
      )}
    >
      <div className="overflow-hidden rounded-sm border">
        <Preview def={def} iconsReady={iconsReady} />
      </div>
      <span className="px-0.5 text-sm">{def.label}</span>
    </button>
  );
}

function Groups({ groups, iconsReady }: { groups: LibraryGroup[]; iconsReady: number }) {
  return groups.map((g) => (
    <div key={g.category} className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-muted-foreground">{g.category}</h4>
      <div className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
        {g.items.map((d) => (
          <Item key={d.kind} def={d} iconsReady={iconsReady} />
        ))}
      </div>
    </div>
  ));
}

export function LibraryPanel() {
  useCanvasDrop();
  const [query, setQuery] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [iconsReady, setIconsReady] = useState(0);
  const platform = useActivePlatform();
  const all = getComponents();
  const { main, others } = useMemo(() => libraryFor(all, platform, query), [all, platform, query]);
  const count = main.reduce((n, g) => n + g.items.length, 0);
  const otherCount = others.reduce((n, g) => n + g.items.length, 0);

  useEffect(() => {
    let live = true;
    void ensureIcons(all.flatMap(defaultIcons)).then(() => live && setIconsReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, [all]);

  return (
    <div className="flex flex-col">
      <Section title={platform ? `Components · ${platformDef(platform).label}` : 'Components'} actions={<span className="text-xs text-muted-foreground">{count}</span>}>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search components…" aria-label="Search components" className="h-8 pl-8" />
        </div>
        {count ? <Groups groups={main} iconsReady={iconsReady} /> : <p className="text-sm text-muted-foreground">{query ? 'No components match your search.' : 'No components yet.'}</p>}
        <p className="text-xs text-muted-foreground">Click to add to the selected screen, or drag onto a screen.</p>
      </Section>
      {otherCount > 0 && (
        <Section
          title="Other platforms"
          actions={
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers}>
              {otherCount} {showOthers ? <CaretDownIcon /> : <CaretRightIcon />}
            </button>
          }
        >
          {showOthers ? <Groups groups={others} iconsReady={iconsReady} /> : <p className="text-xs text-muted-foreground">Components made for other platforms. Show them to use one here anyway.</p>}
        </Section>
      )}
    </div>
  );
}
