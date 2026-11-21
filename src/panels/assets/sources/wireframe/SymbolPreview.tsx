// A shared component drawn small, as an instance of it shows, and its name for a card: My components (Library
// panel) and the Import components dialog.
import { useMemo } from 'react';
import { localBounds, type WireframeSymbol } from '@/model';
import { NodeRenderer } from '@/canvas/renderers/NodeRenderer';
import { WF } from '@/wireframe/style';
import { newSymbolInstance } from '@/wireframe/symbols';
import { cn } from '@/lib/utils';

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

/**
 * A component's name for a card: whole, on up to two lines (`line-clamp-2`, with the full name as tooltip). Kits
 * name components with a common prefix ("Acme · Top bar", "Acme · List row"), so a name too long even for two lines
 * is cut in the middle, never at the end: the distinctive part stays visible.
 */
export function SymbolName({ name, className }: { name: string; className?: string }) {
  const shown = name.length > MAX_NAME ? `${name.slice(0, 16).trimEnd()}…${name.slice(-(MAX_NAME - 17)).trimStart()}` : name;
  return (
    <span className={cn('line-clamp-2 text-sm leading-tight break-words', className)} title={name} data-testid="symbol-name">
      {shown}
    </span>
  );
}

const MAX_NAME = 44;
