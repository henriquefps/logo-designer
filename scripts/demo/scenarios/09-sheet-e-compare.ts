// Video 9 (looking at the result, phase 3 A3 + A4): what an agent looks at while it works, opened in the
// browser: `wf sheet` (every screen with status, flows and notes), `wf compare --overlay` (screenshot,
// wireframe and both blended; round 1 against the final round) and the to-png fidelity fix (before / after).
// The images are made by the CLI in setup from the e2e run's specs (scripts/demo/fixtures/hoard-e2e/), or
// taken from DEMO_E2E_DIR when the 08 recording left its project there.
//
//   HOARD_SHOTS=<dir with hoard-galeria.jpg, hoard-configuracoes.jpg>   needed for the compare images
//   DEMO_E2E_DIR=<dir>                                                 use (and keep) the e2e project and images there
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import { designer } from '../lib/live.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const rounds = join(here, '../fixtures/hoard-e2e');
const work = process.env.DEMO_E2E_DIR ? resolve(process.env.DEMO_E2E_DIR) : mkdtempSync(join(tmpdir(), 'designer-demo-sheet-'));
const shots = process.env.HOARD_SHOTS ? resolve(process.env.HOARD_SHOTS) : null;

interface Shot {
  id: string;
  title: string;
  caption: string;
  src: string;
}

function tourHtml(sections: Shot[][]): string {
  const figure = (s: Shot) =>
    `<figure id="${s.id}"><figcaption><b>${s.title}</b> · ${s.caption}</figcaption><img src="${s.src}" alt="${s.title}" data-zoom></figure>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Hoard · wf sheet / compare</title>
<style>
  :root { --bg: #eef1f5; --fg: #141a22; --muted: #5b6676; --card: #fff; --line: #d8dee8; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 64px 32px 48px; background: var(--bg); color: var(--fg); font: 15px/1.45 Inter, system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 22px; } header p { margin: 0 0 24px; color: var(--muted); }
  section { display: flex; gap: 20px; margin: 0 0 28px; align-items: flex-start; }
  figure { flex: 1; margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
  figcaption { margin: 0 0 8px; color: var(--muted); font-size: 13px; } figcaption b { color: var(--fg); font-size: 14px; }
  img { display: block; width: 100%; height: auto; cursor: zoom-in; border-radius: 6px; }
  #zoom { position: fixed; inset: 40px 0 0 0; background: rgba(12, 16, 22, .92); display: none; overflow: auto; cursor: zoom-out; z-index: 10; }
  #zoom.on { display: block; } #zoom img { width: auto; max-width: none; margin: 24px auto; cursor: zoom-out; }
</style></head><body>
<header><h1>Hoard · o que o agente olha</h1><p>Imagens geradas pelo CLI durante a rodada (wf sheet, wf compare) e o antes/depois da fidelidade do to-png.</p></header>
${sections.map((row) => `<section>${row.map(figure).join('')}</section>`).join('\n')}
<div id="zoom"><img alt=""></div>
<script>
  const zoom = document.getElementById('zoom'), big = zoom.querySelector('img');
  document.querySelectorAll('[data-zoom]').forEach((img) => img.addEventListener('click', () => {
    big.src = img.src; big.style.width = Math.round(img.naturalWidth * (img.dataset.scale ? +img.dataset.scale : 1)) + 'px';
    zoom.classList.add('on'); zoom.scrollTo(0, 0);
  }));
  zoom.addEventListener('click', () => zoom.classList.remove('on'));
</script></body></html>`;
}

