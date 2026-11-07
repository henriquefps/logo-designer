import { Fragment } from 'react';
import { DotsThreeIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { getTools } from '@/tools/registry';
import { switchTool } from '@/tools/context';
import type { Tool } from '@/tools/types';
import { useEditorStore } from '@/store/useEditorStore';

/** Tools always visible in the phone strip; the rest live in the "More tools" menu. */
const PRIMARY_MOBILE = ['select', 'direct', 'pen', 'rectangle', 'ellipse', 'text'];

function ToolButton({ t, active, side }: { t: Tool; active: boolean; side: 'right' | 'top' }) {
  const Icon = t.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          aria-label={t.label}
          aria-pressed={active}
          className={cn('shrink-0', active && 'bg-primary/10 text-primary hover:bg-primary/15')}
          onClick={() => switchTool(t.id)}
        >
          <Icon weight={active ? 'fill' : 'regular'} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        {t.label}
        {t.shortcut && <Kbd>{t.shortcut.toUpperCase()}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Tool buttons from the tool registry, grouped. Vertical on desktop, a compact strip on phones. */
export function ToolBar({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const active = useEditorStore((s) => s.tool);
  const tools = getTools().filter((t) => !t.hidden);
  const vertical = orientation === 'vertical';

  if (!vertical) {
    const primary = tools.filter((t) => PRIMARY_MOBILE.includes(t.id));
    const more = tools.filter((t) => !PRIMARY_MOBILE.includes(t.id));
    const activeMore = more.find((t) => t.id === active);
    const MoreIcon = activeMore?.icon ?? DotsThreeIcon;
    return (
      <div role="toolbar" aria-label="Tools" aria-orientation="horizontal" className="flex items-center gap-0.5">
        {primary.map((t) => (
          <ToolButton key={t.id} t={t} active={active === t.id} side="top" />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={activeMore ? 'secondary' : 'ghost'}
              size="icon"
              aria-label={activeMore ? `More tools (${activeMore.label})` : 'More tools'}
              className={cn('shrink-0', activeMore && 'bg-primary/10 text-primary hover:bg-primary/15')}
            >
              <MoreIcon weight={activeMore ? 'fill' : 'regular'} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="min-w-48">
            <DropdownMenuRadioGroup value={active} onValueChange={(id) => switchTool(id)}>
              {more.map((t) => {
                const Icon = t.icon;
                return (
                  <DropdownMenuRadioItem key={t.id} value={t.id}>
                    <Icon />
                    {t.label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div role="toolbar" aria-label="Tools" aria-orientation="vertical" className="flex flex-col items-center gap-1 py-2">
      {tools.map((t, i) => {
        const newGroup = i > 0 && tools[i - 1].group !== t.group;
        return (
          <Fragment key={t.id}>
            {newGroup && <span aria-hidden="true" className="my-1 h-px w-6 shrink-0 bg-border" />}
            <ToolButton t={t} active={active === t.id} side="right" />
          </Fragment>
        );
      })}
    </div>
  );
}
