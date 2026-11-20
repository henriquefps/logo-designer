// Video 8 (an agent builds a wireframe live, phase 3 end to end): an agent turns two Hoard screenshots
// (Gallery and Settings) into a wireframe project with the CLI only (`wf components`, `wf build --into`,
// `wf compare`, `wf sheet`) while `designer live` mirrors the file to a real designer-sync; the app (Sync on)
// shows each round as it lands. Then Henrique adjusts the project in the app and the agent's file gets it.
// The specs are the three rounds of the real run (scripts/demo/fixtures/hoard-e2e/); every command shown in
// the terminal strip is run for real and its output is what it printed.
//
//   HOARD_SHOTS=<dir with hoard-galeria.jpg, hoard-configuracoes.jpg>   also runs wf compare
//   DEMO_E2E_DIR=<dir>                                                 keeps the project, spec, sheet and compares there
import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import type { Demo } from '../lib/demo.ts';
import { canvas, canvasText, choose, field, nodeWithText, openTab, screenLabel } from '../lib/designer.ts';
import { designer, readProject, startLive, startSyncServer, waitUntil, type LiveProcess, type SyncServer } from '../lib/live.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const rounds = join(here, '../fixtures/hoard-e2e');
const work = process.env.DEMO_E2E_DIR ? resolve(process.env.DEMO_E2E_DIR) : mkdtempSync(join(tmpdir(), 'designer-demo-agent-'));
const shots = process.env.HOARD_SHOTS ? resolve(process.env.HOARD_SHOTS) : null;
const file = join(work, 'hoard.designer.json');
const spec = join(work, 'hoard.spec.json');
let server: SyncServer | null = null;
let live: LiveProcess | null = null;

/** Runs `designer <args>` in the work folder and shows the command and the lines of its output that matter. */
async function run(demo: Demo, args: string[], show: (out: string) => string[] = (o) => o.split('\n').slice(-2)): Promise<string> {
  await demo.terminal([`$ designer ${args.join(' ')}`]);
  await demo.pause(500);
  const out = designer(root, args, work);
  await demo.terminal(show(out).map((l) => `  ${l.replace(work + '/', '')}`));
  return out;
}

/** Writes round N's spec where the agent keeps it. */
const writeRound = (n: number) => copyFileSync(join(rounds, `round-${n}.spec.json`), spec);

