import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StackIcon } from '@phosphor-icons/react';
import { locate, type Id, type SceneNode } from '@/model';
import { setReference } from '@/actions/modules/object';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { notifySharedChange } from '@/wireframe/symbolCommands';
import { LayerRow, type DropPosition } from './LayerRow';

interface DropTarget {
  id: Id;
  pos: DropPosition;
}

/** The row to show when the panel opens: the last selected node (or the instance it is inside, whose inside is not listed). */
function initialReveal(): Id | null {
  const sel = useEditorStore.getState().selection;
  const id = sel[sel.length - 1];
  const loc = id ? locate(useDocStore.getState().doc, id) : null;
  if (!loc) return null;
  return loc.ancestors.find((a) => !!a.component)?.id ?? id;
}

/** Layer tree: top of the list = top of the stack. Drag rows to reorder or drop onto a group. */
export function LayersPanel() {
  const doc = useDocStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const [collapsed, setCollapsed] = useState<Set<Id>>(new Set());
  const [dragging, setDragging] = useState<Id[] | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const ds = useDocStore.getState;
  const ed = useEditorStore.getState;
  const rootRef = useRef<HTMLDivElement>(null);
  // Set while the panel itself changes the selection: then it does not scroll.
  const fromPanel = useRef(false);
  // The row to bring into view once it is rendered (a selection made on the canvas).
  // The tab is mounted only while it is open: a selection made while it was closed is shown when it opens (centred:
  // the list starts from the top).
  const [opened] = useState(initialReveal);
  const reveal = useRef<Id | null>(null);
  const [revealTick, setRevealTick] = useState(0);
  const centre = useRef(false);

  // Follows the canvas: a selection made there (click, marquee, keyboard) opens the selected node's ancestors
  // and scrolls its row into view (nearest: no jump when it is already visible).
  const follow = (id: Id) => {
    const loc = locate(useDocStore.getState().doc, id);
    if (!loc) return;
    // A component instance's inside is not listed: its row is the one to show.
    const at = loc.ancestors.findIndex((a) => !!a.component);
    const ancestors = (at >= 0 ? loc.ancestors.slice(0, at) : loc.ancestors).map((a) => a.id);
    setCollapsed((c) => (ancestors.some((a) => c.has(a)) ? new Set([...c].filter((x) => !ancestors.includes(x))) : c));
    reveal.current = at >= 0 ? loc.ancestors[at].id : id;
    setRevealTick((t) => t + 1);
  };
  useEffect(
    () =>
      useEditorStore.subscribe((st, prev) => {
        if (st.selection === prev.selection) return;
        if (fromPanel.current) {
          fromPanel.current = false;
          return;
        }
        const id = st.selection[st.selection.length - 1];
        if (id) follow(id);
      }),
    [],
  );
  useLayoutEffect(() => {
    if (opened) {
      reveal.current = opened;
      centre.current = true;
    }
  }, [opened]);
  useLayoutEffect(() => {
    const id = reveal.current;
    if (!id) return;
    const row = rootRef.current?.querySelector(`[data-layer-id="${CSS.escape(id)}"]`);
    if (row) {
      row.scrollIntoView({ block: centre.current ? 'center' : 'nearest' });
      centre.current = false;
      reveal.current = null;
    }
  }, [revealTick, collapsed, doc]);

  if (!doc.children.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <StackIcon className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No layers yet. Draw a shape with the rectangle (M) or ellipse (L) tool.</p>
      </div>
    );
  }

  const select = (id: Id, e: React.MouseEvent) => {
    const node = locate(doc, id)?.node;
    if (!node) return;
    fromPanel.current = true;
    if (e.shiftKey || e.metaKey || e.ctrlKey) ed().toggleSelection(id);
    else ed().setSelection([id]);
  };

  const commitDrop = () => {
    if (!dragging || !drop) return;
    const loc = locate(doc, drop.id);
    if (!loc) return;
    if (drop.pos === 'inside' && loc.node.type === 'group' && !loc.node.component) {
      ds().moveNodes(dragging, loc.node.id, loc.node.children.length);
      setCollapsed((c) => {
        const n = new Set(c);
        n.delete(loc.node.id);
        return n;
      });
      // Into the shared part of a shared component: every instance gets it (said in a toast).
      notifySharedChange(loc.node.id);
    } else {
      const parentId = loc.parent === doc ? null : (loc.parent as SceneNode).id;
      // The list is reversed: "above" in the list = later in children.
      ds().moveNodes(dragging, parentId, drop.pos === 'above' ? loc.index + 1 : loc.index);
      notifySharedChange(parentId);
    }
  };

  const rows: React.ReactNode[] = [];
  const renderLevel = (nodes: SceneNode[], depth: number, hiddenParent: boolean) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      // A component instance's children are generated: not listed (select and edit the instance).
      const instance = n.type === 'group' && !!n.component;
      // A repeat copy (wireframes) is generated too: one read-only row; clicking it selects the template.
      const copy = n.repeatCopy;
      if (copy) {
        rows.push(
          <LayerRow
            key={n.id}
            node={n}
            depth={depth}
            copyLabel={`Copy ${copy.index}`}
            selected={selection.includes(copy.template)}
            expanded={false}
            dimmed
            drop={null}
            onSelect={(e) => select(copy.template, e)}
            onToggleExpand={() => {}}
            onRename={() => {}}
            onToggleVisible={() => {}}
            onToggleLock={() => {}}
            onStopReference={() => {}}
            onHover={(on) => ed().setHover(on ? copy.template : null)}
            onDragStart={(e) => e.preventDefault()}
            onDragOver={() => {}}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={() => {}}
          />,
        );
        continue;
      }
      const expanded = n.type === 'group' && !instance && !collapsed.has(n.id);
      rows.push(
        <LayerRow
          key={n.id}
          node={n}
          depth={depth}
          instance={instance}
          selected={selection.includes(n.id)}
          expanded={expanded}
          dimmed={hiddenParent || !n.visible}
          drop={drop?.id === n.id ? drop.pos : null}
          onSelect={(e) => select(n.id, e)}
          onToggleExpand={() =>
            setCollapsed((c) => {
              const next = new Set(c);
              if (next.has(n.id)) next.delete(n.id);
              else next.add(n.id);
              return next;
            })
          }
          onRename={(name) => ds().updateNode(n.id, { name }, { label: 'Rename layer' })}
          onToggleVisible={() => ds().updateNode(n.id, { visible: !n.visible }, { label: n.visible ? 'Hide' : 'Show' })}
          onToggleLock={() => {
            ds().updateNode(n.id, { locked: !n.locked }, { label: n.locked ? 'Unlock' : 'Lock' });
            if (!n.locked) ed().setSelection(ed().selection.filter((x) => x !== n.id));
          }}
          onStopReference={() => setReference(false, [n.id])}
          onHover={(on) => ed().setHover(on ? n.id : null)}
          onDragStart={(e) => {
            const ids = selection.includes(n.id) ? selection : [n.id];
            if (!selection.includes(n.id)) {
              fromPanel.current = true;
              ed().setSelection([n.id]);
            }
            setDragging(ids);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ids.join(','));
          }}
          onDragOver={(e, pos) => {
            if (!dragging || dragging.includes(n.id)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (drop?.id !== n.id || drop.pos !== pos) setDrop({ id: n.id, pos });
          }}
          onDrop={(e) => {
            e.preventDefault();
            commitDrop();
            setDrop(null);
            setDragging(null);
          }}
          onDragEnd={() => {
            setDrop(null);
            setDragging(null);
          }}
        />,
      );
      if (n.type === 'group' && expanded) renderLevel(n.children, depth + 1, hiddenParent || !n.visible);
    }
  };
  renderLevel(doc.children, 0, false);

  return (
    <div ref={rootRef} role="tree" aria-label="Layers" aria-multiselectable className="flex flex-col py-1" onMouseLeave={() => ed().setHover(null)}>
      {rows}
    </div>
  );
}
