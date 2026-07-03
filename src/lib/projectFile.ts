import { downloadBlob } from '@/lib/export/svgSerialize';
import type { CanvasSettings } from '@/types/canvas';
import type { LogoElement } from '@/types/element';
import type { Project } from '@/types/project';

const FILE_FORMAT = 'logogo-project';
const FILE_VERSION = 1;

interface ProjectFile {
  format: typeof FILE_FORMAT;
  version: number;
  name: string;
  canvasSettings: CanvasSettings;
  elements: LogoElement[];
}

export function downloadProjectFile(project: Project): void {
  const file: ProjectFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: project.name,
    canvasSettings: project.canvasSettings,
    elements: project.elements,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const safeName = project.name.trim().replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'logo';
  downloadBlob(blob, `${safeName}.logogo.json`);
}

/** Throws with a user-facing message if the file isn't a recognizable LogoGo project. */
export async function parseProjectFile(file: File): Promise<{ name: string; canvasSettings: CanvasSettings; elements: LogoElement[] }> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Not a valid JSON file.');
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    (data as ProjectFile).format !== FILE_FORMAT ||
    !Array.isArray((data as ProjectFile).elements) ||
    typeof (data as ProjectFile).canvasSettings !== 'object'
  ) {
    throw new Error('This file was not created by LogoGo.');
  }

  const parsed = data as ProjectFile;
  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Imported logo',
    canvasSettings: parsed.canvasSettings,
    elements: parsed.elements,
  };
}
