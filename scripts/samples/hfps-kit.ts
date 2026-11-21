// Builds the "hfps-kit" wireframe sample (public/samples/hfps-kit.designer.json, its thumbnail and its wf sheet
// preview): the wireframe base of the hfps design kit, every recurring pattern a shared component named
// "hfps · <Pattern>", laid out like a component sheet (one row of screens per pattern group, a section title above
// each row, the rule and the code piece each pattern maps to in a note beside it) plus two example screens that
// compose them. Through the `designer` CLI only (`wf build`), never by editing ids by hand.
//
//   bun scripts/samples/hfps-kit.ts      (writes the project, its thumbnail, the wf sheet and one PNG per frame)
//
// The spec is written below as data. Two builds: the first one measures (frame heights, where each component
// lands in its frame, note heights); the second places the rows, the section titles and the notes from those
// measurements, so nothing overlaps whatever the content's height.
//
// Wireframes are greyscale lo-fi: what carries the kit is structure, sizes and names. Where the library draws a
// size the kit does not use (a two-line row is 72 here, 56 in the kit; chips and toolbar controls are 32, 36 in
// the kit), the note states the kit's size (docs/wireframe-mode.md → The hfps-kit sample → Gaps).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(root, 'public/samples/hfps-kit.designer.json');
const THUMB = join(root, 'public/samples/hfps-kit.thumb.png');
const SHEET = join(root, 'docs/screenshots/sample-hfps-kit-sheet.png');
const RENDERS = join(root, 'docs/screenshots/hfps-kit');

const NAME = 'hfps-kit';
const SAMPLE_DATE = Date.UTC(2026, 10, 20);
const WIDTH = { phone: 390, desktop: 1440 } as const;
const NOTE_GAP = 24; // frame edge → its notes column
const NOTE_W = 200; // a note's width (the app's)
const NOTE_SPACE = 12; // between two notes in a column
const GAP = 160; // notes column → next frame
const TITLE_H = 120; // a row's section title, above the frames' name strips
const ROW_GAP = 200; // a row's bottom (frames or notes) → the next row's title

type Json = Record<string, unknown>;
type Platform = keyof typeof WIDTH;
interface SpecNote { id: string; text: string; on: string; x?: number; y?: number }
interface Variant { platform: Platform; id: string; x?: number; y?: number; layout?: Json; root: Json[] }
interface SpecScreen { name: string; id: string; variants: Variant[] }

// ---------------------------------------------------------------------------------------------- spec helpers

const P = 'hfps · ';
const inst = (name: string, extra: Json = {}): Json => ({ use: P + name, ...extra });
const caption = (text: string): Json => ({ text: { text, size: 'caption', tone: 'muted' } });
const eyebrow = (text: string): Json => ({ text: { text: text.toUpperCase(), size: 'caption', tone: 'muted' } });
const comp = (name: string, content: Json) => ({ name: P + name, id: `sym-${slug(name)}`, content });
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const notes: SpecNote[] = [];
/** A component on a sheet screen: its name as a caption above the instance, and its note beside the frame. */
function entry(screen: string, name: string, note: string, instance: Json = inst(name)): Json {
  const id = `${slug(screen)}-${slug(name)}`;
  notes.push({ id: `note-${id}`, text: note, on: id });
  // align start: a component that hugs (a button) keeps its own width; the ones that fill still fill.
  return { vstack: [caption(P + name), instance], gap: 8, align: 'start', id, name: P + name };
}
/** A note on a node that is already in a screen (an instance filling a frame, an overlay). */
function noteOn(id: string, text: string) {
  notes.push({ id: `note-${id}`, text, on: id });
}

// ---------------------------------------------------------------------------------------------- shared components
// Nested where the kit nests them: the shells hold the top bar (and the sidebar), the sheets hold the buttons,
// the summary strips repeat one metric, the card list repeats the list row, master-detail holds the detail panel.

