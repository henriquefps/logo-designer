// Video 19 (Import from project…): the Roam sample has no kit; Library → My components → Import from project… →
// hfps-kit, a couple unticked, Import (toast, components); the dialog again: nothing is duplicated.
import type { Scenario } from '../lib/scenario.ts';
import { newWireframe, openTab } from '../lib/designer.ts';

export default {
  name: '19-importar-componentes',
  steps: 5,
  /** Cut from the video: the Roam sample as a new project. */
  async setup(demo) {
    const { page } = demo;
    await newWireframe(demo);
    await demo.click(page.getByRole('dialog').locator('[data-sample="roam"]'));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    const dlg = page.getByRole('dialog');
    await demo.caption('O projeto Roam (um exemplo) não tem os componentes do kit hfps');
    await openTab(demo, 'Assets');
    await demo.hover(page.getByText('My components', { exact: false }).first(), {}, 1300);

    await demo.caption('Assets → My components → "Import from project…": kits primeiro, depois seus projetos');
    await demo.click(page.getByTestId('import-components'), {}, { pause: 800 });
    await dlg.getByRole('heading', { name: 'Import components' }).waitFor();
    await demo.click(page.getByTestId('import-components-source'), {}, { pause: 900 });
    await demo.click(page.getByRole('option', { name: 'hfps-kit' }), {}, { pause: 1200 });
    await page.getByTestId('import-components-list').waitFor();
    await demo.pause(1500);

    await demo.caption('Cada componente vem com prévia e caixa marcada: desmarcamos dois');
    const boxes = page.getByTestId('import-components-list').getByRole('checkbox');
    await demo.click(boxes.nth(3), {}, { pause: 700 });
    await demo.click(boxes.nth(5), {}, { pause: 900 });

    await demo.caption('Import 34: o aviso conta 36, porque dois vêm junto por serem usados dentro de outros; todos em My components');
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
