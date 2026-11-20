// The wireframe mode overview (3–5 min, Portuguese captions): one continuous project, "Planejando a próxima versão do
// Hoard", told in ten chapters, each opened by a full-screen title card. Real app, real input, the real agent (Claude
// Code through `designer agent`, a local designer-sync built from sync-server/); every wait for the agent is shown sped
// up with the "⏩ acelerado" badge. Needs Go, Claude Code logged in, the Hoard screenshots (HOARD_SHOTS, default
// ~/designer-demos/inputs/hoard). `bun run demo overview`; the chapter times land in demo-out/16-overview.chapters.txt.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Demo } from '../lib/demo.ts';
import type { Scenario } from '../lib/scenario.ts';
import { canvas, canvasText, choose, dragFromLibrary, field, focusScreen, insertFromLibrary, libraryItem, openTab, screenBlank, screenBox, screenLabel, searchLibrary, setField } from '../lib/designer.ts';
import { designer, editProject } from '../lib/live.ts';
import { REQUEST } from './15-benchmark-configuracoes.ts';
import { copyImageToClipboard, hoardShots, newestRow, startAgentBackend, waitAgentOnline, waitForAgent, type AgentBackend } from '../lib/agent.ts';
import { dialog, findId, type W, hideJobs, hideJobsFor, linkTab, nodeLoc, screenToLeft, selectDeep, showJobs, tabOn } from '../lib/wf.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

export interface State {
  backend?: AgentBackend;
  /** The Hoard Settings benchmark fixture as a project file (chapter 9 opens it). */
  benchmarkFile?: string;
}

const state: State = {};

export interface Chapter {
  title: string;
  run(demo: Demo, st: State): Promise<void>;
}

