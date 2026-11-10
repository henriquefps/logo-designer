import { useState } from 'react';
import { StackIcon } from '@phosphor-icons/react';
import { locate, type Id, type SceneNode } from '@/model';
import { setReference } from '@/actions/modules/object';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { LayerRow, type DropPosition } from './LayerRow';

interface DropTarget {
  id: Id;
  pos: DropPosition;
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
    if (e.shiftKey || e.metaKey || e.ctrlKey) ed().toggleSelection(id);
    else ed().setSelection([id]);
  };

  const commitDrop = () => {
    if (!dragging || !drop) return;
    const loc = locate(doc, drop.id);
    if (!loc) return;
    if (drop.pos === 'inside' && loc.node.type === 'group') {
      ds().moveNodes(dragging, loc.node.id, loc.node.children.length);
      setCollapsed((c) => {
        const n = new Set(c);
        n.delete(loc.node.id);
        return n;
      });
    } else {
      const parentId = loc.parent === doc ? null : (loc.parent as SceneNode).id;
      // The list is reversed: "above" in the list = later in children.
      ds().moveNodes(dragging, parentId, drop.pos === 'above' ? loc.index + 1 : loc.index);
    }
  };

  const rows: React.ReactNode[] = [];
  const renderLevel = (nodes: SceneNode[], depth: number, hiddenParent: boolean) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const expanded = n.type === 'group' && !collapsed.has(n.id);
      rows.push(
        <LayerRow
          key={n.id}
          node={n}
          depth={depth}
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
            if (!selection.includes(n.id)) ed().setSelection([n.id]);
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
    <div role="tree" aria-label="Layers" aria-multiselectable className="flex flex-col py-1" onMouseLeave={() => ed().setHover(null)}>
      {rows}
    </div>
  );
}
