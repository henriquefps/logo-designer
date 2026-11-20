// The wireframe component library (docs/wireframe-mode.md → Library): components by category, the
// selected screen's platform first, a search box. Click inserts into the selected screen/stack; drag
// drops at a point on the canvas (into the stack under it, at that point, with the insertion line).
import { useEffect, useMemo, useState } from 'react';
import { CaretDownIcon, CaretRightIcon, MagnifyingGlassIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { localBounds, platformDef, type ScreenPlatform, type SceneNode, type WireframeSymbol } from '@/model';
import { Input } from '@/components/ui/input';
import { NodeRenderer } from '@/canvas/renderers/NodeRenderer';
import { Section } from '@/panels/shared/Section';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { insertComponent } from '@/wireframe/componentCommands';
import { insertContainer } from '@/wireframe/containerCommands';
import { CONTAINER_PRESETS, matchesPreset, type ContainerPreset } from '@/wireframe/containers';
import { showDropLine } from '@/wireframe/layoutDrag';
import { ensureIcons } from '@/wireframe/iconLoader';
import { getComponents } from '@/wireframe/library/registry';
import { defaultProps, type AnyComponentDef, type PropSpec } from '@/wireframe/library/types';
import { libraryFor, type LibraryGroup } from '@/wireframe/libraryIndex';
import { frameOf, frames } from '@/wireframe/screens';
import { WF } from '@/wireframe/style';
import { insertSymbol, startDeleteSymbol, startRenameSymbol } from '@/wireframe/symbolCommands';
import { newSymbolInstance, symbolsOf } from '@/wireframe/symbols';
import { cn } from '@/lib/utils';

export const COMPONENT_DRAG_MIME = 'application/x-designer-component';
/** A Layout preset (empty stack / grid / card container) being dragged from the library. */
export const CONTAINER_DRAG_MIME = 'application/x-designer-container';
/** A shared component (My components) being dragged from the library: its master id. */
export const SYMBOL_DRAG_MIME = 'application/x-designer-symbol';

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
    const isComponent = (e: DragEvent) => [COMPONENT_DRAG_MIME, CONTAINER_DRAG_MIME, SYMBOL_DRAG_MIME].some((m) => !!e.dataTransfer?.types.includes(m));
    const onOver = (e: DragEvent) => {
      const canvas = canvasOf(e);
      if (!isComponent(e) || !canvas) return void showDropLine(null);
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      const r = canvas.getBoundingClientRect();
      showDropLine(useEditorStore.getState().screenToDoc({ x: e.clientX - r.left, y: e.clientY - r.top }));
    };
    const onEnd = () => showDropLine(null);
    const onDrop = (e: DragEvent) => {
      showDropLine(null);
      const canvas = canvasOf(e);
      if (!canvas || !isComponent(e)) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const at = useEditorStore.getState().screenToDoc({ x: e.clientX - r.left, y: e.clientY - r.top });
      const preset = e.dataTransfer?.getData(CONTAINER_DRAG_MIME);
      if (preset) {
        if (!insertContainer(preset, at)) toast.error('Could not insert the container');
        return;
      }
      const symbol = e.dataTransfer?.getData(SYMBOL_DRAG_MIME);
      if (symbol) {
        if (!insertSymbol(symbol, at)) toast.error('Could not insert the component here');
        return;
      }
      const kind = e.dataTransfer?.getData(COMPONENT_DRAG_MIME);
      if (!kind) return;
      insert(kind, at);
    };
    document.addEventListener('dragover', onOver);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', onEnd);
    return () => {
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragend', onEnd);
      onEnd();
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

/** A small drawing of an empty container preset (stack bars, grid cells, a card). */
function ContainerPreview({ preset }: { preset: ContainerPreset }) {
  const bar = (x: number, y: number, w: number, h: number, key: string) => <rect key={key} x={x} y={y} width={w} height={h} rx={2} fill={WF.fill} />;
  let body: React.ReactNode;
  if (preset.id === 'hstack') body = [0, 1, 2].map((i) => bar(12 + i * 40, 18, 32, 24, `h${i}`));
  else if (preset.id === 'grid') body = [0, 1, 2, 3].map((i) => bar(12 + (i % 2) * 60, 8 + Math.floor(i / 2) * 24, 52, 18, `g${i}`));
  else if (preset.id === 'card')
    body = (
      <>
        <rect x={20} y={4} width={104} height={52} rx={6} fill="none" stroke={WF.line} />
        {bar(28, 12, 88, 18, 'img')}
        <rect x={28} y={35} width={50} height={6} rx={1.5} fill={WF.ink} />
        {bar(28, 45, 76, 5, 'txt')}
      </>
    );
  else body = [0, 1, 2].map((i) => bar(24, 8 + i * 16, 96, 12, `v${i}`));
  return (
    <svg aria-hidden viewBox="0 0 144 60" className="mx-auto block h-auto max-h-20 w-full" style={{ background: WF.paper }}>
      {preset.id !== 'card' && <rect x={6} y={3} width={132} height={54} rx={3} fill="none" stroke="#a8a8a8" strokeDasharray="4 3" />}
      {body}
    </svg>
  );
}

function ContainerItem({ preset }: { preset: ContainerPreset }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(CONTAINER_DRAG_MIME, preset.id);
      }}
      onClick={() => insertContainer(preset.id) || toast.error('Could not insert the container')}
      title={`Insert an empty ${preset.label.toLowerCase()} (or drag it onto a screen or into a stack), then add elements to it`}
      className="group/item flex flex-col gap-1.5 rounded-md border bg-card p-1.5 text-left outline-none hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="overflow-hidden rounded-sm border">
        <ContainerPreview preset={preset} />
      </div>
      <span className="px-0.5 text-sm">{preset.label}</span>
    </button>
  );
}

