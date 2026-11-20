// Video 6 (notes and export): a note attached to a list row (Note tool, K), then File → Copy for
// AI and the markdown pasted (Ctrl+V) into a plain text box outside the app.
import type { Scenario } from '../lib/scenario.ts';
import { canvas, field, focusScreen, newWireframe, nodeWithText, screenBox } from '../lib/designer.ts';
import { buildListScreen } from './shared.ts';

export default {
  name: '06-notas-e-exportacao',
  steps: 6,
  async setup(demo) {
    await newWireframe(demo);
    await buildListScreen(demo, 'Ajustes', ['Idioma', 'Notificações', 'Sobre']);
  },
  async run(demo) {
    const { page } = demo;
    await focusScreen(demo, 'Ajustes', 1.2);

    await demo.caption('Ferramenta Nota (tecla K) e um clique na linha "Notificações"');
    await demo.key('k', { show: 'K' });
    await demo.click(await nodeWithText(page, 'Notificações'), { fx: 0.4 });

    await demo.caption('A nota fica presa à linha; escrevendo o comportamento');
    await demo.click(field(page, 'Note text'), {}, { pause: 250 });
    await page.keyboard.press('ControlOrMeta+A');
    await demo.type('Abre só se o usuário permitir notificações no sistema.', { delay: 45 });
    await demo.hover(field(page, 'Attached to'), {}, 1000);

    await demo.caption('Arrastando a tela: a nota acompanha a linha');
    const s = await screenBox(page, 'Ajustes');
    await demo.drag({ x: s.x + 40, y: s.y - 9 }, { x: s.x - 20, y: s.y + 30 }, { duration: 900, hold: 400 });

    await demo.caption('File → Copy for AI: o projeto inteiro vira markdown');
    await demo.menu('File', 'Copy for AI');
    await demo.pause(900);

    await demo.caption('Colando (Ctrl + V) num editor de texto qualquer');
    const c = (await canvas(page).boundingBox())!;
    await page.evaluate((r) => (window as unknown as { __demoPasteBox(t: string, r: object): void }).__demoPasteBox('Editor de texto (fora do Designer)', r), {
      x: c.x + 40,
      y: c.y + 30,
      width: c.width - 80,
      height: c.height - 60,
    });
    const area = page.locator('#demo-paste textarea');
    await demo.click(area, { fy: 0.2 }, { pause: 300 });
    await demo.key('ControlOrMeta+V');
    if (!(await area.inputValue())) throw new Error('Nothing was pasted: the clipboard is empty after Copy for AI');
    await demo.pause(1200);

    await demo.caption('A nota aparece ao lado do elemento a que está presa');
    await demo.move(area, { fy: 0.6 });
    const text = await area.inputValue();
    const line = text.split('\n').findIndex((l) => l.includes('permitir notificações'));
    // Scroll the text box with the wheel until the note's line is in view.
    if (line > 12) await demo.scroll(0, Math.min((line - 8) * 19.5, 4000));
    await demo.pause(2200);
  },
} satisfies Scenario;
