import type { ReactNode } from 'react';
import { ArrowSquareOutIcon } from '@phosphor-icons/react';
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
import { CodeBlock } from '@/pages/CodeBlock';
import { REPO_URL } from '@/pages/syncDownloads';

const DOCS_URL = `${REPO_URL}/blob/main/docs/agents.md`;
const SCHEMA_URL = 'https://designer.hfps.dev/schema/designer-project.schema.json';

const INSTALL_SKILL = 'npx skills add henriquefps/logo-designer';

// Same snippet as skills/designer/SKILL.md and docs/agents.md: pinned to a commit, because Bun caches an unpinned github: spec.
const RUN_CLI = `DESIGNER="github:henriquefps/logo-designer#$(git ls-remote https://github.com/henriquefps/logo-designer.git main | cut -c1-12)"
bunx --bun "$DESIGNER" --help`;

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">{children}</code>;
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" href={href} target="_blank" rel="noreferrer">
      {children} <ArrowSquareOutIcon className="size-3.5" />
    </a>
  );
}

/** Help → CLI & agents: what the designer CLI is and how to give it to an AI agent. */
export function CliDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>CLI &amp; agents</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Let your AI agent draw for you, then finish the artwork here, by hand.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-5 text-[0.9375rem]">
          <p>
            The <Code>designer</Code> command line lets an AI agent (Claude Code, Codex and the like) create icons and artwork as editable Designer projects, check them (keylines, previews) and open them straight into{' '}
            <em>your</em> Designer in this browser, with <Code>designer open</Code> or <Code>designer present</Code>, so you can edit them like anything you drew yourself.
          </p>

          <section className="flex flex-col gap-2">
            <h3 className="font-medium">1. Give your agent the skill</h3>
            <p className="text-[0.8125rem] text-muted-foreground">Teaches it the commands and the workflow. Run it once in your project.</p>
            <CodeBlock code={INSTALL_SKILL} what="skill install command" />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-medium">2. Run the CLI</h3>
            <p className="text-[0.8125rem] text-muted-foreground">
              Needs <Ext href="https://bun.sh">Bun</Ext>. The commit is pinned because Bun caches an unpinned GitHub package and keeps running an old CLI. The first run downloads it (about 20 to 60 seconds).
            </p>
            <CodeBlock code={RUN_CLI} what="CLI command" />
          </section>

          <p className="text-[0.8125rem] text-muted-foreground">
            More: <Ext href={DOCS_URL}>Designer for agents (docs/agents.md)</Ext> · <Ext href={SCHEMA_URL}>Project JSON schema</Ext>
          </p>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
