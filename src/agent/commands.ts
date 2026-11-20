// The four entry points (docs/wireframe-mode.md → Phase 4 → The app). Each opens the agent job dialog with what it
// is about; the dialog's Send builds the job here.
import { create } from 'zustand';
import { isScreenNode, type Id, type ScreenPlatform, type Vec } from '@/model';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { imageFileToDataUrl } from '@/io/importActions';
import { flowSource, flowSourceLabel, newScreenFromFlow } from '@/wireframe/flows';
import { frameOf, frames } from '@/wireframe/screens';
import type { FlowMenu } from '@/wireframe/flowCommands';
import { sendJob } from './send';
import type { AppJob as Job } from './jobs';

export type AgentRequest =
  | { kind: 'screenshot'; file: File; at?: Vec }
  | { kind: 'next-screen'; menu: FlowMenu; shared?: boolean }
  | { kind: 'adapt'; frameId: Id; to: ScreenPlatform }
  | { kind: 'request' };

/** What the agent dialog is open for. */
export const useAgentRequest = create<{ request: AgentRequest | null }>()(() => ({ request: null }));

export function openAgentDialog(request: AgentRequest) {
  useAgentRequest.setState({ request });
  useEditorStore.getState().openDialog('agentJob');
}

const clean = (s: string | undefined) => {
  const t = s?.trim();
  return t ? { hint: t } : {};
};

/** A guess for a screenshot's platform: wide images are desktop, squarish ones tablet. */
export function guessPlatform(width: number, height: number): ScreenPlatform {
  const r = width / Math.max(1, height);
  if (r >= 1.25) return 'desktop';
  if (r >= 0.68) return 'tablet';
  return 'phone';
}

/** 1. A pasted or dropped screenshot → a wireframe. */
export async function sendScreenshot(file: File, opts: { platform: ScreenPlatform; name?: string; hint?: string }): Promise<Job | null> {
  const { href } = await imageFileToDataUrl(file);
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(href);
  if (!m) throw new Error('Could not read the image.');
  const ext = m[1] === 'image/jpeg' ? 'jpg' : m[1].split('/')[1] || 'png';
  const name = opts.name?.trim();
  return sendJob({
    type: 'screenshot',
    input: { platform: opts.platform, ...(name ? { name } : {}), ...clean(opts.hint) },
    attachments: [{ name: `screenshot.${ext}`, mime: m[1], dataBase64: m[2] }],
  });
}

/**
 * 2. The flow drop menu's "Generate with AI": the target screen and frame are made now (empty, named after the
 * label, linked) and the agent fills it. The new screen stays when sending fails (Edit → Undo removes it).
 */
export async function sendNextScreen(menu: FlowMenu, opts: { shared?: boolean; hint?: string } = {}): Promise<Job | null> {
  const ds = useDocStore.getState();
  const doc = ds.doc;
  const source = flowSource(doc, menu.fromId);
  const from = source ? frameOf(doc, source) : null;
  if (!source || !from) return null;
  const label = flowSourceLabel(doc, source, menu.part).slice(0, 60) || 'New screen';
  const part = menu.part !== undefined ? { part: menu.part } : {};
  let made: { frameId: Id; screenId: Id } | null = null;
  ds.apply((d) => void (made = newScreenFromFlow(d, menu.fromId, menu.point, { ...part, ...(opts.shared !== undefined ? { shared: opts.shared } : {}) })), {
    label: 'New screen from flow (AI)',
  });
  const created = made as { frameId: Id; screenId: Id } | null;
  if (!created) return null;
  useEditorStore.getState().setSelection([created.frameId]);
  const frame = frames(useDocStore.getState().doc).find((f) => f.id === created.frameId);
  return sendJob({
    type: 'next-screen',
    screenId: created.screenId,
    frameId: created.frameId,
    input: {
      fromScreenId: from.screen.screenId,
      fromNodeId: source,
      ...(menu.part !== undefined ? { fromPart: menu.part } : {}),
      label: frame?.name ?? label,
      platform: from.screen.platform,
      ...clean(opts.hint),
      at: { x: Math.round(menu.point.x), y: Math.round(menu.point.y) },
    },
  });
}

/** 3. Screen section → "Adapt to tablet / desktop with AI". */
export async function sendAdapt(frameId: Id, to: ScreenPlatform, opts: { hint?: string } = {}): Promise<Job | null> {
  const frame = useDocStore.getState().doc.children.find((n) => n.id === frameId);
  if (!frame || !isScreenNode(frame)) return null;
  return sendJob({
    type: 'adapt',
    screenId: frame.screen.screenId,
    frameId,
    input: { screenId: frame.screen.screenId, fromPlatform: frame.screen.platform, toPlatform: to, ...clean(opts.hint) },
  });
}

/** 4. "Ask the agent…": a free request about the whole project. */
export async function sendRequest(text: string): Promise<Job | null> {
  const t = text.trim();
  if (!t) return null;
  return sendJob({ type: 'request', input: { text: t } });
}
