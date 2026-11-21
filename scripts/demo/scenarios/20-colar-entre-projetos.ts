// Video 20 (paste between projects keeps shared components): copy an instance of a shared component that nests
// others (a sheet with buttons) in the hfps-kit sample, switch to Roam (which lacks it) and paste: it stays a shared
// component (My components), and one undo removes everything.
import type { Scenario } from '../lib/scenario.ts';
import { node, openTab, screenBlank, screenBox } from '../lib/designer.ts';
import { newWireframe } from '../lib/designer.ts';

type Doc = { children: { id: string; symbol?: { id: string }; children?: unknown[] }[]; wireframe: { symbols: { id: string; name: string; content: unknown }[] } };

export default {
  name: '20-colar-entre-projetos',
  steps: 5,
  /** Cut from the video: Roam, then the hfps-kit sample (the current project). */
  async setup(demo) {
    const { page } = demo;
    await newWireframe(demo);
    await demo.click(page.getByRole('dialog').locator('[data-sample="roam"]'));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await demo.menu('Help', 'Open sample project…');
    await demo.click(page.getByRole('dialog').locator('[data-sample="hfps-kit"]'));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    // An instance (on the sample's sheet) of a master that nests another one: found in the open document.
    const id = await page.evaluate(() => {
      const d = (window as unknown as { __designer: { useDocStore: { getState(): { doc: Doc } } } }).__designer.useDocStore.getState().doc;
      const nests = (s: { content: unknown }) => JSON.stringify(s.content).includes('"symbol":{"id"');
      const names = new Set(d.wireframe.symbols.filter((s) => /sheet|dialog/i.test(s.name) && nests(s)).map((s) => s.id));
      let hit: string | null = null;
      const walk = (n: { id: string; symbol?: { id: string }; children?: unknown[] }) => {
        if (!hit && n.symbol && names.has(n.symbol.id)) hit = n.id;
        for (const c of (n.children ?? []) as (typeof n)[]) walk(c);
      };
      d.children.forEach(walk);
      return hit;
    });
    if (!id) throw new Error('no instance of a sheet that nests buttons in the kit sample');

    await demo.caption('No projeto hfps-kit: uma folha (Form sheet) é um componente compartilhado com botões dentro dela');
    const first = node(page, id);
    const b0 = (await first.boundingBox())!;
    await demo.zoomAt({ x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 }, 5);
    await demo.pause(800);
    await demo.click(first, {}, { pause: 700 });
    await openTab(demo, 'Properties');
    await demo.pause(900);

    await demo.caption('Ctrl + C: copiamos a instância');
    await demo.key('ControlOrMeta+C', { show: 'Ctrl + C' });
    await demo.pause(900);

    await demo.caption('File → Projects…: vamos para o Roam, que não tem esse componente');
    await demo.menu('File', 'Projects…');
    await demo.click(page.getByRole('dialog').getByRole('button', { name: /^Roam/ }), {}, { pause: 600 });
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await openTab(demo, 'Assets');
    await demo.hover(page.getByText('My components').first(), {}, 1200);

    await demo.caption('Ctrl + V numa tela do Roam: continua sendo o componente compartilhado, com os botões que vêm dentro');
    await demo.key('ControlOrMeta+0', { show: false });
    const ex = await screenBox(page, 'Explore');
    await demo.zoomAt({ x: ex.x + ex.width / 2, y: ex.y + ex.height / 2 }, 6);
    await demo.click(await screenBlank(page, 'Explore'), {}, { pause: 500 });
    await demo.key('ControlOrMeta+V', { show: 'Ctrl + V' });
    await demo.pause(1200);
    await demo.hover(page.getByText('My components').first(), {}, 2200);

    await demo.caption('Ctrl + Z: um único desfazer tira a instância e os componentes importados');
    await demo.key('ControlOrMeta+Z', { show: 'Ctrl + Z' });
    await demo.pause(2200);
  },
} satisfies Scenario;
