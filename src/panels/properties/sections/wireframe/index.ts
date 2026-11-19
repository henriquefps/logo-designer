import type { PropertySection } from '../../types';
import { WireframeSection } from './WireframeSection';

/** Wireframe documents, nothing selected: the logical screens and their frames (replaces Artboard). */
const section: PropertySection = { id: 'wireframe', order: 0, when: (ctx) => ctx.ids.length === 0 && !!ctx.doc.wireframe, Component: WireframeSection };
export default section;
