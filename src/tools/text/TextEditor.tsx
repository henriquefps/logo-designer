import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findNode, multiply, worldMatrix, type TextNode } from '@/model';
import { cssFontStack, textLayout, useFontStore } from '@/fonts';
import { useView } from '@/canvas/overlays/useView';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { commitTextEdit, isEditingText, setEditingText } from './session';

/**
 * Tool overlay: while a text is being edited, a transparent textarea is portaled into the canvas
 * and transformed with the node's world matrix × the view, so it sits exactly on the (hidden) SVG
 * text: same font, size, line height, letter spacing and alignment.
 */
export function TextEditorOverlay() {
  const id = useEditorStore((s) => s.editingTextId);
  const node = useDocStore((s) => (id ? findNode(s.doc, id) : null));
  const canvas = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-slot="canvas"]') : null;

  // The node vanished (undo, project switch…): end the session.
  useEffect(() => {
    if (id && !node && isEditingText()) commitTextEdit();
  }, [id, node]);

  // Selecting something else ends the edit.
  useEffect(
    () =>
      useEditorStore.subscribe((s, prev) => {
        if (s.selection !== prev.selection && s.editingTextId && !s.selection.includes(s.editingTextId) && isEditingText()) commitTextEdit();
      }),
    [],
  );

  if (!id || !node || node.type !== 'text' || !canvas) return null;
  return createPortal(<EditorBox key={id} node={node} />, canvas);
}

const PAD_PX = 4;

function EditorBox({ node }: { node: TextNode }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // The click that opened the editor can still deliver a mousedown here (double-click word select).
  const [openedAt] = useState(() => performance.now());
  const { zoom, matrix: view } = useView();
  useFontStore((s) => s.version);
  const doc = useDocStore((s) => s.doc);
  const m = multiply(view, worldMatrix(doc, node.id));
  const layout = textLayout(node);
  const { resolved } = layout;
  const lh = node.fontSize * node.lineHeight;
  const pad = PAD_PX / zoom;
  const left = node.align === 'left' ? 0 : node.align === 'center' ? -layout.width / 2 : -layout.width;
  // Browsers add letter-spacing after the last character too: give it room so alignment matches.
  const width = layout.width + Math.max(0, node.letterSpacing) + pad * 2;
  const color = node.fill.kind === 'solid' ? node.fill.color.slice(0, 7) : node.fill.kind === 'none' ? 'var(--foreground)' : node.fill.stops[0]?.color.slice(0, 7);

  useLayoutEffect(() => {
    const focus = () => {
      const el = ref.current;
      if (!el || document.activeElement === el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    };
    focus();
    // The canvas pointerdown that started editing moves focus to <body> after its handlers run.
    const t = window.setTimeout(focus, 0);
    window.addEventListener('pointerup', focus, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerup', focus);
    };
  }, []);
  // Keep the content from scrolling inside the box while it grows.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  });

  return (
    <div
      className="absolute top-0 left-0"
      style={{ transform: `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`, transformOrigin: '0 0', width: 0, height: 0 }}
    >
      <textarea
        ref={ref}
        aria-label="Edit text"
        value={node.text}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        wrap="off"
        onChange={(e) => setEditingText(e.currentTarget.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          if (performance.now() - openedAt < 400) e.preventDefault();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            commitTextEdit();
          }
        }}
        className="absolute block resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{
          left: left - pad,
          top: 0,
          width,
          height: layout.lines.length * lh,
          paddingLeft: pad,
          paddingRight: pad,
          boxSizing: 'border-box',
          fontFamily: cssFontStack(resolved.face.family),
          fontWeight: resolved.weight,
          fontStyle: resolved.syntheticItalic ? 'italic' : resolved.face.style,
          fontSynthesis: resolved.syntheticItalic ? 'style' : 'none',
          fontVariantLigatures: 'none',
          fontKerning: 'normal',
          fontSize: node.fontSize,
          lineHeight: `${lh}px`,
          letterSpacing: node.letterSpacing,
          textAlign: node.align,
          whiteSpace: 'pre',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          color,
          caretColor: color,
          minWidth: pad * 2 + 1,
        }}
      />
    </div>
  );
}
