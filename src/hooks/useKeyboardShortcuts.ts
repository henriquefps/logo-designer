import { useEffect } from 'react';
import { useProjectStore, useActiveProject } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** Global editor shortcuts: nudge, delete, duplicate, undo/redo, select-all, escape. */
export function useKeyboardShortcuts() {
  const project = useActiveProject();
  const selectedIds = useUIStore((s) => s.selectedIds);
  const setSelection = useUIStore((s) => s.setSelection);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const nodeEditElementId = useUIStore((s) => s.nodeEditElementId);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target) || !project) return;
      const store = useProjectStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }

      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelection(project.elements.map((el) => el.id));
        return;
      }

      if (selectedIds.length === 0) {
        if (e.key === 'Escape') clearSelection();
        return;
      }

      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const newIds = store.duplicateElements(selectedIds);
        setSelection(newIds);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Node-edit mode owns Delete/Backspace while active (removes the selected node instead
        // of the whole element) — see CanvasStage's own keydown handler.
        if (nodeEditElementId) return;
        e.preventDefault();
        store.removeElements(selectedIds);
        clearSelection();
        return;
      }

      if (e.key === 'Escape') {
        clearSelection();
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();

      const selectedSet = new Set(selectedIds);
      const positions = project.elements
        .filter((el) => selectedSet.has(el.id) && !el.locked)
        .map((el) => ({ id: el.id, x: el.x + delta[0], y: el.y + delta[1] }));
      if (positions.length === 0) return;

      store.beginGesture();
      store.setElementPositions(positions);
      store.commit();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [project, selectedIds, setSelection, clearSelection, nodeEditElementId]);
}
