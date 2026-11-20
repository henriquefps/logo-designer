// Video 11 (phase 4, "Turn into a wireframe with AI"): a project with the Hoard Galeria screen; a screenshot of the
// Settings screen pasted (Ctrl+V) on the canvas → the dialog (platform guessed: Phone) → the real `designer agent`
// running Claude Code builds it live; the wait is shown sped up. Needs Go, Claude Code logged in, and the Hoard
// screenshots (HOARD_SHOTS, default ~/designer-demos/inputs/hoard).
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import { canvas } from '../lib/designer.ts';
import { copyImageToClipboard, hoardShots, newestRow, startAgentSession, waitForAgent, type AgentSession, frameLabel } from '../lib/agent.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
let session: AgentSession | null = null;

export default {
  name: '11-print-para-wireframe-com-ia',
  steps: 7,
  async setup(demo) {
    session = await startAgentSession(demo, root, join(here, '../fixtures/agent/hoard-galeria.spec.json'));
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    const s = session!;
    await demo.caption('O projeto do Hoard tem a Galeria; o agente de IA está online nesta máquina (cachyos-fps)');
    await demo.hover(page.getByTestId('agent-status').first(), {}, 1400);

    await demo.caption('Copio a captura da tela de Configurações do celular e colo no canvas (Ctrl + V)');
    await copyImageToClipboard(page, join(hoardShots(), 'hoard-configuracoes.jpg'));
    const c = (await canvas(page).boundingBox())!;
    await demo.click({ x: c.x + c.width * 0.72, y: c.y + c.height * 0.5 });
    await demo.key('ControlOrMeta+V', { show: 'Ctrl + V' });
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Turn into a wireframe with AI' }).waitFor();

    await demo.caption('A plataforma vem da forma da imagem: alta e estreita → celular');
    await demo.hover(dlg.getByLabel('Platform'), {}, 1600);

    await demo.caption('“Transformar em wireframe com IA”: o job vai para o servidor de sync e o agente o pega');
    await demo.click(dlg.getByRole('button', { name: 'Turn into a wireframe with AI' }));
    await newestRow(page).waitFor();
    await demo.pause(1200);

    await demo.caption('O Claude Code monta a tela com componentes da biblioteca e compara com a captura');
    const run = await waitForAgent(demo, s, 6);
    await demo.terminal([]);

    await demo.caption('Pronto: a tela “Configurações” apareceu ao vivo, ao lado da Galeria');
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.hover(frameLabel(page, 'Configurações'), {}, 1800);

    await demo.caption(`O resumo do agente fica no painel (${Math.round(run.totalMs / 1000)} s no total, primeira mudança em ${Math.round((run.firstChangeMs ?? 0) / 1000)} s)`);
    await demo.hover(newestRow(page).getByTestId('agent-job-summary'), {}, 2600);
  },
  async teardown() {
    await session?.stop();
  },
} satisfies Scenario;
