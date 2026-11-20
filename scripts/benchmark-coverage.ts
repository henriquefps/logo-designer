// Coverage check of Henrique's agent benchmark (docs/agents.md → Benchmark), criterion 1: every item of the
// "current" screen (rows, subtitles, trailing values, options, checkboxes, toggles, chips, buttons, help texts)
// appears exactly once across the new screens, and nothing is invented.
//
//   bun scripts/benchmark-coverage.ts <project.designer.json> [--current "Configurações"] [--json out.json]
//
// "Before" = the screen with status current (or --current); "after" = every screen with status changed or new.
// Not items: top app bar titles, section headers (they may become entry names or titles), and on the new menu the
// rows that open another screen (the entries); they are listed apart. Exit 1 when something is missing,
// duplicated or extra.
import { readFileSync, writeFileSync } from 'node:fs';
import { installGlobPlugin } from '../src/cli/globPlugin.ts';

// The component registry uses `import.meta.glob` (Vite); under Bun the CLI's loader must come first.
installGlobPlugin();
const { parseFileDoc } = await import('../src/cli/sync');
const { dumpToSpec } = await import('../src/wireframe/spec');

type Json = Record<string, unknown>;
const CONTAINERS = ['vstack', 'hstack', 'grid'];
const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

export interface Item {
  key: string;
  screen: string;
}

/** The items of a screen's tree, in order. `entries` collects the rows that open another screen. */
export function itemsOf(
  nodes: unknown[],
  screen: string,
  components: Map<string, unknown[]>,
  out: { items: Item[]; entries: string[]; titles: string[]; sections: string[] },
  menu: boolean,
  linked: ReadonlySet<string> = new Set(),
) {
  for (const raw of nodes) {
    const n = raw as Json;
    const container = CONTAINERS.find((k) => Array.isArray(n[k]));
    if (container) {
      itemsOf(n[container] as unknown[], screen, components, out, menu, linked);
      continue;
    }
    if (typeof n.use === 'string') {
      itemsOf(components.get(n.use) ?? [], screen, components, out, menu, linked);
      continue;
    }
    const kind = Object.keys(n).find((k) => !['id', 'opens', 'note', 'x', 'y', 'width', 'height', 'position', 'bleed', 'grow'].includes(k) && typeof n[k] === 'object' && n[k] !== null);
    if (!kind) continue;
    const p = n[kind] as Json;
    const add = (key: string) => out.items.push({ key, screen });
    switch (kind) {
      case 'top-app-bar':
        out.titles.push(norm(p.title));
        break;
      case 'section-header':
        out.sections.push(norm(p.label));
        break;
      case 'list-row':
        // An entry of the new menu: a row that opens a screen (node sugar, or a flow of the spec's `flows`).
        if (menu && (n.opens || linked.has(String(n.id)))) {
          out.entries.push(norm(p.title));
          break;
        }
        add(`row: ${norm(p.title)}`);
        if (norm(p.subtitle)) add(`subtitle: ${norm(p.subtitle)}`);
        if (p.trailing === 'value') add(`value: ${norm(p.value)}`);
        break;
      case 'radio-group':
        if (norm(p.label)) add(`radio label: ${norm(p.label)}`);
        add(`radio: ${(p.options as unknown[]).map(norm).join(' | ')}`);
        break;
      case 'segmented-control':
        add(`chips: ${(p.labels as unknown[]).map(norm).join(' | ')}`);
        break;
      case 'checkbox':
        add(`checkbox: ${norm(p.label)}`);
        break;
      case 'toggle':
        add(`toggle: ${norm(p.label)}`);
        if (norm(p.description)) add(`toggle help: ${norm(p.description)}`);
        break;
      case 'button':
        add(`button: ${norm(p.label)}`);
        break;
      case 'text':
      case 'heading':
        add(`text: ${norm(p.text)}`);
        break;
      case 'divider':
        break;
      default:
        add(`${kind}: ${norm(p.title ?? p.label ?? p.text ?? '')}`);
    }
  }
}

