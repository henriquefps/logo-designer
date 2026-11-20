// `designer new --sample <id>`: the app's bundled sample projects (src/samples/registry.ts, files in public/samples/)
// as a new project copy (new id, "<name> (sample)" or --name), like Help → Open sample project… in the app.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignDocument } from '@/model';
import { validateDocument } from '@/io/projectFile';
import { SAMPLES, sampleById } from '@/samples/registry';
import { sampleCopy } from '@/samples/copy';

/** Where a sample's file is in this checkout (public/ is two levels above src/cli). */
// (Not `new URL(…, import.meta.url)`: Vite rewrites that pattern as an asset import under Vitest.)
export const samplePath = (file: string): string => join(dirname(fileURLToPath(import.meta.url)), '../../public', file);

export const sampleIds = (): string => SAMPLES.map((s) => s.id).join(' | ');

export async function newSampleProject(id: string, name?: string): Promise<{ doc: DesignDocument; warnings: string[] }> {
  const sample = sampleById(id);
  if (!sample) throw new SampleUsage(`Unknown sample "${id}" (samples: ${sampleIds()})`);
  const warnings: string[] = [];
  const doc = validateDocument(JSON.parse(await readFile(samplePath(sample.file), 'utf8')), { warnings });
  const copy = sampleCopy(doc, sample);
  if (name?.trim()) copy.name = name.trim();
  return { doc: copy, warnings };
}

export class SampleUsage extends Error {}