const components = [
  // Actions
  comp('Primary button', { vstack: [{ button: { label: 'Save', variant: 'primary' } }], gap: 0, width: 'hug' }),
  comp('Secondary button', { vstack: [{ button: { label: 'Export', variant: 'secondary' } }], gap: 0, width: 'hug' }),
  comp('Ghost button', { vstack: [{ button: { label: 'Cancel', variant: 'text' } }], gap: 0, width: 'hug' }),
  // An icon with a 12 padding: the 24 icon in its 48 target.
  comp('Icon button', { hstack: [{ icon: { icon: 'ellipsis-vertical', size: 24 } }], padding: 12, width: 'hug' }),
  comp('Chip row', { hstack: [{ chip: { label: 'All', selected: true } }, { chip: 'Running' }, { chip: 'Stopped' }], gap: 8 }),

  // Header and shell
  comp('Top bar', { vstack: [{ 'top-app-bar': { title: 'App', leading: 'menu', actions: 1, action1: 'sun-moon' } }], gap: 0 }),
  comp('Top bar (desktop)', { vstack: [{ 'top-app-bar': { title: 'App', leading: 'none', actions: 2, action1: 'activity', action2: 'sun-moon' } }], gap: 0 }),
  comp('Sidebar', { vstack: [{ 'sidebar-nav': { title: '', items: ['Overview', 'Items', 'Activity', '#Account', 'Settings'] }, height: 'fill' }], gap: 0, width: 240, height: 'fill' }),
  comp('App shell', {
    vstack: [
      inst('Top bar'),
      // The 8 margin around the card; the card fills what is left and scrolls inside.
      { vstack: [{ vstack: [{ paragraph: { lines: 4 } }], style: 'outline', radius: 'large', padding: 16, height: 'fill', name: 'Card' }], padding: 8, height: 'fill', name: 'Margin' },
    ],
    gap: 0,
    height: 'fill',
  }),
  comp('App shell (desktop)', {
    vstack: [
      inst('Top bar (desktop)'),
      {
        hstack: [
          inst('Sidebar'),
          { vstack: [{ vstack: [{ paragraph: { lines: 6 } }], style: 'outline', radius: 'large', padding: 24, height: 'fill', name: 'Card' }], padding: 8, width: 'fill', height: 'fill', name: 'Margin' },
        ],
        gap: 0,
        align: 'stretch',
        height: 'fill',
        name: 'Body',
      },
    ],
    gap: 0,
    height: 'fill',
  }),
  comp('Theme menu', {
    vstack: [
      { 'radio-group': { label: 'Theme', options: ['Light', 'Dark', 'System'], selected: 3 } },
      { divider: {} },
      { 'radio-group': { label: 'Palette', options: ['Blue', 'Olive', 'Violet', 'Rose', 'Graphite'], selected: 1 } },
    ],
    style: 'outline',
    radius: 'small',
    padding: 12,
    gap: 12,
    width: 240,
  }),

  // Navigation
  comp('Breadcrumbs', {
    vstack: [
      { breadcrumbs: { items: ['Spaces', 'Space', 'Members'] } },
      { hstack: [{ hstack: [{ icon: { icon: 'arrow-left', size: 24 } }], padding: 12, width: 'hug', name: 'Back' }, { heading: { text: 'Members', level: 'subheading' }, width: 'fill' }], gap: 4 },
    ],
    gap: 4,
  }),
  comp('Back link', { vstack: [{ button: { label: 'Space', variant: 'text', icon: 'arrow-left' } }], gap: 0, width: 'hug' }),
  comp('Section tabs', { vstack: [{ tabs: { labels: ['Overview', 'Activity', 'Settings'], selected: 1 } }], gap: 0 }),
  comp('Section select', { vstack: [{ select: { label: '', value: 'Overview', options: ['Overview', 'Activity', 'Members', 'Settings'] } }], gap: 0 }),

  // Rows
  comp('Eyebrow section', { vstack: [{ 'section-header': 'SECTION' }], gap: 0 }),
  comp('List row', { vstack: [{ 'list-row': { title: 'Item name', subtitle: 'id-4f2a · 3 days ago', trailing: 'chevron', divider: true } }], gap: 0 }),
  comp('Choice row', { vstack: [{ 'radio-group': { label: 'Quality', options: ['Original', 'High', 'Data saver'], selected: 1 } }], gap: 0 }),
  comp('Check row', { vstack: [{ checkbox: { label: 'Include archived', checked: true } }], gap: 0 }),
  comp('Slider row', { vstack: [{ slider: { label: 'Exposure', value: 50 } }], gap: 0 }),

  // Toolbars and summaries
  comp('Toolbar', { vstack: [{ toolbar: { title: '', actions: ['All', 'Running', 'Stopped', 'Sort'], search: true } }], gap: 0 }),
  comp('Toolbar (phone)', {
    vstack: [
      { 'search-field': { placeholder: 'Search' } },
      { hstack: [{ select: { label: '', value: 'All', options: ['All', 'Running', 'Stopped'] }, width: 'fill' }, { button: { label: 'Sort', variant: 'secondary', icon: 'arrow-up-down' } }], gap: 8 },
    ],
    gap: 8,
  }),
  comp('Metric', { vstack: [eyebrow('Metric'), { heading: { text: '1,284', level: 'heading' } }], gap: 4 }),
  comp('Summary strip', { grid: [inst('Metric')], columns: 4, gap: 16, repeat: 4, padding: 16 }),
  comp('Summary strip (phone)', { grid: [inst('Metric')], columns: 2, gap: 16, repeat: 4, padding: 16 }),

  // Lists and master-detail
  comp('Data table', { vstack: [{ 'data-table': { columns: ['Name', 'Status', 'Updated'], rows: 6 } }], gap: 0 }),
  comp('Card list', { vstack: [inst('List row')], gap: 0, repeat: 5 }),
  comp('Empty state', { vstack: [{ 'empty-state': { icon: 'inbox', title: 'No items yet', message: 'Items you add show up here.', buttonLabel: 'Add item' } }], gap: 0 }),
  comp('Detail panel', {
    vstack: [
      { hstack: [{ heading: { text: 'Item name', level: 'subheading' }, width: 'fill' }, { icon: { icon: 'x', size: 24 } }], gap: 8 },
      { text: { text: 'id-4f2a · Updated 3 days ago', size: 'small', tone: 'muted' } },
      { hstack: [inst('Secondary button'), inst('Icon button')], gap: 8 },
      { divider: {} },
      eyebrow('Details'),
      { paragraph: { lines: 4 } },
    ],
    style: 'outline',
    padding: 24,
    gap: 12,
    width: 560,
    height: 'fill',
  }),
  comp('Master-detail', {
    hstack: [
      { vstack: [inst('Toolbar'), inst('Data table')], gap: 0, width: 'fill', name: 'List' },
      inst('Detail panel'),
    ],
    gap: 0,
    align: 'stretch',
    height: 'fill',
  }),
  comp('Full-screen sheet', {
    vstack: [
      { 'top-app-bar': { title: 'Item name', leading: 'close', actions: 1, action1: 'ellipsis-vertical' } },
      { vstack: [{ text: { text: 'id-4f2a · Updated 3 days ago', size: 'small', tone: 'muted' } }, eyebrow('Details'), { paragraph: { lines: 6 } }], padding: 16, gap: 12, height: 'fill', name: 'Body' },
    ],
    gap: 0,
    height: 'fill',
  }),

  // Overlays and feedback
  comp('Bottom sheet', {
    vstack: [
      { heading: { text: 'Log an item', level: 'subheading' } },
      { 'text-field': { label: 'Name', placeholder: 'What is it' } },
      { 'text-field': { label: 'Amount', placeholder: '0', inputType: 'number' } },
      inst('Primary button', { width: 'fill' }),
      inst('Ghost button', { width: 'fill' }),
    ],
    style: 'outline',
    radius: 'large',
    padding: 16,
    gap: 12,
    position: 'pinned-bottom',
  }),
  comp('Dialog', { vstack: [{ modal: { title: 'Log an item', lines: 3, primary: 'Save', secondary: 'Cancel', close: true } }], gap: 0, width: 480, position: 'free' }),
  comp('Checklist sheet', {
    vstack: [
      eyebrow('Add folders'),
      { checkbox: { label: 'All', checked: false } },
      { divider: {} },
      { vstack: [{ checkbox: { label: 'Folder', checked: true } }], gap: 4, repeat: 4 },
      { hstack: [inst('Ghost button'), inst('Primary button', { name: 'Confirm' })], gap: 8 },
    ],
    style: 'outline',
    radius: 'large',
    padding: 16,
    gap: 8,
    position: 'pinned-bottom',
  }),
  comp('Confirm dialog', { vstack: [{ dialog: { title: 'Delete item?', message: 'It is removed for everyone. This cannot be undone.', primary: 'Delete', secondary: 'Cancel' } }], gap: 0, width: 320 }),
  comp('Toast', { vstack: [{ snackbar: { message: 'Item saved', action: 'Undo' } }], gap: 0 }),
];

