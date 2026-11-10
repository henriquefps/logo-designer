export type SyncView = 'unset' | 'syncing' | 'synced' | 'queued' | 'offline' | 'error';

/** Pure: what the top-bar sync button shows for a sync store state. */
export function syncView(s: { enabled: boolean; url: string; status: string; pending: number }): SyncView {
  if (!s.enabled || !s.url.trim()) return 'unset';
  if (s.status === 'syncing') return 'syncing';
  if (s.status === 'error') return 'error';
  if (s.status === 'offline') return 'offline';
  return s.pending > 0 ? 'queued' : 'synced';
}
