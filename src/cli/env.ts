// Headless environment for the `designer` CLI: a DOMParser for the SVG importer (happy-dom) and a
// fetch that reads bundled font files from disk (catalog URLs are file paths under Bun), so text
// is measured and outlined exactly like in the app. No React, no stores.
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let ready = false;

export async function setupHeadless() {
  if (ready) return;
  ready = true;
  if (typeof globalThis.DOMParser === 'undefined') {
    const { Window } = await import('happy-dom');
    const win = new Window();
    (globalThis as { DOMParser?: unknown }).DOMParser = win.DOMParser;
  }
  const realFetch = globalThis.fetch;
  const fileFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith('file://') ? new URL(url).pathname : url.startsWith('/') ? url : null;
    if (path && /\.(ttf|otf|woff2?)$/i.test(path)) {
      try {
        return new Response(new Uint8Array(await readFile(decodeURIComponent(path))));
      } catch {
        return new Response(null, { status: 404 });
      }
    }
    return realFetch(input, init);
  };
  // In the agent's sandbox (designer agent): bundled font files only, no network at all.
  const { sandboxRoot, sandboxFetch } = await import('./sandbox');
  if (sandboxRoot(process.env)) {
    const fontsDir = realpathSync(fileURLToPath(new URL('../fonts/files', import.meta.url)));
    globalThis.fetch = sandboxFetch(fontsDir, async (p) => new Uint8Array(await readFile(p)));
  } else globalThis.fetch = Object.assign(fileFetch, realFetch) as typeof fetch;
  const { installMeasurer } = await import('@/fonts/measure');
  installMeasurer();
}
