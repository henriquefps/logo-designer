// Live editing (docs/sync.md → Live editing): a project carrying `live` is being edited by an agent through
// `designer live`, so edits travel within about a second instead of on the 2 s + 30 s rhythm.

/** Autosave delay for a live project (a normal one waits 600 ms). */
export const LIVE_AUTOSAVE_DELAY = 200;
/** Push delay after a live project's autosave (a normal one waits 2 s): ≈ 500 ms from the edit to the server. */
export const LIVE_PUSH_DELAY = 300;

export const CLI_EDITOR = 'cli';
export const appEditor = (device: string) => `app:${device}`;

export type LiveEditor = 'this-device' | 'other-device' | 'cli';

/** Pure: who `editedBy` names, seen from this device. */
export function liveEditor(editedBy: string | undefined, device: string): LiveEditor {
  if (!editedBy || editedBy === CLI_EDITOR || !editedBy.startsWith('app:')) return 'cli';
  return editedBy === appEditor(device) ? 'this-device' : 'other-device';
}

export const LIVE_EDITOR_LABEL: Record<LiveEditor, string> = {
  'this-device': 'this device',
  'other-device': 'another device',
  cli: 'the CLI',
};
