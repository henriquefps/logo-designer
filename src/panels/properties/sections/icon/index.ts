import type { PropertySection } from '../../types';
import { IconSection } from '@/iconMode/ui/IconSection';

/** App icon panel: only in icon documents, when nothing is selected (above the artboard). */
const section: PropertySection = { id: 'icon', order: -10, when: (ctx) => !!ctx.doc.icon && ctx.ids.length === 0, Component: IconSection };
export default section;
