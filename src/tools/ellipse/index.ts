import { CircleIcon } from '@phosphor-icons/react';
import { shapeStyle } from '@/store/usePaintDefaults';
import { createEllipse } from '@/model';
import { createShapeTool } from '../shapeTool';

export default createShapeTool({
  id: 'ellipse',
  label: 'Ellipse',
  shortcut: 'l',
  icon: CircleIcon,
  order: 10,
  create: (b) => createEllipse({ ...shapeStyle(), rx: b.width / 2, ry: b.height / 2, transform: { x: b.x + b.width / 2, y: b.y + b.height / 2 } }),
  update: (node, b) =>
    node.type === 'ellipse'
      ? { ...node, rx: b.width / 2, ry: b.height / 2, transform: { ...node.transform, x: b.x + b.width / 2, y: b.y + b.height / 2 } }
      : node,
});
