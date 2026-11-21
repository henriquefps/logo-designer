// Video 18 (component kits): New document → Wireframe → "Start with components from: hfps-kit" gives a project whose
// My components are the kit's `hfps · …` patterns; a few of them are inserted on the phone screen; then the hfps-kit
// sample itself (Help → Open sample project…) is panned across to show the patterns and their notes.
import type { Scenario } from '../lib/scenario.ts';
import { canvas, newWireframe, openTab, screenBlank, searchLibrary } from '../lib/designer.ts';

export default {
  name: '18-kit-hfps',
  steps: 6,
  async run(demo) {
    const { page } = demo;
    const dlg = page.getByRole('dialog');

    await demo.caption('Novo documento → Wireframe: "Start with components from" oferece o kit hfps-kit');
    await newWireframe(demo);
    await dlg.getByRole('heading', { name: 'New wireframe' }).waitFor();
    await demo.click(page.getByTestId('new-wireframe-kit'), {}, { pause: 700 });
    await demo.click(page.getByRole('option', { name: 'hfps-kit' }), {}, { pause: 900 });
    await demo.click(dlg.getByRole('button', { name: 'Create' }), {}, { pause: 900 });
    await dlg.waitFor({ state: 'hidden' });

    await demo.caption('Assets → Components: o projeto já começa com os "hfps · …" em My components, sem as telas do kit');
    await openTab(demo, 'Assets');
    await demo.hover(page.getByTestId('import-components'), {}, 1400);
    await searchLibrary(demo, 'hfps');
    await demo.pause(1400);

    await demo.caption('"hfps · App shell" na tela do celular: cabeçalho fixo e um card que preenche o resto');
    await demo.click(await screenBlank(page, 'Screen 1'));
    await searchLibrary(demo, 'hfps · App shell');
    await demo.click(page.getByRole('button', { name: /hfps · App shell$/ }).filter({ visible: true }).first(), { fy: 0.4 });
    await demo.pause(900);

    await demo.caption('Na mesma tela, mais peças do kit: Eyebrow section, List row e Primary button');
    for (const [q, label] of [['hfps · Eyebrow section', 'hfps · Eyebrow section'], ['hfps · List row', 'hfps · List row'], ['hfps · Primary button', 'hfps · Primary button']] as const) {
      await searchLibrary(demo, q);
      await demo.click(page.getByRole('button', { name: new RegExp(`${label}$`) }).filter({ visible: true }).first(), { fy: 0.4 });
      await demo.pause(700);
    }
    await demo.key('Escape', { show: false });
    await demo.key('Escape', { show: false });
    await demo.pause(900);

    await demo.caption('Help → Open sample project… → hfps-kit: a folha com todos os padrões do kit');
    await demo.menu('Help', 'Open sample project…');
    await demo.click(dlg.locator('[data-sample="hfps-kit"]'), {}, { pause: 600 });
    await dlg.waitFor({ state: 'hidden' });
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.pause(1200);

    await demo.caption('Cada componente tem uma nota ao lado: a regra do kit e a peça de código correspondente');
    const c = (await canvas(page).boundingBox())!;
    await demo.move({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
    await demo.zoomAt({ x: c.x + 220, y: c.y + 90 }, 5);
    await demo.pause(1200);
    for (let i = 0; i < 4; i++) {
      await demo.scroll(c.width * 0.45, 0);
      await demo.pause(900);
    }
    await demo.scroll(-c.width * 1.2, c.height * 0.7);
    await demo.pause(1800);
  },
} satisfies Scenario;
