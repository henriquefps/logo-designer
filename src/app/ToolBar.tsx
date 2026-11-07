import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { getTools } from '@/tools/registry';
import { switchTool } from '@/tools/context';
import { useEditorStore } from '@/store/useEditorStore';

/** Tool buttons from the tool registry, grouped. Vertical on desktop, a horizontal strip on phones. */
export function ToolBar({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const active = useEditorStore((s) => s.tool);
  const tools = getTools().filter((t) => !t.hidden);
  const vertical = orientation === 'vertical';
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      aria-orientation={orientation}
      className={cn('flex items-center gap-1', vertical ? 'flex-col py-2' : 'flex-row justify-center overflow-x-auto px-2')}
    >
      {tools.map((t, i) => {
        const Icon = t.icon;
        const newGroup = i > 0 && tools[i - 1].group !== t.group;
        return (
          <Fragment key={t.id}>
            {newGroup && <span aria-hidden="true" className={cn('shrink-0 bg-border', vertical ? 'my-1 h-px w-6' : 'mx-1 h-6 w-px')} />}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={active === t.id ? 'secondary' : 'ghost'}
                  size="icon"
                  aria-label={t.label}
                  aria-pressed={active === t.id}
                  className={cn('shrink-0', active === t.id && 'bg-primary/10 text-primary hover:bg-primary/15')}
                  onClick={() => switchTool(t.id)}
                >
                  <Icon weight={active === t.id ? 'fill' : 'regular'} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={vertical ? 'right' : 'top'} className="flex items-center gap-2">
                {t.label}
                {t.shortcut && <Kbd>{t.shortcut.toUpperCase()}</Kbd>}
              </TooltipContent>
            </Tooltip>
          </Fragment>
        );
      })}
    </div>
  );
}
