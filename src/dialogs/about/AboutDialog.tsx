import { Button } from '@/components/ui/button';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>About Designer</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>A free, open SVG editor that runs entirely in your browser.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-3 text-[0.9375rem]">
          <p>No account and no server: your projects stay on this device, in your browser's storage.</p>
          <p>
            Made by{' '}
            <a className="font-medium text-primary underline-offset-4 hover:underline" href="https://hfps.dev" target="_blank" rel="noreferrer">
              Henrique Silva
            </a>
            . Formerly LogoGo.
          </p>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
