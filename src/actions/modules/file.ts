import { toast } from 'sonner';
import { downloadProject, parseProject, PROJECT_EXTENSION } from '@/io/projectFile';
import { pickFiles } from '@/io/download';
import { getImporter } from '@/io/importers/registry';
import { useDocStore } from '@/store/useDocStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useProjectsStore } from '@/store/useProjectsStore';
import { IMAGE_ACCEPT, openSvgFileAsDocument, placeReferenceImage, SVG_ACCEPT } from '@/io/importActions';
import { copySvgToClipboard } from '@/io/exportActions';
import type { Action } from '../types';

const open = (id: string) => useEditorStore.getState().openDialog(id);

const actions: Action[] = [
  {
    id: 'file.new',
    label: 'New…',
    menu: 'file',
    group: 'project',
    order: 0,
    shortcut: 'alt+mod+n',
    run: () => useEditorStore.getState().openDialog('newDocument'),
  },
  {
    id: 'file.projects',
    label: 'Projects…',
    menu: 'file',
    group: 'project',
    order: 1,
    shortcut: 'mod+o',
    run: () => open('projects'),
  },
  {
    id: 'file.openProjectFile',
    label: 'Open project file…',
    menu: 'file',
    group: 'file',
    order: 10,
    run: async () => {
      const [file] = await pickFiles(`${PROJECT_EXTENSION},.json,application/json`);
      if (!file) return;
      try {
        const doc = parseProject(await file.text());
        await useProjectsStore.getState().importDocument(doc);
        toast.success(`Opened “${doc.name}”`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not open this file.');
      }
    },
  },
  {
    id: 'file.saveProjectFile',
    label: 'Save project file',
    menu: 'file',
    group: 'file',
    order: 11,
    shortcut: 'mod+s',
    allowInInput: true,
    run: () => downloadProject(useDocStore.getState().doc),
  },
  {
    id: 'file.importSvg',
    label: 'Import SVG…',
    menu: 'file',
    group: 'io',
    order: 20,
    shortcut: 'mod+i',
    run: async () => {
      const importer = getImporter('svg');
      if (!importer) {
        toast.info('SVG import is coming soon.');
        return;
      }
      const files = await pickFiles(importer.accept, true);
      if (files.length) await importer.importFiles(files);
    },
  },
  {
    id: 'file.placeReference',
    label: 'Place reference image…',
    menu: 'file',
    group: 'io',
    order: 21,
    run: async () => {
      const [file] = await pickFiles(IMAGE_ACCEPT);
      if (file) await placeReferenceImage(file);
    },
  },
  {
    id: 'file.export',
    label: 'Export…',
    menu: 'file',
    group: 'io',
    order: 21,
    shortcut: ['mod+shift+e', 'mod+e'],
    run: () => open('export'),
  },
  {
    id: 'file.openSvg',
    label: 'Open SVG as new project…',
    menu: 'file',
    group: 'file',
    order: 12,
    run: async () => {
      const [file] = await pickFiles(SVG_ACCEPT);
      if (file) await openSvgFileAsDocument(file);
    },
  },
  {
    id: 'file.copySvg',
    label: 'Copy SVG to clipboard',
    menu: 'file',
    group: 'io',
    order: 22,
    shortcut: 'mod+alt+c',
    run: () => void copySvgToClipboard(),
  },
];

export default actions;
