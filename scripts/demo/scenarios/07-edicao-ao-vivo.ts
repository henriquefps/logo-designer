// Video 7 (live editing): an agent edits a project file while `designer live` runs; the app (Sync on,
// same server) shows every change within a second, Henrique's edit in the app goes back to the file,
// and the Live indicator says who changed it last. The file edits are made by this scenario the way an
// agent makes them (the CLI, or writing the JSON); the sync server is a real designer-sync.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../lib/scenario.ts';
import { canvasText, focusScreen, insertFromLibrary, screenBlank } from '../lib/designer.ts';
import { addComponent, designer, editProject, readProject, startLive, startSyncServer, waitUntil, type LiveProcess, type SyncServer } from '../lib/live.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const work = mkdtempSync(join(tmpdir(), 'designer-demo-live-'));
const file = join(work, 'hoard.designer.json');
let server: SyncServer | null = null;
let live: LiveProcess | null = null;

export default {
  name: '07-edicao-ao-vivo',
  steps: 7,
  /** Cut from the video: the server, the agent's starting file, `designer live`, and Sync turned on in the app. */
  async setup(demo) {
    const { page } = demo;
    server = await startSyncServer(root, join(work, 'server'));
    designer(root, ['new', '--preset', 'wireframe', '--name', 'Hoard', '-o', file], work);
    designer(root, ['screen', file, '--name', 'Configurações'], work);
    editProject(file, (d) => addComponent(d, 'Configurações', 'top-app-bar', { title: 'Configurações' }, 'Top app bar'));
    const origin = new URL(page.url()).origin + '/';
    live = await startLive(root, file, server.url, origin, work);
    await page.evaluate((u) => {
      localStorage.setItem('designer.sync', JSON.stringify({ enabled: true, url: u, apiKey: '', syncFonts: false }));
      localStorage.setItem('designer.welcomed', '1');
    }, server.url);
    await page.goto(`${origin}?open-project=${live.id}`);
    await page.locator('[data-live-by]').waitFor({ timeout: 30_000 });
    await focusScreen(demo, 'Configurações', 1.1);
  },
  async run(demo) {
    const { page } = demo;
    const l = live!;
    const indicator = page.locator('[data-live-by]');

    await demo.caption('Um agente roda “designer live hoard.designer.json”: o projeto abre aqui, marcado Live');
    await demo.hover(indicator, {}, 1400);

    await demo.caption('O agente escreve no arquivo: uma linha “Idioma”… aparece em menos de 1 s');
    editProject(file, (d) => addComponent(d, 'Configurações', 'list-row', { title: 'Idioma', trailing: 'value', value: 'Português' }, 'Idioma'));
    await canvasText(page, 'Idioma').first().waitFor({ timeout: 3000 });
    await demo.pause(900);
    editProject(file, (d) => addComponent(d, 'Configurações', 'list-row', { title: 'Tema escuro', trailing: 'toggle', checked: true }, 'Tema escuro'));
    await canvasText(page, 'Tema escuro').first().waitFor({ timeout: 3000 });
    await demo.pause(900);
    editProject(file, (d) => addComponent(d, 'Configurações', 'list-row', { title: 'Backup', subtitle: 'Toda noite, 3h', trailing: 'chevron' }, 'Backup'));
    await canvasText(page, 'Backup').first().waitFor({ timeout: 3000 });
    await demo.pause(1200);

    await demo.caption('O agente cria outra tela com “designer screen --name Perfil”');
    designer(root, ['screen', file, '--name', 'Perfil'], work);
    await page.getByText('Perfil', { exact: true }).first().waitFor({ timeout: 3000 });
    await demo.pause(500);
    await demo.zoomAt(await demo.point(page.getByText('Perfil', { exact: true }).first()), 0.75);
    await demo.pause(1200);

    await demo.caption('Henrique ajusta no app: seleciona a tela e insere um botão');
    await demo.click(await screenBlank(page, 'Configurações'));
    const pulled = l.count(/↓ pulled/);
    await insertFromLibrary(demo, 'Button');
    await demo.key('Escape', { show: false });
    await demo.key('Escape', { show: false });

    await demo.caption('…e o arquivo do agente é atualizado (o terminal mostra “pulled … edited in the app”)');
    await l.waitForNew(/↓ pulled/, pulled);
    const hasButton = () => JSON.stringify(readProject(file)).includes('"kind": "button"') || JSON.stringify(readProject(file)).includes('"kind":"button"');
    await waitUntil('the button in the file', hasButton, 5000);
    await demo.pause(1400);

    await demo.caption('O indicador Live mostra quem mudou por último: este dispositivo, outro ou a CLI');
    await demo.click(indicator);
    await demo.pause(2200);
    await demo.key('Escape', { show: false });

    await demo.caption('Ctrl+C no “designer live”: o projeto deixa de ser Live');
    await l.stop();
    await indicator.waitFor({ state: 'detached', timeout: 10_000 });
    await demo.pause(1500);
  },
  async teardown() {
    await live?.stop().catch(() => {});
    server?.stop();
  },
} satisfies Scenario;
