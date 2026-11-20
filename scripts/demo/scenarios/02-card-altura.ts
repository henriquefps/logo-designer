// Video 2 (R1, sizes that follow): a Card made taller with its bottom handle (the border follows),
// then a component whose height can't change: no handle, read-only H with a hint.
import type { Scenario } from '../lib/scenario.ts';
import { field, focusScreen, insertFromLibrary, newWireframe, nodeWithText, openTab, panel } from '../lib/designer.ts';

export default {
  name: '02-card-altura',
  steps: 6,
  async setup(demo) {
    await newWireframe(demo);
  },
  async run(demo) {
    const { page } = demo;
    await demo.caption('Uma tela de celular vazia');
    await focusScreen(demo, 'Screen 1', 1.4);

    await demo.caption('Inserindo um Card pela biblioteca (Assets → Components)');
    await insertFromLibrary(demo, 'Card', 'card');

    await demo.caption('Arrastando a alça de baixo: o card fica mais alto e a borda acompanha');
    const card = await nodeWithText(page, 'Card title');
    const b = (await card.boundingBox())!;
    const x = b.x + b.width / 2;
    // Ends with a sideways move (the height stays): the card keeps its new height.
    await demo.drag({ x, y: b.y + b.height }, { x: x + 40, y: b.y + b.height + 190 }, { via: [{ x, y: b.y + b.height + 190 }], hold: 900, duration: 1600 });

    await demo.caption('Properties: a altura agora é fixa (Height = número)');
    await openTab(demo, 'Properties');
    await demo.hover(field(page, 'Height sizing'), {}, 900);
    await demo.hover(field(page, 'Height'), {}, 1200);

    await demo.caption('Um título (Heading) não muda de altura: sem alça vertical');
    await insertFromLibrary(demo, 'Heading');
    const heading = await nodeWithText(page, 'Heading');
    const h = (await heading.boundingBox())!;
    await demo.hover({ x: h.x + h.width / 2, y: h.y + h.height + 2 }, {}, 1200);

    await demo.caption('O campo H fica somente leitura: "Height follows the content"');
    await openTab(demo, 'Properties');
    const hint = panel(page).getByText('Height follows the content').first();
    await hint.scrollIntoViewIfNeeded();
    await demo.hover(field(page, 'Height'), {}, 700);
    await demo.hover(hint, {}, 1800);
  },
} satisfies Scenario;
