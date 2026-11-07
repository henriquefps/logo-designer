import { importFiles, importSvgText, IMAGE_ACCEPT, SVG_ACCEPT } from '@/io/importActions';
import { looksLikeSvg } from '@/io/svgImport';
import type { Importer } from '../types';

/** SVG files and markup become editable nodes; PNG/JPG/WebP become image nodes. */
const importer: Importer = {
  id: 'svg',
  label: 'SVG or image',
  accept: `${SVG_ACCEPT},${IMAGE_ACCEPT}`,
  importFiles: (files) => importFiles(files),
  importText: async (text) => looksLikeSvg(text) && importSvgText(text, 'Pasted SVG'),
};

export default importer;
