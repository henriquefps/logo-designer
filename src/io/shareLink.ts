// Open-by-link: a project (or SVG) travels inside the URL so an agent can hand Henrique a link.
//   https://designer.hfps.dev/#open=<data>[&name=<name>]   data = base64url(deflate-raw(text))
//   https://designer.hfps.dev/?import=<url>                fetched (CORS) .designer.json or .svg
// Pure (CompressionStream, fetch): shared by the app and the `designer` CLI. See docs/agents.md.
import type { DesignDocument } from '@/model';
import { validateDocument } from './projectFile';
import { svgToDocument } from './svgDocument';
import { looksLikeSvg } from './svgImport';

export const APP_ORIGIN = 'https://designer.hfps.dev';
/** Links longer than this may be cut by chat apps / mail clients; the CLI warns. */
export const LINK_WARN_LENGTH = 64 * 1024;
/** Chrome's URL limit (2 MB). Longer links are refused: use `?import=<url>`. */
export const LINK_MAX_LENGTH = 2 * 1024 * 1024;
/** Decompressed / fetched payloads above this are refused (guards against zip bombs). */
export const PAYLOAD_MAX_BYTES = 32 * 1024 * 1024;

// ---------- base64url ----------

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const clean = s.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean)) throw new Error('The link is damaged (it has characters a Designer link never has).');
  const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- deflate-raw ----------

async function readAll(stream: ReadableStream<Uint8Array>, limit = Infinity): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error(`The shared content is larger than ${Math.round(limit / 1024 / 1024)} MB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const through = (bytes: Uint8Array, t: CompressionStream | DecompressionStream, limit?: number) =>
  readAll(new Blob([bytes as BlobPart]).stream().pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>), limit);

/** text → deflate-raw → base64url. */
export async function encodePayload(text: string): Promise<string> {
  return toBase64Url(await through(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
}

/** base64url → inflate-raw → text. Throws a readable error for damaged or truncated links. */
export async function decodePayload(data: string): Promise<string> {
  const bytes = fromBase64Url(data);
  try {
    return new TextDecoder().decode(await through(bytes, new DecompressionStream('deflate-raw'), PAYLOAD_MAX_BYTES));
  } catch (e) {
    if (e instanceof Error && /larger than/.test(e.message)) throw e;
    throw new Error('The link is incomplete or damaged (it may have been cut when it was copied). Ask for a new link, or use an ?import= link.', { cause: e });
  }
}

// ---------- links ----------

const trimOrigin = (origin: string) => origin.replace(/\/+$/, '');

/** `#open=` link for a project JSON or SVG text. `name` names an SVG project (JSON carries its own). */
export async function buildOpenLink(text: string, opts: { origin?: string; name?: string } = {}): Promise<string> {
  const data = await encodePayload(text);
  const name = opts.name ? `&name=${encodeURIComponent(opts.name)}` : '';
  return `${trimOrigin(opts.origin ?? APP_ORIGIN)}/#open=${data}${name}`;
}

/** `?import=` link that makes the app fetch `url` (needs CORS on that server). */
export function buildImportLink(url: string, opts: { origin?: string } = {}): string {
  return `${trimOrigin(opts.origin ?? APP_ORIGIN)}/?import=${encodeURIComponent(url)}`;
}

export type LaunchRequest = { kind: 'data'; data: string; name?: string } | { kind: 'url'; url: string };

/** Reads an open/import request from a page URL; null when there is none. */
export function readLaunchRequest(href: string): LaunchRequest | null {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const data = hash.get('open');
  if (data) return { kind: 'data', data, ...(hash.get('name') ? { name: hash.get('name')! } : {}) };
  const imp = url.searchParams.get('import');
  if (imp) return { kind: 'url', url: imp };
  return null;
}

/** The page URL without the open/import request (for history.replaceState). */
export function withoutLaunchRequest(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('import');
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  hash.delete('open');
  hash.delete('name');
  const rest = hash.toString();
  url.hash = rest ? `#${rest}` : '';
  return url.toString().replace(/#$/, '');
}

// ---------- payload → document ----------

export interface SharedDocument {
  doc: DesignDocument;
  source: 'project' | 'svg';
  warnings: string[];
}

/** Base name of a URL or path (`…/glyph.designer.json` → `glyph`). */
export function nameFromPath(path: string): string {
  const last = decodeURIComponent(path.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? '');
  return last.replace(/\.designer\.json$/i, '').replace(/\.(json|svg)$/i, '') || 'Shared';
}

/** Project JSON or SVG text → a validated document. */
export function payloadToDocument(text: string, name = 'Shared'): SharedDocument {
  const t = text.trim();
  if (t.startsWith('<') || looksLikeSvg(t)) {
    const { doc, warnings } = svgToDocument(t, name);
    return { doc, source: 'svg', warnings };
  }
  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch {
    throw new Error('The shared content is neither a Designer project (JSON) nor an SVG.');
  }
  return { doc: validateDocument(data), source: 'project', warnings: [] };
}

/** Resolves a launch request into a document: decodes `#open=` data or fetches `?import=`. */
export async function resolveLaunchRequest(req: LaunchRequest, fetcher: typeof fetch = fetch): Promise<SharedDocument & { from: string }> {
  if (req.kind === 'data') {
    const text = await decodePayload(req.data);
    return { ...payloadToDocument(text, req.name || 'Shared'), from: 'a shared link' };
  }
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    throw new Error(`“${req.url}” is not a valid URL.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) URLs can be imported.');
  let res: Response;
  try {
    res = await fetcher(url.toString());
  } catch (e) {
    throw new Error(
      `Could not download ${url.host}${url.pathname}. The server must allow cross-origin requests (raw.githubusercontent.com does; a local server needs Access-Control-Allow-Origin: *, e.g. \`designer serve\`).`,
      { cause: e },
    );
  }
  if (!res.ok) throw new Error(`Could not download ${url.host}${url.pathname} (HTTP ${res.status}).`);
  const bytes = res.body ? await readAll(res.body, PAYLOAD_MAX_BYTES) : new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  return { ...payloadToDocument(text, nameFromPath(url.pathname)), from: url.host + url.pathname };
}
