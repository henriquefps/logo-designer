import type paper from 'paper';
import type { IconElement, ShapeElement, ShapePoint } from '@/types/element';

async function getPaperLib() {
  const mod = await import('paper');
  return mod.default ?? mod;
}

function segmentsToPoints(segments: paper.Segment[]): ShapePoint[] {
  return segments.map((s) => {
    const p: ShapePoint = { x: s.point.x, y: s.point.y };
    if (s.handleIn.length > 0.001) {
      p.handleInX = s.handleIn.x;
      p.handleInY = s.handleIn.y;
    }
    if (s.handleOut.length > 0.001) {
      p.handleOutX = s.handleOut.x;
      p.handleOutY = s.handleOut.y;
    }
    return p;
  });
}

/** Flattens an imported SVG item tree (paper.js wraps multi-element SVGs in nested Groups) into
 * one concatenated `d` string — each Path/CompoundPath contributes its own subpath(s), and
 * concatenating valid subpath strings (each starting with its own `M`) is itself valid SVG path
 * data, same as a boolean-op's compound-path result. */
function collectPathData(item: paper.Item): string {
  if (item.className === 'Path' || item.className === 'CompoundPath') {
    return (item as paper.PathItem).pathData;
  }
  // Non-geometric SVG nodes (e.g. an accessibility <title>) import as item types with no
  // meaningful children array — contribute nothing rather than crash on them.
  return (item.children ?? []).map(collectPathData).join(' ');
}

export interface ConvertResult {
  width: number;
  height: number;
  points?: ShapePoint[];
  pathData?: string;
  closed?: boolean;
  fill: string | null;
  stroke: string;
  strokeWidth: number;
}

/** Converts a rectangle/ellipse/line shape into a node-editable `points` path — a single simple
 * closed (rect/ellipse) or open (line) contour, so it stays compatible with node-edit mode
 * (unlike a boolean-op result, which needs `pathData` because it can have holes). */
export async function convertShapeToPathGeometry(element: ShapeElement): Promise<ConvertResult | null> {
  if (element.shape === 'path') return null;

  const paperLib = await getPaperLib();
  const scope = new paperLib.PaperScope();
  scope.setup(new scope.Size(1, 1));

  try {
    const w = Math.abs(element.width);
    const h = Math.abs(element.height);
    let path: paper.Path;
    let closed: boolean;

    if (element.shape === 'rectangle') {
      path = new scope.Path.Rectangle({ point: [-w / 2, -h / 2], size: [w, h], radius: element.cornerRadius ?? 0 });
      closed = true;
    } else if (element.shape === 'ellipse') {
      path = new scope.Path.Ellipse({ point: [-w / 2, -h / 2], size: [w, h] });
      closed = true;
    } else {
      path = new scope.Path.Line([-w / 2, -h / 2], [w / 2, h / 2]);
      closed = false;
    }

    return {
      width: w,
      height: h,
      points: segmentsToPoints(path.segments),
      closed,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
    };
  } finally {
    scope.project?.remove();
  }
}

/**
 * Converts a rendered icon into raw path geometry by importing its *live, already-on-canvas* SVG
 * subtree into an isolated paper.js scope — this offloads flattening arbitrary primitives
 * (circle/rect/polyline/nested groups, whatever a given icon happens to use) into real path
 * geometry to paper.js's SVG importer, rather than hand-rolling a converter per primitive type.
 * `svgNode` must be the icon's own inner <svg> (rendered at `size`x`size` px, matching its
 * on-canvas appearance), so the imported geometry already lands in local pixel space.
 */
export async function convertIconToPathGeometry(element: IconElement, svgNode: SVGSVGElement): Promise<ConvertResult> {
  const paperLib = await getPaperLib();
  const scope = new paperLib.PaperScope();
  scope.setup(new scope.Size(1, 1));

  try {
    const imported = scope.project.importSVG(svgNode, { expandShapes: true });
    imported.translate(new scope.Point(-element.size / 2, -element.size / 2));
    const bounds = imported.bounds;
    const pathData = collectPathData(imported);

    // Phosphor icons are solid filled silhouettes (even "regular" weight — Phosphor has no
    // stroke-based rendering); Lucide icons are drawn with an actual stroke and no fill.
    const isFillBased = element.iconType === 'phosphor';

    return {
      width: bounds.width,
      height: bounds.height,
      pathData,
      fill: isFillBased ? element.color : null,
      stroke: element.color,
      strokeWidth: isFillBased ? 0 : (element.strokeWidth ?? 2),
    };
  } finally {
    scope.project?.remove();
  }
}
