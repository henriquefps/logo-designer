// Video 21 (content per instance): a shared "Acme · App shell" (top bar + a card container, made through the UI in
// the setup, cut from the video) gets its card marked "Content per instance"; the shell goes on a second phone screen
// and each screen's card takes different library components (the insertion line shows while dragging). Then the top
// bar's title is changed for every instance with "Use everywhere": both screens update, the content stays different.
import type { Scenario } from '../lib/scenario.ts';
import { dragFromLibrary, insertFromLibrary, node, openTab, screenBlank, setField } from '../lib/designer.ts';
import { findNode, layerRow, makeAppShell, startPhoneProject } from '../lib/acmeShell.ts';

export default {
  name: '21-conteudo-por-instancia',
  steps: 7,
  /** Cut from the video: a project with the shared "Acme · App shell" on Screen 1 and an empty second phone screen. */
  async setup(demo) {
    await startPhoneProject(demo);
    await makeAppShell(demo);
    await demo.menu('Object', 'Add screen', 'Phone screen');
    await demo.key('ControlOrMeta+0', { show: false });
    await demo.pause(300);
  },
  async run(demo) {
    const { page } = demo;
    await demo.caption('"Acme · App shell": barra de topo + um card. Cada tela deveria ter o seu próprio conteúdo no card');
    await openTab(demo, 'Layers');
    const card1 = await findNode(page, 'Screen 1', { name: 'Card container' });
    await demo.click(layerRow(page, card1), { fx: 0.4 }, { pause: 500 });
    await openTab(demo, 'Properties');
    await demo.hover(page.getByLabel('Content per instance'), {}, 900);

    await demo.caption('Properties → Layout → "Content per instance": o card continua compartilhado, o conteúdo é de cada tela');
    await demo.click(page.getByLabel('Content per instance'), {}, { pause: 1400 });

    await demo.caption('Na Screen 2: o mesmo componente, em Assets → My components');
    await demo.click(await screenBlank(page, 'Screen 2'), {}, { pause: 500 });
    await insertFromLibrary(demo, 'Acme · App shell', 'app shell');
    await demo.pause(1200);

    await demo.caption('Arrastamos componentes da biblioteca para dentro do card da Screen 1: a linha mostra onde entram');
    const cardOn = async (screen: string) => node(page, await findNode(page, screen, { name: 'Card container' }));
    await dragFromLibrary(demo, 'Heading', await demo.point(await cardOn('Screen 1')));
    await dragFromLibrary(demo, 'List row', await demo.point(await cardOn('Screen 1'), { fy: 0.9 }), { toAim: {} });
    await demo.pause(600);

    await demo.caption('E outros, diferentes, no card da Screen 2: cada tela guarda o seu conteúdo');
    await dragFromLibrary(demo, 'Empty state', await demo.point(await cardOn('Screen 2')));
    await demo.pause(1400);

    await demo.caption('Agora a barra de topo: o título vale só para esta tela até escolhermos "Use everywhere"');
    await openTab(demo, 'Layers');
    const bar = await findNode(page, 'Screen 1', { kind: 'top-app-bar' });
    await demo.click(layerRow(page, bar), { fx: 0.4 }, { pause: 500 });
    await openTab(demo, 'Properties');
    await setField(demo, 'Title', 'Acme Mail');
    await demo.pause(1200);

    await demo.caption('"Use everywhere": o título passa a ser o do componente, nas duas telas; o conteúdo de cada card fica como está');
    await demo.click(page.getByTestId('override-title').getByRole('button', { name: 'Use everywhere' }), {}, { pause: 2600 });
  },
} satisfies Scenario;
