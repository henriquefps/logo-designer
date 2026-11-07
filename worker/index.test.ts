import { describe, expect, it, vi } from 'vitest';
import { handle } from './index';

const env = () => ({ ASSETS: { fetch: vi.fn(async () => new Response('asset')) } });

describe('worker routing', () => {
  it('serves assets for designer.hfps.dev', async () => {
    const e = env();
    const res = await handle(new Request('https://designer.hfps.dev/foo?x=1'), e);
    expect(await res.text()).toBe('asset');
    expect(e.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  it('serves the real sw.js from assets on the new host', async () => {
    const e = env();
    await handle(new Request('https://designer.hfps.dev/sw.js'), e);
    expect(e.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  it('redirects the old host keeping path and query with 301', async () => {
    const e = env();
    const res = await handle(new Request('https://logogo.hfps.dev/a/b?c=d'), e);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://designer.hfps.dev/a/b?c=d');
    expect(e.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('redirects the old root', async () => {
    const res = await handle(new Request('https://logogo.hfps.dev/'), env());
    expect(res.headers.get('location')).toBe('https://designer.hfps.dev/');
  });

  it('serves a self-unregistering service worker on the old host', async () => {
    const e = env();
    const res = await handle(new Request('https://logogo.hfps.dev/sw.js'), e);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    const body = await res.text();
    expect(body).toContain('registration.unregister()');
    expect(body).toContain('caches.delete');
    expect(body).toContain('clients.matchAll');
    expect(body).toContain('https://designer.hfps.dev/');
    expect(e.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
