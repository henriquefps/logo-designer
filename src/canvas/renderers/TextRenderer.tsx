import type { TextNode } from '@/model';
import { paintedProps } from './paint';

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

/** Basic live text. The text worker refines metrics (see setTextMeasurer in model/bounds). */
export function TextRenderer({ node }: { node: TextNode }) {
  const { defs, props } = paintedProps(node);
  const lines = node.text.split('\n');
  const lh = node.fontSize * node.lineHeight;
  const firstBaseline = (lh - node.fontSize) / 2 + node.fontSize * 0.8;
  return (
    <>
      {defs}
      <text
        fontFamily={node.fontFamily}
        fontWeight={node.fontWeight}
        fontStyle={node.fontStyle}
        fontSize={node.fontSize}
        letterSpacing={node.letterSpacing || undefined}
        textAnchor={ANCHOR[node.align]}
        style={{ whiteSpace: 'pre' }}
        {...props}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={0} y={firstBaseline + i * lh}>
            {line || ' '}
          </tspan>
        ))}
      </text>
    </>
  );
}
