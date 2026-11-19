import { beforeEach, describe, expect, it } from 'vitest';
import { bakeScale, createDocument, createGroup, createRect, findNode, type ComponentNode, type DesignDocument, type GroupNode, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { runWireframePipeline } from '../pipeline';
import { addScreen } from '../screens';
import type { WireframeStep } from '../types';

const s = () => useDocStore.getState();
const node = <T,>(id: string) => findNode(s().doc, id) as T;

/** A wireframe with one phone screen at the origin; returns the frame id. */
function loadWireframe(): string {
  const doc: DesignDocument = createDocument({ name: 'W', wireframe: { screens: [] } });
  const id = addScreen(doc, { layout: null, platform: 'phone', name: 'Home', x: 0, y: 0 });
  s().load(doc);
  return id;
}

const placeholder = (label: string, height: number, y = 0) =>
  ({ ...createGroup({ name: 'Box', transform: { x: 24, y } }), component: { kind: 'placeholder', props: { label, height } } }) as ComponentNode;

beforeEach(() => s().load(createDocument()));

describe('wireframe pipeline in the doc store', () => {
  it('builds a component and grows the screen inside the same undo step', () => {
    const screen = loadWireframe();
    expect(s().past).toHaveLength(0);
    const box = placeholder('Hero', 1000, 100);
    s().addNodes([box], { parentId: screen });
    expect(s().past).toHaveLength(1);
    const built = node<ComponentNode>(box.id);
    expect(built.children.map((c) => c.name)).toEqual(['Box', 'Cross', 'Label']);
    expect(built.children.map((c) => c.id)).toEqual([`${box.id}~0`, `${box.id}~1`, `${box.id}~2`]);
    expect(built.component.size).toEqual({ width: 342, height: 1000 });
    expect(node<ScreenNode>(screen).screen.height).toBe(1100);
    s().undo();
    expect(findNode(s().doc, box.id)).toBeNull();
    expect(node<ScreenNode>(screen).screen.height).toBe(844);
    s().redo();
    expect(node<ComponentNode>(box.id).children).toHaveLength(3);
    expect(node<ScreenNode>(screen).screen.height).toBe(1100);
  });

  it('changing a prop rebuilds the children (one undo step restores the old ones)', () => {
    const screen = loadWireframe();
    const box = placeholder('Before', 120);
    s().addNodes([box], { parentId: screen });
    const label = () => (node<ComponentNode>(box.id).children.find((c) => c.name === 'Label') as { text: string } | undefined)?.text;
    expect(label()).toBe('Before');
    const steps = s().past.length;
    s().updateNodes([box.id], (n) => {
      if (n.type === 'group' && n.component) n.component.props.label = 'After';
    });
    expect(label()).toBe('After');
    expect(s().past.length).toBe(steps + 1);
    s().undo();
    expect(label()).toBe('Before');
  });

  it('runs on every frame of a transaction and records one undo step', () => {
    const screen = loadWireframe();
    const r = createRect({ width: 100, height: 100, transform: { x: 100, y: 100 } });
    s().addNodes([r], { parentId: screen });
    const steps = s().past.length;
    s().beginTransaction('Move');
    for (let y = 200; y <= 1200; y += 100) {
      s().updateNode(r.id, { transform: { y } });
      expect(node<ScreenNode>(screen).screen.height).toBe(Math.max(844, y + 50));
    }
    s().commitTransaction();
    expect(s().past.length).toBe(steps + 1);
    expect(node<ScreenNode>(screen).screen.height).toBe(1250);
    s().undo();
    expect(node<ScreenNode>(screen).screen.height).toBe(844);
  });

  it('a resized component absorbs the scale into its size and is rebuilt at the new width', () => {
    const screen = loadWireframe();
    const box = placeholder('Wide', 100);
    s().addNodes([box], { parentId: screen });
    s().updateNodes([box.id], (n) => void (n.transform.scaleX = 0.5));
    // The transform keeps a scale here (only applyWorldMatrix bakes); bake it like a resize gesture.
    s().replaceNodes([bakeScale(structuredClone(node<ComponentNode>(box.id)))]);
    const n = node<ComponentNode>(box.id);
    expect(n.transform.scaleX).toBe(1);
    expect(n.component.size!.width).toBe(171);
    expect((n.children[0] as { width: number }).width).toBe(171);
  });

  it('settling a move drops objects onto a screen (and takes them off again)', () => {
    const screen = loadWireframe();
    const r = createRect({ width: 40, height: 40, transform: { x: 1000, y: 1000 } });
    s().addNodes([r]);
    expect(s().doc.children.map((c) => c.id)).toContain(r.id);
    s().beginTransaction('Move');
    s().updateNode(r.id, { transform: { x: 100, y: 200 } });
    // Mid-gesture nothing is reparented (the gesture keeps computing from its snapshot).
    expect(s().doc.children.map((c) => c.id)).toContain(r.id);
    s().commitTransaction();
    const frame = node<GroupNode>(screen);
    expect(frame.children.map((c) => c.id)).toEqual([r.id]);
    // The world position is kept (the frame is at the origin here, so local = world).
    expect(node<GroupNode>(r.id).transform).toMatchObject({ x: 100, y: 200 });
    s().updateNode(r.id, { transform: { x: 2000 } });
    expect(s().doc.children.map((c) => c.id)).toContain(r.id);
    expect(node<GroupNode>(screen).children).toHaveLength(0);
    s().undo();
    expect(node<GroupNode>(screen).children.map((c) => c.id)).toEqual([r.id]);
  });

  it('never touches logo documents', () => {
    const doc = createDocument();
    expect(runWireframePipeline(doc, null, 'load')).toBeNull();
    const g = { ...createGroup(), component: { kind: 'placeholder', props: {} } } as ComponentNode;
    s().addNodes([g]);
    expect(node<ComponentNode>(g.id).children).toHaveLength(0);
    expect(s().past.at(-1)!.patches).toHaveLength(1);
  });

  it('steps see what changed: unchanged instances are not rebuilt', () => {
    const doc: DesignDocument = createDocument({ wireframe: { screens: [] } });
    const id = addScreen(doc, { layout: null, platform: 'phone' });
    const seen: string[] = [];
    const spy: WireframeStep = {
      id: 'spy',
      order: 1,
      run: (_d, ctx) => {
        for (const n of ctx.input.children) if (ctx.differs(n, ctx.previous(n.id))) seen.push(`${ctx.phase}:${n.id}`);
      },
    };
    const base = runWireframePipeline(doc, null, 'load', { steps: [spy] })?.doc ?? doc;
    expect(seen).toEqual([`load:${id}`]);
    seen.length = 0;
    runWireframePipeline(base, base, 'change', { steps: [spy] });
    expect(seen).toEqual([]);
  });
});
