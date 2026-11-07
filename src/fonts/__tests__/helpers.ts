/// <reference types="node" />
import { readFileSync } from 'node:fs';

/** Reads a bundled font file as an ArrayBuffer (tests run in node). */
export function fontBytes(file: string): ArrayBuffer {
  const b = readFileSync(new URL(`../files/${file}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
