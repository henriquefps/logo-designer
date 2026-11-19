// Containers as library elements (docs/wireframe-mode.md → Phase 1.5, R2 and R3): the Layout
// presets of the library panel (empty stacks, grid, card container), the empty-container rules and
// the lo-fi appearance of a styled container. Pure (no stores, no React): the canvas renderer, the
// SVG export, the layout and the library panel all read it.
import { createGroup, newId, type ContainerRadius, type ContainerStyle, type GroupNode, type LayoutInfo, type LayoutKind, type SceneNode } from '@/model';
import { WF_CONTAINER } from './style';

/** Minimum box of an empty container (no flow children): big enough to see and to drop onto. */
export const EMPTY_CONTAINER = { width: 160, height: 64 } as const;

/** Text of the empty-container placeholder (canvas only). */
export const EMPTY_LABEL = 'Drop elements here';

export interface ContainerPreset {
  id: 'vstack' | 'hstack' | 'grid' | 'card';
  label: string;
  /** Extra search words for the library panel. */
  keywords: string[];
  /** Layer name of a new one. */
  name: string;
  layout: LayoutInfo;
}

/** The Layout category of the library panel, in order (decided in R2/R3). */
export const CONTAINER_PRESETS: readonly ContainerPreset[] = [
  { id: 'vstack', label: 'Vertical stack', name: 'Vertical stack', keywords: ['vstack', 'column', 'stack', 'container', 'layout', 'list'], layout: { kind: 'vstack', gap: 12, padding: 0, align: 'stretch' } },
  { id: 'hstack', label: 'Horizontal stack', name: 'Horizontal stack', keywords: ['hstack', 'row', 'stack', 'container', 'layout', 'carousel'], layout: { kind: 'hstack', gap: 8, padding: 0, align: 'center' } },
  { id: 'grid', label: 'Grid', name: 'Grid', keywords: ['grid', 'columns', 'container', 'layout', 'gallery'], layout: { kind: 'grid', gap: 12, padding: 0, align: 'stretch', columns: 2 } },
  {
    id: 'card',
    label: 'Card container',
    name: 'Card container',
    keywords: ['card', 'container', 'custom', 'box', 'panel', 'surface'],
    layout: { kind: 'vstack', gap: 8, padding: 16, align: 'stretch', style: 'outline', radius: 'small' },
  },
];

export const containerPreset = (id: string) => CONTAINER_PRESETS.find((p) => p.id === id);

/** Case-insensitive search over a preset's label and keywords (every word must match). */
export function matchesPreset(p: ContainerPreset, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = [p.label, p.id, 'layout', ...p.keywords].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** A new, empty container of a preset (the layout step sizes it). `width`: its box width when it is not placed by a stack. */
export function newContainer(preset: ContainerPreset, at: { x: number; y: number }, width?: number): GroupNode {
  const layout: LayoutInfo = structuredClone(preset.layout);
  if (width !== undefined) layout.size = { width, height: EMPTY_CONTAINER.height };
  return { ...createGroup({ name: preset.name, transform: { x: at.x, y: at.y } }), id: newId(), layout, children: [] };
}

/** A stack / grid (not a screen frame, not a component instance). */
export const isStackNode = (n: SceneNode): n is GroupNode & { layout: LayoutInfo } => n.type === 'group' && !!n.layout && !n.screen && !n.component;

/** True when a container has nothing in its flow (visible, not free): it shows the placeholder and takes the minimum size. */
export function isEmptyContainer(n: GroupNode): boolean {
  return !n.children.some((c) => c.visible && c.layoutItem?.position !== 'free');
}

/** Effective style (missing = none). */
export const containerStyle = (l: LayoutInfo): ContainerStyle => l.style ?? 'none';
export const containerRadius = (l: LayoutInfo): ContainerRadius => l.radius ?? 'none';

/**
 * The background of a styled container in its local space (origin top-left, its `layout.size`),
 * or null for `none` / not laid out yet. Drawn by the canvas and the SVG export, like a screen's paper.
 */
export function containerBackground(n: GroupNode): { width: number; height: number; radius: number; fill: string | null; stroke: string | null } | null {
  if (!n.layout || n.screen || n.component || !n.layout.size) return null;
  const style = containerStyle(n.layout);
  if (style === 'none') return null;
  const { width, height } = n.layout.size;
  if (width <= 0 || height <= 0) return null;
  const radius = Math.min(WF_CONTAINER.radius[containerRadius(n.layout)], width / 2, height / 2);
  return {
    width,
    height,
    radius,
    fill: style === 'filled' || style === 'outline-filled' ? WF_CONTAINER.fill : null,
    stroke: style === 'outline' || style === 'outline-filled' ? WF_CONTAINER.stroke : null,
  };
}

export const STYLE_LABELS: Record<ContainerStyle, string> = { none: 'None', outline: 'Outline', filled: 'Filled', 'outline-filled': 'Outline + filled' };
export const RADIUS_LABELS: Record<ContainerRadius, string> = { none: 'Square', small: 'Small', large: 'Large' };

/** Words for the export: `outlined`, `filled`, `outlined, filled` (empty for none). */
export function styleWords(l: LayoutInfo): string {
  const s = containerStyle(l);
  return s === 'outline' ? 'outlined' : s === 'filled' ? 'filled' : s === 'outline-filled' ? 'outlined, filled' : '';
}

export const LAYOUT_KIND_LABEL: Record<LayoutKind, string> = { vstack: 'Vertical stack', hstack: 'Horizontal stack', grid: 'Grid' };
