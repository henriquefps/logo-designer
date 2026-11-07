import { isPainted } from '@/model';
import type { PropertySection } from '../../types';
import { FillSection } from './FillSection';

const section: PropertySection = { id: 'fill', order: 30, when: (ctx) => ctx.nodes.some(isPainted), Component: FillSection };
export default section;
