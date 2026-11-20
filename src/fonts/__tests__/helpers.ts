/// <reference types="node" />
import { readFileSync } from 'node:fs';

/** Reads a bundled font file as an ArrayBuffer (tests run in node). */
export function fontBytes(file: string): ArrayBuffer {
  const b = readFileSync(new URL(`../files/${file}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Serves the bundled font files to the font store (its catalog URLs are Vite asset paths under Vitest). */
export function installFontFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const m = /([^/?]+\.ttf)(\?.*)?$/.exec(url);
    return m ? new Response(new Uint8Array(readFileSync(new URL(`../files/${m[1]}`, import.meta.url)))) : real(input, init);
  }, real) as typeof fetch;
}
