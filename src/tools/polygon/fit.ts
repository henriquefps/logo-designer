import { polygonVertices, rectFromPoints, type PolygonNode, type Rect } from '@/model';

/**
 * Polygon/star parameters that fill `box` exactly: radius from the tighter axis, the residual
 * stretch goes into scaleX/scaleY, and the center is offset so the vertex bounds match the box.
 */
export function fitPolygon(box: Rect, sides: number, innerRatio: number | undefined) {
  const unit = rectFromPoints(polygonVertices({ sides, radius: 1, innerRadius: innerRatio }))!;
  const kx = box.width / unit.width;
  const ky = box.height / unit.height;
  const radius = Math.max(0.01, Math.min(kx, ky));
  const scaleX = kx / radius || 1;
  const scaleY = ky / radius || 1;
  const cx = unit.x + unit.width / 2;
  const cy = unit.y + unit.height / 2;
  const x = box.x + box.width / 2 - cx * radius * scaleX;
  const y = box.y + box.height / 2 - cy * radius * scaleY;
  const patch: Pick<PolygonNode, 'sides' | 'radius' | 'innerRadius'> = { sides, radius };
  if (innerRatio !== undefined) patch.innerRadius = radius * innerRatio;
  return { ...patch, transform: { x, y, rotation: 0, scaleX, scaleY } };
}
