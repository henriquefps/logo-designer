// Node-side renderer for the icon module (@resvg/resvg-js): tests and the `designer icons` CLI. Never imported by the app.
import { deflateSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import type { IconRenderer } from './iconSet';
import type { Rasterize } from './measure';

const render = (svg: string, width: number) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' }).render();

export const resvgRasterize: Rasterize = async (svg, px) => {
  const img = render(svg, px);
  return { data: img.pixels, width: img.width, height: img.height, channels: 4 };
};

export const resvgRenderer: IconRenderer = {
  rasterize: resvgRasterize,
  png: async (svg, size) => new Uint8Array(render(svg, size).asPng()),
  pngAt: async (svg, width) => new Uint8Array(render(svg, width).asPng()),
  deflate: async (data) => new Uint8Array(deflateSync(data)),
};
