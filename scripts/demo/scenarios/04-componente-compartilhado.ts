// Video 4 (shared components): Make component on a custom card ("Trip card"), a second screen, the
// card inserted from My components, then an edit inside one instance updates every instance.
import type { Scenario } from '../lib/scenario.ts';
import {
  canvasText,
  childNodes,
  dragFromLibrary,
  focusScreen,
  insertFromLibrary,
  libraryItem,
  newWireframe,
  openTab,
  screenBlank,
  screenBox,
  screenNode,
  searchLibrary,
  setField,
} from '../lib/designer.ts';

export default {
  name: '04-componente-compartilhado',
  steps: 7,
  /** Cut from the video: a card container with an image and a heading, built through the UI. */
  async setup(demo) {
    const { page } = demo;
    await newWireframe(demo);
    await insertFromLibrary(demo, 'Card container', 'card c');
    await dragFromLibrary(demo, 'Image', await demo.point(canvasText(page, 'Drop elements here').first()), { query: 'imag' });
    await insertFromLibrary(demo, 'Heading', 'heading');
    await openTab(demo, 'Properties');
    await setField(demo, 'Text', 'Rio de Janeiro');
    await demo.key('Escape', { show: false });
    await demo.key('Escape', { show: false });
  },
  async run(demo) {
    const { page } = demo;
    const card = async (screen: string, i = 0) => (await childNodes(page, await screenNode(page, screen)))[i];

    await demo.caption('Um card feito à mão: Card container com imagem e título');
    await focusScreen(demo, 'Screen 1', 1);
    await demo.click(await card('Screen 1'), { fy: 0.3 });

    await demo.caption('Object → Make component…, com o nome "Trip card"');
    await demo.menu('Object', 'Make component');
    const name = page.getByRole('dialog').getByRole('textbox');
    await name.waitFor();
    await demo.click(name, {}, { pause: 200 });
    await page.keyboard.press('ControlOrMeta+A');
    await demo.type('Trip card');
    await demo.click(page.getByRole('dialog').getByRole('button', { name: 'Make component', exact: true }));

    await demo.caption('Uma segunda tela: tecla F e um clique ao lado');
    await demo.key('f', { show: 'F' });
    const first = await screenBox(page, 'Screen 1');
    await demo.click({ x: first.x + first.width + 40, y: first.y });
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0 (ajustar à tela)' });

    await demo.caption('Assets → My components: inserindo o Trip card duas vezes na nova tela');
    await searchLibrary(demo, 'trip');
    await demo.click(libraryItem(page, 'Trip card'), { fy: 0.4 });
    // With an instance selected, a click inserts nothing ("Could not insert the component here"):
    // select the screen first (reported as a bug).
    await demo.click(await screenBlank(page, 'Screen 2'));
    await demo.click(libraryItem(page, 'Trip card'), { fy: 0.4 });

    await demo.caption('Duplo clique para entrar em uma cópia e selecionar o título');
    const copy = await card('Screen 2', 1);
    await demo.click(copy, { fy: 0.85 });
    await demo.dblclick(copy, { fx: 0.3, fy: 0.85 });
    await openTab(demo, 'Properties');

    await demo.caption('Editando o título: "Lisboa, 3 noites"');
    await setField(demo, 'Text', 'Lisboa, 3 noites');

    await demo.caption('Todas as cópias mudaram, nas duas telas');
    await demo.key('Escape', { show: false });
    await demo.key('Escape', { show: false });
    await demo.hover(await card('Screen 1'), { fy: 0.85 }, 900);
    await demo.hover(await card('Screen 2', 0), { fy: 0.85 }, 900);
    await demo.hover(await card('Screen 2', 1), { fy: 0.85 }, 1200);
  },
} satisfies Scenario;
