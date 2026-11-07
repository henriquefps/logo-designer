import { newId } from './id';
import type {
  Artboard,
  DesignDocument,
  EllipseNode,
  GroupNode,
  ImageNode,
  NodeBase,
  Paint,
  PathNode,
  PolygonNode,
  RectNode,
  SceneNode,
  Stroke,
  SubPath,
  TextNode,
  Transform,
} from './types';

export const DEFAULT_FILL_COLOR = '#2f6fb5';

export const identityTransform = (): Transform => ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
export const none = (): Paint => ({ kind: 'none' });
export const solid = (color: string): Paint => ({ kind: 'solid', color });
export const linear = (from: string, to: string, angle = 0): Paint => ({
  kind: 'linear',
  angle,
  stops: [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ],
});
export const radial = (from: string, to: string): Paint => ({
  kind: 'radial',
  stops: [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ],
});

export const defaultStroke = (paint: Paint = none(), width = 1): Stroke => ({
  paint,
  width,
  cap: 'butt',
  join: 'miter',
  dash: [],
});

type BaseInit = Partial<Omit<NodeBase, 'transform'>> & { transform?: Partial<Transform> };

function base(type: string, init: BaseInit): NodeBase {
  const { transform, ...rest } = init;
  return {
    id: newId(),
    name: type,
    visible: true,
    locked: false,
    opacity: 1,
    ...rest,
    transform: { ...identityTransform(), ...transform },
  };
}

type Init<T extends SceneNode> = BaseInit & Partial<Omit<T, keyof NodeBase | 'type'>>;

export function createRect(init: Init<RectNode> = {}): RectNode {
  const { width = 100, height = 100, radius = 0, fill = solid(DEFAULT_FILL_COLOR), stroke = defaultStroke(), ...b } = init;
  return { ...base('Rectangle', b), type: 'rect', width, height, radius, fill, stroke };
}

export function createEllipse(init: Init<EllipseNode> = {}): EllipseNode {
  const { rx = 50, ry = 50, fill = solid(DEFAULT_FILL_COLOR), stroke = defaultStroke(), ...b } = init;
  return { ...base('Ellipse', b), type: 'ellipse', rx, ry, fill, stroke };
}

export function createPolygon(init: Init<PolygonNode> = {}): PolygonNode {
  const { sides = 5, radius = 50, innerRadius, fill = solid(DEFAULT_FILL_COLOR), stroke = defaultStroke(), ...b } = init;
  const node: PolygonNode = { ...base(innerRadius ? 'Star' : 'Polygon', b), type: 'polygon', sides, radius, fill, stroke };
  if (innerRadius !== undefined) node.innerRadius = innerRadius;
  return node;
}

export function createPath(init: Init<PathNode> = {}): PathNode {
  const {
    subpaths = [] as SubPath[],
    fill = none(),
    stroke = defaultStroke(solid('#000000')),
    fillRule = 'nonzero',
    ...b
  } = init;
  return { ...base('Path', b), type: 'path', subpaths, fill, stroke, fillRule };
}

export function createText(init: Init<TextNode> = {}): TextNode {
  const {
    text = 'Text',
    fontFamily = 'Inter Variable',
    fontWeight = 400,
    fontStyle = 'normal',
    fontSize = 48,
    letterSpacing = 0,
    lineHeight = 1.2,
    align = 'left',
    fill = solid('#000000'),
    stroke = defaultStroke(),
    ...b
  } = init;
  return {
    ...base('Text', b),
    type: 'text',
    text,
    fontFamily,
    fontWeight,
    fontStyle,
    fontSize,
    letterSpacing,
    lineHeight,
    align,
    fill,
    stroke,
  };
}

export function createImage(init: Init<ImageNode> & { href: string }): ImageNode {
  const { href, width = 100, height = 100, ...b } = init;
  return { ...base('Image', b), type: 'image', href, width, height };
}

export function createGroup(init: Init<GroupNode> = {}): GroupNode {
  const { children = [], ...b } = init;
  return { ...base('Group', b), type: 'group', children };
}

export const defaultArtboard = (): Artboard => ({ width: 1024, height: 1024, background: solid('#ffffff') });

export function createDocument(init: Partial<DesignDocument> = {}): DesignDocument {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: newId('d'),
    name: 'Untitled',
    createdAt: now,
    updatedAt: now,
    artboard: defaultArtboard(),
    children: [],
    ...init,
  };
}

/** Deep clone with fresh ids for the node and all descendants. */
export function cloneWithNewIds<T extends SceneNode>(node: T): T {
  const copy = structuredClone(node) as T;
  const walk = (n: SceneNode) => {
    n.id = newId();
    if (n.type === 'group') n.children.forEach(walk);
  };
  walk(copy);
  return copy;
}
