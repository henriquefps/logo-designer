// Types of the wireframe pipeline (see ./pipeline.ts). Separate so steps can import them without a cycle.
import { current, isDraft, type Draft, type Patch } from 'immer';
import type { DesignDocument, Id, SceneNode } from '@/model';

/**
 * - `change`: every document change, including each frame of a gesture (inside a transaction).
 *   Keep these cheap; skip work for nodes that did not change.
 * - `settle`: the change becomes one undo step (`apply` outside a transaction, `commitTransaction`).
 *   `before` is the document before the whole gesture.
 * - `load`: a document is opened or created by code (`useDocStore.load`, the CLI). No `before`:
 *   everything counts as changed.
 */
export type PipelinePhase = 'change' | 'settle' | 'load';

export interface PipelineContext {
  phase: PipelinePhase;
  /** The document before this change (null on `load`). */
  before: DesignDocument | null;
  /** The document this run started from (plain, frozen): cheap to traverse, unlike the draft. */
  input: DesignDocument;
  /** The node with this id before the change, or null (new node, or `load`). */
  previous: (id: Id) => SceneNode | null;
  /**
   * Like `previous`, but against the document where the whole gesture started (the transaction's base).
   * Outside a gesture it is the same as `previous`. For steps whose result must depend on the gesture's
   * total change, not on the last frame's delta.
   */
  atGestureStart: (id: Id) => SceneNode | null;
  /**
   * The settle run at the end of a gesture (`commitTransaction`): `before` is the gesture's base and the input has
   * already been through a `change` run per frame, so a box that differs from `before` may be the layout's doing.
   */
  committing?: boolean;
  /**
   * True when `value` (a node or any part of one, draft or plain) differs from `prev`. Earlier
   * steps' writes count: a draft that a step modified is a change.
   */
  differs: (value: unknown, prev: unknown) => boolean;
}

export interface WireframeStep {
  id: string;
  /** Lower runs first. See the table at the top of this file. */
  order: number;
  /** Phases the step runs in (default: all three). */
  phases?: readonly PipelinePhase[];
  /** Mutates the draft. Must be idempotent: running it twice changes nothing the second time. */
  run: (draft: Draft<DesignDocument>, ctx: PipelineContext) => void;
}

export interface PipelineResult {
  doc: DesignDocument;
  /** Empty when `patches: false` was requested. */
  patches: Patch[];
  inverse: Patch[];
}

/** Snapshot of a draft (the original when untouched), or the value itself. */
export const plain = <T>(v: T): T => (isDraft(v) ? (current(v as Draft<T>) as T) : v);

