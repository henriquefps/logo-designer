import { afterEach, describe, expect, it, vi } from 'vitest';
import { getItem, listItems, normalizeServerUrl, putItem, SyncError } from './api';
import { base64ToBytes, bytesToBase64 } from './base64';

const conn = { url: 'http://192.168.1.10:3051/', apiKey: ' k ' };
const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('normalizes the address', () => {
    expect(normalizeServerUrl(' https://sync.example.com// ')).toBe('https://sync.example.com');
  });

  it('lists with the bearer key and no body', async () => {
    const f = respond(200, { items: [{ id: 'a' }] });
    vi.stubGlobal('fetch', f);
    expect(await listItems(conn, 'projects')).toEqual([{ id: 'a' }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://192.168.1.10:3051/api/projects');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(init.body).toBeUndefined();
  });

  it('puts JSON and encodes the id', async () => {
    const f = respond(200, { applied: true, item: { id: 'a b' } });
    vi.stubGlobal('fetch', f);
    await putItem({ url: 'http://x' }, 'fonts', 'a b', { name: 'n', createdAt: 1, updatedAt: 2, deleted: false, data: { q: 1 } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/fonts/a%20b');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string).updatedAt).toBe(2);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it.each([
    [401, 'auth'],
    [413, 'rejected'],
    [500, 'server'],
    [400, 'rejected'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    vi.stubGlobal('fetch', respond(status, { error: 'nope' }));
    await expect(getItem(conn, 'projects', 'a')).rejects.toMatchObject({ kind });
  });

  it('reports an unreachable server as offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const e = await listItems(conn, 'projects').catch((x) => x);
    expect(e).toBeInstanceOf(SyncError);
    expect(e.kind).toBe('offline');
  });

  it('refuses a response that is not the sync server', async () => {
    vi.stubGlobal('fetch', respond(200, { hello: 'world' }));
    await expect(listItems(conn, 'projects')).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('base64', () => {
  it('round-trips bytes, including big buffers', () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    expect(new Uint8Array(base64ToBytes(bytesToBase64(big.buffer)))).toEqual(big);
  });
});
