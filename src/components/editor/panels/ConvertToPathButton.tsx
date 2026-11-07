import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/useProjectStore';
import { convertIconToPathGeometry, convertShapeToPathGeometry, type ConvertResult } from '@/lib/convertToPath';
import { convertTextToPathGeometry } from '@/lib/textToPath';
import type { LogoElement } from '@/types/element';

interface ConvertToPathButtonProps {
  element: LogoElement;
}

function isConvertible(element: LogoElement): boolean {
  if (element.type === 'icon' || element.type === 'text') return true;
  return element.type === 'shape' && element.shape !== 'path';
}

export function ConvertToPathButton({ element }: ConvertToPathButtonProps) {
  const [busy, setBusy] = useState(false);

  if (!isConvertible(element)) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      let geometry: ConvertResult | null = null;
      if (element.type === 'icon') {
        const svgNode = document.querySelector<SVGSVGElement>(`[data-element-id="${element.id}"] svg`);
        if (svgNode) geometry = await convertIconToPathGeometry(element, svgNode);
      } else if (element.type === 'text') {
        geometry = await convertTextToPathGeometry(element);
      } else if (element.type === 'shape' && element.shape !== 'path') {
        geometry = await convertShapeToPathGeometry(element);
      }
      if (geometry) useProjectStore.getState().convertToPath(element.id, geometry);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy} onClick={handleClick}>
      {busy ? 'Converting…' : 'Convert to path'}
    </Button>
  );
}
