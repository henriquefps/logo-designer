// Flow and status sections of the export for AI (docs/wireframe-mode.md → Export additions). Pure;
// aiExport.ts wires them in (README_SECTIONS / SCREEN_SECTIONS and the tree writer).
import { findNode, type DesignDocument, type Id, type ScreenStatus, type WireframeFlow } from '@/model';
import type { AiContext, AiScreen } from './aiExport';
import { flowSourceLabel, flowSources, flowsOf } from './flows';
import { getComponent } from './library/registry';
import { frameOf } from './screens';

const clean = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

export const STATUS_TEXT: Record<ScreenStatus, string> = {
  current: 'current (the screen as the app has it today)',
  changed: 'changed (a proposed change to a screen the app already has)',
  new: 'new (a screen the app does not have yet)',
};

/** The source element in words: `"Language" list row`, `text "Hello"`, `"Box"`, `"Arquivos" in the bottom navigation`. */
export function flowSourceText(doc: DesignDocument, id: Id, part?: string): string {
  const n = findNode(doc, id);
  if (!n) return 'an element';
  if (part !== undefined && n.type === 'group' && n.component) {
    const kind = getComponent(n.component.kind)?.label.toLowerCase() ?? n.component.kind;
    return `${JSON.stringify(clean(flowSourceLabel(doc, id, part)))} in the ${kind}`;
  }
  const label = clean(flowSourceLabel(doc, id));
  if (n.type === 'group' && n.component) {
    const kind = getComponent(n.component.kind)?.label.toLowerCase() ?? n.component.kind;
    return label ? `${JSON.stringify(label)} ${kind}` : kind;
  }
  if (n.type === 'text') return `text ${JSON.stringify(label)}`;
  return JSON.stringify(label || n.name);
}

/** "→ opens Language" (with the label when there is one), for the line under the source element. */
export function flowOpensLine(flow: WireframeFlow, screenName: string): string {
  return `→ opens ${screenName}${flow.label ? ` (${JSON.stringify(clean(flow.label))})` : ''}`;
}

interface FlowRow {
  from: AiScreen;
  to: AiScreen;
  source: string;
  /** What the element says (the edge text when the flow has no label). */
  sourceLabel: string;
  label?: string;
}

/** The flows between logical screens, deduplicated across variants (a copied row opens the same screen). */
function flowRows(ctx: AiContext): FlowRow[] {
  const byId = new Map(ctx.screens.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const rows: FlowRow[] = [];
  for (const f of flowsOf(ctx.doc)) {
    for (const id of flowSources(ctx.doc, f)) {
      const frame = frameOf(ctx.doc, id);
      const from = frame && byId.get(frame.screen.screenId);
      const to = byId.get(f.to);
      if (!from || !to) continue;
      if (f.symbol && from.id === to.id) continue; // a shared tab bar's own tab: nothing opens
      const source = flowSourceText(ctx.doc, id, f.part);
      const label = f.label ? clean(f.label) : undefined;
      const key = JSON.stringify([from.id, to.id, source, label]);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ from, to, source, sourceLabel: clean(flowSourceLabel(ctx.doc, id, f.part)), label });
    }
  }
  return rows;
}

const mermaidId = (s: AiScreen) => `s_${s.slug.replace(/-/g, '_')}`;
const mermaidText = (s: string) => s.replace(/"/g, "'").replace(/[|<>]/g, ' ').trim();

/** README → "Flow": the list and a Mermaid flowchart of the logical screens. Nothing without flows. */
export function flowReadmeSection(ctx: AiContext): string[] {
  const rows = flowRows(ctx);
  if (!rows.length) return [];
  const edges = new Set<string>();
  for (const r of rows) {
    const text = mermaidText(r.label ?? r.sourceLabel);
    edges.add(`  ${mermaidId(r.from)} -->${text ? `|"${text}"|` : ''} ${mermaidId(r.to)}`);
  }
  return [
    '## Flow',
    '',
    'What opens what: tapping (or clicking) the element in the first screen opens the second.',
    '',
    ...rows.map((r) => `- ${r.from.name} → ${r.to.name} (from ${r.source})${r.label ? ` — ${JSON.stringify(r.label)}` : ''}`),
    '',
    '```mermaid',
    'flowchart LR',
    ...ctx.screens.map((s) => `  ${mermaidId(s)}["${mermaidText(s.name)}"]`),
    ...edges,
    '```',
    '',
  ];
}

/** Screen file → "Flow": where the screen is opened from (its outgoing flows are listed under their elements). */
export function flowScreenSection(ctx: AiContext, screen: AiScreen): string[] {
  const rows = flowRows(ctx).filter((r) => r.to.id === screen.id && r.from.id !== screen.id);
  if (!rows.length) return [];
  return ['## Opened from', '', ...rows.map((r) => `- ${r.from.name} (${r.source})${r.label ? ` — ${JSON.stringify(r.label)}` : ''}`), ''];
}
