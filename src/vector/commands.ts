// Store-facing vector commands shared by the Object menu, the Properties panel and the tools.
import { toast } from 'sonner';
import {
  createGroup,
  createPath,
  findNode,
  invert,
  isPainted,
  nodeSubpaths,
  none,
  parentWorldMatrix,
  sortByDocumentOrder,
  topmostIds,
  walk,
  defaultStroke,
  type Id,
  type PathNode,
  type SceneNode,
} from '@/model';
import { textToPaths } from '@/fonts/outline';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { switchTool } from '@/tools/context';
import { useNodeEdit } from '@/tools/direct/state';
import { bottomStyleSource, convertTree, hasOutline, isBooleanOperand, isShapeType, pathFromWorld, recenterPath, shapeToPath, worldShapes } from './convert';
import { booleanOp, loadPaper, outlineStroke, simplifySubpaths, type BooleanOp } from './paperOps';
import { joinEndpoints, joinOpenSubpaths, parseKey, reverseSubpaths } from './pathEdit';

const ds = () => useDocStore.getState();
const ed = () => useEditorStore.getState();

/** Selected, unlocked, topmost ids. */
export function selectedIds(): Id[] {
  const d = ds().doc;
  return topmostIds(d, ed().selection).filter((id) => {
    const n = findNode(d, id);
    return n && !n.locked;
  });
}
const selectedNodes = (): SceneNode[] => selectedIds().map((id) => findNode(ds().doc, id)!);

const containsShape = (n: SceneNode): boolean => (n.type === 'group' ? n.children.some(containsShape) : isShapeType(n));
const containsPath = (n: SceneNode): boolean => (n.type === 'group' ? n.children.some(containsPath) : hasOutline(n));

