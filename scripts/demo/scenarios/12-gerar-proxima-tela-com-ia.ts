// Video 12 (phase 4, the flow drop menu's "Generate with AI"): on the Hoard Settings screen, a flow dragged from the
// "Backup do celular" row to empty canvas → Generate with AI with a short hint → the empty screen appears at once,
// linked, and the real agent fills it (sped up). Then Present: tap the row, the new screen, back.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import { canvas, canvasText, screenBox } from '../lib/designer.ts';
import { newestRow, startAgentSession, waitForAgent, type AgentSession, clickScreen, frameLabel } from '../lib/agent.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
let session: AgentSession | null = null;

export default {
  name: '12-gerar-proxima-tela-com-ia',
  steps: 8,
  async setup(demo) {
    session = await startAgentSession(demo, root, join(here, '../fixtures/agent/hoard-galeria-configuracoes.spec.json'));
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    await demo.caption('Configurações do Hoard (atual); a linha “Backup do celular” ainda não leva a lugar nenhum');
    const row = canvasText(page, /^Backup do celular$/).first();
    await demo.hover(row, {}, 1000);

    await demo.caption('Duplo clique seleciona a linha; arrasto o fluxo dela para o canvas vazio');
    await demo.dblclick(row);
    const cfg = await screenBox(page, 'Configurações');
    const c = (await canvas(page).boundingBox())!;
    const handle = canvas(page).locator('[data-slot="flow-handle"] circle');
    await demo.drag(handle, { x: Math.min(cfg.x + cfg.width + 170, c.x + c.width - 60), y: cfg.y + cfg.height * 0.35 }, { duration: 1300, hold: 900 });

    await demo.caption('“Gerar com IA”, com uma dica curta do que a tela deve ter');
    await demo.click(page.getByRole('menuitem', { name: /Generate with AI/ }));
    const dlg = page.getByRole('dialog');
    await demo.click(dlg.getByLabel('Hint (optional)'), {}, { pause: 200 });
    await demo.type('Pastas incluídas no backup, progresso e um botão para fazer backup agora', { delay: 28 });

    await demo.caption('A tela vazia é criada e ligada na hora; o agente a preenche ao vivo');
    await demo.click(dlg.getByRole('button', { name: 'Generate' }));
    await newestRow(page).waitFor();
    await demo.pause(1400);
    const run = await waitForAgent(demo, session!, 4);
    await demo.terminal([]);

    await demo.caption(`Pronto em ${Math.round(run.totalMs / 1000)} s: a tela “Backup do celular” segue o estilo de Configurações`);
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.hover(frameLabel(page, 'Backup do celular'), {}, 2200);

    await demo.caption('Apresentar: tocar na linha abre a tela nova; a seta volta');
    await clickScreen(demo, 'Configurações');
    await demo.menu('View', 'Present');
    const hotspot = page.locator('[data-slot="hotspot"]').filter({ visible: true }).and(page.getByRole('button', { name: 'Open Backup do celular' }));
    await demo.hover(hotspot, {}, 900);
    await demo.click(hotspot, {}, { pause: 1800 });
    const back = page.locator('[data-slot="hotspot"]').filter({ visible: true }).and(page.getByRole('button', { name: 'Open Configurações' }));
    if (await back.count()) await demo.click(back.first(), {}, { pause: 1200 });
    else await demo.click(page.getByRole('button', { name: 'Back', exact: true }), {}, { pause: 1200 });

    await demo.caption('Esc volta ao editor; o painel mostra o resumo do agente');
    await demo.key('Escape', { show: 'Esc' });
    await demo.hover(newestRow(page).getByTestId('agent-job-summary'), {}, 2200);
  },
  async teardown() {
    await session?.stop();
  },
} satisfies Scenario;
