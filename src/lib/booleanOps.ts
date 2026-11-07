import type paper from 'paper';
import type { LogoElement, ShapeElement } from '@/types/element';

export type BooleanOpKind = 'unite' | 'subtract' | 'intersect' | 'exclude';

/** Only closed, area-having shapes make sense as boolean-op input — a 'line' has no fill region,
 * and icons/text need "convert to path" (a separate, not-yet-built step) before they have any
 * point/segment geometry to hand to paper.js. */
export function isBooleanOpEligible(el: LogoElement): el is ShapeElement {
  return el.type === 'shape' && (el.shape === 'rectangle' || el.shape === 'ellipse' || el.shape === 'path');
}

/** Builds a paper.js PathItem for one element, centered at the origin in its own local space,
 * then applies flip/rotate/translate in the same order ElementNode's nested <g> transforms do
 * (scale/flip innermost, rotate, then translate) — so the result lands in absolute canvas space
 * matching what's actually rendered on screen. */
function buildPaperPath(scope: paper.PaperScope, el: ShapeElement): paper.PathItem {
  let path: paper.PathItem;

  if (el.shape === 'rectangle') {
    const w = Math.abs(el.width);
    const h = Math.abs(el.height);
    path = new scope.Path.Rectangle({
      point: [-w / 2, -h / 2],
      size: [w, h],
      radius: el.cornerRadius ?? 0,
    });
  } else if (el.shape === 'ellipse') {
    const w = Math.abs(el.width);
    const h = Math.abs(el.height);
    path = new scope.Path.Ellipse({ point: [-w / 2, -h / 2], size: [w, h] });
  } else if (el.pathData) {
    // Converted icon/text (or a previous boolean-op result) — possibly multiple subpaths
    // (e.g. the hole in a letter "e"), which `scope.PathItem.create` handles as a CompoundPath.
    path = scope.PathItem.create(el.pathData);
  } else {
    const freehand = new scope.Path();
    for (const p of el.points ?? []) {
      freehand.add(
        new scope.Segment({
          point: [p.x, p.y],
          handleIn: p.handleInX !== undefined ? [p.handleInX, p.handleInY!] : undefined,
          handleOut: p.handleOutX !== undefined ? [p.handleOutX, p.handleOutY!] : undefined,
        }),
      );
    }
    // Boolean ops need a closed region — an open freehand stroke used as input is implicitly
    // "filled in" by closing it back to its start point.
    freehand.closed = true;
    path = freehand;
  }

  path.scale(el.flipH ? -1 : 1, el.flipV ? -1 : 1, [0, 0]);
  path.rotate(el.rotation, [0, 0]);
  path.translate([el.x, el.y]);
  return path;
}

export interface BooleanOpResult {
  x: number;
  y: number;
  width: number;
  height: number;
  pathData: string;
}

/**
 * Combines 2+ shape elements (already in back-to-front z-order) into one resulting path, computed
 * entirely by paper.js in an isolated, headless PaperScope — never attached to a real canvas or
 * shared with any other paper.js usage. Returns absolute geometry (position + a `d` string
 * relative to that position, i.e. ready to drop straight into a new ShapeElement with
 * rotation 0 / flipH false / flipV false, since every input transform was already baked in).
 * Returns null if fewer than 2 eligible elements are given.
 *
 * paper.js (~350KB) is dynamically imported here rather than at module load — boolean ops are an
 * advanced action most sessions never touch, so it shouldn't sit in the app's main bundle.
 */
export async function computeBooleanOp(elements: ShapeElement[], op: BooleanOpKind): Promise<BooleanOpResult | null> {
  if (elements.length < 2) return null;

  const paperModule = await import('paper');
  const paperLib = paperModule.default ?? paperModule;
  const scope = new paperLib.PaperScope();
  scope.setup(new scope.Size(1, 1));

  try {
    const paths = elements.map((el) => buildPaperPath(scope, el));
    let result: paper.PathItem = paths[0];
    for (let i = 1; i < paths.length; i++) {
      const next = result[op](paths[i]);
      result.remove();
      paths[i].remove();
      result = next;
    }

    const bounds = result.bounds;
    const center = bounds.center;
    result.translate([-center.x, -center.y]);

    return {
      x: center.x,
      y: center.y,
      width: bounds.width,
      height: bounds.height,
      pathData: result.pathData,
    };
  } finally {
    scope.project?.remove();
  }
}
