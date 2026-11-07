import { nodeToSvgPath, type EllipseNode, type PathNode, type PolygonNode, type RectNode } from '@/model';
import { paintedProps } from './paint';

export function RectRenderer({ node }: { node: RectNode }) {
  const { defs, props } = paintedProps(node);
  const r = Math.min(node.radius, node.width / 2, node.height / 2);
  return (
    <>
      {defs}
      <rect x={-node.width / 2} y={-node.height / 2} width={node.width} height={node.height} rx={r || undefined} {...props} />
    </>
  );
}

export function EllipseRenderer({ node }: { node: EllipseNode }) {
  const { defs, props } = paintedProps(node);
  return (
    <>
      {defs}
      <ellipse rx={node.rx} ry={node.ry} {...props} />
    </>
  );
}

export function PolygonRenderer({ node }: { node: PolygonNode }) {
  const { defs, props } = paintedProps(node);
  return (
    <>
      {defs}
      <path d={nodeToSvgPath(node)} {...props} />
    </>
  );
}

export function PathRenderer({ node }: { node: PathNode }) {
  const { defs, props } = paintedProps(node);
  return (
    <>
      {defs}
      <path d={nodeToSvgPath(node)} fillRule={node.fillRule} {...props} />
    </>
  );
}
