import { AlignButtons } from '../../../shared/AlignButtons';
import { Section } from '../../../shared/Section';
import type { SelectionContext } from '../../types';

export function AlignSection({ ctx }: { ctx: SelectionContext }) {
  return (
    <Section title="Align">
      <AlignButtons ids={ctx.ids} />
    </Section>
  );
}
