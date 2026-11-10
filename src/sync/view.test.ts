import { describe, expect, it } from 'vitest';
import { syncView } from './view';

const on = { enabled: true, url: 'https://s.example.com', status: 'idle', pending: 0 };
describe('syncView', () => {
  it('maps the sync store to the top-bar state', () => {
    expect(syncView({ ...on, enabled: false })).toBe('unset');
    expect(syncView({ ...on, url: ' ' })).toBe('unset');
    expect(syncView({ ...on, status: 'syncing' })).toBe('syncing');
    expect(syncView({ ...on, status: 'error' })).toBe('error');
    expect(syncView({ ...on, status: 'offline', pending: 2 })).toBe('offline');
    expect(syncView({ ...on, pending: 2 })).toBe('queued');
    expect(syncView(on)).toBe('synced');
  });
});
