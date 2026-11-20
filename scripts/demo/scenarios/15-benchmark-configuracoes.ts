// Video 15, Henrique's benchmark for the agent (docs/agents.md → Benchmark): the WHOLE Hoard Settings screen (status
// current, scripts/demo/fixtures/hoard-benchmark/) and his request, word for word, through Ask the agent…; the real
// agent reorganizes it live (sped up); then Present through the new menu and a few sub-screens, and the automatic
// part of the score (scripts/benchmark-coverage.ts, designer validate) as the last caption.
//
//   BENCH_OUT=<dir>   keeps the final project, its sheet, the coverage report and the agent's summary there
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import { canvas, node, screenBox } from '../lib/designer.ts';
import { newestRow, startAgentSession, waitForAgent, type AgentSession, frameLabel } from '../lib/agent.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
let session: AgentSession | null = null;

/** Henrique's words, exactly. */
export const REQUEST =
  'Esse menu de configurações está muito longo, tem muitos itens misturados. Organize em várias entradas, várias seções, por exemplo uma entrada de servidor, uma de gerenciamento de dados, e assim por diante, cada uma com a sua tela, na versão celular.';

type W = { __designer: { useDocStore: { getState(): { doc: { wireframe: { screens: { id: string; name: string; status?: string }[] } } } } } };

