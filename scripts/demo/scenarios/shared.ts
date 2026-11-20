// Pieces of setup shared by scenarios (always through the UI, run fast and cut from the video).
import type { Demo } from '../lib/demo.ts';
import { insertFromLibrary, openTab, screenBlank, setField } from '../lib/designer.ts';

/** Screen 1 renamed `name`, with a top app bar titled `name` and one list row per title. */
export async function buildListScreen(demo: Demo, name: string, rows: string[]): Promise<void> {
  await demo.click(await screenBlank(demo.page, 'Screen 1'));
  await openTab(demo, 'Properties');
  await setField(demo, 'Screen name', name);
  await insertFromLibrary(demo, 'Top app bar', 'top app');
  await openTab(demo, 'Properties');
  await setField(demo, 'Title', name);
  for (const row of rows) {
    await insertFromLibrary(demo, 'List row');
    await openTab(demo, 'Properties');
    await setField(demo, 'Title', row);
  }
  await demo.key('Escape', { show: false });
  await demo.key('Escape', { show: false });
}
