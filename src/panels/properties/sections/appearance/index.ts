import type { PropertySection } from '../../types';
import { AppearanceSection } from './AppearanceSection';

const section: PropertySection = { id: 'appearance', order: 20, when: (ctx) => ctx.ids.length > 0, Component: AppearanceSection };
export default section;
