import { memo } from 'react';
import { useDocStore } from '@/store/useDocStore';
import { ArtboardRenderer } from './renderers/ArtboardRenderer';
import { NodeRenderer } from './renderers/NodeRenderer';
import { useView } from './overlays/useView';

const Nodes = memo(function Nodes({ nodes }: { nodes: ReturnType<typeof useDocStore.getState>['doc']['children'] }) {
  return (
    <>
      {nodes.map((n) => (
        <NodeRenderer key={n.id} node={n} />
      ))}
    </>
  );
});

/** The document drawn in world coordinates under the view transform. */
export function SceneLayer() {
  const artboard = useDocStore((s) => s.doc.artboard);
  const children = useDocStore((s) => s.doc.children);
  const { zoom, pan } = useView();
  return (
    <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
      <ArtboardRenderer artboard={artboard} />
      <Nodes nodes={children} />
      <rect
        width={artboard.width}
        height={artboard.height}
        fill="none"
        stroke="var(--border)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    </g>
  );
}
