import type { Icon } from '@phosphor-icons/react';

export type MenuId = 'file' | 'edit' | 'object' | 'text' | 'view' | 'help';

/**
 * A command: shown in a menu (optional), bound to a shortcut (optional), callable from anywhere.
 * Shortcut syntax: modifiers joined by '+', `mod` = Cmd on macOS / Ctrl elsewhere, e.g.
 * 'mod+z', 'mod+shift+z', 'shift+o', 'delete', 'arrowleft', 'mod+]'. Key names follow KeyboardEvent.key (lowercase).
 */
export interface Action {
  id: string;
  label: string;
  menu?: MenuId;
  /** Items with the same group are kept together; groups are separated by a divider. */
  group?: string;
  order?: number;
  /** Render inside a submenu with this label (e.g. 'Arrange'). */
  submenu?: string;
  shortcut?: string | string[];
  icon?: Icon;
  /** Shortcut works even when focus is in a text field (rare: e.g. mod+s). */
  allowInInput?: boolean;
  /** Hide from menus (shortcut-only actions such as arrow nudges). */
  hidden?: boolean;
  /** Shown in the shortcuts dialog under this section (defaults to the menu name). */
  section?: string;
  enabled?: () => boolean;
  checked?: () => boolean;
  run: () => void;
}
