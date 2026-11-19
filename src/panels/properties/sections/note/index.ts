import { isNoteNode } from '@/wireframe/notes';
import type { PropertySection } from '../../types';
import { NoteSection } from './NoteSection';

/** One note selected (wireframe documents): its text and what it is attached to. */
const section: PropertySection = {
  id: 'note',
  order: 6,
  when: (ctx) => !!ctx.doc.wireframe && ctx.nodes.length === 1 && isNoteNode(ctx.nodes[0]),
  Component: NoteSection,
};
export default section;
