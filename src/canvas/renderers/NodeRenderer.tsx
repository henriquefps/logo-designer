import { memo, type ComponentType } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { toSvgTransform, type NodeType, type SceneNode, type ScreenNode } from '@/model';
import { ScreenFrameRenderer } from '@/wireframe/canvas/ScreenFrameRenderer';
import { ContainerRenderer } from '@/wireframe/canvas/ContainerRenderer';
import { ImageRenderer } from './ImageRenderer';
import { EllipseRenderer, PathRenderer, PolygonRenderer, RectRenderer } from './shapes';
import { TextRenderer } from './TextRenderer';

function GroupRenderer({ node }: { node: Extract<SceneNode, { type: 'group' }> }) {
  const children = node.children.map((c) => <NodeRenderer key={c.id} node={c} />);
  if (node.screen) return <ScreenFrameRenderer node={node as ScreenNode}>{children}</ScreenFrameRenderer>;
  // A wireframe stack / grid: its style (outline / fill) and, when empty, a canvas-only placeholder.
  if (node.layout && !node.component) return <ContainerRenderer node={node}>{children}</ContainerRenderer>;
  return <>{children}</>;
}

/** One renderer per node type. Adding a node type = add its component here (see docs/architecture.md). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENDERERS: Record<NodeType, ComponentType<{ node: any }>> = {
  group: GroupRenderer,
  rect: RectRenderer,
  ellipse: EllipseRenderer,
  polygon: PolygonRenderer,
  path: PathRenderer,
  text: TextRenderer,
  image: ImageRenderer,
};

/**
 * Renders a node as SVG: a <g> carrying transform/opacity/blend, then the type renderer.
 * Memoized by node identity: immer keeps unchanged nodes referentially equal.
 */
export const NodeRenderer = memo(function NodeRenderer({ node }: { node: SceneNode }) {
  const R = RENDERERS[node.type];
  const showReferences = useEditorStore((s) => s.showReferences);
  if (!node.visible || (node.reference && !showReferences)) return null;
  return (
    <g
      data-node-id={node.id}
      transform={toSvgTransform(node.transform)}
      opacity={node.opacity < 1 ? node.opacity : undefined}
      style={node.blendMode && node.blendMode !== 'normal' ? { mixBlendMode: node.blendMode as React.CSSProperties['mixBlendMode'] } : undefined}
    >
      <R node={node} />
    </g>
  );
});