export default {
  name: '08-agente-ao-vivo',
  steps: 10,
  /** Cut from the video: the server, the empty project, `designer live`, Sync on and the project opened in the app. */
  async setup(demo) {
    const { page } = demo;
    mkdirSync(work, { recursive: true });
    server = await startSyncServer(root, join(work, '.sync-server'));
    designer(root, ['new', '--preset', 'wireframe', '--name', 'Hoard', '-o', file], work);
    const origin = new URL(page.url()).origin + '/';
    live = await startLive(root, file, server.url, origin, work);
    await page.evaluate((u) => {
      localStorage.setItem('designer.sync', JSON.stringify({ enabled: true, url: u, apiKey: '', syncFonts: false }));
      localStorage.setItem('designer.welcomed', '1');
    }, server.url);
    await page.goto(`${origin}?open-project=${live.id}`);
    await page.locator('[data-live-by]').waitFor({ timeout: 30_000 });
  },
  async run(demo) {
    const { page } = demo;
    const l = live!;

    await demo.caption('Um agente vai transformar duas capturas do Hoard em wireframe, só com a CLI; este é o app, ao vivo');
    await demo.terminal(['$ designer live hoard.designer.json &', `  ${l.lines.find((x) => x.startsWith('Live:'))}`, '  Edits to hoard.designer.json are pushed within a second; …']);
    await demo.hover(page.locator('[data-live-by]'), {}, 1600);

    await demo.caption('Ele lê o catálogo e escreve um spec com componentes da biblioteca (nada de traçar formas)');
    await run(demo, ['wf', 'components', '-o', 'components.md']);
    writeRound(1);
    await demo.pause(800);

    await demo.caption('Rodada 1: wf build --into o arquivo do live → as duas telas aparecem aqui');
    await run(demo, ['wf', 'build', 'hoard.spec.json', '--into', 'hoard.designer.json'], (o) => o.split('\n').filter((x) => x.startsWith('Updated')));
    await canvasText(page, 'Backup de SM-S928B').first().waitFor({ timeout: 5000 });
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.pause(1800);

    await demo.caption('wf compare com a captura: falta o botão “Sincronizar agora” e notas de comportamento');
    if (shots && existsSync(join(shots, 'hoard-configuracoes.jpg'))) {
      copyFileSync(join(shots, 'hoard-configuracoes.jpg'), join(work, 'hoard-configuracoes.jpg'));
      copyFileSync(join(shots, 'hoard-galeria.jpg'), join(work, 'hoard-galeria.jpg'));
      await run(demo, ['wf', 'compare', 'hoard-configuracoes.jpg', 'hoard.designer.json', '--screen', 'Configurações', '--overlay', '50', '-o', 'configuracoes.r1.compare.png'], (o) => [o.split(' to ')[0]]);
    }
    await demo.pause(1600);

    await demo.caption('Rodada 2: botão ao lado da linha Situação, texto menor e notas onde o desenho não basta');
    writeRound(2);
    const before = l.count(/↑ pushed/);
    await run(demo, ['wf', 'build', 'hoard.spec.json', '--into', 'hoard.designer.json'], (o) => o.split('\n').filter((x) => x.startsWith('Updated')));
    await l.waitForNew(/↑ pushed/, before);
    await canvasText(page, 'Sincronizar agora').first().waitFor({ timeout: 5000 });
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });
    await demo.pause(2200);

    await demo.caption('Rodada 3: espaçamento do cartão; depois wf sheet para revisar o fluxo inteiro');
    writeRound(3);
    await run(demo, ['wf', 'build', 'hoard.spec.json', '--into', 'hoard.designer.json'], (o) => o.split('\n').filter((x) => x.startsWith('Updated')));
    await demo.pause(900);
    await run(demo, ['wf', 'sheet', 'hoard.designer.json', '--notes', '-o', 'hoard-sheet.png'], (o) => [o.split(' to ')[0]]);
    await demo.pause(1600);

    await demo.caption('Henrique ajusta no app: a tela Configurações passa a ser “Changed”');
    await demo.terminal([], { clear: true });
    await demo.click(screenLabel(page, 'Configurações'));
    await openTab(demo, 'Properties');
    const pulled = l.count(/↓ pulled/);
    await choose(demo, 'Screen status', 'Changed');
    await demo.key('Escape', { show: false });
    await l.waitForNew(/↓ pulled/, pulled);

    await demo.caption('…e uma nota no cartão de backup (tecla K), escrita por ele');
    await demo.key('k', { show: 'K' });
    await demo.click(await nodeWithText(page, 'Backup de SM-S928B'), { fx: 0.5, fy: 0.03 });
    await demo.click(field(page, 'Note text'), {}, { pause: 250 });
    await page.keyboard.press('ControlOrMeta+A');
    await demo.type('Some depois do primeiro backup completo', { delay: 40 });
    const c = (await canvas(page).boundingBox())!;
    await demo.click({ x: c.x + c.width - 60, y: c.y + c.height - 60 }); // empty canvas: done

    await demo.caption('O arquivo do agente recebe tudo: “pulled … edited in the app”, e o wf dump mostra as mudanças');
    await waitUntil('the note in the file', () => JSON.stringify(readProject(file)).includes('Some depois do primeiro backup'), 8000);
    const pulls = l.lines.filter((x) => /↓ pulled/.test(x)).slice(-1);
    await demo.terminal([`  ${pulls[0] ?? ''}`]);
    await run(demo, ['wf', 'dump', 'hoard.designer.json', '--no-geometry', '-o', 'hoard.after.spec.json']);
    const after = readProject(file) as unknown as { wireframe: { screens: { name: string; status?: string }[] }; children: { note?: { text: string } }[] };
    const status = after.wireframe.screens.find((s) => s.name === 'Configurações')?.status;
    const note = after.children.find((c) => c.note?.text.includes('Some depois'))?.note?.text;
    await demo.terminal([`  Configurações: "status": "${status}"`, `  note: "${note}"`], { keep: 5 });
    if (status !== 'changed' || !note) throw new Error(`the file did not get Henrique's edits (status ${status}, note ${note})`);
    await demo.pause(2600);

    await demo.caption('Na próxima rodada o agente parte desse dump: as mudanças do Henrique ficam');
    await demo.pause(2000);
  },
  async teardown() {
    await live?.stop().catch(() => {});
    server?.stop();
  },
} satisfies Scenario;
