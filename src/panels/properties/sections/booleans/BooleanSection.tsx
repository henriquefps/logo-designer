import { ScissorsIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BOOLEAN_OPS } from '@/actions/modules/path';
import { booleanSelection } from '@/vector/commands';
import { startKnockout } from '@/vector/knockoutSession';
import { Section } from '../../../shared/Section';

export function BooleanSection() {
  return (
    <Section title="Boolean">
      <div className="flex items-center gap-1">
        {BOOLEAN_OPS.map(({ op, label, icon: Icon }) => (
          <Tooltip key={op}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => void booleanSelection(op)}>
                <Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void startKnockout()}>
              <ScissorsIcon data-icon="inline-start" />
              Knock out
            </Button>
          </TooltipTrigger>
          <TooltipContent>The top object cuts the others, with a gap. One colour, no hidden shapes.</TooltipContent>
        </Tooltip>
      </div>
    </Section>
  );
}