export default {
  name: '09-sheet-e-compare',
  steps: 6,
  /** Cut from the video: the images (CLI) and the page that shows them. */
  async setup(demo) {
    mkdirSync(work, { recursive: true });
    const tour = join(work, 'tour');
    mkdirSync(tour, { recursive: true });
    const project = join(work, 'hoard.designer.json');
    if (!existsSync(project)) {
      copyFileSync(join(rounds, 'round-3.spec.json'), join(work, 'hoard.spec.json'));
      designer(root, ['wf', 'build', 'hoard.spec.json', '-o', 'hoard.designer.json'], work);
    }
    copyFileSync(join(rounds, 'round-1.spec.json'), join(tour, 'round-1.spec.json'));
    designer(root, ['wf', 'build', 'round-1.spec.json', '-o', 'round-1.designer.json'], tour);
    designer(root, ['wf', 'sheet', project, '--notes', '-o', join(work, 'hoard-sheet.png')], work);
    copyFileSync(join(work, 'hoard-sheet.png'), join(tour, 'sheet.png'));
    copyFileSync(join(root, 'docs/img/render-fidelity-before-after.png'), join(tour, 'fidelity.png'));
    const sections: Shot[][] = [[{ id: 'sheet', title: 'wf sheet --notes', caption: 'as telas como no canvas, com status, fluxos e notas', src: 'sheet.png' }]];
    if (shots && existsSync(join(shots, 'hoard-galeria.jpg'))) {
      for (const f of ['hoard-galeria.jpg', 'hoard-configuracoes.jpg']) copyFileSync(join(shots, f), join(work, f));
      const cmp = (shot: string, p: string, screen: string, out: string) => designer(root, ['wf', 'compare', join(work, shot), p, '--screen', screen, '--overlay', '50', '-o', out], work);
      cmp('hoard-galeria.jpg', project, 'Galeria', join(work, 'galeria.compare.png'));
      cmp('hoard-configuracoes.jpg', project, 'Configurações', join(work, 'configuracoes.compare.png'));
      cmp('hoard-configuracoes.jpg', join(tour, 'round-1.designer.json'), 'Configurações', join(tour, 'configuracoes.r1.png'));
      copyFileSync(join(work, 'galeria.compare.png'), join(tour, 'galeria.png'));
      copyFileSync(join(work, 'configuracoes.compare.png'), join(tour, 'configuracoes.png'));
      sections.push([{ id: 'galeria', title: 'wf compare --overlay 50 · Galeria', caption: 'captura, wireframe e os dois sobrepostos', src: 'galeria.png' }]);
      sections.push([
        { id: 'r1', title: 'Configurações · rodada 1', caption: 'sem o botão, texto grande', src: 'configuracoes.r1.png' },
        { id: 'final', title: 'Configurações · final', caption: 'botão, texto menor, espaçamento', src: 'configuracoes.png' },
      ]);
    }
    sections.push([{ id: 'fidelity', title: 'to-png: antes e depois (A4)', caption: 'app (Chromium) · CLI antes · CLI depois', src: 'fidelity.png' }]);
    writeFileSync(join(tour, 'index.html'), tourHtml(sections));
    await demo.page.goto(pathToFileURL(join(tour, 'index.html')).href);
    await demo.page.locator('#sheet img').waitFor();
    await demo.page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => {}))));
  },
  async run(demo) {
    const { page } = demo;
    const img = (id: string) => page.locator(`#${id} img`);
    const zoomed = page.locator('#zoom');

    await demo.caption('O que o agente olha durante a rodada, aberto no navegador: wf sheet e wf compare');
    await demo.hover(img('sheet'), { fx: 0.3, fy: 0.4 }, 900);
    await demo.move(img('sheet'), { fx: 0.55, fy: 0.12 });
    await demo.pause(900);

    await demo.caption('wf sheet --notes: as duas telas, status, as setas dos fluxos e as notas, numa imagem só');
    await demo.click(img('sheet'), { fx: 0.55, fy: 0.15 });
    await demo.pause(1200);
    await demo.move({ x: 700, y: 200 });
    await demo.scroll(0, 260);
    await demo.pause(1600);
    await demo.click({ x: 1200, y: 600 });

    if (await img('galeria').count()) {
      await demo.caption('wf compare --overlay 50: captura, wireframe e a sobreposição para ver o que desalinha');
      await demo.scroll(0, (await img('galeria').boundingBox())!.y - 120);
      await demo.click(img('galeria'), { fx: 0.85, fy: 0.3 });
      await demo.pause(1000);
      await demo.move({ x: 1000, y: 300 });
      await demo.scroll(0, 300);
      await demo.pause(1500);
      await demo.click({ x: 1200, y: 600 });

      await demo.caption('Configurações: rodada 1 (sem “Sincronizar agora”) ao lado da final');
      await demo.scroll(0, (await img('r1').boundingBox())!.y - 100);
      await demo.hover(img('r1'), { fx: 0.5, fy: 0.35 }, 1300);
      await demo.hover(img('final'), { fx: 0.5, fy: 0.35 }, 1300);
      await demo.click(img('final'), { fx: 0.5, fy: 0.35 });
      await demo.pause(1600);
      await demo.click({ x: 1200, y: 600 });
    } else {
      await demo.caption('(sem as capturas do Hoard: HOARD_SHOTS não definido, sem wf compare)');
    }

    await demo.caption('to-png antes: “D” e acentos tortos em Inter 500–700, que enganavam a comparação');
    await demo.scroll(0, (await img('fidelity').boundingBox())!.y - 80);
    await demo.hover(img('fidelity'), { fx: 0.1, fy: 0.55 }, 1000);
    await demo.click(img('fidelity'), { fx: 0.1, fy: 0.55 });
    await demo.pause(800);
    await demo.move({ x: 180, y: 430 });
    await demo.pause(1200);
    await demo.move({ x: 520, y: 430 }, {}, { duration: 900 });
    await demo.pause(1200);

    await demo.caption('to-png depois: igual ao app (acima), peso, espaçamento e acentos');
    await demo.move({ x: 180, y: 640 });
    await demo.pause(1200);
    await demo.move({ x: 520, y: 640 }, {}, { duration: 900 });
    await demo.pause(1600);
    if (await zoomed.isVisible()) await demo.click({ x: 1200, y: 780 });
    await demo.pause(800);
  },
} satisfies Scenario;