export interface Coverage {
  current: string;
  newScreens: { name: string; status: string }[];
  menu: string | null;
  entries: string[];
  titles: string[];
  sections: string[];
  before: number;
  after: number;
  missing: string[];
  duplicated: { key: string; screens: string[] }[];
  extra: { key: string; screen: string }[];
}

export function coverage(doc: Parameters<typeof dumpToSpec>[0], currentName?: string): Coverage {
  const spec = dumpToSpec(doc, { geometry: false }) as unknown as { screens: Json[]; components?: { name: string; content: unknown }[]; flows?: { from: string }[] };
  const linked = new Set((spec.flows ?? []).map((f) => String(f.from)));
  const components = new Map<string, unknown[]>((spec.components ?? []).map((c) => [c.name, [c.content]]));
  const rootOf = (s: Json) => (Array.isArray(s.root) ? (s.root as unknown[]) : (((s.variants as Json[] | undefined)?.[0]?.root as unknown[]) ?? []));
  const current = spec.screens.find((s) => (currentName ? s.name === currentName : s.status === 'current'));
  if (!current) throw new Error(`no ${currentName ? `screen “${currentName}”` : 'screen with status current'}`);
  const news = spec.screens.filter((s) => s !== current && (s.status === 'changed' || s.status === 'new'));
  // The new menu: the changed screen (or, failing that, the new screen with the most entries).
  const menu = news.find((s) => s.status === 'changed') ?? null;
  const b = { items: [] as Item[], entries: [] as string[], titles: [] as string[], sections: [] as string[] };
  itemsOf(rootOf(current), String(current.name), components, b, false);
  const a = { items: [] as Item[], entries: [] as string[], titles: [] as string[], sections: [] as string[] };
  for (const s of news) itemsOf(rootOf(s), String(s.name), components, a, s === menu, linked);
  const count = (xs: Item[]) => xs.reduce((m, i) => m.set(i.key, (m.get(i.key) ?? 0) + 1), new Map<string, number>());
  const cb = count(b.items);
  const ca = count(a.items);
  const missing: string[] = [];
  const duplicated: Coverage['duplicated'] = [];
  for (const [key, n] of cb) {
    const m = ca.get(key) ?? 0;
    for (let i = m; i < n; i++) missing.push(key);
    if (m > n) duplicated.push({ key, screens: a.items.filter((x) => x.key === key).map((x) => x.screen) });
  }
  const extra = a.items.filter((i) => !cb.has(i.key));
  return {
    current: String(current.name),
    newScreens: news.map((s) => ({ name: String(s.name), status: String(s.status) })),
    menu: menu ? String(menu.name) : null,
    entries: a.entries,
    titles: a.titles,
    sections: b.sections,
    before: b.items.length,
    after: a.items.length,
    missing,
    duplicated,
    extra,
  };
}

type Doc = Parameters<typeof dumpToSpec>[0];
type SceneLike = { id: string; type: string; children?: SceneLike[]; component?: { kind: string; props: Json }; screen?: { screenId: string; platform: string } };

