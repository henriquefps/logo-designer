// A small fictional component kit ("Acme kit") for the kit e2e and the kit demo scenarios: six shared components
// named "Acme · …", one of them (Settings sheet) nesting four others. Built with the real CLI (`designer wf build`)
// and handed to the app as a `designer link` (#open=…), the way a person opens a file someone sent them.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { Page } from 'playwright';

const one = (content: unknown) => ({ vstack: [content] });

export const ACME_KIT_SPEC = {
  name: 'Acme kit',
  components: [
    { name: 'Acme · Top bar', content: one({ 'top-app-bar': 'Title' }) },
    { name: 'Acme · Section header', content: one({ 'section-header': 'SECTION' }) },
    { name: 'Acme · List row', content: one({ 'list-row': { title: 'Item name' } }) },
    { name: 'Acme · Primary button', content: one({ button: 'Save' }) },
    { name: 'Acme · Secondary button', content: one({ button: { label: 'Cancel', variant: 'secondary' } }) },
    {
      name: 'Acme · Settings sheet',
      content: {
        vstack: [{ use: 'Acme · Section header' }, { use: 'Acme · List row' }, { use: 'Acme · List row' }, { hstack: [{ use: 'Acme · Secondary button' }, { use: 'Acme · Primary button' }], gap: 8 }],
        gap: 8,
        padding: 16,
        style: 'outline',
      },
    },
  ],
  screens: [
    {
      name: 'Components',
      root: [{ use: 'Acme · Top bar' }, { use: 'Acme · Section header' }, { use: 'Acme · List row' }, { use: 'Acme · Primary button' }, { use: 'Acme · Secondary button' }, { use: 'Acme · Settings sheet' }],
    },
  ],
};

export const ACME_NAMES = ACME_KIT_SPEC.components.map((c) => c.name);
/** The masters Settings sheet nests (they come along when only it is ticked). */
export const ACME_NESTED = ['Acme · Section header', 'Acme · List row', 'Acme · Secondary button', 'Acme · Primary button'];

function designer(root: string, args: string[]): string {
  const r = spawnSync('bun', ['bin/designer.ts', ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`designer ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}

/** Builds the kit with `designer wf build` and returns a link that opens it in the app at `origin` (not yet marked as a kit). */
export function acmeKitLink(root: string, origin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'acme-kit-'));
  const spec = join(dir, 'acme.spec.json');
  const file = join(dir, 'acme-kit.designer.json');
  writeFileSync(spec, JSON.stringify(ACME_KIT_SPEC, null, 2));
  designer(root, ['wf', 'build', spec, '-o', file]);
  return designer(root, ['link', file, '--origin', origin]).trim();
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Opens the Acme kit in the app as a new project (the link's Import dialog, confirmed) and waits until it is the open
 * project. `markAsKit`: then turns on Properties → Project → Use as component kit, as a person would.
 */
export async function openAcmeKit(page: Page, opts: { markAsKit?: boolean } = {}): Promise<void> {
  await page.goto(acmeKitLink(repoRoot, new URL(page.url()).origin));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
  await page.waitForFunction(() => (window as unknown as { __designer: { useDocStore: { getState(): { doc: { name: string } } } } }).__designer.useDocStore.getState().doc.name === 'Acme kit');
  if (!opts.markAsKit) return;
  const tab = page.getByRole('tab', { name: 'Properties', exact: true });
  if ((await tab.getAttribute('data-state')) !== 'active') await tab.click();
  await page.getByTestId('use-as-kit').click();
  await page.waitForFunction(() => (window as unknown as { __designer: { useDocStore: { getState(): { doc: { wireframe?: { kit?: boolean } } } } } }).__designer.useDocStore.getState().doc.wireframe?.kit === true);
}
