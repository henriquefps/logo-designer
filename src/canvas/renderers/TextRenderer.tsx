import type { TextNode } from '@/model';
import { cssFontStack, initFonts, SYNTHETIC_ITALIC_DEG, textLayout, useFontStore } from '@/fonts';
import { useEditorStore } from '@/store/useEditorStore';
import { paintedProps } from './paint';

initFonts();

/**
 * Live text. Every line is positioned explicitly from the fonts module's layout (same math as
 * the measurer and the outliner), so the selection box and "Create outlines" match what you see.
 * Ligatures and font synthesis are off; italic without an italic face is skewed here, like the outlines.
 */
export function TextRenderer({ node }: { node: TextNode }) {
  // Re-render when fonts load (metrics change) and hide while the text is being edited in place.
  useFontStore((s) => s.version);
  const editing = useEditorStore((s) => s.editingTextId === node.id);
  const { defs, props } = paintedProps(node);
  const layout = textLayout(node);
  const { resolved } = layout;
  const skew = resolved.syntheticItalic;
  const shift = skew ? Math.tan((SYNTHETIC_ITALIC_DEG * Math.PI) / 180) : 0;
  const text = (
    <text
      fontFamily={cssFontStack(resolved.face.family)}
      fontWeight={resolved.weight}
      fontStyle={resolved.face.style}
      fontSize={node.fontSize}
      letterSpacing={node.letterSpacing || undefined}
      style={{ whiteSpace: 'pre', fontVariantLigatures: 'none', fontSynthesis: 'none', fontKerning: 'normal' }}
      visibility={editing ? 'hidden' : undefined}
      {...props}
    >
      {layout.lines.map((line, i) =>
        line.text ? (
          // With skewX(-a) around y=0, shifting x by tan(a)·baseline keeps each line's baseline in place.
          <tspan key={i} x={line.x + shift * line.baseline} y={line.baseline}>
            {line.text}
          </tspan>
        ) : null,
      )}
    </text>
  );
  return (
    <>
      {defs}
      {skew ? <g transform={`skewX(${-SYNTHETIC_ITALIC_DEG})`}>{text}</g> : text}
    </>
  );
}
