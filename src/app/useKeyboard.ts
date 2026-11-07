import { useEffect } from 'react';
import { actionForEvent } from '@/actions/registry';
import { getTool, toolForShortcut } from '@/tools/registry';
import { switchTool, toolContext } from '@/tools/context';
import { useEditorStore } from '@/store/useEditorStore';

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/** Global keyboard: active tool first, then actions (menus), then single-key tool shortcuts, Space = pan. */
export function useKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target);
      const ed = useEditorStore.getState();
      if (!editable && e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          ed.setSpacePan(true);
        }
        return;
      }
      // Ignore keys while a modal/menu has focus (Radix handles its own keys).
      const inOverlay = e.target instanceof HTMLElement && !!e.target.closest('[role="dialog"],[role="menu"],[role="listbox"],[role="alertdialog"]');
      if (!editable && !inOverlay) {
        const tool = getTool(ed.tool);
        if (tool?.onKeyDown?.(e, toolContext)) {
          e.preventDefault();
          return;
        }
      }
      const action = actionForEvent(e);
      if (action && (!editable || action.allowInInput) && !inOverlay) {
        e.preventDefault();
        if (action.enabled?.() ?? true) action.run();
        return;
      }
      if (editable || inOverlay || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = toolForShortcut(e.key);
      if (t) {
        e.preventDefault();
        switchTool(t.id);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useEditorStore.getState().setSpacePan(false);
      const ed = useEditorStore.getState();
      getTool(ed.tool)?.onKeyUp?.(e, toolContext);
    };
    const onBlur = () => useEditorStore.getState().setSpacePan(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
