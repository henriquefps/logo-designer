import { isPainted } from '@/model';
import type { PropertySection } from '../../types';
import { StrokeSection } from './StrokeSection';

const section: PropertySection = { id: 'stroke', order: 40, when: (ctx) => ctx.nodes.some(isPainted), Component: StrokeSection };
export default section;