// ---------------------------------------------------------------------------------------------- screens

const FULL = { padding: 0, gap: 0 }; // shells fill the frame edge to edge
const screens: SpecScreen[] = [];
const rows: { title: string; screens: string[] }[] = [];
function screen(name: string, variants: Omit<Variant, 'id'>[]) {
  screens.push({ name, id: `s-${slug(name)}`, variants: variants.map((v) => ({ ...v, id: `f-${slug(name)}-${v.platform}` })) });
  rows[rows.length - 1].screens.push(name);
}
function row(title: string) {
  rows.push({ title, screens: [] });
}

// Row 1: shell, header, navigation
row('Shell and navigation');
screen('App shell', [
  { platform: 'phone', layout: FULL, root: [inst('App shell', { id: 'shell-phone' })] },
  { platform: 'desktop', layout: FULL, root: [inst('App shell (desktop)', { id: 'shell-desktop' })] },
]);
noteOn('shell-phone', 'Fixed 56 header on the background, never scrolls. ONE card with an 8 margin fills the rest and is never taller; content scrolls inside the card, the document never does. React: AppShell. Compose: HfpsScaffold(topBar).');
noteOn('shell-desktop', 'From 768: the sidebar sits on the background next to the card (Sidebar variant="inset"), the card keeps its inset margin. Same rule: header fixed, scroll inside the card. React: AppShell + SidebarInset.');
screen('Header', [
  {
    platform: 'phone',
    root: [
      entry('Header', 'Top bar', 'Title or logo left, actions right (theme menu, status). Menu on phones with a sidebar, back on sub-pages. No bottom border. React: AppShell header. Compose: HfpsTopBar(title, onBack, actions).'),
      entry('Header', 'Top bar (desktop)', 'From 768 the menu button goes (the sidebar is shown); same 56 bar. React: AppShell header.'),
      entry('Header', 'Theme menu', 'Opened from the header\'s theme icon: one dropdown, two radio groups, Theme then Palette. Saved per browser. React: ThemeMenu (DropdownMenuRadioGroup).'),
      entry('Header', 'Sidebar', 'Desktop navigation, on the background beside the card; a full-height Sheet from the menu button on phones. Section labels are eyebrows. React: Sidebar variant="inset".'),
    ],
  },
]);
screen('Navigation', [
  {
    platform: 'phone',
    root: [
      entry('Navigation (phone)', 'Back link', 'Below 768 the breadcrumb trail collapses to one "← Parent" link in the header. Back goes to the parent level, not back in history. React: Page breadcrumbs (md:hidden).'),
      entry('Navigation (phone)', 'Section tabs', '2 or 3 sections: plain tabs fit a phone. Never a horizontally scrolling tab strip. React: Tabs.'),
      entry('Navigation (phone)', 'Section select', '4 or more sections: a full-width select below @2xl, the tabs from @2xl up; same value, same navigation. React: SectionSwitcher.'),
    ],
  },
  {
    platform: 'desktop',
    root: [
      entry('Navigation (desktop)', 'Breadcrumbs', 'Every page below the top level has a trail; the last crumb is the current page, not a link. Title row with a ghost back button to the parent. React: Page breadcrumbs + breadcrumbs.ts.'),
    ],
  },
]);

