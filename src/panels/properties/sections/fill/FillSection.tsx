import { isPainted } from '@/model';
import { PaintEditor } from '../../../shared/PaintEditor';
import { Section } from '../../../shared/Section';
import { editNodes } from '../../edit';
import type { SelectionContext } from '../../types';

export function FillSection({ ctx }: { ctx: SelectionContext }) {
  const painted = ctx.nodes.filter(isPainted);
  const first = painted[0];
  const ids = painted.map((n) => n.id);
  return (
    <Section title="Fill">
      <PaintEditor
        label="Fill"
        value={first.fill}
        onChange={(p) => editNodes(ids, (n) => void ('fill' in n && (n.fill = p)), 'Fill')}
      />
    </Section>
  );
}
