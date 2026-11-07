import { useMemo } from 'react';
import { findNode, topmostIds, type SceneNode } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { getPropertySections } from './registry';
import type { SelectionContext } from './types';

export function PropertiesPanel() {
  const doc = useDocStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const ctx = useMemo<SelectionContext>(() => {
    const ids = topmostIds(doc, selection);
    return { doc, ids, nodes: ids.map((id) => findNode(doc, id)).filter((n): n is SceneNode => !!n) };
  }, [doc, selection]);
  return (
    <div className="flex flex-col">
      {getPropertySections()
        .filter((s) => s.when(ctx))
        .map(({ id, Component }) => (
          <Component key={id} ctx={ctx} />
        ))}
    </div>
  );
}