// Row 2: rows and controls
row('Rows and controls');
screen('Rows', [
  {
    platform: 'phone',
    root: [
      entry('Rows', 'Eyebrow section', 'The only uppercase text: 12 medium, tracked 0.08em, for section labels only. Never on a control, tab or table header. React: eyebrow utility. Compose: Eyebrow(text).'),
      entry('Rows', 'List row', 'Settings-like row inside the card, 56 tall in the kit (two lines: name 15 + mono meta 13), whole row tappable, hairline between rows. React: card list row. Compose: HfpsListRow + HfpsRowDivider.'),
      entry('Rows', 'Choice row', 'Single choice: radio rows, whole row tappable, 48 min. Compose: HfpsChoiceRow in a selectableGroup().'),
      entry('Rows', 'Check row', 'Several choices: check rows, whole row toggles, 48 min. Compose: HfpsCheckRow.'),
      entry('Rows', 'Slider row', 'Label and value on one row, 48 min; drag anywhere on the row, tap the value to type it. Compose: HfpsSlider.'),
    ],
  },
]);
screen('Buttons', [
  {
    platform: 'phone',
    root: [
      entry('Buttons', 'Primary button', 'ONE primary action per screen or sheet. 44 min height, sentence case. React: Button. Compose: PrimaryButton.'),
      entry('Buttons', 'Secondary button', 'Neutral, hairline border. React: Button variant="outline". Compose: SecondaryButton.'),
      entry('Buttons', 'Ghost button', 'Cancel, Reset. React: Button variant="ghost". Compose: GhostButton.'),
      entry('Buttons', 'Icon button', 'Every icon-only action: 24 icon in a 48 touch target (36 h-9 in web toolbars), with a tooltip and a label for screen readers. React: Button size="icon". Compose: HfpsIconButton.'),
      entry('Buttons', 'Chip row', 'Filters and segments in a row: 36 visible, 48 target, selected = filled. Compose: HfpsChip. Web: ToggleGroup from @2xl, a Select below.'),
    ],
  },
]);
screen('Toolbars', [
  {
    platform: 'phone',
    root: [
      entry('Toolbars (phone)', 'Toolbar (phone)', 'Below @md the search takes its own full-width row; the filter becomes a select. Controls 36, gap 8.'),
      entry('Toolbars (phone)', 'Summary strip (phone)', 'Two columns on phones, never an orphan row. Eyebrow label over a 20–24 semibold tabular number.'),
    ],
  },
  {
    platform: 'desktop',
    root: [
      entry('Toolbars (desktop)', 'Toolbar', 'Search, filter, sort on one row that never wraps; search shrinks first. Controls 36 (h-9), never mixed with sm. Sticky at the top of the card.'),
      entry('Toolbars (desktop)', 'Summary strip', 'Up to 4 metrics, py-4, borders between them (not fills). Headline numbers large, labels small. React: grid-cols-2 md:grid-cols-[repeat(4,…)].'),
      entry('Toolbars (desktop)', 'Metric', 'One summary metric: eyebrow label, number with tabular-nums. Values change without animating.'),
    ],
  },
]);

