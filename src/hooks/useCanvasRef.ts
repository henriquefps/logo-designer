import { createContext, useContext, type RefObject } from 'react';

export const CanvasRefContext = createContext<RefObject<SVGSVGElement | null> | null>(null);

/**
 * Shares the live <svg> DOM node across the editor tree (CanvasStage writes it,
 * ExportPanel reads it) without prop-drilling it through every panel — export
 * needs the actual rendered node (for accurate serialization), not a re-derived
 * one from store state. Provider lives in CanvasRefProvider.tsx.
 */
export function useCanvasRef(): RefObject<SVGSVGElement | null> {
  const ref = useContext(CanvasRefContext);
  if (!ref) throw new Error('useCanvasRef must be used within a CanvasRefProvider');
  return ref;
}