/** Path nodes in the selection after converting shapes (inside groups too). */
function selectedPathLeaves(): PathNode[] {
  const out: PathNode[] = [];
  walk(selectedNodes(), (n) => {
    if (n.type === 'path' && !n.locked) out.push(n);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------

export const canConvertToPath = () => selectedNodes().some(containsShape);

export function convertSelectionToPath() {
  const nodes = selectedNodes().filter(containsShape);
  if (!nodes.length) return;
  ds().replaceNodes(nodes.map(convertTree), { label: 'Convert to path' });
}

const containsText = (n: SceneNode): boolean => (n.type === 'group' ? n.children.some(containsText) : n.type === 'text');
/** Boolean operand once its texts are outlined. */
const isOperand = (n: SceneNode) => isBooleanOperand(n) || containsText(n);

/** Replaces every visible text in a tree with its glyph outlines (textToPaths). Same object when there is no text. */
async function outlineTexts(n: SceneNode): Promise<SceneNode> {
  if (n.type === 'text') return n.visible ? { ...(await textToPaths(n)), id: n.id } : n;
  if (n.type !== 'group' || !containsText(n)) return n;
  return { ...n, children: await Promise.all(n.children.map(outlineTexts)) };
}

/** outlineTexts for several nodes, with a toast (and null) when a font cannot be loaded. */
async function outlineTextsOrToast(nodes: SceneNode[]): Promise<SceneNode[] | null> {
  try {
    return await Promise.all(nodes.map(outlineTexts));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not outline the text.');
    return null;
  }
}

export const canBoolean = () => selectedNodes().filter(isOperand).length >= 2;

const OP_LABEL: Record<BooleanOp, string> = { unite: 'Unite', subtract: 'Subtract front', intersect: 'Intersect', exclude: 'Exclude' };

export async function booleanSelection(op: BooleanOp) {
  const doc = ds().doc;
  const ids = sortByDocumentOrder(doc, selectedIds()).filter((id) => isOperand(findNode(doc, id)!));
  if (ids.length < 2) return;
  // Text takes part through its glyph outlines.
  const [scope, resolved] = await Promise.all([loadPaper(), outlineTextsOrToast(ids.map((id) => findNode(doc, id)!))]);
  if (!resolved) return;
  if (ds().doc !== doc) return; // document changed while paper.js / fonts were loading
  const operands = ids.map((id, i) => worldShapes(resolved[i], parentWorldMatrix(doc, id)));
  let subpaths;
  try {
    subpaths = booleanOp(scope, operands, op);
  } catch (err) {
    console.error(err);
    toast.error(`${OP_LABEL[op]} failed on this geometry`);
    return;
  }
  if (!subpaths.length) {
    toast(`${OP_LABEL[op]}: the result is empty`);
    return;
  }
  const bottomId = ids[0];
  const bottom = resolved[0];
  const style = bottomStyleSource(bottom);
  const result: PathNode = {
    ...pathFromWorld(subpaths, invert(parentWorldMatrix(doc, bottomId)), {
      fill: style ? structuredClone(style.fill) : none(),
      stroke: style ? structuredClone(style.stroke) : defaultStroke(),
      fillRule: 'nonzero',
      name: style?.name ?? 'Path',
      opacity: bottom.opacity,
    }),
    id: bottomId,
  };
  const store = ds();
  store.beginTransaction(OP_LABEL[op]);
  store.replaceNodes([result]);
  store.deleteNodes(ids.slice(1));
  store.commitTransaction();
  ed().setSelection([bottomId]);
}

export const canOutlineStroke = () =>
  selectedNodes().some((n) => {
    let ok = false;
    walk([n], (c) => {
      if ((hasOutline(c) || c.type === 'text') && isPainted(c) && c.stroke.paint.kind !== 'none' && c.stroke.width > 0) ok = true;
    });
    return ok;
  });

export async function outlineStrokeSelection() {
  const doc = ds().doc;
  // Stroked text is outlined first, then its glyph strokes are expanded like any path.
  const strokedText = (n: SceneNode) => n.type === 'text' && n.stroke.paint.kind !== 'none' && n.stroke.width > 0;
  const withText = (n: SceneNode): SceneNode | Promise<SceneNode> => {
    if (strokedText(n)) return outlineTexts(n);
    if (n.type === 'group' && containsText(n)) return Promise.all(n.children.map(withText)).then((children) => ({ ...n, children }));
    return n;
  };
  let selected: SceneNode[];
  try {
    selected = await Promise.all(selectedIds().map((id) => withText(findNode(doc, id)!)));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not outline the text.');
    return;
  }
  const scope = await loadPaper();
  if (ds().doc !== doc) return;
  const replace = (n: SceneNode): SceneNode => {
    if (n.type === 'group') return { ...n, children: n.children.map(replace) };
    if (!hasOutline(n) || !isPainted(n) || n.stroke.paint.kind === 'none' || n.stroke.width <= 0) return n;
    const outline = outlineStroke(scope, nodeSubpaths(n)!, n.stroke);
    if (!outline.length) return n;
    const base = { name: n.name, opacity: n.opacity, visible: n.visible, locked: n.locked, transform: { ...n.transform } };
    const strokePath = recenterPath(
      createPath({ ...base, name: `${n.name} stroke`, subpaths: outline, fill: structuredClone(n.stroke.paint), stroke: defaultStroke(), fillRule: 'nonzero' }),
    );
    if (n.fill.kind === 'none') return { ...strokePath, id: n.id, name: n.name };
    const fillPath = { ...shapeToPath(n)!, id: createPath().id, stroke: defaultStroke(), opacity: 1 };
    strokePath.opacity = 1;
    return { ...createGroup({ name: n.name, opacity: n.opacity, children: [fillPath, strokePath] }), id: n.id };
  };
  ds().replaceNodes(selected.map(replace), { label: 'Outline stroke' });
}

export const canEditPaths = () => selectedNodes().some(containsPath);

/** Applies `fn` to every path leaf of the selection (shapes are converted first), one undo step. */
function editPaths(label: string, fn: (p: PathNode) => PathNode) {
  const store = ds();
  store.beginTransaction(label);
  if (canConvertToPath()) convertSelectionToPath();
  const paths = selectedPathLeaves();
  store.replaceNodes(paths.map(fn));
  store.commitTransaction();
}

export const reverseSelection = () => editPaths('Reverse path direction', (p) => ({ ...p, subpaths: reverseSubpaths(p.subpaths) }));

export async function simplifySelection() {
  const scope = await loadPaper();
  editPaths('Simplify path', (p) => {
    const b = nodeSubpaths(p);
    const pts = b?.flatMap((s) => s.points) ?? [];
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
    return recenterPath({ ...p, subpaths: simplifySubpaths(scope, p.subpaths, Math.max(0.25, diag / 250)) });
  });
}

/**
 * Join: in node edit with two endpoints selected, connects them. Otherwise joins the open subpaths of
 * the selected paths (several paths merge into the bottom one) or closes a single open subpath.
 */
export function joinSelection() {
  const e = ed();
  const editing = e.editingPathId ? findNode(ds().doc, e.editingPathId) : null;
  const sel = useNodeEdit.getState().selected;
  if (editing?.type === 'path' && sel.length === 2) {
    const joined = joinEndpoints(editing.subpaths, parseKey(sel[0]), parseKey(sel[1]));
    if (joined) {
      ds().replaceNodes([{ ...editing, subpaths: joined }], { label: 'Join' });
      useNodeEdit.getState().setSelected([]);
      return;
    }
  }
  const doc = ds().doc;
  const ids = sortByDocumentOrder(doc, selectedIds()).filter((id) => {
    const n = findNode(doc, id)!;
    return n.type === 'path';
  });
  if (!ids.length) return;
  if (ids.length === 1) {
    const p = findNode(doc, ids[0]) as PathNode;
    ds().replaceNodes([{ ...p, subpaths: joinOpenSubpaths(p.subpaths) }], { label: 'Join' });
    return;
  }
  const bottom = findNode(doc, ids[0]) as PathNode;
  const world = ids.flatMap((id) => worldShapes(findNode(doc, id)!, parentWorldMatrix(doc, id)).flatMap((s) => s.subpaths));
  const merged = pathFromWorld(joinOpenSubpaths(world), invert(parentWorldMatrix(doc, bottom.id)), {
    name: bottom.name,
    fill: bottom.fill,
    stroke: bottom.stroke,
    fillRule: bottom.fillRule,
    opacity: bottom.opacity,
  });
  const store = ds();
  store.beginTransaction('Join');
  store.replaceNodes([{ ...merged, id: bottom.id }]);
  store.deleteNodes(ids.slice(1));
  store.commitTransaction();
  ed().setSelection([bottom.id]);
}

export const canJoin = () => {
  const e = ed();
  if (e.editingPathId && useNodeEdit.getState().selected.length === 2) return true;
  return selectedNodes().some((n) => n.type === 'path' && n.subpaths.some((s) => !s.closed && s.points.length >= 2));
};

// ---------------------------------------------------------------------------------------------
// Node editing entry points

/** Starts node editing on a node: paths directly, shapes after a "Convert to path?" prompt. */
export function enterNodeEdit(id: Id): boolean {
  const n = findNode(ds().doc, id);
  if (!n || n.locked) return false;
  if (n.type === 'path') {
    ed().setSelection([id]);
    ed().setEditingPath(id);
    useNodeEdit.getState().setSelected([]);
    switchTool('direct');
    return true;
  }
  if (isShapeType(n)) {
    useNodeEdit.setState({ pendingConvert: id });
    ed().openDialog('convertToPath');
    return true;
  }
  return false;
}

/** Confirms the pending conversion and starts node editing. */
export function confirmPendingConvert() {
  const id = useNodeEdit.getState().pendingConvert;
  useNodeEdit.setState({ pendingConvert: null });
  if (!id) return;
  const n = findNode(ds().doc, id);
  const p = n && shapeToPath(n);
  if (!p) return;
  ds().replaceNodes([p], { label: 'Convert to path' });
  enterNodeEdit(id);
}

/** The single selected node that can be node-edited, if any. */
export function nodeEditCandidate(): Id | null {
  const ids = selectedIds();
  if (ids.length !== 1) return null;
  const n = findNode(ds().doc, ids[0]);
  return n && hasOutline(n) ? n.id : null;
}

// ---------------------------------------------------------------------------------------------
// Eyedropper

/** Copies fill and stroke of `sourceId` into every painted leaf of the selection. Returns the count. */
export function applyStyleFrom(sourceId: Id): number {
  const doc = ds().doc;
  const src = findNode(doc, sourceId);
  if (!src || !isPainted(src)) return 0;
  const targets: Id[] = [];
  walk(selectedNodes(), (n) => {
    if (n.id !== sourceId && isPainted(n) && !n.locked) targets.push(n.id);
  });
  if (!targets.length) return 0;
  ds().updateNodes(
    targets,
    (n) => {
      if (!('fill' in n)) return;
      n.fill = structuredClone(src.fill);
      n.stroke = structuredClone(src.stroke);
    },
    { label: 'Eyedropper' },
  );
  return targets.length;
}

/** Select tool: double-click on a path/shape starts node editing (deepest hit). */
export function editPathAt(hitDeep: Id | null): boolean {
  if (!hitDeep) return false;
  const n = findNode(ds().doc, hitDeep);
  return !!n && hasOutline(n) && enterNodeEdit(hitDeep);
}

/** Select tool: Enter on a single selected path/shape starts node editing. */
export function editSelectedPath(): boolean {
  const id = nodeEditCandidate();
  return !!id && enterNodeEdit(id);
}