function Groups({ groups, iconsReady, containers = [] }: { groups: LibraryGroup[]; iconsReady: number; containers?: readonly ContainerPreset[] }) {
  // The Layout category (containers first, then layout components) always comes first.
  const layout = groups.find((g) => g.category === LAYOUT);
  const ordered = containers.length || layout ? [{ category: LAYOUT, items: layout?.items ?? [] }, ...groups.filter((g) => g !== layout)] : groups;
  return ordered.map((g) => (
    <div key={g.category} className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-muted-foreground">{g.category}</h4>
      <div className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
        {g.category === LAYOUT && containers.map((p) => <ContainerItem key={`container-${p.id}`} preset={p} />)}
        {g.items.map((d) => (
          <Item key={d.kind} def={d} iconsReady={iconsReady} />
        ))}
      </div>
    </div>
  ));
}

const LAYOUT = 'Layout';

/** A shared component drawn small, as an instance shows it. */
function SymbolPreview({ symbol, symbols }: { symbol: WireframeSymbol; symbols: readonly WireframeSymbol[] }) {
  const node = useMemo(() => newSymbolInstance(symbol, symbols, { x: 0, y: 0 }), [symbol, symbols]);
  const size = node.layout?.size;
  const b = size ? { x: 0, y: 0, ...size } : localBounds(node);
  if (!b || !b.width || !b.height) return <div className="h-12" />;
  const pad = 8;
  return (
    <svg
      aria-hidden
      viewBox={`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`}
      className="mx-auto block h-auto max-h-24 w-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ background: WF.paper }}
    >
      <NodeRenderer node={node} />
    </svg>
  );
}

function SymbolItem({ symbol, symbols }: { symbol: WireframeSymbol; symbols: readonly WireframeSymbol[] }) {
  return (
    <div className="group/item relative flex flex-col gap-1.5 rounded-md border bg-card p-1.5 hover:border-ring">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData(SYMBOL_DRAG_MIME, symbol.id);
        }}
        onClick={() => insertSymbol(symbol.id) || toast.error('Could not insert the component here')}
        title={`Insert “${symbol.name}” (or drag it onto a screen). Every copy stays in sync.`}
        className="flex flex-col gap-1.5 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="overflow-hidden rounded-sm border">
          <SymbolPreview symbol={symbol} symbols={symbols} />
        </div>
        <span className="truncate px-0.5 pr-14 text-sm">{symbol.name}</span>
      </button>
      <div className="absolute right-1.5 bottom-1 flex">
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Rename ${symbol.name}`} title="Rename" onClick={() => startRenameSymbol(symbol.id)}>
          <PencilSimpleIcon className="size-3.5" />
        </button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Delete ${symbol.name}`} title="Delete (copies become plain content)" onClick={() => startDeleteSymbol(symbol.id)}>
          <TrashIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** My components: this document's shared components, first in the library. */
function MyComponents({ query }: { query: string }) {
  const symbols = useDocStore((s) => symbolsOf(s.doc));
  const q = query.trim().toLowerCase();
  const shown = q ? symbols.filter((x) => x.name.toLowerCase().includes(q)) : symbols;
  if (q && !shown.length) return null;
  return (
    <Section title="My components" actions={<span className="text-xs text-muted-foreground">{shown.length}</span>}>
      {shown.length ? (
        <div className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
          {shown.map((x) => (
            <SymbolItem key={x.id} symbol={x} symbols={symbols} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Build a piece once (a card, a top bar), select it and choose Object → Make component (⌥⇧K) to reuse it on every screen.</p>
      )}
    </Section>
  );
}

export function LibraryPanel() {
  useCanvasDrop();
  const [query, setQuery] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [iconsReady, setIconsReady] = useState(0);
  const platform = useActivePlatform();
  const all = getComponents();
  const { main, others } = useMemo(() => libraryFor(all, platform, query), [all, platform, query]);
  const containers = useMemo(() => CONTAINER_PRESETS.filter((p) => matchesPreset(p, query)), [query]);
  const count = main.reduce((n, g) => n + g.items.length, 0) + containers.length;
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
      <MyComponents query={query} />
      <Section title={platform ? `Components · ${platformDef(platform).label}` : 'Components'} actions={<span className="text-xs text-muted-foreground">{count}</span>}>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search components…" aria-label="Search components" className="h-8 pl-8" />
        </div>
        {count ? <Groups groups={main} iconsReady={iconsReady} containers={containers} /> : <p className="text-sm text-muted-foreground">{query ? 'No components match your search.' : 'No components yet.'}</p>}
        <p className="text-xs text-muted-foreground">Click to add to the selected screen or stack, or drag onto a screen. Layout containers take what you drop into them.</p>
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
