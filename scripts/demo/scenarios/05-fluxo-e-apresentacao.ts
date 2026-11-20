// Video 5 (flows, status, present mode): a flow from a list row to another screen, a flow dropped on
// empty canvas → New screen, a status badge, then Present: hotspot, click through, Back, Esc.
import type { Scenario } from '../lib/scenario.ts';
import { canvas, canvasText, choose, frameScreenAt, insertFromLibrary, libraryItem, newWireframe, nodeWithText, openTab, screenBlank, screenBox, screenLabel, setField } from '../lib/designer.ts';
import type { Demo } from '../lib/demo.ts';

async function renameSelectedScreen(demo: Demo, name: string) {
  await openTab(demo, 'Properties');
  await setField(demo, 'Screen name', name);
}

/** Drags from the selected element's flow handle (the circle on its right) to a point. */
async function dragFlow(demo: Demo, to: { x: number; y: number }) {
  const handle = canvas(demo.page).locator('[data-slot="flow-handle"] circle');
  await demo.drag(handle, to, { duration: 1300, hold: 900 });
}

export default {
  name: '05-fluxo-e-apresentacao',
  steps: 8,
  /** Cut from the video: "Ajustes" (top bar + two rows) and "Idioma", built through the UI. */
  async setup(demo) {
    const { page } = demo;
    await newWireframe(demo);
    await demo.click(await screenBlank(page, 'Screen 1'));
    await renameSelectedScreen(demo, 'Ajustes');
    await insertFromLibrary(demo, 'Top app bar', 'top app');
    await openTab(demo, 'Properties');
    await setField(demo, 'Title', 'Ajustes');
    await insertFromLibrary(demo, 'List row');
    await openTab(demo, 'Properties');
    await setField(demo, 'Title', 'Idioma');
    await insertFromLibrary(demo, 'List row');
    await openTab(demo, 'Properties');
    await setField(demo, 'Title', 'Notificações');
    await demo.key('f');
    const first = await screenBox(page, 'Ajustes');
    await demo.click({ x: first.x + first.width + 40, y: first.y });
    await renameSelectedScreen(demo, 'Idioma');
    await insertFromLibrary(demo, 'Top app bar', 'top app');
    await openTab(demo, 'Properties');
    await setField(demo, 'Title', 'Idioma');
    await insertFromLibrary(demo, 'List row');
    await demo.click(libraryItem(page, 'List row'), { fy: 0.4 });
    await demo.key('Escape');
    await demo.key('Escape');
    await frameScreenAt(demo, 'Ajustes', 0.7);
  },
  async run(demo) {
    const { page } = demo;
    await demo.caption('Selecionando a linha "Idioma": aparece a alça de fluxo à direita');
    await demo.click(await nodeWithText(page, 'Idioma'), { fx: 0.3 });

    await demo.caption('Arrastando a alça até a tela "Idioma": uma seta de fluxo');
    await dragFlow(demo, await demo.point(await screenBox(page, 'Idioma'), { fx: 0.5, fy: 0.4 }));

    await demo.caption('Da linha "Notificações" para o canvas vazio → New screen');
    await demo.click(await nodeWithText(page, 'Notificações'), { fx: 0.3 });
    const idioma = await screenBox(page, 'Idioma');
    await dragFlow(demo, { x: idioma.x + idioma.width + 50, y: idioma.y + 10 });
    await demo.click(page.getByRole('menuitem', { name: /^New screen/ }));

    await demo.caption('Status da nova tela: New (selo ao lado do nome)');
    await openTab(demo, 'Properties');
    await choose(demo, 'Screen status', 'New');
    await demo.hover(screenLabel(page, 'Notificações'), {}, 1000);

    await demo.caption('View → Present, começando pela tela "Ajustes"');
    await demo.click(screenLabel(page, 'Ajustes'));
    await demo.menu('View', 'Present');

    await demo.caption('Passando o mouse: as linhas com fluxo mostram um hotspot; clique abre a tela');
    const hotspot = (name: string) => page.locator('[data-slot="hotspot"]').filter({ visible: true }).and(page.getByRole('button', { name: `Open ${name}` }));
    await demo.hover(hotspot('Idioma'), {}, 1100);
    await demo.click(hotspot('Idioma'), {}, { pause: 1100 });

    await demo.caption('Back volta para "Ajustes"; depois "Notificações"');
    await demo.click(page.getByRole('button', { name: 'Back', exact: true }), {}, { pause: 1000 });
    await demo.hover(hotspot('Notificações'), {}, 700);
    await demo.click(hotspot('Notificações'), {}, { pause: 1100 });

    await demo.caption('Esc sai da apresentação e volta ao editor');
    await demo.key('Escape', { show: 'Esc' });
    await demo.hover(canvasText(page, 'Idioma').first(), {}, 1200);
  },
} satisfies Scenario;
