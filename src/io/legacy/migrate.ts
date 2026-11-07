import { toast } from 'sonner';
import { loadProjectList, metaOf, saveDocument, saveProjectList } from '@/store/persistence';
import { convertLegacyProject, LEGACY_STORAGE_KEY, readLegacyProjects, type IconRenderer } from './logogo';

export const MIGRATED_FLAG = 'designer.logogoMigrated';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export interface MigrationSummary {
  projects: number;
  failed: number;
  skippedElements: number;
}

/**
 * One-time import of LogoGo projects from localStorage into IndexedDB. Best effort: never throws,
 * keeps the old data untouched, and marks itself done so it runs once per browser.
 */
let running: Promise<MigrationSummary | null> | null = null;

export function migrateLogoGoOnce(renderIcon?: IconRenderer): Promise<MigrationSummary | null> {
  // Single flight: init can run twice (React StrictMode); both callers await the same run.
  if (!running) running = run(renderIcon).finally(() => (running = null));
  return running;
}

async function run(renderIcon?: IconRenderer): Promise<MigrationSummary | null> {
  const ls = storage();
  if (!ls) return null;
  try {
    if (ls.getItem(MIGRATED_FLAG)) return null;
    const raw = ls.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      ls.setItem(MIGRATED_FLAG, 'none');
      return null;
    }
    const legacy = readLegacyProjects(raw);
    const render = renderIcon ?? (await import('./renderIcon')).renderLibraryIcon;
    const summary: MigrationSummary = { projects: 0, failed: 0, skippedElements: 0 };
    let list = await loadProjectList();
    for (const p of legacy) {
      try {
        const { doc, skipped } = await convertLegacyProject(p, render);
        await saveDocument(doc);
        list = [metaOf(doc), ...list];
        summary.projects++;
        summary.skippedElements += skipped;
      } catch (e) {
        console.warn('LogoGo migration: project skipped', p.name, e);
        summary.failed++;
      }
    }
    if (summary.projects) await saveProjectList(list.sort((a, b) => b.updatedAt - a.updatedAt));
    ls.setItem(MIGRATED_FLAG, new Date().toISOString());
    report(summary);
    return summary;
  } catch (e) {
    console.warn('LogoGo migration failed', e);
    return null;
  }
}

function report(s: MigrationSummary) {
  if (!s.projects && !s.failed) return;
  const title = s.projects === 1 ? 'Imported 1 project from LogoGo' : `Imported ${s.projects} projects from LogoGo`;
  const notes: string[] = [];
  if (s.skippedElements) notes.push(`${s.skippedElements} element${s.skippedElements === 1 ? '' : 's'} could not be converted`);
  if (s.failed) notes.push(`${s.failed} project${s.failed === 1 ? '' : 's'} failed`);
  const description = notes.length ? notes.join(' · ') + '.' : 'Find them in File → Projects.';
  // Let the Toaster mount first.
  setTimeout(() => (s.projects ? toast.success(title, { description }) : toast.error('LogoGo projects could not be imported', { description })), 300);
}
