# Deploy

Designer is a single Cloudflare Worker named `designer`: static assets (the Vite client build, SPA fallback to `index.html`) plus a tiny entrypoint, `worker/index.ts`. Config lives in `cloudflare.config.ts` (the `cf` CLI; there is no Wrangler config).

- `designer.hfps.dev` → the app (assets).
- `logogo.hfps.dev` → the Worker answers `/sw.js` with a self-unregistering service worker (drops old LogoGo PWA caches and sends open windows to designer.hfps.dev) and 301-redirects every other path to `https://designer.hfps.dev<path+query>`.

`runWorkerFirst: true` is required because assets patterns can't filter by host, so the Worker sees every request and passes non-logogo hosts to `env.ASSETS`.

## Commands

`cf` needs Node >= 22.18 and does not run under Bun; the scripts call it with `node`. Bun stays for install/build/test.

```sh
bun run build       # vite build; writes assets + worker to .cloudflare/output/v0/ (gitignored)
bun run deploy:dry  # build + `cf deploy --dry-run` (no upload, no DNS)
bun run deploy      # build + `cf deploy` (publishes the Worker and both custom domains)
bun run test        # includes worker routing tests (worker/index.test.ts)
```

The Vite config uses `@cloudflare/vite-plugin`; `vite-plugin-pwa` is pointed at `.cloudflare/output/v0/workers/default/assets` so `sw.js` and the precache manifest land in the deployed assets.

Caching: `public/_headers` serves `sw.js`, `registerSW.js`, `index.html`, `/` and `manifest.json` with `no-cache`, and `/assets/*` as immutable.

## One manual step before the first deploy: free `logogo.hfps.dev`

The domain is currently attached to the Pages project `logogo`. A hostname can have only one owner, so remove it from Pages first (this takes logogo.hfps.dev offline until the Worker deploys, so run the deploy right after):

```sh
cf pages domains delete logogo.hfps.dev --project-name logogo          # asks for confirmation
cf pages domains delete logogo.hfps.dev --project-name logogo --dry-run # preview only
```

Then `bun run deploy`. If the DNS record for `logogo.hfps.dev` is a CNAME to `logogo.pages.dev`, the Worker custom-domain attach may need it removed first (cf will say so); the Pages project itself can stay.
