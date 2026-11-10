// Pure helpers for `designer open` / `designer present`: picking the OS opener and building the
// gallery page. No I/O here so they can be tested; the wiring is in main.ts.

/** CORS + Private Network Access headers for the local servers (`serve`, `present`). */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'no-store',
};

export interface Opener {
  command: string;
  args: string[];
}

/**
 * The command that opens `url` in the default browser, or null when this environment has no GUI
 * opener (Linux without DISPLAY/WAYLAND_DISPLAY, e.g. over SSH). On macOS `open` works over SSH
 * too (it opens on that Mac's desktop). `url` is passed as a single argument, never via a shell.
 */
export function pickOpener(platform: string, env: Record<string, string | undefined>, url: string): Opener | null {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  if (env.DISPLAY || env.WAYLAND_DISPLAY) return { command: 'xdg-open', args: [url] };
  return null;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface GalleryItem {
  name: string;
  width: number;
  height: number;
  /** Same-origin URL of the SVG preview image. */
  previewUrl: string;
  /** `?import=` link into Designer (short: it only carries the file's localhost URL). */
  importLink: string;
}

const fmtNum = (n: number) => String(Math.round(n * 100) / 100);

/** The gallery page: one card per file. Self-contained (no external requests), light/dark. */
export function galleryHtml(items: GalleryItem[]): string {
  const cards = items
    .map(
      (it) => `    <article class="card">
      <div class="thumb"><img src="${escapeHtml(it.previewUrl)}" alt="${escapeHtml(it.name)}"></div>
      <h2>${escapeHtml(it.name)}</h2>
      <p>${fmtNum(it.width)} × ${fmtNum(it.height)} px</p>
      <a class="btn" href="${escapeHtml(it.importLink)}" target="_blank" rel="noopener">Open in Designer</a>
    </article>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>Designer — ${items.length} ${items.length === 1 ? 'file' : 'files'}</title>
<style>
  :root { --bg: #f6f8fb; --fg: #0f1b2d; --muted: #5b6b82; --card: #ffffff; --border: #d9e1ec; --blue: #2f6fb5; --blue-fg: #ffffff; --check: #e6ebf2; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0e1522; --fg: #e8eef7; --muted: #93a3ba; --card: #162033; --border: #26344d; --blue: #5b9be0; --blue-fg: #0b1220; --check: #1f2b42; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 20px; background: var(--bg); color: var(--fg); font: 15px/1.45 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { max-width: 1100px; margin: 0 auto 24px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  header p { margin: 0; color: var(--muted); }
  main { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
  .thumb { aspect-ratio: 1; border-radius: 8px; display: grid; place-items: center; padding: 8px;
    background: conic-gradient(var(--check) 25%, transparent 0 50%, var(--check) 0 75%, transparent 0) 0 0 / 16px 16px; }
  .thumb img { max-width: 100%; max-height: 100%; }
  h2 { margin: 6px 0 0; font-size: 16px; overflow-wrap: anywhere; }
  .card p { margin: 0; color: var(--muted); font-size: 13px; }
  .btn { margin-top: 6px; text-align: center; text-decoration: none; background: var(--blue); color: var(--blue-fg); font-weight: 600; padding: 9px 12px; border-radius: 8px; }
  .btn:hover { filter: brightness(1.08); }
  .btn:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
</style>
</head>
<body>
  <header>
    <h1>Designer</h1>
    <p>${items.length} ${items.length === 1 ? 'file' : 'files'} ready. “Open in Designer” asks you to confirm the import in the app.</p>
  </header>
  <main>
${cards}
  </main>
</body>
</html>
`;
}
