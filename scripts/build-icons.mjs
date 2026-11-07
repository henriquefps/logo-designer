#!/usr/bin/env node
// Builds a repository's icon set from one glyph file, in the hfps app-icon style
// (viewBox 128, rx 28, brand color, white glyph; ICON_COLOR overrides).
//
//   node build-icons.mjs <glyph.svg> <docs-img-dir> [--site <dir>] [--sheet <preview.png>]
//
//   glyph.svg   SVG fragment drawn inside a 128 box, using `currentColor`
//               (see glyph-olmapkit.svg). Inner box is 100 x 100: the script
//               places it with translate(14 14) scale(0.78125).
//   docs-img-dir   gets icon.svg, icon-light.svg, icon.png (1024)
//   --site <dir>   also writes icon.svg, favicon.ico (16/32/48), apple-touch-icon.png (180),
//                  icon-192.png, icon-512.png there (a demo or docs site root)
//   --sheet <png>  scratch preview of the icon at 16/32/64/128 px, to check small sizes
//
// Needs the `sharp` package: `npm i --no-save sharp` in a scratch folder, then run with
// NODE_PATH=<that folder>/node_modules, or run it from a repo that already has it.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// ESM imports ignore NODE_PATH, so load sharp through require: from NODE_PATH or this
// script's folders first, then from the node_modules of the folder the script runs in.
const sharp = (() => {
  for (const base of [import.meta.url, pathToFileURL(resolve('package.json')).href]) {
    try { return createRequire(base)('sharp'); } catch {}
  }
  console.error('sharp not found: run `npm i --no-save sharp` in the repo, or set NODE_PATH to a folder that has it');
  process.exit(1);
})();

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const site = flag('--site');
const sheet = flag('--sheet');
const [glyphPath, docsDir] = args;
if (!glyphPath || !docsDir) {
  console.error('usage: node build-icons.mjs <glyph.svg> <docs-img-dir> [--site <dir>] [--sheet <preview.png>]');
  process.exit(1);
}

// Designer uses the blue palette (theme-color), not the default olive.
const GREEN = process.env.ICON_COLOR ?? '#2f6fb5';
const glyphSrc = (await readFile(glyphPath, 'utf8')).replace(/<!--[\s\S]*?-->/g, '').trim();
const glyph = (c) => `<g transform="translate(14 14) scale(0.78125)">\n${glyphSrc.replaceAll('currentColor', c)}\n</g>`;
const svg = (bg, c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512">${bg}${glyph(c)}</svg>`;

const dark = svg(`<rect width="128" height="128" rx="28" fill="${GREEN}"/>`, '#fff');
const light = svg(`<rect x="1" y="1" width="126" height="126" rx="27" fill="#fff" stroke="#d3d4cb" stroke-width="2"/>`, GREEN);

const render = (source, size) =>
  sharp(Buffer.from(source), { density: (72 * size * 2) / 512 }).resize(size, size).png().toBuffer();
const out = (dir, name) => new URL(name, pathToFileURL(resolve(dir) + '/'));

await mkdir(docsDir, { recursive: true });
await writeFile(out(docsDir, 'icon.svg'), dark);
await writeFile(out(docsDir, 'icon-light.svg'), light);
await writeFile(out(docsDir, 'icon.png'), await render(dark, 1024));

if (site) {
  await mkdir(site, { recursive: true });
  await writeFile(out(site, 'icon.svg'), dark);
  // iOS fills transparency with black, so the apple-touch-icon is the full square.
  await writeFile(out(site, 'apple-touch-icon.png'), await render(dark.replace('rx="28"', 'rx="0"'), 180));
  await writeFile(out(site, 'icon-192.png'), await render(dark, 192));
  await writeFile(out(site, 'icon-512.png'), await render(dark, 512));

  // favicon.ico: PNG-compressed entries at 16, 32 and 48 px
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((s) => render(dark, s)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = pngs.map((png, i) => {
    const e = Buffer.alloc(16);
    e[0] = sizes[i];
    e[1] = sizes[i];
    e.writeUInt16LE(1, 4);  // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  await writeFile(out(site, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));
}

if (sheet) {
  const sizes = [16, 32, 64, 128];
  const tiles = await Promise.all(sizes.map((s) => render(dark, s)));
  let x = 8;
  await sharp({ create: { width: 260, height: 140, channels: 4, background: '#fff' } })
    .composite(tiles.map((input, i) => { const left = x; x += sizes[i] + 12; return { input, left, top: 6 }; }))
    .png().toFile(sheet);
}
console.log(`Icons written to ${docsDir}${site ? ' and ' + site : ''}`);
