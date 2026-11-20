// Video 10 (links from parts of a component): a bottom navigation with four tabs becomes a shared "Tab bar" on four
// screens; each tab is linked to its screen once, in the master ("Every screen using Tab bar"); every screen shows
// its own tab selected (selected follows the screen); then Present, tapping through the tabs.
import type { Scenario } from '../lib/scenario.ts';
import type { Demo } from '../lib/demo.ts';
import { canvas, canvasText, field, panel, insertFromLibrary, libraryItem, newWireframe, openTab, screenBlank, screenBox, screenLabel, searchLibrary, setField } from '../lib/designer.ts';

const SCREENS = ['Galeria', 'Arquivos', 'Álbuns', 'Ajustes'];

async function renameSelectedScreen(demo: Demo, name: string) {
  await openTab(demo, 'Properties');
  await setField(demo, 'Screen name', name);
}

/** The tab with this label inside the bottom navigation of a screen (its text on the canvas). */
async function tabOn(demo: Demo, screen: string, label: string) {
  const b = await screenBox(demo.page, screen);
  const texts = canvasText(demo.page, new RegExp(`^${label}$`));
  const n = await texts.count();
  for (let i = 0; i < n; i++) {
    const r = await texts.nth(i).boundingBox();
    if (r && r.x >= b.x && r.x <= b.x + b.width && r.y > b.y + b.height * 0.6 && r.y <= b.y + b.height) return { x: r.x + r.width / 2, y: r.y - 8 };
  }
  throw new Error(`No tab "${label}" on ${screen}`);
}

/** Hover a tab of the selected bottom navigation, then drag its part handle onto a screen and choose where the link applies. */
async function linkTab(demo: Demo, from: string, label: string, to: string) {
  await demo.hover(await tabOn(demo, from, label), {}, 700);
  const handle = canvas(demo.page).locator('[data-slot="part-handle"] circle');
  await demo.drag(handle, await demo.point(await screenBox(demo.page, to), { fx: 0.5, fy: 0.35 }), { duration: 1200, hold: 700 });
  await demo.click(demo.page.getByRole('menuitem', { name: /^Every screen using/ }), {}, { pause: 900 });
}

/** Properties: an icon prop, chosen in the icon picker by searching. */
async function pickIcon(demo: Demo, label: string, query: string, id: string) {
  const { page } = demo;
  await demo.click(panel(page).getByRole('button', { name: new RegExp(`^${label}:`) }));
  const search = page.getByRole('dialog').getByLabel('Search icons');
  await demo.click(search, {}, { pause: 200 });
  await demo.type(query, { delay: 55 });
  await demo.click(page.getByRole('dialog').getByRole('button', { name: `Insert ${id}`, exact: true }).first(), {}, { pause: 500 });
}

