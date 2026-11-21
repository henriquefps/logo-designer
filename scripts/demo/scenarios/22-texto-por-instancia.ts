// Video 22 (text per instance): a shared "Acme · List row" (made through the UI in the setup, cut from the video)
// used three times on a phone screen. Its title is changed on the first row (Overridden here, the others keep the
// shared text), on the second and then put back with "Reset to shared", and on the third with "Use everywhere".
import type { Scenario } from '../lib/scenario.ts';
import { insertFromLibrary, openTab, screenBlank, setField } from '../lib/designer.ts';
import { findNode, insertEmpty, layerRow, nameComponent, startPhoneProject } from '../lib/acmeShell.ts';

export default {
  name: '22-texto-por-instancia',
  steps: 5,
  /** Cut from the video: Screen 1 with three instances of "Acme · List row". */
  async setup(demo) {
    const { page } = demo;
    await startPhoneProject(demo);
    await insertEmpty(demo, 'an empty vertical stack');
    await insertFromLibrary(demo, 'List row');
    await openTab(demo, 'Layers');
    await demo.click(layerRow(page, await findNode(page, 'Screen 1', { name: 'Vertical stack' })), { fx: 0.4 });
    await demo.menu('Object', 'Make component');
    await nameComponent(demo, 'Acme · List row');
    for (let i = 0; i < 2; i++) {
      await demo.click(await screenBlank(page, 'Screen 1'));
      await insertFromLibrary(demo, 'Acme · List row', 'list row');
    }
    await demo.click(await screenBlank(page, 'Screen 1'));
    await openTab(demo, 'Layers');
  },
  async run(demo) {
    const { page } = demo;
    const row = async (n: number) => {
      await openTab(demo, 'Layers');
      const id = await findNode(page, 'Screen 1', { kind: 'list-row', nth: n });
      await demo.click(layerRow(page, id), { fx: 0.4 }, { pause: 500 });
      await openTab(demo, 'Properties');
    };
    const override = page.getByTestId('override-title');

    await demo.caption('Três linhas da mesma "Acme · List row": hoje todas mostram o mesmo título');
    await demo.pause(1800);

    await demo.caption('Mudamos o título da primeira em Properties: só esta linha muda ("Overridden here")');
    await row(0);
    await setField(demo, 'Title', 'Inbox · 3 new');
    await override.waitFor();
    await demo.pause(2000);

    await demo.caption('Na segunda, outro título... e "Reset to shared" volta ao texto do componente');
    await row(1);
    await setField(demo, 'Title', 'Drafts');
    await override.waitFor();
    await demo.pause(1400);
    await demo.click(override.getByRole('button', { name: 'Reset to shared' }), {}, { pause: 1800 });

    await demo.caption('Na terceira, "Use everywhere": o texto vira o do componente para quem não tem texto próprio');
    await row(2);
    await setField(demo, 'Title', 'Acme item');
    await override.waitFor();
    await demo.pause(1200);
    await demo.click(override.getByRole('button', { name: 'Use everywhere' }), {}, { pause: 1200 });

    await demo.caption('A primeira continua com o texto dela; a segunda e a terceira seguem o componente');
    await demo.pause(3000);
  },
} satisfies Scenario;
