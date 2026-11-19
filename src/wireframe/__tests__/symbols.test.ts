// Phase 2 shared components (docs/wireframe-mode.md → Shared components): make, insert, edit
// propagation, undo, detach, delete master, nesting in a repeat, export, file validation.
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createGroup, findNode, type ComponentNode, type DesignDocument, type GroupNode, type LayoutInfo, type SceneNode, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { defaultScreenLayout } from '../layout';
import { materializeDocument } from '../pipeline';
import { addScreen } from '../screens';
import { instancePrefix, instancesOf, makeSymbol, newSymbolInstance, symbolsOf } from '../symbols';
import { insertIntoLayout } from '../layoutEdit';

const s = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

const heading = (id: string, text: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'heading', props: { text, level: 'subheading' } } });
const image = (id: string): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind: 'image', props: {} } });
const container = (id: string, layout: Partial<LayoutInfo> & { kind: LayoutInfo['kind'] }, children: SceneNode[] = []): GroupNode => ({
  ...createGroup({ name: id }),
  id,
  layout: { gap: 0, padding: 0, align: 'stretch', ...layout } as LayoutInfo,
  children,
});
const card = (id: string) => container(id, { kind: 'vstack', gap: 8, padding: 16, style: 'outline', radius: 'small' }, [image(`${id}-img`), heading(`${id}-title`, 'Lisbon')]);

function twoScreens(a: SceneNode[], b: SceneNode[] = []): DesignDocument {
  const doc = createDocument({ name: 'W', wireframe: { screens: [] } });
  const ia = addScreen(doc, { platform: 'phone', name: 'Home', x: 0, y: 0, layout: defaultScreenLayout('phone') });
  const ib = addScreen(doc, { platform: 'phone', name: 'Trips', x: 500, y: 0, layout: defaultScreenLayout('phone') });
  const fa = doc.children.find((n) => n.id === ia) as ScreenNode;
  const fb = doc.children.find((n) => n.id === ib) as ScreenNode;
  fa.id = 'A';
  fb.id = 'B';
  fa.children = a;
  fb.children = b;
  return materializeDocument(doc);
}
const node = (doc: DesignDocument, id: string) => findNode(doc, id) as GroupNode;

beforeEach(() => {
  s().load(createDocument());
  ed().setSelection([]);
});

describe('shared components', () => {
  it('make, insert, edit propagates in one undo step', () => {
    s().load(twoScreens([card('c')]));
    let sym = '';
    s().apply((d) => void (sym = makeSymbol(d, 'c', 'Trip card')!));
    expect(sym).toBeTruthy();
    expect(node(s().doc, 'c').symbol).toEqual({ id: sym });
    expect(node(s().doc, 'c').children.map((c) => c.id)).toEqual([`${instancePrefix('c')}c-img`, `${instancePrefix('c')}c-title`]);
    const master = symbolsOf(s().doc)[0];
    expect(master.content.children.map((c) => c.id)).toEqual(['c-img', 'c-title']);
    const inst = newSymbolInstance(master, symbolsOf(s().doc), { x: 0, y: 0 });
    s().apply((d) => void insertIntoLayout(d, 'B', inst));
    expect(instancesOf(s().doc, sym)).toHaveLength(2);
    const t2 = `${instancePrefix(inst.id)}c-title`;
    expect((node(s().doc, t2) as ComponentNode).component.props.text).toBe('Lisbon');
    // edit in the second instance → master and first instance
    s().updateNodes([t2], (n) => void ((n as ComponentNode).component.props.text = 'Porto'));
    expect((node(s().doc, `${instancePrefix('c')}c-title`) as ComponentNode).component.props.text).toBe('Porto');
    expect((symbolsOf(s().doc)[0].content.children[1] as ComponentNode).component.props.text).toBe('Porto');
    s().undo();
    expect((node(s().doc, `${instancePrefix('c')}c-title`) as ComponentNode).component.props.text).toBe('Lisbon');
    expect((node(s().doc, t2) as ComponentNode).component.props.text).toBe('Lisbon');
  });
});
