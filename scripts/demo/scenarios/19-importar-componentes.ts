// Video 19 (Import from project…): the Roam sample lacks the components of the fictional "Acme kit" (a project marked
// as a kit, set up and cut from the video); Library → My components → Import from project… → Acme kit, two of the
// masters another one nests unticked: they still come along, and the button and the toast say the same total; the
// dialog again: nothing is duplicated.
import type { Scenario } from '../lib/scenario.ts';
import { newWireframe, openTab } from '../lib/designer.ts';
import { openAcmeKit } from '../lib/acmeKit.ts';

export default {
  name: '19-importar-componentes',
  steps: 5,
  /** Cut from the video: the Acme kit, marked as a kit, then the Roam sample as a new project. */
  async setup(demo) {
    const { page } = demo;
    await openAcmeKit(page, { markAsKit: true });
    await newWireframe(demo);
    await demo.click(page.getByRole('dialog').locator('[data-sample="roam"]'));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    const dlg = page.getByRole('dialog');
    await demo.caption('O projeto Roam (um exemplo) não tem os componentes do Acme kit');
    await openTab(demo, 'Assets');
    await demo.hover(page.getByText('My components', { exact: false }).first(), {}, 1300);

    await demo.caption('Assets → My components → "Import from project…": kits primeiro, depois seus projetos');
    await demo.click(page.getByTestId('import-components'), {}, { pause: 800 });
    await dlg.getByRole('heading', { name: 'Import components' }).waitFor();
    await demo.click(page.getByTestId('import-components-source'), {}, { pause: 900 });
    await demo.click(page.getByRole('option', { name: 'Acme kit' }), {}, { pause: 1200 });
    await page.getByTestId('import-components-list').waitFor();
    await demo.pause(1500);

    await demo.caption('Cada componente vem com prévia e caixa marcada: desmarcamos Section header e List row');
    const list = page.getByTestId('import-components-list');
    await demo.click(list.locator('label', { hasText: 'Acme · Section header' }).getByRole('checkbox'), {}, { pause: 700 });
    await demo.click(list.locator('label', { hasText: 'Acme · List row' }).getByRole('checkbox'), {}, { pause: 900 });

    await demo.caption('"Import 6 (2 come along)": a Settings sheet usa os dois, então vêm junto; o aviso conta os mesmos 6');
    await demo.hover(page.getByTestId('import-components-submit'), {}, 1600);
    await demo.click(page.getByTestId('import-components-submit'), {}, { pause: 600 });
    await dlg.waitFor({ state: 'hidden' });
    await demo.hover(page.getByText(/^Imported \d+ components/).first(), {}, 1800);
    await demo.hover(page.getByText('My components', { exact: false }).first(), {}, 1500);

    await demo.caption('Importando de novo: nada é duplicado, só o que faltava entra (o que já existe é reaproveitado)');
    await demo.click(page.getByTestId('import-components'), {}, { pause: 800 });
    await page.getByTestId('import-components-list').waitFor();
    await demo.pause(1200);
    await demo.click(page.getByTestId('import-components-submit'), {}, { pause: 600 });
    await dlg.waitFor({ state: 'hidden' });
    await demo.pause(2500);
  },
} satisfies Scenario;