// Row 3: lists and master-detail
row('Lists and master-detail');
screen('Lists', [
  {
    platform: 'phone',
    root: [
      entry('Lists (phone)', 'Card list', 'Below @xl (~576) a table renders as a card list: same data, search, filters and selection; no column header. Row actions go behind a ⋯ icon button. React: DataList (cards).'),
      entry('Lists (phone)', 'Empty state', 'An empty list says what goes there and offers the one action. Never a "select an item" placeholder. React: Empty.'),
    ],
  },
  {
    platform: 'desktop',
    root: [
      entry('Lists (desktop)', 'Data table', 'From @xl: table-fixed, a flexible primary column, fixed widths on the others; header muted, no fill. Selected row = background only, never a left bar. React: DataList (table).'),
    ],
  },
]);
screen('Master-detail', [
  { platform: 'desktop', layout: FULL, root: [inst('App shell (desktop)', { id: 'md-list', name: 'Nothing selected' })] },
]);
screen('Master-detail (selected)', [
  {
    platform: 'desktop',
    layout: FULL,
    root: [
      inst('Top bar (desktop)'),
      {
        hstack: [
          inst('Sidebar'),
          { vstack: [{ vstack: [inst('Master-detail', { id: 'md-selected' })], style: 'outline', radius: 'large', height: 'fill', name: 'Card' }], padding: 8, width: 'fill', height: 'fill', name: 'Margin' },
        ],
        gap: 0,
        align: 'stretch',
        height: 'fill',
      },
    ],
  },
]);
noteOn('md-list', 'Master-detail: the list takes the full width until something is selected. No detail panel and no placeholder before that. Insert hfps · Toolbar and hfps · Data table in the card.');
noteOn('md-selected', 'Selected: the detail panel opens beside the list (~60/40, resizable); the list keeps its tree position so search, filter and sort survive. Below 1024 the detail is a full-screen sheet. React: ResizablePanelGroup.');
screen('Detail (phone)', [{ platform: 'phone', layout: FULL, root: [inst('Full-screen sheet', { id: 'detail-phone' })] }]);
noteOn('detail-phone', 'Detail and editor sheets take the full screen on phones: no max width, no strip of the page behind; close with the X, no swipe. React: Sheet (full width below 1024).');

