import { useRef, type ReactNode } from 'react';
import { CanvasRefContext } from '@/hooks/useCanvasRef';

export function CanvasRefProvider({ children }: { children: ReactNode }) {
  const ref = useRef<SVGSVGElement | null>(null);
  return <CanvasRefContext.Provider value={ref}>{children}</CanvasRefContext.Provider>;
}
