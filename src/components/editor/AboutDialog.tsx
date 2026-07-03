import { InfoIcon, ShieldCheckIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function AboutDialog() {
  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <InfoIcon className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>About & privacy</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>About LogoGo</DialogTitle>
          <DialogDescription>A free, no-login logo and app-icon designer.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex gap-2.5 rounded-md border border-border bg-muted/40 p-3">
            <ShieldCheckIcon className="size-5 shrink-0 text-primary" weight="fill" />
            <div className="space-y-1 text-muted-foreground">
              <p className="font-medium text-foreground">Privacy</p>
              <p>
                LogoGo runs entirely in your browser. There are no accounts, no cookies, and no analytics — your
                projects are saved only in this browser&apos;s local storage and are never uploaded anywhere. Clearing
                your browser data removes them for good, so use the export/import project file if you want a backup.
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">
              Developed by <span className="font-medium text-foreground">Henrique Silva</span>
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="https://hfps.dev" target="_blank" rel="noreferrer">
                hfps.dev
                <ArrowSquareOutIcon className="size-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
