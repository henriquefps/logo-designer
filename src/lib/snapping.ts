export interface ElementBounds {
  id: string;
  centerX: number;
  centerY: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SnapTarget {
  axis: 'x' | 'y';
  position: number;
  source: 'canvas-center' | 'canvas-edge' | 'element-center' | 'element-edge';
}

export interface SnapResult {
  dx: number;
  dy: number;
  activeGuides: SnapTarget[];
}

export function boundsFromCenter(id: string, centerX: number, centerY: number, width: number, height: number): ElementBounds {
  const halfW = width / 2;
  const halfH = height / 2;
  return { id, centerX, centerY, left: centerX - halfW, right: centerX + halfW, top: centerY - halfH, bottom: centerY + halfH };
}

/** Snap targets: canvas center/edges plus every non-dragged sibling's center + edges. */
export function computeSnapTargets(canvasSize: number, siblings: ElementBounds[]): SnapTarget[] {
  const targets: SnapTarget[] = [
    { axis: 'x', position: canvasSize / 2, source: 'canvas-center' },
    { axis: 'y', position: canvasSize / 2, source: 'canvas-center' },
    { axis: 'x', position: 0, source: 'canvas-edge' },
    { axis: 'x', position: canvasSize, source: 'canvas-edge' },
    { axis: 'y', position: 0, source: 'canvas-edge' },
    { axis: 'y', position: canvasSize, source: 'canvas-edge' },
  ];

  for (const sibling of siblings) {
    targets.push({ axis: 'x', position: sibling.centerX, source: 'element-center' });
    targets.push({ axis: 'x', position: sibling.left, source: 'element-edge' });
    targets.push({ axis: 'x', position: sibling.right, source: 'element-edge' });
    targets.push({ axis: 'y', position: sibling.centerY, source: 'element-center' });
    targets.push({ axis: 'y', position: sibling.top, source: 'element-edge' });
    targets.push({ axis: 'y', position: sibling.bottom, source: 'element-edge' });
  }

  return targets;
}

/**
 * Finds the closest snap on each axis (checking the dragged element's center
 * and both edges against every target) within `tolerance` virtual units, and
 * returns the offset needed to align to it. Tolerance should be pre-scaled by
 * the caller as `basePx / zoom` so the snap feel stays constant at any zoom.
 */
export function findSnap(dragged: ElementBounds, targets: SnapTarget[], tolerance: number): SnapResult {
  let bestX: { diff: number; dx: number; target: SnapTarget } | null = null;
  let bestY: { diff: number; dy: number; target: SnapTarget } | null = null;

  const xCandidates = [dragged.centerX, dragged.left, dragged.right];
  const yCandidates = [dragged.centerY, dragged.top, dragged.bottom];

  for (const target of targets) {
    if (target.axis === 'x') {
      for (const candidate of xCandidates) {
        const diff = Math.abs(target.position - candidate);
        if (diff <= tolerance && (!bestX || diff < bestX.diff)) {
          bestX = { diff, dx: target.position - candidate, target };
        }
      }
    } else {
      for (const candidate of yCandidates) {
        const diff = Math.abs(target.position - candidate);
        if (diff <= tolerance && (!bestY || diff < bestY.diff)) {
          bestY = { diff, dy: target.position - candidate, target };
        }
      }
    }
  }

  const activeGuides: SnapTarget[] = [];
  if (bestX) activeGuides.push(bestX.target);
  if (bestY) activeGuides.push(bestY.target);

  return { dx: bestX?.dx ?? 0, dy: bestY?.dy ?? 0, activeGuides };
}
