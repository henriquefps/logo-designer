import type { PropertySection } from '../../types';
import { TransformSection } from './TransformSection';

const section: PropertySection = { id: 'transform', order: 10, when: (ctx) => ctx.ids.length > 0, Component: TransformSection };
export default section;