export default {
  name: '10-links-na-navegacao',
  steps: 9,
  /** Cut from the video: four screens with a title each, built through the UI. */
  async setup(demo) {
    const { page } = demo;
    await newWireframe(demo);
    await demo.click(await screenBlank(page, 'Screen 1'));
    await renameSelectedScreen(demo, SCREENS[0]);
    await insertFromLibrary(demo, 'Heading');
    await openTab(demo, 'Properties');
    await setField(demo, 'Text', SCREENS[0]);
    for (let i = 1; i < SCREENS.length; i++) {
      await demo.key('Escape');
      await demo.key('Escape');
      // Properties → Screens → + Phone: a screen right of everything, selected.
      await openTab(demo, 'Properties');
      await demo.click(panel(page).locator('.grid button').filter({ hasText: 'Phone' }).first());
      await renameSelectedScreen(demo, SCREENS[i]);
      await insertFromLibrary(demo, 'Heading');
      await openTab(demo, 'Properties');
      await setField(demo, 'Text', SCREENS[i]);
    }
    await demo.key('Escape');
    await demo.key('Escape');
    await demo.key('ControlOrMeta+0');
  },
  async run(demo) {
    const { page } = demo;
    await demo.caption('Na tela Galeria: uma Bottom navigation da biblioteca (fica fixa embaixo)');
    await demo.click(await screenBlank(page, 'Galeria'));
    await insertFromLibrary(demo, 'Bottom navigation', 'bottom nav');

    await demo.caption('Quatro abas: Galeria, Arquivos, Álbuns e Ajustes, com seus ícones');
    await openTab(demo, 'Properties');
    for (const [i, name] of SCREENS.slice(0, 3).entries()) await setField(demo, `Tab ${i + 1}`, name);
    await demo.click(page.getByRole('button', { name: 'Add tab' }));
    await setField(demo, 'Tab 4', SCREENS[3]);
    await pickIcon(demo, 'Icon, tab 3', 'images', 'Images');
    await pickIcon(demo, 'Icon, tab 4', 'settings', 'Settings');

    await demo.caption('Object → Vertical stack e Make component: a barra vira o componente compartilhado "Tab bar"');
    await demo.menu('Object', 'Vertical stack');
    await demo.menu('Object', 'Make component…');
    const name = page.getByRole('dialog').getByRole('textbox');
    await name.waitFor();
    await demo.click(name, {}, { pause: 200 });
    await page.keyboard.press('ControlOrMeta+A');
    await demo.type('Tab bar');
    await demo.click(page.getByRole('dialog').getByRole('button', { name: 'Make component', exact: true }));

    await demo.caption('My components → Tab bar nas outras três telas');
    for (const s of SCREENS.slice(1)) {
      await demo.click(await screenBlank(page, s));
      await searchLibrary(demo, 'tab bar');
      await demo.click(libraryItem(page, 'Tab bar'), { fy: 0.4 });
    }

    await demo.caption('Duplo clique na barra da Galeria: a navegação dentro dela; cada aba mostra sua própria alça');
    await demo.key('Escape', { show: false });
    await demo.click(await tabOn(demo, 'Galeria', 'Álbuns'));
    await demo.dblclick(await tabOn(demo, 'Galeria', 'Álbuns'));
    await demo.hover(await tabOn(demo, 'Galeria', 'Arquivos'), {}, 900);

    await demo.caption('Arrastando a alça de "Arquivos" até a tela Arquivos → Every screen using "Tab bar"');
    await linkTab(demo, 'Galeria', 'Arquivos', 'Arquivos');

    await demo.caption('O mesmo para "Álbuns", "Ajustes" e a própria "Galeria": um link no componente vale nas quatro telas');
    await linkTab(demo, 'Galeria', 'Álbuns', 'Álbuns');
    await linkTab(demo, 'Galeria', 'Ajustes', 'Ajustes');
    await linkTab(demo, 'Galeria', 'Galeria', 'Galeria');

    await demo.caption('Cada tela mostra a sua aba selecionada: "Selected tab" segue a tela');
    await openTab(demo, 'Properties');
    await demo.hover(field(page, 'Selected tab: follows the screen or fixed'), {}, 900);
    await demo.key('Escape', { show: false });
    await demo.key('Escape', { show: false });
    // Closer, on the bottom of the four screens.
    const first = await screenBox(page, SCREENS[0]);
    const last = await screenBox(page, SCREENS[3]);
    await demo.zoomAt({ x: (first.x + last.x + last.width) / 2, y: first.y + first.height - 20 }, 1.8);
    for (const s of SCREENS) await demo.hover(await tabOn(demo, s, s), {}, 800);
    await demo.key('ControlOrMeta+0', { show: 'Ctrl + 0' });

    await demo.caption('View → Present: tocando nas abas, de tela em tela');
    await demo.click(screenLabel(page, 'Galeria'));
    await demo.menu('View', 'Present');
    const hotspot = (label: string) => page.locator(`[data-slot="hotspot"][data-part]`).filter({ visible: true }).and(page.getByRole('button', { name: `${label}: open ${label}` }));
    for (const s of [...SCREENS.slice(1), SCREENS[0]]) {
      await demo.hover(hotspot(s), {}, 600);
      await demo.click(hotspot(s), {}, { pause: 1100 });
    }
    await demo.key('Escape', { show: 'Esc' });
  },
} satisfies Scenario;
