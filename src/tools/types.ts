import type { Icon } from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import type { DesignDocument, Id, Vec } from '@/model';
import type { DocState } from '@/store/useDocStore';
import type { EditorState } from '@/store/useEditorStore';

/** Pointer event delivered to tools, already converted to document coordinates. */
export interface ToolPointerEvent {
  /** Document (world) coordinates. */
  point: Vec;
  /** Canvas-viewport pixel coordinates. */
  screen: Vec;
  shift: boolean;
  alt: boolean;
  /** Cmd on macOS, Ctrl elsewhere. */
  mod: boolean;
  button: number;
  pointerType: string;
  pointerId: number;
  /** 0..1 (stylus pressure; 0.5 for a pressed mouse). */
  pressure: number;
  /** Click count (2 = double click) for pointerdown. */
  detail: number;
  /** True while a button/finger is down. */
  pressed: boolean;
}

/** Helpers handed to every tool callback. Read stores lazily: state changes during a gesture. */
export interface ToolContext {
  doc: () => DesignDocument;
  docStore: () => DocState;
  editor: () => EditorState;
  /** World units per screen pixel (1 / zoom). */
  px: () => number;
  /** Topmost node under a document point (root-level unless deep). */
  hitTest: (point: Vec, opts?: { deep?: boolean; tolerancePx?: number }) => Id | null;
  /** Switches to another tool by id. */
  setTool: (id: string) => void;
}

export interface Tool {
  id: string;
  label: string;
  /** Single key (e.g. 'v', 'm', '\\') shown in tooltips and handled globally. */
  shortcut?: string;
  icon: Icon;
  /** CSS cursor when the tool is idle (tools can call editor().setCursor for dynamic cursors). */
  cursor: string;
  /** Toolbar placement: lower orders first; tools with the same group sit together. */
  group: 'select' | 'draw' | 'shape' | 'text' | 'paint' | 'view';
  order: number;
  /** One-line hint for the options bar when the tool has no Options component. */
  hint?: string;
  /** Hidden tools are registered (shortcut works) but not shown in the toolbar. */
  hidden?: boolean;

  onActivate?: (ctx: ToolContext) => void;
  onDeactivate?: (ctx: ToolContext) => void;
  onPointerDown?: (e: ToolPointerEvent, ctx: ToolContext) => void;
  /** Called for hover (pressed=false) and drags (pressed=true). */
  onPointerMove?: (e: ToolPointerEvent, ctx: ToolContext) => void;
  onPointerUp?: (e: ToolPointerEvent, ctx: ToolContext) => void;
  /** Gesture interrupted (pinch started, Escape, tool switch). */
  onCancel?: (ctx: ToolContext) => void;
  /** Return true when handled (stops global shortcuts). */
  onKeyDown?: (e: KeyboardEvent, ctx: ToolContext) => boolean;
  onKeyUp?: (e: KeyboardEvent, ctx: ToolContext) => void;
  /** Rendered inside the canvas overlay <svg> (screen pixel coordinates). */
  Overlay?: ComponentType;
  /** Rendered in the options bar. */
  Options?: ComponentType;
}
