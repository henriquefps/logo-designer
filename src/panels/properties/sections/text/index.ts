import type { PropertySection } from '../../types';
import { TextSection } from './TextSection';

const section: PropertySection = { id: 'text', order: 15, when: (ctx) => ctx.nodes.some((n) => n.type === 'text'), Component: TextSection };
export default section;
