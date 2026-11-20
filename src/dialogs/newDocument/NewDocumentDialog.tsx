import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeftIcon, FileSvgIcon, FolderOpenIcon, PlusIcon } from '@phosphor-icons/react';
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { runAction } from '@/actions/registry';
import { useProjectsStore } from '@/store/useProjectsStore';
import type { ProjectMeta } from '@/store/persistence';
import { cn } from '@/lib/utils';
import { isFirstVisit, markWelcomed } from './welcome';
import { DESIGN_MODES, firstStep, modeDef, moveFocus, pickMode, type DesignMode, type ModeOptions, type Step } from './modes';
import { createDocument } from './create';
import { ModeIllustration } from './illustrations';
import { FreePanel, IconPanel, WireframePanel } from './ModeOptions';
import { RecentProjects } from './RecentProjects';

/** Step 1: the three design modes as equal cards (one row on desktop, stacked on a phone). */
function ModeCards({ initial, onPick }: { initial: DesignMode | null; onPick: (m: DesignMode) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const group = useRef<HTMLDivElement>(null);
  // -1: no card focused yet (the dialog opens on the group, so no card looks preselected).
  const [focus, setFocus] = useState(() => DESIGN_MODES.findIndex((m) => m.id === initial));
  useEffect(() => {
    // Runs before the dialog's own auto-focus, which then leaves focus where it is.
    if (initial) refs.current[focus]?.focus();
    else group.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    const next = focus < 0 ? (moveFocus(0, e.key) === null ? null : e.key === 'End' ? DESIGN_MODES.length - 1 : 0) : moveFocus(focus, e.key);
    if (next === null) return;
    e.preventDefault();
    setFocus(next);
    refs.current[next]?.focus();
  };
  return (
    <div ref={group} tabIndex={-1} role="group" aria-label="Design mode" className="grid grid-cols-1 gap-3 outline-none md:grid-cols-3" onKeyDown={onKeyDown}>
      {DESIGN_MODES.map((m, i) => (
        <button
          key={m.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          tabIndex={i === Math.max(0, focus) ? 0 : -1}
          onFocus={() => setFocus(i)}
          onClick={() => onPick(m.id)}
          data-mode={m.id}
          aria-describedby={`new-doc-mode-${m.id}`}
          className={cn(
            'group flex items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none transition-colors md:flex-col md:items-stretch md:gap-3',
            'hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/50',
          )}
        >
          <span className="flex w-28 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary md:w-full">
            <ModeIllustration mode={m.id} className="aspect-[16/10] w-full" />
          </span>
          <span className="flex min-w-0 flex-col gap-1 md:px-1 md:pb-1">
            <span className="text-base font-semibold">{m.label}</span>
            <span id={`new-doc-mode-${m.id}`} className="text-sm text-muted-foreground">
              {m.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Welcome / File → New, in two steps: pick one of the three design modes (App icon, Wireframe, Free
 * project; equal cards), then its options with defaults, so Create is one click after the mode.
 * Recent projects, Open SVG and All projects stay on step 1. The first visit shows it once; a
 * still-empty document is reused instead of creating another one.
 */
export function NewDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const activeId = useProjectsStore((s) => s.activeId);
  const [step, setStep] = useState<Step>(firstStep);
  const [cameFrom, setCameFrom] = useState<DesignMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const welcome = isFirstVisit();
  // The dialog stays mounted between uses: every opening starts again at step 1.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(firstStep());
      setCameFrom(null);
    }
  }

  const close = (o: boolean) => {
    if (!o) markWelcomed();
    onOpenChange(o);
  };

  const create = async (options: ModeOptions) => {
    if (busy) return;
    setBusy(true);
    try {
      await createDocument(options);
      close(false);
    } finally {
      setBusy(false);
    }
  };

  const openRecent = async (p: ProjectMeta) => {
    await useProjectsStore.getState().open(p.id);
    close(false);
  };

  const back = () => {
    if (step.step === 'options') setCameFrom(step.options.mode);
    setStep(firstStep());
  };

  const options = step.step === 'options' ? step.options : null;
  const mode = options ? modeDef(options.mode) : null;
  const setOptions = (next: ModeOptions) => setStep({ step: 'options', options: next });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (options) void create(options);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={close}>
      <ResponsiveDialogContent className="sm:max-w-3xl">
        {!options ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{welcome ? 'Welcome to Designer' : 'New document'}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {welcome ? 'A free vector editor that runs entirely in your browser. What do you want to make?' : 'What do you want to make? Each mode has its own tools and exports.'}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody className="flex flex-col gap-5">
              <ModeCards
                initial={cameFrom}
                onPick={(m) => {
                  setCameFrom(m);
                  setStep(pickMode(m));
                }}
              />
              {!welcome && <RecentProjects projects={projects} activeId={activeId} onOpen={(p) => void openRecent(p)} />}
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  close(false);
                  runAction('file.openSvg');
                }}
              >
                <FileSvgIcon data-icon="inline-start" />
                Open SVG…
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  close(false);
                  runAction('file.projects');
                }}
              >
                <FolderOpenIcon data-icon="inline-start" />
                All projects
              </Button>
              <Button variant="ghost" onClick={() => close(false)}>
                {welcome ? 'Skip for now' : 'Cancel'}
              </Button>
            </ResponsiveDialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" aria-label={mode!.title}>
            <ResponsiveDialogHeader>
              <span className="eyebrow">{mode!.label}</span>
              <ResponsiveDialogTitle>{mode!.title}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{mode!.description}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody>
              {options.mode === 'free' && <FreePanel options={options} onChange={setOptions} onCreate={() => void create(options)} disabled={busy} />}
              {options.mode === 'icon' && <IconPanel options={options} onChange={setOptions} onCreate={() => void create(options)} disabled={busy} />}
              {options.mode === 'wireframe' && <WireframePanel options={options} onChange={setOptions} onCreate={() => void create(options)} disabled={busy} />}
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <Button type="button" variant="outline" onClick={back} disabled={busy} className="max-md:order-last sm:mr-auto">
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
              <Button type="submit" disabled={busy} autoFocus>
                <PlusIcon data-icon="inline-start" />
                {busy ? 'Creating…' : 'Create'}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
