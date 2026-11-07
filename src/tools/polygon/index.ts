import { PolygonIcon } from '@phosphor-icons/react';
import { shapeStyle } from '@/store/usePaintDefaults';
import { createPolygon, type PolygonNode } from '@/model';
import { createShapeTool } from '../shapeTool';
import { fitPolygon } from './fit';
import { PolygonOptions } from './PolygonOptions';
import { usePolygonOptions } from './state';

const params = () => {
  const o = usePolygonOptions.getState();
  return { sides: Math.max(3, Math.round(o.sides)), inner: o.star ? o.innerRatio : undefined };
};

const tool = createShapeTool({
  id: 'polygon',
  label: 'Polygon / Star',
  icon: PolygonIcon,
  order: 3,
  hint: 'Drag to draw. Shift keeps proportions, Alt draws from the center.',
  create: (b) => {
    const { sides, inner } = params();
    const f = fitPolygon(b, sides, inner);
    return createPolygon({ ...f, ...shapeStyle(), name: inner !== undefined ? 'Star' : 'Polygon' });
  },
  update: (node, b) => {
    if (node.type !== 'polygon') return node;
    const f = fitPolygon(b, node.sides, node.innerRadius !== undefined ? node.innerRadius / node.radius : undefined);
    const next: PolygonNode = { ...node, ...f, transform: { ...node.transform, ...f.transform } };
    if (f.innerRadius === undefined) delete next.innerRadius;
    return next;
  },
});

export default { ...tool, Options: PolygonOptions };
