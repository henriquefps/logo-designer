import { CircleIcon, FolderSimpleIcon, ImageIcon, PenNibIcon, PolygonIcon, SquareIcon, TextTIcon, type Icon } from '@phosphor-icons/react';
import type { NodeType } from '@/model';

export const NODE_ICONS: Record<NodeType, Icon> = {
  group: FolderSimpleIcon,
  rect: SquareIcon,
  ellipse: CircleIcon,
  polygon: PolygonIcon,
  path: PenNibIcon,
  text: TextTIcon,
  image: ImageIcon,
};