export const chapters: Chapter[] = [
  {
    title: 'Começar',
    async run(demo) {
      const { page } = demo;
      await demo.chapter(1, 'Começar', 'Planejando a próxima versão do Hoard, um app de fotos, antes de escrever código');
      await demo.caption('File → New: três modos de projeto, lado a lado');
      await demo.key('Control+Alt+N', { show: 'Ctrl + Alt + N' });
      const cards = dialog(demo).getByRole('group', { name: 'Design mode' }).getByRole('button');
      await cards.first().waitFor();
      await demo.hover(cards.nth(0), {}, 900);
      await demo.hover(cards.nth(2), {}, 900);
      await demo.caption('Wireframe: telas e fluxo de um app, para entregar a uma IA');
      await demo.hover(cards.nth(1), {}, 900);
      await demo.click(cards.nth(1));
      await demo.caption('Um nome e a primeira tela: celular');
      const name = dialog(demo).getByLabel('Name', { exact: true });
      await demo.fill(name, 'Hoard — próxima versão', { enter: false });
      await demo.click(dialog(demo).getByRole('button', { name: 'Create', exact: true }));
      await dialog(demo).waitFor({ state: 'hidden' });
      await waitAgentOnline(page);
      await demo.caption('Na barra de status: o agente de IA (Claude Code) está online nesta máquina');
      await demo.hover(page.getByTestId('agent-status').first(), {}, 1300);
    },
  },
  {
    title: 'Do print ao wireframe',
    async run(demo, st) {
      const { page } = demo;
      await demo.chapter(2, 'Do print ao wireframe', 'Uma captura de tela do app atual vira uma tela editável');
      await demo.caption('Copio a captura da Galeria do Hoard e colo no canvas (Ctrl + V)');
      await copyImageToClipboard(page, join(hoardShots(), 'hoard-galeria.jpg'));
      const c = (await canvas(page).boundingBox())!;
      await demo.click({ x: c.x + c.width * 0.7, y: c.y + c.height * 0.45 });
      await demo.key('ControlOrMeta+V', { show: 'Ctrl + V' });
      const dlg = dialog(demo);
      const go = dlg.getByRole('button', { name: 'Turn into a wireframe with AI' });
      await go.waitFor();
      await demo.caption('“Transformar em wireframe com IA”: celular, nome Galeria');
      const nameField = dlg.getByLabel('Name', { exact: false }).first();
      if (await nameField.count()) await demo.fill(nameField, 'Galeria', { enter: false });
      const hint = dlg.getByLabel(/^Hint/).first();
      if (await hint.count()) {
        await demo.click(hint, {}, { pause: 200 });
        await demo.type('Notas em português', { delay: 40 });
      }
      await demo.click(go);
      await newestRow(page).waitFor();
      await demo.caption('O Claude Code monta a tela com componentes da biblioteca, ao vivo');
      const job = await hideJobsFor(demo);
      await screenToLeft(demo, 'Screen 1');
      await waitForAgent(demo, st.backend!, 8, { jobId: job });
      await demo.terminal([]);
      await demo.caption('Pronto: a Galeria, com o texto, a estrutura e notas sobre o que a captura não mostra');
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.pause(1800);
    },
  },
  {
    title: 'Editar à mão',
    async run(demo) {
      await demo.chapter(3, 'Editar à mão', 'Tudo o que a IA fez é um componente comum: dá para mudar, mover, completar');
      await hideJobs(demo);
      await focusScreen(demo, 'Galeria', 1.45, 50);
      await demo.caption('Clique e duplo clique: entro na pilha e seleciono o cabeçalho do dia');
      const header = await findId(demo, 'Galeria', { kind: 'section-header' });
      await selectDeep(demo, header, { fx: 0.3 });
      await demo.caption('Properties: o cabeçalho vira “Hoje”, com “9 fotos” à direita');
      await openTab(demo, 'Properties');
      await setField(demo, 'Label', 'Hoje');
      await setField(demo, 'Action', '9 fotos');
      await demo.caption('Assets → Components: um controle segmentado entra logo depois do que está selecionado');
      await insertFromLibrary(demo, 'Segmented control', 'segm');
      await openTab(demo, 'Properties');
      await setField(demo, 'Segment 1', 'Dias');
      await setField(demo, 'Segment 2', 'Meses');
      await setField(demo, 'Segment 3', 'Anos');
      await demo.caption('Arrasto para cima do “Hoje”: a linha azul mostra onde ele entra');
      const seg = await findId(demo, 'Galeria', { kind: 'segmented-control' });
      await demo.drag(nodeLoc(demo, seg), nodeLoc(demo, header), { fromAim: { fx: 0.6, fy: 0.3 }, toAim: { fx: 0.5, fy: 0, dy: 3 }, hold: 900 });
      await demo.key('Escape', { show: false });
      await demo.key('Escape', { show: false });
      await demo.pause(900);
    },
  },
  {
    title: 'Contêineres e listas',
    async run(demo) {
      const { page } = demo;
      await demo.chapter(4, 'Contêineres e listas', 'Um card feito à mão e repetido vira uma lista de qualquer coisa');
      await hideJobs(demo);
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.caption('A tela vazia vira “Arquivos”, a outra aba do app');
      await demo.click(await screenBlank(page, 'Screen 1'));
      await openTab(demo, 'Properties');
      await setField(demo, 'Screen name', 'Arquivos');
      await focusScreen(demo, 'Arquivos', 1.5, 50);
      await demo.caption('Layout: uma pilha vertical com um Card container dentro');
      await insertFromLibrary(demo, 'Vertical stack', 'vert');
      await insertFromLibrary(demo, 'Card container', 'card c');
      await demo.caption('Dentro do card: uma imagem (arrastada), um título e um texto');
      await dragFromLibrary(demo, 'Image', await demo.point(canvasText(page, 'Drop elements here').first()), { query: 'imag' });
      // With the image selected, a click on the library adds the next piece right after it, in the card.
      await insertFromLibrary(demo, 'Heading', 'heading');
      await openTab(demo, 'Properties');
      await setField(demo, 'Text', 'Câmera');
      await insertFromLibrary(demo, 'Text', 'text');
      await openTab(demo, 'Properties');
      await setField(demo, 'Text', '1.248 fotos · 6,2 GB');
      await demo.caption('A imagem mais baixa: puxo a alça de baixo');
      const img = await findId(demo, 'Arquivos', { kind: 'image' });
      await selectDeep(demo, img);
      await demo.drag(nodeLoc(demo, img), nodeLoc(demo, img), { fromAim: { fx: 0.5, fy: 1 }, toAim: { fx: 0.5, fy: 0.55 }, hold: 400 });
      await demo.caption('A pilha: “Repeat first item”, 4 vezes, 12 px entre eles');
      await selectDeep(demo, await findId(demo, 'Arquivos', { kind: 'image', up: 2 }), { fy: 0.9 });
      await openTab(demo, 'Properties');
      await demo.click(field(page, 'Repeat first item'));
      await setField(demo, 'Repeat count', '4');
      await setField(demo, 'Gap', '12');
      await demo.caption('Uma lista de cards personalizados: as cópias seguem o primeiro');
      await demo.key('Escape', { show: false });
      await demo.key('Escape', { show: false });
      await demo.move(await screenBlank(page, 'Arquivos'));
      await demo.scroll(0, 220);
      await demo.pause(1200);
    },
  },
  {
    title: 'Componentes compartilhados',
    async run(demo) {
      const { page } = demo;
      await demo.chapter(5, 'Componentes compartilhados', 'A barra de abas é uma só: muda numa tela, muda em todas');
      await hideJobs(demo);
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.caption('Seleciono a barra de navegação que a IA desenhou na Galeria');
      const nav = await findId(demo, 'Galeria', { kind: 'bottom-navigation' });
      await selectDeep(demo, nav, { fx: 0.5, fy: 0.5 });
      await demo.caption('Object → Make component…: vira o componente “Barra de abas”');
      await demo.menu('Object', 'Vertical stack');
      await demo.menu('Object', 'Make component…');
      const name = dialog(demo).getByRole('textbox');
      await name.waitFor();
      await demo.click(name, {}, { pause: 200 });
      await page.keyboard.press('ControlOrMeta+A');
      await demo.type('Barra de abas');
      await demo.click(dialog(demo).getByRole('button', { name: 'Make component', exact: true }));
      await demo.caption('Assets → My components: a mesma barra na tela Arquivos');
      await demo.click(screenLabel(page, 'Arquivos'));
      await searchLibrary(demo, 'barra');
      await demo.click(libraryItem(page, 'Barra de abas'), { fy: 0.4 });
      await demo.key('Escape', { show: false });
      await demo.key('Escape', { show: false });
      await demo.pause(1000);
    },
  },
  {
    title: 'Fluxo',
    async run(demo, st) {
      const { page } = demo;
      await demo.chapter(6, 'Fluxo', 'Setas dizem para onde cada toque leva; a IA desenha a próxima tela');
      await hideJobs(demo);
      await demo.caption('Duplo clique entra na barra; cada aba tem a sua alça de fluxo');
      await demo.click(await tabOn(demo, 'Galeria', 'Arquivos'));
      await demo.page.waitForTimeout(650);
      await demo.dblclick(await tabOn(demo, 'Galeria', 'Arquivos'));
      await demo.caption('Aba “Arquivos” → tela Arquivos, para toda tela que usa a barra');
      await linkTab(demo, 'Galeria', 'Arquivos', 'Arquivos');
      await demo.caption('E “Galeria” → Galeria: um link no componente vale nas duas telas');
      await linkTab(demo, 'Galeria', 'Galeria', 'Galeria');
      await demo.caption('Aba selecionada: “Follows the screen”, cada tela marca a sua');
      await demo.key('Escape', { show: false });
      await demo.key('Escape', { show: false });
      await selectDeep(demo, await findId(demo, 'Galeria', { kind: 'bottom-navigation' }), { fx: 0.5, fy: 0.75 });
      await openTab(demo, 'Properties');
      const sel = field(page, 'Selected tab: follows the screen or fixed');
      if ((await sel.textContent())?.includes('Fixed')) await choose(demo, 'Selected tab: follows the screen or fixed', 'Follows the screen');
      else await demo.hover(sel, {}, 900);
      await demo.key('Escape', { show: false });
      await demo.key('Escape', { show: false });
      await demo.hover(await tabOn(demo, 'Arquivos', 'Arquivos'), {}, 900);
      await demo.caption('Do card “Câmera” arrasto um fluxo até o canvas vazio → Generate with AI');
      const card = await findId(demo, 'Arquivos', { kind: 'image', up: 1 });
      await selectDeep(demo, card, { fx: 0.5, fy: 0.85 });
      const gal = await screenBox(page, 'Galeria');
      const c = (await canvas(page).boundingBox())!;
      // Right of Galeria and of the agent's notes beside it.
      const notesRight = await page.evaluate((g) => {
        const rs = Array.from(document.querySelectorAll('[data-slot="canvas"] [data-node-id]'))
          .filter((e) => e.parentElement?.closest('[data-node-id]') == null)
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.left >= g.x + g.width - 1 && r.left < g.x + g.width + 140 && r.top < g.y + 900);
        return Math.max(g.x + g.width, ...rs.map((r) => r.right));
      }, gal);
      await demo.drag(canvas(page).locator('[data-slot="flow-handle"] circle'), { x: Math.min(notesRight + 40, c.x + c.width - 60), y: gal.y + 30 }, { duration: 1300, hold: 700 });
      await demo.click(page.getByRole('menuitem', { name: /Generate with AI/ }));
      const dlg = dialog(demo);
      await demo.click(dlg.getByLabel('Hint (optional)'), {}, { pause: 200 });
      await demo.type('As fotos da pasta Câmera em grade, agrupadas por mês, com um botão de voltar', { delay: 22 });
      await demo.click(dlg.getByRole('button', { name: 'Generate' }));
      await newestRow(page).waitFor();
      await demo.caption('A tela vazia já existe e está ligada; o agente a preenche ao vivo');
      const job = await hideJobsFor(demo);
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await waitForAgent(demo, st.backend!, 6, { jobId: job });
      await demo.terminal([]);
      await demo.caption('As setas contornam as telas no caminho, nunca passam por cima delas');
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.pause(2200);
    },
  },
  {
    title: 'Notas e status',
    async run(demo) {
      const { page } = demo;
      await demo.chapter(7, 'Notas e status', 'O que a tela não mostra vai numa nota; o status diz o que muda');
      await hideJobs(demo);
      await focusScreen(demo, 'Galeria', 2, 50);
      await demo.caption('Ferramenta Nota (K) e um clique na lista de fotos');
      await demo.key('k', { show: 'K' });
      const header = await findId(demo, 'Galeria', { kind: 'section-header' });
      await demo.click(nodeLoc(demo, header), { fx: 0.3, fy: 0.5 });
      await demo.caption('Um comportamento: puxar para atualizar');
      await demo.click(field(page, 'Note text'), {}, { pause: 250 });
      await page.keyboard.press('ControlOrMeta+A');
      await demo.type('Puxar para baixo atualiza: busca fotos novas no servidor.', { delay: 38 });
      await demo.key('Escape', { show: false });
      await demo.key('Escape', { show: false });
      await demo.caption('Status: a Galeria muda nesta versão (Changed), Arquivos é nova (New)');
      await demo.click(screenLabel(page, 'Galeria'));
      await openTab(demo, 'Properties');
      await choose(demo, 'Screen status', 'Changed');
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.click(screenLabel(page, 'Arquivos'));
      await choose(demo, 'Screen status', 'New');
      await demo.key('Escape', { show: false });
      await demo.pause(1600);
    },
  },
  {
    title: 'Apresentar',
    async run(demo) {
      const { page } = demo;
      await demo.chapter(8, 'Apresentar', 'Clicar pelo app como num protótipo, sem escrever código');
      await hideJobs(demo);
      await demo.caption('View → Present, a partir da Galeria');
      await demo.click(screenLabel(page, 'Galeria'));
      await demo.menu('View', 'Present');
      const hot = (re: RegExp) => page.locator('[data-slot="hotspot"]').filter({ visible: true }).and(page.getByRole('button', { name: re }));
      await demo.caption('As abas levam de tela em tela; a aba certa fica marcada');
      await demo.hover(hot(/^Arquivos: open Arquivos/), {}, 600);
      await demo.click(hot(/^Arquivos: open Arquivos/), {}, { pause: 1300 });
      await demo.caption('O card Câmera abre a tela que a IA gerou; a seta volta');
      const open = hot(/^Open /).first();
      await demo.hover(open, {}, 600);
      await demo.click(open, {}, { pause: 1600 });
      const back = hot(/^Open Arquivos/);
      if (await back.count()) await demo.click(back.first(), {}, { pause: 1100 });
      else await demo.click(page.getByRole('button', { name: 'Back', exact: true }), {}, { pause: 1100 });
      await demo.click(hot(/^Galeria: open Galeria/), {}, { pause: 1200 });
      await demo.key('Escape', { show: 'Esc' });
    },
  },
  {
    title: 'Pedir ao agente',
    async run(demo, st) {
      const { page } = demo;
      await demo.chapter(9, 'Pedir ao agente', 'Um pedido em português, sobre um projeto inteiro: a IA reorganiza, você decide');
      await hideJobs(demo);
      await demo.caption('File → Open project file…: a tela Configurações inteira do Hoard de hoje');
      const chooser = page.waitForEvent('filechooser');
      await demo.menu('File', 'Open project file…');
      await (await chooser).setFiles(st.benchmarkFile!);
      await screenLabel(page, 'Configurações').waitFor();
      await waitAgentOnline(page);
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.caption('Doze seções numa coluna só: comprida demais');
      const cfg = await screenBox(page, 'Configurações');
      const c = (await canvas(page).boundingBox())!;
      await demo.zoomAt({ x: cfg.x + cfg.width / 2, y: c.y + 60 }, 2.6);
      await demo.move({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
      await demo.scroll(0, 1600);
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.caption('Ask the agent… (Ctrl + K), com as palavras do Henrique');
      await demo.key('ControlOrMeta+K', { show: 'Ctrl + K' });
      const dlg = dialog(demo);
      await demo.click(dlg.getByLabel('Request'), {}, { pause: 200 });
      await demo.type(REQUEST, { delay: 12 });
      await demo.pause(700);
      await demo.click(dlg.getByRole('button', { name: 'Send' }));
      await newestRow(page).waitFor();
      await demo.caption('Menu novo e uma tela por entrada aparecem ao vivo');
      const job = await hideJobsFor(demo);
      await screenToLeft(demo, 'Configurações', 30);
      const run = await waitForAgent(demo, st.backend!, 14, { timeoutMs: 30 * 60_000, jobId: job });
      await demo.terminal([]);
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.caption(`Pronto em ${Math.round(run.totalMs / 1000)} s: a tela atual fica intacta, a proposta ao lado`);
      await demo.pause(1600);
      const menu = await page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc.wireframe.screens.find((x) => x.status === 'changed')?.name ?? null);
      if (menu) {
        const b = await screenBox(page, menu);
        await demo.zoomAt({ x: b.x + b.width * 1.5, y: b.y + 40 }, 3.2);
        await demo.pause(2600);
        await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      }
      await demo.caption('Não gostou? Um clique desfaz tudo o que o agente fez. Gostou? É só continuar');
      await showJobs(demo);
      await demo.hover(newestRow(page).getByRole('button', { name: /Undo the agent/ }), {}, 2400);
    },
  },
  {
    title: 'Entregar para a IA',
    async run(demo) {
      const { page } = demo;
      await demo.chapter(10, 'Entregar para a IA', 'O plano vira um pacote que qualquer agente de código entende');
      await hideJobs(demo);
      await demo.caption('File → Projects…: de volta ao Hoard — próxima versão');
      await demo.menu('File', 'Projects…');
      await demo.click(dialog(demo).getByRole('button', { name: /^Hoard — próxima versão/ }));
      await dialog(demo).waitFor({ state: 'hidden' });
      await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
      await demo.caption('File → Export for AI…: um .zip com README, uma página por tela e as imagens');
      const download = page.waitForEvent('download');
      await demo.menu('File', 'Export for AI…');
      const dl = await download;
      const file = await dl.path();
      const { default: JSZip } = await import('jszip');
      const { readFileSync } = await import('node:fs');
      const zip = await JSZip.loadAsync(readFileSync(file));
      // Everything sits in a `<project>/` folder; README first.
      const all = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
      const isReadme = (n: string) => /(^|\/)README\.md$/.test(n);
      const names = all.sort((a, b) => (isReadme(a) ? -1 : isReadme(b) ? 1 : a.localeCompare(b)));
      const readme = await zip.file(names[0])!.async('string');
      const folder = names[0].replace(/README\.md$/, '');
      const shown = names.map((n) => n.slice(folder.length));
      const c = (await canvas(page).boundingBox())!;
      const rect = { x: 24, y: c.y + 10, width: 1232, height: c.height - 20 };
      const show = (on: number, text: string) =>
        page.evaluate((d) => (window as unknown as { __demoDoc(d: unknown): void }).__demoDoc(d), { title: `${dl.suggestedFilename()} · ${names.length} arquivos`, files: shown, on, text, rect });
      await show(0, readme);
      await demo.pause(2200);
      await demo.caption('O README: telas, status, o fluxo (também em Mermaid) e as notas');
      await demo.move({ x: rect.x + 600, y: rect.y + 300 });
      await page.evaluate(() => {
        const t = document.querySelector('#demo-doc .text');
        if (t) t.scrollTo({ top: t.scrollHeight * 0.45, behavior: 'smooth' });
      });
      await demo.pause(2600);
      const screenFile = names.find((n) => /galeria/i.test(n) && n.endsWith('.md'));
      if (screenFile) {
        await demo.caption('Cada tela: os componentes em ordem, as notas ao lado, para onde cada toque leva');
        await show(names.indexOf(screenFile), await zip.file(screenFile)!.async('string'));
        await demo.pause(3000);
      }
      await page.evaluate(() => (window as unknown as { __demoDoc(d: unknown): void }).__demoDoc(null));
      await demo.caption('Ou Copy for AI: o mesmo texto, para colar na conversa com o agente');
      await demo.menu('File', 'Copy for AI');
      await demo.pause(700);
      await page.evaluate((r) => (window as unknown as { __demoPasteBox(t: string, r: object): void }).__demoPasteBox('Conversa com o agente de código (fora do Designer)', r), { x: 24, y: c.y + 10, width: 1232, height: c.height - 20 });
      const area = page.locator('#demo-paste textarea');
      await demo.click(area, { fy: 0.2 }, { pause: 300 });
      await demo.key('ControlOrMeta+V', { show: 'Ctrl + V' });
      if (!(await area.inputValue())) throw new Error('Nothing was pasted after Copy for AI');
      await demo.pause(2200);
      await demo.chapter(0, 'E tem mais', undefined, {
        ms: 5200,
        label: '',
        items: [
          'Variantes tablet e desktop de cada tela, ou “Adapt with AI”',
          'Status atual / alterada / nova em cada tela',
          'designer wf na linha de comando: build, dump, sheet, compare',
          'Edição ao vivo: um agente edita o arquivo, você vê no app',
          'designer.hfps.dev',
        ],
      });
    },
  },
];

export default {
  name: '16-overview',
  steps: 0,
  async setup(demo, st: State = state) {
    // The browser's own file picker cannot be driven; without it the app falls back to a file input (as in Firefox).
    await demo.page.addInitScript(() => void delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker);
    st.backend = await startAgentBackend(demo, root);
    st.benchmarkFile = join(st.backend.work, 'hoard-configuracoes.designer.json');
    designer(root, ['new', '--preset', 'wireframe', '--name', 'Hoard — Configurações', '-o', st.benchmarkFile], st.backend.work);
    designer(root, ['wf', 'build', join(here, '../fixtures/hoard-benchmark/configuracoes-atual.spec.json'), '--into', st.benchmarkFile], st.backend.work);
    editProject(st.benchmarkFile, (d) => void (d.name = 'Hoard — Configurações'));
  },
  async run(demo) {
    // Ten chapters in 3–5 minutes: everything a little quicker than the feature videos.
    demo.pace = 0.75;
    for (const ch of chapters) await ch.run(demo, state);
  },
  async teardown(st: State = state) {
    await st.backend?.stop();
  },
} satisfies Scenario & { setup(demo: Demo, st?: State): Promise<void>; teardown(st?: State): Promise<void> };
