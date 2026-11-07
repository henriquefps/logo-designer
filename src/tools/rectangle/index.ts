import { RectangleIcon } from '@phosphor-icons/react';
import { shapeStyle } from '@/store/usePaintDefaults';
import { createRect } from '@/model';
import { createShapeTool } from '../shapeTool';

export default createShapeTool({
  id: 'rectangle',
  label: 'Rectangle',
  shortcut: 'm',
  icon: RectangleIcon,
  order: 0,
  create: (b) => createRect({ ...shapeStyle(), width: b.width, height: b.height, transform: { x: b.x + b.width / 2, y: b.y + b.height / 2 } }),
  update: (node, b) =>
    node.type === 'rect'
      ? { ...node, width: b.width, height: b.height, transform: { ...node.transform, x: b.x + b.width / 2, y: b.y + b.height / 2 } }
      : node,
});
