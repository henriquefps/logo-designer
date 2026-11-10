import type { Exporter } from '../types';
import { AppIconOptions } from './options';
import { appIconChoice } from './choice';

/** Export dialog → "App icon": the icon set ZIP or glyph.svg (icon documents only). */
const exporter: Exporter = {
  id: 'app-icon',
  label: 'App icon',
  extension: 'zip',
  order: 50,
  when: (doc) => !!doc.icon,
  Options: AppIconOptions,
  run: async ({ doc }) => {
    const { downloadGlyph, downloadIconZip } = await import('@/iconMode/commands');
    if (appIconChoice() === 'glyph') await downloadGlyph(doc);
    else await downloadIconZip(doc);
  },
};
export default exporter;
