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
import { AppMark } from '@/app/ProjectTitle';

const REPO = 'https://github.com/henriquefps/logo-designer';

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="font-medium text-primary underline-offset-4 hover:underline" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const PRIVACY = [
  ['No account', 'Open the page and start drawing. There is nothing to sign up for.'],
  ['Everything stays in your browser', 'Projects are saved in this browser’s storage (IndexedDB). Export a project file to back it up or move it.'],
  ['Fonts never leave your device', 'Uploaded fonts are stored locally and only used to draw and outline your text.'],
  ['No tracking', 'No analytics and no ads. The only requests to another server go to Iconify, when you browse the Phosphor or Iconify icon libraries.'],
] as const;

const CREDITS = [
  ['Lucide icons', 'ISC license', 'https://lucide.dev/license'],
  ['Phosphor icons', 'MIT license', 'https://github.com/phosphor-icons/homepage/blob/master/LICENSE'],
  ['Iconify collections', 'Each icon keeps its collection’s license (shown in the Icons panel)', 'https://iconify.design/'],
  ['Bundled fonts', 'SIL Open Font License 1.1 (Inter, Space Grotesk, Montserrat, Archivo Black, Bebas Neue, Playfair Display, DM Serif Display, Lora, Pacifico, JetBrains Mono)', 'https://openfontlicense.org/'],
  ['Geometry and type', 'paper.js (MIT), opentype.js (MIT), perfect-freehand (MIT)', 'https://paperjs.org/'],
] as const;

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>About Designer</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>A free, open source SVG editor that runs entirely in your browser.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-5 text-[0.9375rem]">
          <div className="flex items-center gap-3">
            <span className="[&_svg]:size-12">
              <AppMark />
            </span>
            <p className="text-muted-foreground">
              Made by <Link href="https://hfps.dev">Henrique Silva</Link>. Formerly LogoGo.
            </p>
          </div>
          <section className="flex flex-col gap-2" aria-label="License">
            <h3 className="eyebrow">License</h3>
            <p>
              <span className="font-medium">Free and open source — AGPL-3.0.</span>{' '}
              <span className="text-muted-foreground">
                Designer is free software under the GNU Affero General Public License, version 3 or later. Anyone using it over a network can get the
                complete source code: <Link href={REPO}>source code on GitHub</Link>.
              </span>
            </p>
          </section>
          <section className="flex flex-col gap-2" aria-label="Privacy">
            <h3 className="eyebrow">Privacy</h3>
            <ul className="flex flex-col gap-2">
              {PRIVACY.map(([title, text]) => (
                <li key={title}>
                  <span className="font-medium">{title}.</span> <span className="text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2" aria-label="Credits">
            <h3 className="eyebrow">Credits and licenses</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {CREDITS.map(([name, license, href]) => (
                <li key={name}>
                  <Link href={href}>{name}</Link> <span className="text-muted-foreground">· {license}</span>
                </li>
              ))}
            </ul>
          </section>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
