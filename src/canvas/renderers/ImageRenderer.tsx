import type { ImageNode } from '@/model';

export function ImageRenderer({ node }: { node: ImageNode }) {
  return <image href={node.href} x={-node.width / 2} y={-node.height / 2} width={node.width} height={node.height} preserveAspectRatio="none" />;
}
