import { createId } from '@/lib/id';
import { DEFAULT_CANVAS_SETTINGS, type CanvasSettings } from '@/types/canvas';
import type { LogoElement } from '@/types/element';
import type { Project } from '@/types/project';

const LEGACY_SETTINGS_KEY = 'logogo_canvas_settings';
const LEGACY_ELEMENTS_KEY = 'logogo_elements';

/**
 * One-time migration from LogoGo v1's flat two-key localStorage scheme
 * (a single autosaved canvas) into a v2 named Project. Removes the legacy
 * keys once migrated so this only ever runs once per browser.
 */
export function migrateLegacyStorage(): Project | null {
  const rawSettings = localStorage.getItem(LEGACY_SETTINGS_KEY);
  const rawElements = localStorage.getItem(LEGACY_ELEMENTS_KEY);

  if (!rawSettings && !rawElements) return null;

  let canvasSettings: CanvasSettings = DEFAULT_CANVAS_SETTINGS;
  let elements: LogoElement[] = [];

  try {
    if (rawSettings) canvasSettings = { ...DEFAULT_CANVAS_SETTINGS, ...JSON.parse(rawSettings) };
    if (rawElements) elements = JSON.parse(rawElements);
  } catch {
    // Corrupt legacy data — fall back to defaults rather than blocking startup.
  }

  localStorage.removeItem(LEGACY_SETTINGS_KEY);
  localStorage.removeItem(LEGACY_ELEMENTS_KEY);

  const now = Date.now();
  return {
    id: createId(),
    name: 'My Logo',
    createdAt: now,
    updatedAt: now,
    canvasSettings,
    elements,
  };
}
