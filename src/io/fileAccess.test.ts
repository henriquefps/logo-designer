import { describe, expect, it, vi } from 'vitest';
import { createDocument, createRect, type Id } from '@/model';
import { openProjectFile, saveProject, saveProjectAs, type FileAccessDeps, type FileHandleLike } from './fileAccess';
import { serializeProject } from './projectFile';

/** In-memory file handle; `permission` drives query/requestPermission. */
function fakeHandle(name: string, content = '', permission: PermissionState = 'granted') {
  const h = {
    name,
    content,
    permission,
    requested: 0,
    getFile: async () => new Blob([h.content]),
    createWritable: async () => {
      let buf = '';
      return { write: async (d: string | Blob) => void (buf += typeof d === 'string' ? d : await d.text()), close: async () => void (h.content = buf) };
    },
    queryPermission: async () => h.permission,
    requestPermission: async () => {
      h.requested++;
      return h.permission === 'prompt' ? ('granted' as PermissionState) : h.permission;
    },
  };
  return h;
}

function deps(over: Partial<FileAccessDeps> = {}) {
  const handles = new Map<Id, FileHandleLike>();
  const downloads: { text: string; fileName: string }[] = [];
  const d: FileAccessDeps = {
    loadHandle: async (id) => handles.get(id) ?? null,
    saveHandle: async (id, h) => void handles.set(id, h),
    deleteHandle: async (id) => void handles.delete(id),
    download: (text, fileName) => void downloads.push({ text, fileName }),
    pickFile: async () => null,
    ...over,
  };
  return { d, handles, downloads };
}

const abort = () => Promise.reject(new DOMException('cancelled', 'AbortError'));

describe('save in place', () => {
  const doc = createDocument({ name: 'Glyph', children: [createRect()] });

  it('first save asks where (Save as), then writes back to the same file', async () => {
    const file = fakeHandle('glyph.designer.json');
    const picker = vi.fn(async () => file);
    const { d, handles } = deps({ showSaveFilePicker: picker });
    expect(await saveProject(doc, d)).toEqual({ kind: 'saved', fileName: 'glyph.designer.json' });
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Glyph.designer.json' }));
    expect(handles.get(doc.id)).toBe(file);
    expect(JSON.parse(file.content).name).toBe('Glyph');

    const edited = { ...doc, name: 'Glyph 2' };
    expect(await saveProject(edited, d)).toEqual({ kind: 'saved', fileName: 'glyph.designer.json' });
    expect(picker).toHaveBeenCalledTimes(1);
    expect(file.content).toBe(serializeProject(edited));
  });

  it('re-asks permission after a reload and falls back to Save as when refused', async () => {
    const file = fakeHandle('a.designer.json', '', 'prompt');
    const other = fakeHandle('b.designer.json');
    const { d, handles } = deps({ showSaveFilePicker: async () => other });
    handles.set(doc.id, file);
    expect(await saveProject(doc, d)).toMatchObject({ fileName: 'a.designer.json' });
    expect(file.requested).toBe(1);

    file.permission = 'denied';
    expect(await saveProject(doc, d)).toMatchObject({ kind: 'saved', fileName: 'b.designer.json' });
    expect(handles.get(doc.id)).toBe(other);
  });

  it('forgets a file that disappeared', async () => {
    const gone = { ...fakeHandle('gone.designer.json'), createWritable: () => Promise.reject(new DOMException('gone', 'NotFoundError')) };
    const { d, handles } = deps({ showSaveFilePicker: abort });
    handles.set(doc.id, gone);
    expect(await saveProject(doc, d)).toEqual({ kind: 'cancelled' });
    expect(handles.has(doc.id)).toBe(false);
  });

  it('Save as picks a new file even when one is linked; cancel keeps the old link', async () => {
    const a = fakeHandle('a.designer.json');
    const { d, handles } = deps({ showSaveFilePicker: abort });
    handles.set(doc.id, a);
    expect(await saveProjectAs(doc, d)).toEqual({ kind: 'cancelled' });
    expect(handles.get(doc.id)).toBe(a);
  });

  it('downloads where the File System Access API is missing (Firefox, Safari)', async () => {
    const { d, downloads } = deps();
    expect(await saveProject(doc, d)).toEqual({ kind: 'downloaded', fileName: 'Glyph.designer.json' });
    expect(downloads[0].text).toBe(serializeProject(doc));
  });
});

describe('open project file', () => {
  const text = serializeProject(createDocument({ name: 'Mark' }));

  it('keeps the handle from the open picker', async () => {
    const file = fakeHandle('mark.designer.json', text);
    const { d } = deps({ showOpenFilePicker: async () => [file] });
    const r = await openProjectFile(d);
    expect(r?.doc.name).toBe('Mark');
    expect(r?.handle).toBe(file);
  });

  it('returns null when cancelled and throws readable errors', async () => {
    expect(await openProjectFile(deps({ showOpenFilePicker: abort }).d)).toBeNull();
    const bad = fakeHandle('x.json', '{"schemaVersion":1,"artboard":{"width":1,"height":1},"children":[{"type":"rect"}]}');
    await expect(openProjectFile(deps({ showOpenFilePicker: async () => [bad] }).d)).rejects.toThrow(/children\[0\]\.width/);
  });

  it('falls back to a file input without a handle', async () => {
    const { d } = deps({ pickFile: async () => new File([text], 'mark.designer.json') });
    expect(await openProjectFile(d)).toMatchObject({ handle: null, fileName: 'mark.designer.json' });
  });
});
