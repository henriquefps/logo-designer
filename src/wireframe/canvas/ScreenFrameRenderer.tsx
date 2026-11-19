import type { ReactNode } from 'react';
import type { ScreenNode } from '@/model';
import { WF } from '../style';

/**
 * A screen frame on the canvas: white paper, content clipped to the frame, thin border on top.
 * The name label is screen-space UI (ScreenLabels), not part of the frame.
 */
export function ScreenFrameRenderer({ node, children }: { node: ScreenNode; children: ReactNode }) {
  const { width, height } = node.screen;
  const clip = `${node.id}-clip`;
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect width={width} height={height} />
        </clipPath>
      </defs>
      <rect width={width} height={height} fill={WF.paper} />
      <g clipPath={`url(#${clip})`}>{children}</g>
      <rect width={width} height={height} fill="none" stroke={WF.frame} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
    </>
  );
}
