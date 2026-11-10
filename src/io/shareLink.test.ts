// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createDocument, createRect } from '@/model';
import { serializeProject } from './projectFile';
import {
  buildImportLink,
  buildOpenLink,
  decodePayload,
  encodePayload,
  fromBase64Url,
  nameFromPath,
  payloadToDocument,
  readLaunchRequest,
  resolveLaunchRequest,
  toBase64Url,
  withoutLaunchRequest,
} from './shareLink';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="40" fill="#ff0000"/></svg>';

describe('share links', () => {
  it('base64url round-trips any bytes without padding or +/', () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
    const s = toBase64Url(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(fromBase64Url(s)).toEqual(bytes);
  });

  it('compresses and restores text (unicode included)', async () => {
    const text = serializeProject(createDocument({ name: 'Ícone ✓', children: [createRect(), createRect()] }));
    const data = await encodePayload(text);
    expect(data.length).toBeLessThan(text.length);
    expect(await decodePayload(data)).toBe(text);
  });

  it('builds #open links that the app reads back', async () => {
    const link = await buildOpenLink(SVG, { name: 'Glyph mark' });
    expect(link.startsWith('https://designer.hfps.dev/#open=')).toBe(true);
    const req = readLaunchRequest(link);
    expect(req).toMatchObject({ kind: 'data', name: 'Glyph mark' });
    const shared = await resolveLaunchRequest(req!);
    expect(shared.source).toBe('svg');
    expect(shared.doc.name).toBe('Glyph mark');
    expect(shared.doc.artboard.width).toBe(128);
    expect(shared.doc.children[0].type).toBe('ellipse');
    expect(withoutLaunchRequest(link)).toBe('https://designer.hfps.dev/');
  });

  it('builds ?import links and strips them afterwards', () => {
    const link = buildImportLink('http://localhost:8765/glyph.designer.json', { origin: 'http://localhost:5173/' });
    expect(link).toBe('http://localhost:5173/?import=http%3A%2F%2Flocalhost%3A8765%2Fglyph.designer.json');
    expect(readLaunchRequest(link)).toEqual({ kind: 'url', url: 'http://localhost:8765/glyph.designer.json' });
    expect(withoutLaunchRequest(link + '#x=1')).toBe('http://localhost:5173/#x=1');
    expect(readLaunchRequest('https://designer.hfps.dev/')).toBeNull();
  });

  it('reports truncated links clearly', async () => {
    const data = await encodePayload(serializeProject(createDocument({ children: [createRect()] })));
    await expect(decodePayload(data.slice(0, data.length / 2))).rejects.toThrow(/incomplete or damaged/);
    await expect(decodePayload('abc$%')).rejects.toThrow(/damaged/);
  });

  it('detects project JSON vs SVG payloads', () => {
    const doc = createDocument({ name: 'Mark', children: [createRect()] });
    expect(payloadToDocument(serializeProject(doc))).toMatchObject({ source: 'project', doc: { name: 'Mark' } });
    expect(payloadToDocument(SVG, 'x').source).toBe('svg');
    expect(() => payloadToDocument('hello')).toThrow(/neither/);
  });

  it('fetches ?import URLs and names SVGs after the file', async () => {
    const fetcher = (async (url: string) => {
      if (url.endsWith('missing.svg')) return new Response('nope', { status: 404 });
      if (url.includes('blocked')) throw new TypeError('Failed to fetch');
      return new Response(SVG);
    }) as unknown as typeof fetch;
    const r = await resolveLaunchRequest({ kind: 'url', url: 'https://raw.githubusercontent.com/a/b/main/scripts/glyph.svg' }, fetcher);
    expect(r.doc.name).toBe('glyph');
    expect(r.from).toBe('raw.githubusercontent.com/a/b/main/scripts/glyph.svg');
    await expect(resolveLaunchRequest({ kind: 'url', url: 'https://x.dev/missing.svg' }, fetcher)).rejects.toThrow(/HTTP 404/);
    await expect(resolveLaunchRequest({ kind: 'url', url: 'https://blocked.dev/a.svg' }, fetcher)).rejects.toThrow(/cross-origin/);
    await expect(resolveLaunchRequest({ kind: 'url', url: 'file:///etc/passwd' }, fetcher)).rejects.toThrow(/http/);
  });

  it('names from paths', () => {
    expect(nameFromPath('/scripts/glyph.designer.json')).toBe('glyph');
    expect(nameFromPath('/a/My%20Logo.svg?x=1')).toBe('My Logo');
  });
});