/** The automatic part of criteria 2–5 (2's "groupings make sense" and 3's "same kinds" are judged by a person). */
export function structure(doc: Doc, c: Coverage) {
  const d = doc as unknown as { children: SceneLike[]; wireframe: { screens: { id: string; name: string; status?: string }[]; flows?: { from: string; to: string; part?: string }[] } };
  const screens = d.wireframe.screens;
  const byName = new Map(screens.map((s) => [s.name, s]));
  const frameOf = new Map<string, SceneLike>();
  for (const f of d.children) if (f.screen) frameOf.set(f.screen.screenId, f);
  const nodeScreen = new Map<string, string>();
  const nodes = new Map<string, SceneLike>();
  const walk = (n: SceneLike, screenId: string) => {
    nodeScreen.set(n.id, screenId);
    nodes.set(n.id, n);
    for (const k of n.children ?? []) walk(k, screenId);
  };
  for (const f of d.children) if (f.screen) walk(f, f.screen.screenId);
  const flows = (d.wireframe.flows ?? []).map((f) => ({ ...f, fromScreen: nodeScreen.get(f.from), kind: nodes.get(f.from)?.component?.kind }));
  const menu = c.menu ? byName.get(c.menu) : undefined;
  const subs = c.newScreens.filter((s) => s.name !== c.menu).map((s) => byName.get(s.name)!);
  const sub = subs.map((s) => {
    const frame = frameOf.get(s.id);
    const bar = (frame?.children ?? []).find((k) => k.component?.kind === 'top-app-bar') ?? [...nodes.values()].find((n) => nodeScreen.get(n.id) === s.id && n.component?.kind === 'top-app-bar');
    return {
      name: s.name,
      status: s.status,
      platform: frame?.screen?.platform,
      topBar: bar ? { title: bar.component!.props.title, leading: bar.component!.props.leading ?? 'back' } : null,
      fromMenu: !!menu && flows.some((f) => f.fromScreen === menu.id && f.to === s.id && f.kind === 'list-row'),
      backToMenu: !!menu && flows.some((f) => f.fromScreen === s.id && f.to === menu.id && f.part === 'back'),
    };
  });
  const menuRows = menu ? [...nodes.values()].filter((n) => nodeScreen.get(n.id) === menu.id && n.component?.kind === 'list-row') : [];
  const entryRows = menuRows.filter((n) => flows.some((f) => f.from === n.id));
  return {
    menu: menu ? { name: menu.name, status: menu.status, rows: menuRows.length, entries: entryRows.length, chevrons: entryRows.filter((n) => (n.component!.props.trailing ?? 'chevron') === 'chevron').length } : null,
    current: screens.filter((s) => s.status === 'current').map((s) => s.name),
    sub,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const file = args.find((x) => !x.startsWith('--') && args[args.indexOf(x) - 1] !== '--current' && args[args.indexOf(x) - 1] !== '--json');
  if (!file) {
    console.error('usage: bun scripts/benchmark-coverage.ts <project.designer.json> [--current NAME] [--json out.json]');
    process.exit(2);
  }
  const at = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const { doc } = parseFileDoc(readFileSync(file, 'utf8'), file);
  const c = coverage(doc, at('--current'));
  const ok = !c.missing.length && !c.duplicated.length && !c.extra.length;
  const lines = [
    `Coverage of “${c.current}” (current, ${c.before} items) across ${c.newScreens.length} new screens (${c.after} items):`,
    `  menu: ${c.menu ?? '(no screen with status changed)'}; entries: ${c.entries.join(', ') || '—'}`,
    `  new screens: ${c.newScreens.map((s) => `${s.name} (${s.status})`).join(', ') || '—'}`,
    `  missing: ${c.missing.length}${c.missing.map((m) => `\n    - ${m}`).join('')}`,
    `  duplicated: ${c.duplicated.length}${c.duplicated.map((d) => `\n    - ${d.key} (${d.screens.join(', ')})`).join('')}`,
    `  extra: ${c.extra.length}${c.extra.map((e) => `\n    - ${e.key} (${e.screen})`).join('')}`,
    ok ? 'PASS: every item exactly once, nothing invented' : 'FAIL',
  ];
  const st = structure(doc, c);
  lines.push(
    '',
    `Structure: menu ${st.menu ? `“${st.menu.name}” (${st.menu.status}), ${st.menu.entries} entries of ${st.menu.rows} rows, ${st.menu.chevrons} with a chevron` : '—'}; current: ${st.current.join(', ') || '—'}`,
    ...st.sub.map((x) => `  ${x.name} (${x.status}, ${x.platform}): top bar ${x.topBar ? `“${x.topBar.title}” ${x.topBar.leading}` : 'NONE'}; from the menu ${x.fromMenu ? 'yes' : 'NO'}; back → menu ${x.backToMenu ? 'yes' : 'NO'}`),
  );
  console.log(lines.join('\n'));
  const out = at('--json');
  if (out) writeFileSync(out, `${JSON.stringify({ ok, ...c, structure: st }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}
