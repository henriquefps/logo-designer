// Video 14 (phase 4, Edit → "Ask the agent…" / Ctrl+K): a free request about the project. The real agent (sped up)
// keeps the "current" Galeria as it is and proposes the change on a "changed" copy, with the empty state as a new
// screen; then Present through it.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import { clickScreen, newestRow, screenNames, startAgentSession, waitForAgent, type AgentSession } from '../lib/agent.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
let session: AgentSession | null = null;

export default {
  name: '14-pedir-ao-agente',
  steps: 7,
  async setup(demo) {
    session = await startAgentSession(demo, root, join(here, '../fixtures/agent/hoard-galeria-configuracoes.spec.json'));
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    await demo.caption('Edit → Ask the agent… (ou Ctrl + K): um pedido livre sobre o projeto todo');
    await demo.menu('Edit', 'Ask the agent');
    const dlg = page.getByRole('dialog');
    await demo.click(dlg.getByLabel('Request'), {}, { pause: 200 });
    await demo.type('Adicione um campo de busca no topo da Galeria e um estado vazio para quando a busca não encontra nada', { delay: 26 });

    await demo.caption('Enviar: o projeto vai para o servidor de sync e o agente começa');
    await demo.click(dlg.getByRole('button', { name: 'Send' }));
    await newestRow(page).waitFor();
    await demo.pause(1200);

    await demo.caption('O agente lê o projeto todo, edita o spec e reconstrói; tudo aparece aqui ao vivo');
    const run = await waitForAgent(demo, session!, 5);
    await demo.terminal([]);

    const names = await screenNames(page);
    const changed = names.find((n) => n.startsWith('Galeria') && n !== 'Galeria' && !/vazi|result/i.test(n)) ?? 'Galeria';
    await demo.caption(`Pronto em ${Math.round(run.totalMs / 1000)} s: a Galeria atual fica intacta; a proposta é uma cópia “changed”`);
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.pause(2600);

    await demo.caption('O resumo do agente explica o que fez e o que supôs');
    await demo.click(newestRow(page).getByRole('button', { name: 'More' }).or(newestRow(page).getByTestId('agent-job-summary')).first());
    await demo.pause(2600);

    await demo.caption(`Apresentar a partir de “${changed}”: a busca leva ao estado vazio`);
    await clickScreen(demo, changed);
    await demo.menu('View', 'Present');
    const hotspots = page.locator('[data-slot="hotspot"]').filter({ visible: true });
    if (await hotspots.count()) {
      await demo.hover(hotspots.first(), {}, 900);
      await demo.click(hotspots.first(), {}, { pause: 1800 });
    } else await demo.pause(1800);

    await demo.caption('Esc volta ao editor');
    await demo.key('Escape', { show: 'Esc' });
    await demo.pause(800);
  },
  async teardown() {
    await session?.stop();
  },
} satisfies Scenario;
