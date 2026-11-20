// Video 1: a new wireframe, a phone screen (F + click), top app bar, heading and list rows from
// Assets → Components, a list row's props in Properties, and a reorder by dragging.
import type { Scenario } from '../lib/scenario.ts';
import { canvasText, choose, focusScreen, insertFromLibrary, libraryItem, newWireframe, nodeWithText, openTab, screenBox, setField } from '../lib/designer.ts';

export default {
  name: '01-tela-e-componentes',
  steps: 8,
  async run(demo) {
    const { page } = demo;
    await demo.caption('Novo documento → Wireframe');
    await newWireframe(demo);

    await demo.caption('Adicionando uma tela de celular: tecla F e um clique no canvas');
    await demo.key('f', { show: 'F' });
    const first = await screenBox(page, 'Screen 1');
    // To the right of Screen 1, where the canvas is empty; then fit both screens in view.
    await demo.click({ x: first.x + first.width + 40, y: first.y });
    await demo.pause(400);
    await focusScreen(demo, 'Screen 2', 1.4);

    await demo.caption('Assets → Components: inserindo uma barra superior (Top app bar)');
    await insertFromLibrary(demo, 'Top app bar', 'top app');

    await demo.caption('Inserindo um título (Heading)');
    await insertFromLibrary(demo, 'Heading');

    await demo.caption('Inserindo três linhas de lista (List row)');
    await insertFromLibrary(demo, 'List row');
    const item = libraryItem(page, 'List row');
    await demo.click(item, { fy: 0.4 });
    await demo.click(item, { fy: 0.4 });

    await demo.caption('Properties: título "Idioma" e valor à direita (Trailing = Value)');
    await openTab(demo, 'Properties');
    await setField(demo, 'Title', 'Idioma');
    await choose(demo, 'Trailing', 'Value');
    await setField(demo, 'Value', 'Português');
    await demo.pause(600);

    await demo.caption('Arrastando a linha para o topo da lista: a linha azul mostra onde ela entra');
    const row = await nodeWithText(page, 'Idioma');
    const firstRow = canvasText(page, /^Title$/).nth(1); // [0] is the top app bar's title
    await demo.drag(row, firstRow, { fromAim: { fx: 0.3 }, toAim: { dy: -10 }, hold: 1100 });

    await demo.caption('Pronto: a pilha da tela se reorganiza sozinha');
    await demo.key('Escape', { show: false });
    await demo.hover(canvasText(page, 'Idioma').first(), { dx: 60 }, 1500);
  },
} satisfies Scenario;
