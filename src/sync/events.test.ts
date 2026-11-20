import { describe, expect, it, vi } from 'vitest';
import { createSseParser, parseChange, subscribeEvents, type ChangeEvent, type StreamState } from './events';
import { liveEditor } from './live';
import { fakeSyncServer } from './__tests__/fakeServer';

const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('SSE parser', () => {
  it('parses events split across chunks, CRLF, comments and multi-line data', () => {
    const got: [string, string][] = [];
    const activity = vi.fn();
    const feed = createSseParser((n, d) => got.push([n, d]), activity);
    feed('retry: 3000\nevent: rea');
    feed('dy\ndata: {"serverTime":1}\n');
    expect(got).toEqual([]);
    feed('\n: heartbeat\n\nevent: change\r\ndata: a\r\ndata: b\r\n\r\n');
    feed('data:no-space\n\n');
    expect(got).toEqual([
      ['ready', '{"serverTime":1}'],
      ['change', 'a\nb'],
      ['message', 'no-space'],
    ]);
    expect(activity).toHaveBeenCalledTimes(4);
  });

  it('accepts only well-formed change payloads', () => {
    expect(parseChange('{"kind":"projects","id":"a","updatedAt":5}')).toEqual({ kind: 'projects', id: 'a', updatedAt: 5 });
    expect(parseChange('{"kind":"other","id":"a","updatedAt":5}')).toBeNull();
    expect(parseChange('{"kind":"fonts","id":1,"updatedAt":5}')).toBeNull();
    expect(parseChange('nope')).toBeNull();
  });
});

describe('subscribeEvents', () => {
  it('opens, reports changes, reconnects after a drop and stops', async () => {
    const server = fakeSyncServer({ apiKey: 'k' });
    const changes: ChangeEvent[] = [];
    const states: StreamState[] = [];
    let opens = 0;
    const stop = subscribeEvents(
      { url: 'http://sync.test/', apiKey: 'k' },
      { fetch: server.fetch, onChange: (e) => changes.push(e), onOpen: () => opens++, onState: (s) => states.push(s) },
    );
    await until(() => opens === 1);
    server.put('projects', 'p1', { name: 'A', createdAt: 1, updatedAt: 10, deleted: false, data: { x: 1 } });
    await until(() => changes.length === 1);
    expect(changes[0]).toEqual({ kind: 'projects', id: 'p1', updatedAt: 10 });

    server.dropStreams(); // the connection drops: reconnect (after 1 s) and open again, so the caller catches up
    await until(() => opens === 2, 3000);
    expect(states).toContain('connecting');
    expect(states.at(-1)).toBe('open');
    stop();
    expect(states.at(-1)).toBe('closed');
    await until(() => server.openStreams === 0);
  });

  it('marks an older server (no stream) as unsupported and a refused key as auth', async () => {
    const old = fakeSyncServer({ events: false });
    const s1: StreamState[] = [];
    const stop1 = subscribeEvents({ url: 'http://x' }, { fetch: old.fetch, onChange: () => {}, onState: (s) => s1.push(s) });
    await until(() => s1.includes('unsupported'));
    stop1();
    const locked = fakeSyncServer({ apiKey: 'right' });
    const s2: StreamState[] = [];
    const stop2 = subscribeEvents({ url: 'http://x', apiKey: 'wrong' }, { fetch: locked.fetch, onChange: () => {}, onState: (s) => s2.push(s) });
    await until(() => s2.includes('auth'));
    stop2();
    expect(locked.eventRequests).toBe(1); // no hammering: the next try is minutes away
  });

  it('reconnects when the stream goes silent (no heartbeat)', async () => {
    const server = fakeSyncServer();
    let opens = 0;
    const stop = subscribeEvents({ url: 'http://x' }, { fetch: server.fetch, onChange: () => {}, onOpen: () => opens++, idleTimeoutMs: 50 });
    await until(() => opens >= 2, 3000);
    stop();
  });
});

describe('live editor label', () => {
  it('tells the CLI, this device and other devices apart', () => {
    expect(liveEditor('cli', 'dev1')).toBe('cli');
    expect(liveEditor(undefined, 'dev1')).toBe('cli');
    expect(liveEditor('app:dev1', 'dev1')).toBe('this-device');
    expect(liveEditor('app:dev2', 'dev1')).toBe('other-device');
  });
});