// Row 4: overlays
row('Sheets, dialogs and feedback');
screen('Form sheet', [
  { platform: 'phone', layout: FULL, root: [inst('App shell'), inst('Bottom sheet', { id: 'sheet-phone' })] },
  { platform: 'desktop', layout: FULL, root: [inst('App shell (desktop)'), inst('Dialog', { id: 'dialog-desktop', x: 480, y: 300 })] },
]);
noteOn('sheet-phone', 'Form dialogs on phones: a bottom drawer with a grab handle (it drags), up to ~92dvh, header fixed, body scrolls, full-width buttons at least 44, primary first then Cancel. React: ResponsiveDialog. Compose: HfpsBottomSheet.');
noteOn('dialog-desktop', 'From 768 (840dp on Android) the same form is a centred dialog; call sites do not change. React: ResponsiveDialog. Compose: HfpsBottomSheet.');
screen('Checklist', [{ platform: 'phone', layout: FULL, root: [inst('App shell'), inst('Checklist sheet', { id: 'checklist-phone' })] }]);
noteOn('checklist-phone', '"Pick several, then confirm": an All row, one row per item (48 min, whole row toggles), Cancel and the confirm action, disabled while nothing is ticked. Compose: HfpsChecklist in HfpsBottomSheet.');
screen('Feedback', [
  {
    platform: 'phone',
    root: [
      entry('Feedback', 'Confirm dialog', 'Short confirmations stay a centred alert dialog on every width, capped at the screen height. React: AlertDialog.'),
      entry('Feedback', 'Toast', 'Bottom centre, above the safe area; swipe to dismiss stays on. React: Sonner Toaster.'),
    ],
  },
]);

