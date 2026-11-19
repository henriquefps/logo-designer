import { isUserPaintable } from '@/model';
import type { PropertySection } from '../../types';
import { AppearanceSection } from './AppearanceSection';

const section: PropertySection = { id: 'appearance', order: 20, when: (ctx) => ctx.nodes.some(isUserPaintable), Component: AppearanceSection };
export default section;
