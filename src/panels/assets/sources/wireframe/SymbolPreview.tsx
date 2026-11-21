// A shared component drawn small, as an instance of it shows: My components (Library panel) and the
// Import components dialog.
import { useMemo } from 'react';
import { localBounds, type WireframeSymbol } from '@/model';
import { NodeRenderer } from '@/canvas/renderers/NodeRenderer';
import { WF } from '@/wireframe/style';
import { newSymbolInstance } from '@/wireframe/symbols';

/** A shared component drawn small, as an instance shows it. */
/** `className`: the preview's height limit (default `max-h-24`). */
export function SymbolPreview({ symbol, symbols, className = 'max-h-24' }: { symbol: WireframeSymbol; symbols: readonly WireframeSymbol[]; className?: string }) {
  const node = useMemo(() => newSymbolInstance(symbol, symbols, { x: 0, y: 0 }), [symbol, symbols]);
  const size = node.layout?.size;
  const b = size ? { x: 0, y: 0, ...size } : localBounds(node);
  if (!b || !b.width || !b.height) return <div className="h-12" />;
  const pad = 8;
  return (
    <svg
      aria-hidden
      viewBox={`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`}
      className={`mx-auto block h-auto w-full ${className}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: WF.paper }}
    >
      <NodeRenderer node={node} />
    </svg>
  );
}