// Row 5: the components composed
row('Examples');
screen('Example · Settings', [
  {
    platform: 'phone',
    layout: FULL,
    root: [
      { 'top-app-bar': { title: 'Settings', leading: 'back', actions: 1, action1: 'sun-moon' }, id: 'ex-settings-bar' },
      {
        vstack: [
          {
            vstack: [
              { 'section-header': 'APPEARANCE' },
              { 'list-row': { title: 'Theme', trailing: 'value', value: 'System', divider: true } },
              { 'list-row': { title: 'Palette', trailing: 'value', value: 'Blue', divider: true } },
              { 'section-header': 'SYNC' },
              { 'list-row': { title: 'Sync automatically', trailing: 'toggle', checked: true, divider: true } },
              { 'list-row': { title: 'Server', subtitle: 'sync.example.com', trailing: 'chevron', divider: true } },
              { vstack: [{ 'radio-group': { label: 'Upload quality', options: ['Original', 'High', 'Data saver'], selected: 1 } }, { slider: { label: 'Cache size', value: 30 } }], padding: 16, gap: 16 },
              { vstack: [{ button: { label: 'Save', variant: 'primary' }, width: 'fill' }], padding: 16 },
            ],
            gap: 0,
            style: 'outline',
            radius: 'large',
            height: 'fill',
            id: 'ex-settings-card',
            name: 'Card',
          },
        ],
        padding: 8,
        height: 'fill',
        name: 'Margin',
      },
    ],
  },
]);
noteOn('ex-settings-card', 'Phone settings from the kit: top bar with back, one card, eyebrow sections, list rows, a choice group, a slider row, one primary action. Shared components carry one text, so rows with their own text are library rows (or detached instances).');
screen('Example · Items', [
  {
    platform: 'desktop',
    layout: FULL,
    root: [
      inst('Top bar (desktop)'),
      {
        hstack: [
          inst('Sidebar'),
          {
            vstack: [
              {
                vstack: [
                  { vstack: [{ breadcrumbs: { items: ['Items', 'All items'] } }], padding: 16, name: 'Trail' },
                  inst('Summary strip'),
                  {
                    hstack: [
                      { vstack: [inst('Toolbar'), { 'data-table': { columns: ['Name', 'Status', 'Updated'], rows: 8, selectable: true }, id: 'ex-items-table' }], gap: 0, width: 'fill', name: 'List' },
                      inst('Detail panel'),
                    ],
                    gap: 0,
                    align: 'stretch',
                    height: 'fill',
                  },
                ],
                gap: 0,
                padding: 0,
                style: 'outline',
                radius: 'large',
                height: 'fill',
                id: 'ex-items-card',
                name: 'Card',
              },
            ],
            padding: 8,
            width: 'fill',
            height: 'fill',
            name: 'Margin',
          },
        ],
        gap: 0,
        align: 'stretch',
        height: 'fill',
      },
    ],
  },
]);
noteOn('ex-items-card', 'Desktop list + detail from the kit: shell with sidebar, breadcrumbs, summary strip, toolbar, data table and the detail panel of the selected row, all inside the one card.');

const flows = [
  { id: 'f-md-select', from: 'md-list', to: 'Master-detail (selected)', label: 'Select a row' },
  { id: 'f-cards-detail', from: 'lists-phone-card-list', to: 'Detail (phone)', label: 'Tap a row' },
];

// ---------------------------------------------------------------------------------------------- build and measure

