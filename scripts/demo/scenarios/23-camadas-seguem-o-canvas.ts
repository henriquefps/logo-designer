// Video 23 (Layers follows the canvas): in the fictional Roam sample (cut: opened, Layers tab, every screen
// collapsed) a click on an element deep inside a screen on the canvas opens its ancestors in Layers and scrolls
// its row into view; then another screen, another element.
import type { Scenario } from '../lib/scenario.ts';
import { frameScreenAt, newWireframe, openTab } from '../lib/designer.ts';
import { findId, selectDeep } from '../lib/wf.ts';

export default {
  name: '23-camadas-seguem-o-canvas',
  steps: 3,
  /** Cut from the video: Roam open, Layers tab, every screen collapsed. */
  async setup(demo) {
    const { page } = demo;
    await newWireframe(demo);
    await demo.click(page.getByRole('dialog').locator('[data-sample="roam"]'));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await demo.key('ControlOrMeta+0', { show: false });
    await openTab(demo, 'Layers');
    const tree = page.getByRole('tree', { name: 'Layers' });
    for (let i = 0; i < 60; i++) {
      const open = tree.locator('[aria-expanded="true"]').first();
      if (!(await open.count())) break;
      await open.getByRole('button', { name: 'Collapse' }).first().click();
    }
    await page.waitForTimeout(5500);
    await demo.click(page.locator('[data-slot="canvas"]'), { fx: 0.97, fy: 0.97 });
  },
  async run(demo) {
    await demo.caption('Layers com todas as telas fechadas: o Roam tem muitos elementos');
    await demo.pause(1800);

    await demo.caption('Clicamos num elemento fundo na tela Explore: Layers abre os pais e rola até a linha dele');
    await frameScreenAt(demo, 'Explore', 1.4);
    const a = await findId(demo, 'Explore', { kind: 'chip', nth: 1 });
    await selectDeep(demo, a);
    await demo.pause(2200);

    await demo.caption('Outro elemento, em outra tela (Lisbon, Portugal): a lista acompanha');
    await demo.key('ControlOrMeta+0', { show: false });
    await frameScreenAt(demo, 'Lisbon, Portugal', 1.2);
    const b = await findId(demo, 'Lisbon, Portugal', { kind: 'chip', nth: 2 });
    await selectDeep(demo, b);
    await demo.pause(2200);

  },
} satisfies Scenario;
