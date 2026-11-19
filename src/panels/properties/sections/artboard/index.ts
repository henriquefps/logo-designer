import type { PropertySection } from '../../types';
import { ArtboardSection } from './ArtboardSection';

const section: PropertySection = { id: 'artboard', order: 0, when: (ctx) => ctx.ids.length === 0 && !ctx.doc.wireframe, Component: ArtboardSection };
export default section;