const tmp = mkdtempSync(join(tmpdir(), 'hfps-kit-sample-'));
const designer = (...args: string[]) => execFileSync('bun', [join(root, 'bin/designer.ts'), ...args], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

interface Node { id: string; transform: { x: number; y: number }; children?: Node[]; screen?: { width: number; height: number }; note?: unknown; height?: number }

/** Every node gets an id from its place in the spec (`<screen or component>-<index>-<index>…`), so rebuilds are
 *  byte-identical: `wf build` would otherwise generate fresh random ids each run. */
function assignIds(node: Json, id: string, root = false) {
  if (node.id === undefined && !root) node.id = id; // a component's content takes the component's id
  const base = (node.id as string | undefined) ?? id;
  for (const key of ['vstack', 'hstack', 'grid']) {
    const kids = node[key];
    if (Array.isArray(kids)) kids.forEach((k, i) => assignIds(k as Json, `${base}-${i}`));
  }
}
for (const c of components) assignIds(c.content, `c-${slug(c.name)}`, true);
for (const s of screens) for (const v of s.variants) v.root.forEach((n, i) => assignIds(n, `${v.id}-${i}`));

function spec(canvas: Json[] = []): Json {
  return {
    $schema: 'https://designer.hfps.dev/schema/wireframe-spec.schema.json',
    version: 1,
    name: NAME,
    components,
    screens: screens.map((s) => ({ name: s.name, id: s.id, variants: s.variants })),
    flows,
    notes,
    canvas,
  };
}

function build(out: string, canvas: Json[] = []) {
  const file = join(tmp, 'spec.json');
  writeFileSync(file, JSON.stringify(spec(canvas), null, 2));
  designer('wf', 'build', file, '-o', out);
}

/** Absolute top of every node (by id) and the frames' heights and the notes' heights, from a built project. */
function measure(project: string) {
  const doc = readJson<{ children: Node[] }>(project);
  const top = new Map<string, { x: number; y: number }>();
  const frameH = new Map<string, number>();
  const noteH = new Map<string, number>();
  const walk = (n: Node, ox: number, oy: number) => {
    const x = ox + n.transform.x;
    const y = oy + n.transform.y;
    top.set(n.id, { x, y });
    if (n.screen) frameH.set(n.id, n.screen.height);
    if (n.note) noteH.set(n.id, Math.max(...(n.children ?? []).map((c) => c.height ?? 0)));
    for (const c of n.children ?? []) walk(c, x, y);
  };
  for (const c of doc.children) walk(c, 0, 0);
  return { top, frameH, noteH };
}

try {
  // First build: frames anywhere (one long row), to measure.
  let x = 0;
  for (const s of screens)
    for (const v of s.variants) {
      Object.assign(v, { x, y: 0 });
      x += WIDTH[v.platform] + GAP * 4;
    }
  const first = join(tmp, 'first.designer.json');
  build(first);
  const m = measure(first);
  const frameOf = (nodeId: string) => screens.flatMap((s) => s.variants).find((v) => JSON.stringify(v.root).includes(`"id":"${nodeId}"`))!;

  // Second build: the rows, each frame followed by its notes column.
  const canvas: Json[] = [];
  let y = 0;
  for (const r of rows) {
    const rowTop = y + TITLE_H;
    canvas.push({ heading: { text: r.title, level: 'title' }, id: `title-${slug(r.title)}`, x: 0, y, size: { width: 1200, height: 35 } });
    let cx = 0;
    let bottom = rowTop;
    for (const name of r.screens) {
      const s = screens.find((sc) => sc.name === name)!;
      for (const v of s.variants) {
        const was = m.top.get(v.id)!;
        v.x = cx;
        v.y = rowTop;
        const h = m.frameH.get(v.id)!;
        bottom = Math.max(bottom, rowTop + h);
        // Notes of this frame: beside it, level with their component, pushed down so they never overlap.
        let noteY = -Infinity;
        for (const n of notes.filter((nt) => frameOf(nt.on) === v).sort((a, b) => m.top.get(a.on)!.y - m.top.get(b.on)!.y)) {
          n.x = cx + WIDTH[v.platform] + NOTE_GAP;
          n.y = Math.max(rowTop + (m.top.get(n.on)!.y - was.y), noteY);
          noteY = n.y + m.noteH.get(n.id)! + NOTE_SPACE;
          bottom = Math.max(bottom, noteY);
        }
        cx += WIDTH[v.platform] + NOTE_GAP + NOTE_W + GAP;
      }
    }
    y = bottom + ROW_GAP;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  const built = join(tmp, 'hfps-kit.designer.json');
  build(built, canvas);
  // Compact JSON with a fixed id and date: rebuilds are byte-identical (opening a sample gives the copy a new id).
  writeFileSync(OUT, JSON.stringify({ ...readJson<Json>(built), id: 'dsamplehfpskit', createdAt: SAMPLE_DATE, updatedAt: SAMPLE_DATE }));
  designer('validate', OUT);
  mkdirSync(dirname(SHEET), { recursive: true });
  designer('wf', 'sheet', OUT, '-o', SHEET, '--notes', '--max', '3200');
  // The thumbnail is the Example · Settings screen: the whole sheet is unreadable at 64 px.
  designer('to-png', OUT, '--screen', 'Example · Settings', '--size', '192', '-o', THUMB);
  // One PNG per frame, 900 wide, named <screen>.<platform>.png: docs/screenshots/hfps-kit/ (the PR's renders).
  rmSync(RENDERS, { recursive: true, force: true });
  mkdirSync(RENDERS, { recursive: true });
  for (const s of screens) {
    const dir = join(tmp, 'renders', slug(s.name));
    designer('to-png', OUT, '--screen', s.name, '--size', '900', '-o', dir);
    for (const v of s.variants) copyFileSync(join(dir, `${slug(s.name)}.${v.platform}.png`), join(RENDERS, `${slug(s.name)}.${v.platform}.png`));
  }
  const raw = statSync(OUT).size;
  const gz = gzipSync(readFileSync(OUT)).length;
  console.log(`Wrote ${OUT} (${(raw / 1024).toFixed(0)} KB, ${(gz / 1024).toFixed(0)} KB gzipped), ${THUMB}, ${SHEET}, ${RENDERS}/`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
