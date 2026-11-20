// Video 3 (R2–R4): a horizontal stack with chips dropped in; a card container (inside a vertical
// stack) with an image and a text dropped in, its outline and corners; then Repeat (count 4, gap 12).
import type { Scenario } from '../lib/scenario.ts';
import { canvasText, childNodes, choose, dragFromLibrary, field, focusScreen, insertFromLibrary, libraryItem, screenBlank, newWireframe, openTab, screenNode, setField } from '../lib/designer.ts';

export default {
  name: '03-containers-e-repeticao',
  steps: 8,
  async setup(demo) {
    await newWireframe(demo);
  },
  async run(demo) {
    const { page } = demo;
    await focusScreen(demo, 'Screen 1', 1.35);

    await demo.caption('Layout → Horizontal stack: uma pilha horizontal vazia');
    await insertFromLibrary(demo, 'Horizontal stack', 'horiz');

    await demo.caption('Soltando chips dentro da pilha: eles se alinham lado a lado');
    await dragFromLibrary(demo, 'Chip', await demo.point(canvasText(page, 'Drop elements here').first()), { query: 'chip' });
    const hstack = (await childNodes(page, await screenNode(page, 'Screen 1')))[0];
    await demo.drag(libraryItem(page, 'Chip'), hstack, { fromAim: { fy: 0.4 }, toAim: { fx: 0.8 }, duration: 800, hold: 450 });
    // With a chip selected, a click on the library adds the next one after it, in the same stack.
    await demo.click(libraryItem(page, 'Chip'), { fy: 0.4 });

    await demo.caption('Uma pilha vertical com um Card container dentro');
    await demo.click(await screenBlank(page, 'Screen 1'));
    await insertFromLibrary(demo, 'Vertical stack', 'vert');
    await insertFromLibrary(demo, 'Card container', 'card c');

    await demo.caption('Soltando uma imagem e um texto dentro do card');
    await dragFromLibrary(demo, 'Image', await demo.point(canvasText(page, 'Drop elements here').first()), { query: 'imag' });
    const vstack = (await childNodes(page, await screenNode(page, 'Screen 1')))[1];
    const card = (await childNodes(page, vstack))[0];
    await dragFromLibrary(demo, 'Text', await demo.point(card, { fx: 0.3, fy: 1, dy: -3 }), { query: 'text' });

    await demo.caption('Aparência do card: contorno + preenchimento, cantos grandes');
    await demo.click(await screenBlank(page, 'Screen 1'));
    await demo.click(card, { fy: 0.3 });
    await demo.dblclick(card, { fy: 0.3 });
    await openTab(demo, 'Properties');
    await choose(demo, 'Container style', 'Outline + filled');
    await choose(demo, 'Corner radius', 'Large');

    await demo.caption('Selecionando a pilha vertical: Repeat first item ligado');
    await demo.click(await screenBlank(page, 'Screen 1'));
    await demo.click(card, { fy: 0.3 });
    await demo.click(field(page, 'Repeat first item'));

    await demo.caption('Count = 4 e Gap = 12: uma lista de cards personalizados');
    await setField(demo, 'Repeat count', '4');
    await setField(demo, 'Gap', '12');

    await demo.caption('O primeiro card é o modelo; as cópias seguem ele');
    await demo.move(await screenBlank(page, 'Screen 1'));
    await demo.scroll(0, 260);
  },
} satisfies Scenario;
