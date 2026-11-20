// Video 13 (phase 4, Screen section → "Adapt to tablet with AI"): the Hoard Settings screen gets a tablet frame,
// made by the real agent (sped up), laid out for the width; the phone frame stays as it is.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import { openTab } from '../lib/designer.ts';
import { newestRow, screenNames, startAgentSession, waitForAgent, type AgentSession, frameLabel } from '../lib/agent.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
let session: AgentSession | null = null;

export default {
  name: '13-adaptar-para-tablet',
  steps: 6,
  async setup(demo) {
    session = await startAgentSession(demo, root, join(here, '../fixtures/agent/hoard-galeria-configuracoes.spec.json'));
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    await demo.caption('A tela Configurações existe só no celular; seleciono pelo nome');
    await demo.click(frameLabel(page, 'Configurações'));
    await openTab(demo, 'Properties');

    await demo.caption('Na seção Screen: “Adaptar para tablet com IA”, ao lado de + Tablet');
    const btn = page.getByRole('button', { name: 'Adapt to tablet with AI' });
    await demo.hover(btn, {}, 1200);
    await demo.click(btn);
    const dlg = page.getByRole('dialog');
    await demo.click(dlg.getByLabel('Hint (optional)'), {}, { pause: 200 });
    await demo.type('Duas colunas: servidor à esquerda, armazenamento e cache à direita', { delay: 28 });
    await demo.click(dlg.getByRole('button', { name: 'Adapt' }));
    await newestRow(page).waitFor();

    await demo.caption('O agente copia o quadro para tablet e o reorganiza para a largura');
    await demo.pause(1000);
    const run = await waitForAgent(demo, session!, 4);
    await demo.terminal([]);

    await demo.caption(`Pronto em ${Math.round(run.totalMs / 1000)} s: o quadro tablet ao lado do celular, mesmo conteúdo`);
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.pause(2400);
    if ((await screenNames(page)).filter((n) => n === 'Configurações').length !== 1) throw new Error('adapt should add a frame, not a screen');

    await demo.caption('Uma tela lógica, dois quadros: Phone e Tablet na seção Screens');
    await demo.click(page.getByTestId('agent-job-panel').getByRole('button', { name: 'Hide agent jobs' }));
    await demo.key('Escape', { show: false });
    await demo.hover(page.getByRole('tabpanel').getByText('Configurações', { exact: true }).first(), {}, 1800);

    await demo.caption('O quadro de celular continua igual; o tablet usa a largura em duas colunas');
    await demo.hover(frameLabel(page, 'Configurações'), {}, 2200);
  },
  async teardown() {
    await session?.stop();
  },
} satisfies Scenario;
