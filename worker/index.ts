// Routing for the `designer` Worker. Static assets are served by the assets binding;
// this runs first only to retire the old LogoGo host (logogo.hfps.dev).

export const NEW_ORIGIN = 'https://designer.hfps.dev';
export const OLD_HOST = 'logogo.hfps.dev';

// Served at logogo.hfps.dev/sw.js so existing LogoGo PWA installs drop their caches
// and navigate their open windows to the new origin.
export const KILL_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(${JSON.stringify(NEW_ORIGIN + '/')}); } catch {}
    }
  })());
});
`;

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== OLD_HOST) return env.ASSETS.fetch(request);

  if (url.pathname === '/sw.js') {
    return new Response(KILL_SW, {
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
  return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};
