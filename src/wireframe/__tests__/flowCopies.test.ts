import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createGroup, findNode, type ComponentNode, type DesignDocument, type ScreenNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { copyNodes, pasteNodes } from '@/store/clipboard';
import { addFlow, flowsFrom, flowsOf } from '../flows';
import { materializeDocument } from '../pipeline';
import { addScreen, frames } from '../screens';

const s = () => useDocStore.getState();
const comp = (id: string, kind: string, props: Record<string, unknown>): ComponentNode => ({ ...createGroup({ name: id }), id, component: { kind, props } });
const sid = (doc: DesignDocument, frame: string) => (findNode(doc, frame) as ScreenNode).screen.screenId;

function fixture(): { doc: DesignDocument; a: string; b: string } {
  const doc = createDocument({ name: 'App', wireframe: { screens: [] } });
  const a = addScreen(doc, { platform: 'phone', name: 'A', x: 0, y: 0 });
  const b = addScreen(doc, { platform: 'phone', name: 'B', x: 600, y: 0 });
  (doc.children.find((n) => n.id === a) as ScreenNode).children = [comp('row', 'list-row', { title: 'Go' }), comp('plain', 'list-row', { title: 'No flow' })];
  const ready = structuredClone(materializeDocument(doc));
  addFlow(ready, 'row', sid(ready, b), 'tap');
  return { doc: ready, a, b };
}

beforeEach(() => s().load(createDocument()));

describe('Duplicate keeps outgoing flows', () => {
  it('an element copy opens the same screens, with new flow ids', () => {
    const { doc, b } = fixture();
    s().load(doc);
    const [copy] = s().duplicate(['row']);
    expect(flowsOf(s().doc)).toHaveLength(2);
    const copied = flowsFrom(s().doc, copy);
    expect(copied).toEqual([expect.objectContaining({ to: sid(s().doc, b), label: 'tap' })]);
    expect(copied[0].id).not.toBe(flowsFrom(s().doc, 'row')[0].id);
    expect(flowsFrom(s().doc, 'row')).toHaveLength(1);
    s().undo(); // one undo step removes the copy and its flow
    expect(flowsOf(s().doc)).toHaveLength(1);
  });

  it('an element without flows copies none', () => {
    const { doc } = fixture();
    s().load(doc);
    s().duplicate(['plain']);
    expect(flowsOf(s().doc)).toHaveLength(1);
  });

  it('a duplicated frame becomes a new logical screen whose elements keep the flows', () => {
    const { doc, a, b } = fixture();
    s().load(doc);
    const [copy] = s().duplicate([a]);
    expect(s().doc.wireframe!.screens).toHaveLength(3);
    const copyFrame = frames(s().doc).find((f) => f.id === copy)!;
    expect(copyFrame.screen.screenId).not.toBe(sid(s().doc, a));
    const copiedRow = copyFrame.children[0].id;
    expect(flowsFrom(s().doc, copiedRow)).toEqual([expect.objectContaining({ to: sid(s().doc, b), label: 'tap' })]);
    expect(flowsOf(s().doc)).toHaveLength(2);
  });
});

describe('copy and paste', () => {
  it('pasting in the same document keeps the flows', () => {
    const { doc, b } = fixture();
    s().load(doc);
    copyNodes(['row']);
    const [pasted] = pasteNodes();
    expect(flowsFrom(s().doc, pasted)).toEqual([expect.objectContaining({ to: sid(s().doc, b) })]);
  });

  it('pasting into another document drops flows whose target does not exist there', () => {
    const { doc, a } = fixture();
    s().load(doc);
    copyNodes(['row']);
    const other = createDocument({ name: 'Other', wireframe: { screens: [] } });
    const home = addScreen(other, { platform: 'phone', name: 'Home', x: 0, y: 0 });
    s().load(materializeDocument(other));
    const [pasted] = pasteNodes();
    expect(pasted).toBeTruthy();
    expect(flowsOf(s().doc)).toHaveLength(0);
    expect(findNode(s().doc, home)).toBeTruthy();
    void a;
  });

  it('pasting a frame with its target into another document keeps the flows to screens that came along', () => {
    const { doc, a, b } = fixture();
    s().load(doc);
    copyNodes([a, b]);
    s().load(materializeDocument(createDocument({ name: 'Other', wireframe: { screens: [] } })));
    const pasted = pasteNodes();
    expect(pasted).toHaveLength(2);
    expect(flowsOf(s().doc)).toHaveLength(1);
    const target = frames(s().doc).find((f) => f.id === pasted[1])!;
    expect(flowsOf(s().doc)[0].to).toBe(target.screen.screenId);
  });
});
