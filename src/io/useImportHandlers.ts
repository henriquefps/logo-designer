import { useEffect } from 'react';
import { isEditableTarget } from '@/app/useKeyboard';
import { getImporters, importerForFile } from '@/io/importers/registry';
import { isMac } from '@/actions/registry';
import { hasClipboard, parseClipboardText, pasteNodes } from '@/store/clipboard';
import { isFontFile } from '@/fonts/store';
import { useEditorStore } from '@/store/useEditorStore';
import type { Vec } from '@/model';
import { importFiles, isImageFile, isSvgFile } from './importActions';

/** Document point under a client position when it is over the canvas, else undefined. */
function dropPoint(e: { clientX: number; clientY: number; target: EventTarget | null }): Vec | undefined {
  const canvas = e.target instanceof Element ? e.target.closest('[data-slot="canvas"]') : null;
  if (!canvas) return undefined;
  const r = canvas.getBoundingClientRect();
  return useEditorStore.getState().screenToDoc({ x: e.clientX - r.left, y: e.clientY - r.top });
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

/**
 * System clipboard and drag-drop: SVG markup or files paste/drop into the document; other text
 * falls back to the in-app clipboard (edit.paste). Mod+V is let through to the browser (the global
 * keyboard handler would cancel it) so the `paste` event carries the clipboard without a prompt.
 */
export function useImportHandlers() {
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'v') return;
      if (isEditableTarget(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"],[role="menu"],[role="alertdialog"]')) return;
      e.stopImmediatePropagation(); // handled by onPaste below
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const data = e.clipboardData;
      if (!data) return;
      e.preventDefault();
      const files = [...data.files].filter((f) => isSvgFile(f) || isImageFile(f));
      if (files.length) {
        void importFiles(files);
        return;
      }
      const svgData = data.getData('image/svg+xml');
      const text = svgData || data.getData('text/plain');
      const nodes = text ? parseClipboardText(text) : null;
      if (nodes) {
        useEditorStore.getState().setSelection(pasteNodes(nodes));
        return;
      }
      void (async () => {
        if (text) {
          for (const imp of getImporters()) if (await imp.importText?.(text)) return;
        }
        // Not SVG: paste the in-app clipboard (what Edit → Paste does).
        if (hasClipboard()) useEditorStore.getState().setSelection(pasteNodes());
      })();
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      // Font files are uploaded by the fonts module (its own drop listener), not reported here.
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => !isFontFile(f));
      if (!files.length) return;
      const at = dropPoint(e);
      const routed = files.filter((f) => importerForFile(f));
      if (routed.length) void importFiles(routed, at);
      else if (files.length) void importFiles(files, at); // reports unsupported files
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
