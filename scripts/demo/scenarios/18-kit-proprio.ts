// Video 18 (any project is a component kit): a project with shared components (the fictional "Acme kit", built by
// `designer wf build` and opened from a link, cut from the video) is marked as a kit in Properties; New document →
// Wireframe → "Start with components from: Acme kit" gives a project whose My components are the kit's; the search
// at the top of the library filters them, and one goes on the phone screen.
import type { Scenario } from '../lib/scenario.ts';
import { newWireframe, openTab, screenBlank, searchLibrary } from '../lib/designer.ts';
import { openAcmeKit } from '../lib/acmeKit.ts';

export default {
  name: '18-kit-proprio',
  steps: 5,
  /** Cut from the video: the Acme kit opened as a project (not yet a kit). */
  async setup(demo) {
    await openAcmeKit(demo.page);
    await demo.page.evaluate(() => (window as unknown as { __designer: { useEditorStore: { getState(): { setSelection(ids: string[]): void } } } }).__designer.useEditorStore.getState().setSelection([]));
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    const dlg = page.getByRole('dialog');

    await demo.caption('Um projeto com componentes compartilhados (Acme kit): sem nada selecionado, Properties → Project');
    await openTab(demo, 'Properties');
    await demo.hover(page.getByTestId('use-as-kit'), {}, 1200);

    await demo.caption('"Use as component kit": o projeto passa a ser oferecido como kit');
    await demo.click(page.getByTestId('use-as-kit'), {}, { pause: 1600 });

    await demo.caption('Novo documento → Wireframe: "Start with components from" lista os projetos marcados como kit');
    await newWireframe(demo);
    await dlg.getByRole('heading', { name: 'New wireframe' }).waitFor();
    await demo.click(page.getByTestId('new-wireframe-kit'), {}, { pause: 900 });
    await demo.click(page.getByRole('option', { name: 'Acme kit' }), {}, { pause: 900 });
    await demo.click(dlg.getByRole('button', { name: 'Create' }), {}, { pause: 900 });
    await dlg.waitFor({ state: 'hidden' });

    await demo.caption('O projeto novo já começa com os componentes do kit em My components, sem as telas do kit');
    await openTab(demo, 'Assets');
    await demo.hover(page.getByTestId('import-components'), {}, 1800);

    await demo.caption('A busca fica no topo e filtra My components e a biblioteca: "Acme · List row" na tela do celular');
    await demo.click(await screenBlank(page, 'Screen 1'));
    await searchLibrary(demo, 'list row');
    await demo.pause(900);
    await demo.click(page.getByRole('button', { name: /Acme · List row$/ }).filter({ visible: true }).first(), { fy: 0.4 });
    await demo.pause(1800);
  },
} satisfies Scenario;
