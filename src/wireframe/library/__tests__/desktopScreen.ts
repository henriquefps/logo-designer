// A desktop screen composed from the web/desktop components: header on top; below it an hstack of sidebar +
// a vstack of breadcrumbs, toolbar, table and pagination. Used by web-desktop.test.ts and to make the PR screenshot.
import { createDocument, createGroup, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type LayoutItemInfo, type SceneNode, type ScreenNode } from '@/model';
import { materializeDocument } from '../../pipeline';
import { addScreen } from '../../screens';
import { getComponent } from '../registry';
import { defaultProps } from '../types';

const def = (kind: string) => getComponent(kind)!;

const inst = (id: string, kind: string, props: Record<string, unknown> = {}, item?: LayoutItemInfo): ComponentNode => ({
  ...createGroup({ name: id }),
  id,
  component: { kind, props: { ...defaultProps(def(kind)), ...props } },
  ...(item ? { layoutItem: item } : {}),
});
const stack = (id: string, layout: Partial<LayoutInfo> & Pick<LayoutInfo, 'kind'>, children: SceneNode[], item?: LayoutItemInfo): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 0, padding: 0, align: 'stretch', ...layout },
  children,
  ...(item ? { layoutItem: item } : {}),
});

export function desktopScreen(): DesignDocument {
  const doc = createDocument({ name: 'Files', wireframe: { screens: [] } });
  const id = addScreen(doc, { platform: 'desktop', name: 'Files', x: 0, y: 0, layout: { kind: 'vstack', gap: 0, padding: 0, align: 'stretch' } });
  const frame = doc.children.find((n) => n.id === id) as ScreenNode;
  frame.id = 'F';
  frame.children = [
    inst('header', 'web-header', { links: ['Files', 'Shared', 'Trash'], selected: 1, search: true, avatar: true }),
    stack('body', { kind: 'hstack', align: 'stretch' }, [
      inst('sidebar', 'sidebar-nav', { title: 'Drive', items: ['# Library', 'All files', 'Recent', 'Starred', '# Admin', 'Members', 'Settings'], selected: 1 }),
      stack('content', { kind: 'vstack', gap: 16, padding: 24, align: 'stretch' }, [
        inst('crumbs', 'breadcrumbs', { items: ['Drive', 'Projects', 'Designer'] }),
        inst('toolbar', 'toolbar', { title: 'All files' }),
        inst('table', 'data-table', { columns: ['Name', 'Owner', 'Size', 'Modified'], rows: 8, selectable: true, rowActions: true }),
        inst('pager', 'pagination', { pages: 12, current: 3, align: 'right' }),
      ], { width: 'fill', height: 'fill' }),
    ], { width: 'fill', height: 'fill' }),
  ];
  return materializeDocument(doc);
}
