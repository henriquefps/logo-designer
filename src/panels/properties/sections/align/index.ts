import type { PropertySection } from '../../types';
import { AlignSection } from './AlignSection';

const section: PropertySection = { id: 'align', order: 50, when: (ctx) => ctx.ids.length > 0, Component: AlignSection };
export default section;
