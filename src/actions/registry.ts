import type { Action, MenuId } from './types';

// Each file in ./modules exports `default: Action[]`. Adding a file adds commands; no shared edits.
const modules = import.meta.glob<{ default: Action[] }>('./modules/*.ts', { eager: true });

const actions: Action[] = Object.values(modules).flatMap((m) => m.default ?? []);
const byId = new Map(actions.map((a) => [a.id, a]));

export const getActions = () => actions;
export const getAction = (id: string) => byId.get(id);
export function runAction(id: string) {
  const a = byId.get(id);
  if (a && (a.enabled?.() ?? true)) a.run();
}

export const MENUS: { id: MenuId; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'edit', label: 'Edit' },
  { id: 'object', label: 'Object' },
  { id: 'text', label: 'Text' },
  { id: 'view', label: 'View' },
  { id: 'help', label: 'Help' },
];

export const GROUP_ORDER: Record<string, number> = {};

/** Menu items for a menu, grouped (groups ordered by their lowest item order). */
export function menuGroups(menu: MenuId): Action[][] {
  const items = actions.filter((a) => a.menu === menu && !a.hidden);
  const groups = new Map<string, Action[]>();
  for (const a of items) {
    const g = a.group ?? 'default';
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }
  const ord = (a: Action) => a.order ?? 100;
  return [...groups.values()]
    .map((g) => g.sort((a, b) => ord(a) - ord(b)))
    .sort((a, b) => ord(a[0]) - ord(b[0]));
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const KEY_LABELS: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  delete: 'Del',
  backspace: '⌫',
  escape: 'Esc',
  enter: '↵',
  ' ': 'Space',
};

/** Human label for a shortcut ('mod+shift+z' → '⇧⌘Z' on macOS, 'Ctrl+Shift+Z' elsewhere). */
export function formatShortcut(shortcut: string): string {
  const parts = shortcut.split('+');
  // Support '+' as a key ('mod++' style is avoided; use '=' instead).
  const key = parts.pop()!;
  const mods = new Set(parts);
  const k = KEY_LABELS[key] ?? key.toUpperCase();
  if (isMac) {
    return `${mods.has('ctrl') ? '⌃' : ''}${mods.has('alt') ? '⌥' : ''}${mods.has('shift') ? '⇧' : ''}${mods.has('mod') ? '⌘' : ''}${k}`;
  }
  const out: string[] = [];
  if (mods.has('mod') || mods.has('ctrl')) out.push('Ctrl');
  if (mods.has('alt')) out.push('Alt');
  if (mods.has('shift')) out.push('Shift');
  out.push(k);
  return out.join('+');
}

export const firstShortcut = (a: Action) => (Array.isArray(a.shortcut) ? a.shortcut[0] : a.shortcut);

/** Does the keyboard event match a shortcut string? */
export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+');
  const key = parts.pop()!;
  const mods = new Set(parts);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mods.has('mod') !== mod) return false;
  if (mods.has('shift') !== e.shiftKey) return false;
  if (mods.has('alt') !== e.altKey) return false;
  if (isMac && mods.has('ctrl') !== e.ctrlKey) return false;
  const k = e.key.toLowerCase();
  if (k === key) return true;
  // Shift changes e.key for symbols/letters; compare by code as a fallback.
  const code = e.code.toLowerCase();
  if (code === `key${key}` || code === `digit${key}`) return true;
  const codeMap: Record<string, string> = { ']': 'bracketright', '[': 'bracketleft', '=': 'equal', '-': 'minus', '\\': 'backslash', "'": 'quote' };
  return codeMap[key] === code;
}

export function actionForEvent(e: KeyboardEvent): Action | undefined {
  for (const a of actions) {
    const list = Array.isArray(a.shortcut) ? a.shortcut : a.shortcut ? [a.shortcut] : [];
    if (list.some((s) => matchShortcut(e, s))) return a;
  }
  return undefined;
}