export default {
  name: '15-benchmark-configuracoes',
  steps: 9,
  async setup(demo) {
    session = await startAgentSession(demo, root, join(here, '../fixtures/hoard-benchmark/configuracoes-atual.spec.json'));
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    const s = session!;
    await demo.caption('Benchmark: a tela Configurações inteira do Hoard (estado atual), 12 seções numa coluna só');
    await demo.hover(frameLabel(page, 'Configurações'), {}, 1500);
    const c = (await canvas(page).boundingBox())!;
    const b = await screenBox(page, 'Configurações');
    await demo.zoomAt({ x: b.x + b.width / 2, y: c.y + 60 }, 3);
    await demo.move({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
    await demo.scroll(0, 1400);
    await demo.scroll(0, 1400);
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });

    await demo.caption('O pedido do Henrique, palavra por palavra, em Ask the agent… (Ctrl + K)');
    await demo.key('ControlOrMeta+K', { show: 'Ctrl + K' });
    const dlg = page.getByRole('dialog');
    await demo.click(dlg.getByLabel('Request'), {}, { pause: 200 });
    await demo.type(REQUEST, { delay: 14 });
    await demo.pause(900);
    await demo.click(dlg.getByRole('button', { name: 'Send' }));
    await newestRow(page).waitFor();

    await demo.caption('O agente (Claude Code, sem ajuda) reorganiza o projeto; as telas aparecem aqui ao vivo');
    await demo.pause(1000);
    const run = await waitForAgent(demo, s, 12, { timeoutMs: 30 * 60_000 });
    await demo.terminal([]);

    const summary = (await newestRow(page).getByTestId('agent-job-summary').textContent().catch(() => '')) ?? '';
    await demo.caption(`Pronto em ${Math.round(run.totalMs / 1000)} s: a tela atual fica, ao lado o menu novo e uma tela por entrada`);
    await demo.click(page.getByTestId('agent-job-panel').getByRole('button', { name: 'Hide agent jobs' }));
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.pause(2500);

    const screens = await page.evaluate(() => (window as unknown as W).__designer.useDocStore.getState().doc.wireframe.screens);
    const menu = screens.find((x) => x.status === 'changed');
    if (menu) {
      await demo.caption(`Apresentar a partir de “${menu.name}”: cada entrada abre a sua tela, a seta volta`);
      // Its frame, clicked in its empty lower part (the labels of "Configurações" and "Configurações (nova)" are both cut
      // to "Confi…" at this zoom): Present starts from the selected screen.
      const frameId = await page.evaluate(
        (id) => (window as unknown as { __designer: { useDocStore: { getState(): { doc: { children: { id: string; screen?: { screenId: string } }[] } } } } }).__designer.useDocStore.getState().doc.children.find((c) => c.screen?.screenId === id)?.id,
        menu.id,
      );
      await demo.click(node(page, frameId!), { fx: 0.5, fy: 0.92 });
      await demo.menu('View', 'Present');
      const hotspots = page.locator('[data-slot="hotspot"]').filter({ visible: true });
      await hotspots.first().waitFor();
      const count = await hotspots.count();
      for (const i of count >= 3 ? [0, Math.floor(count / 2), count - 1] : [...Array(count).keys()]) {
        const h = hotspots.nth(i);
        await demo.hover(h, {}, 700);
        await demo.click(h, {}, { pause: 2000 });
        const back = page.locator('[data-slot="hotspot"]').filter({ visible: true }).and(page.getByRole('button', { name: `Open ${menu.name}` }));
        await back.first().waitFor({ timeout: 5000 });
        await demo.click(back.first(), {}, { pause: 1100 });
      }
      await demo.key('Escape', { show: 'Esc' });
    }

    // The score's automatic part, from the project as the app has it (sped up: the CLI renders every screen).
    const out = process.env.BENCH_OUT ? resolve(process.env.BENCH_OUT) : join(s.work, 'benchmark');
    mkdirSync(out, { recursive: true });
    await demo.caption('Conferindo: cobertura item a item (antes × depois), designer validate, Export for AI');
    const { cov, val } = await demo.speedUp(8, async () => {
      const doc = await page.evaluate(() => (window as unknown as { __designer: { useDocStore: { getState(): { doc: unknown } } } }).__designer.useDocStore.getState().doc);
      const file = join(out, 'hoard-benchmark.designer.json');
      writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      writeFileSync(join(out, 'agent-summary.txt'), `${summary}\n`);
      writeFileSync(join(out, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
      const cov = spawnSync('bun', [join(root, 'scripts/benchmark-coverage.ts'), file, '--json', join(out, 'coverage.json')], { cwd: root, encoding: 'utf8' });
      writeFileSync(join(out, 'coverage.txt'), cov.stdout + cov.stderr);
      const val = spawnSync('bun', [join(root, 'bin/designer.ts'), 'validate', file], { cwd: root, encoding: 'utf8' });
      writeFileSync(join(out, 'validate.txt'), val.stdout + val.stderr);
      spawnSync('bun', [join(root, 'bin/designer.ts'), 'wf', 'sheet', file, '--notes', '-o', join(out, 'sheet.png')], { cwd: root });
      const exp = spawnSync('bun', [join(root, 'bin/designer.ts'), 'export-ai', file, '--dir', join(out, 'export-ai')], { cwd: root, encoding: 'utf8' });
      writeFileSync(join(out, 'export.log'), exp.stdout + exp.stderr);
      return { cov, val };
    });
    console.log(cov.stdout);
    const lines = cov.stdout.split('\n');
    const shown = [lines[0], ...lines.filter((l) => /^ {2}(missing|duplicated|extra):/.test(l)), lines.find((l) => /^(PASS|FAIL)/.test(l)) ?? ''];
    await demo.terminal(['$ bun scripts/benchmark-coverage.ts hoard-benchmark.designer.json', ...shown.map((l) => `  ${l.trim().slice(0, 66)}`)], { clear: true, keep: 7, width: 560 });
    const ok = cov.status === 0;
    const valid = val.status === 0;
    const st = (JSON.parse(readFileSync(join(out, 'coverage.json'), 'utf8')) as { structure: { menu: { entries: number } | null; sub: { fromMenu: boolean; backToMenu: boolean }[] } }).structure;
    const linked = st.sub.length > 0 && st.sub.every((x) => x.fromMenu && x.backToMenu);
    await demo.caption(
      `Cobertura: ${ok ? 'cada item uma vez, nada inventado' : 'FALHOU'} · ${st.menu?.entries ?? 0} entradas, ${linked ? 'ida e volta em todas' : 'fluxos incompletos'} · validate ${valid ? 'ok' : 'falhou'} · ${Math.round(run.totalMs / 1000)} s`,
    );
    await demo.pause(4000);
  },
  async teardown() {
    await session?.stop();
  },
} satisfies Scenario;
