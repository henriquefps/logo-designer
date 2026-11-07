import type { Tool } from './types';

// Every tool lives in its own folder `src/tools/<id>/index.ts` with a default export of type Tool.
// They are discovered at build time, so adding a tool never touches a shared file.
const modules = import.meta.glob<{ default: Tool }>('./*/index.{ts,tsx}', { eager: true });

const GROUP_ORDER: Tool['group'][] = ['select', 'draw', 'shape', 'text', 'paint', 'view'];

const tools: Tool[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.order - b.order);

const byId = new Map(tools.map((t) => [t.id, t]));

export const getTools = (): Tool[] => tools;
export const getTool = (id: string): Tool | undefined => byId.get(id);
export const toolForShortcut = (key: string): Tool | undefined =>
  tools.find((t) => t.shortcut && t.shortcut.toLowerCase() === key.toLowerCase());
