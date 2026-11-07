import { describe, expect, it } from 'vitest';
import { createDocument, createRect } from '@/model';
import { parseProject, serializeProject } from './projectFile';

describe('project file', () => {
  it('round-trips', () => {
    const doc = createDocument({ name: 'Logo', children: [createRect()] });
    const back = parseProject(serializeProject(doc));
    expect(back.children).toEqual(doc.children);
    expect(back.name).toBe('Logo');
  });
  it('rejects other files', () => {
    expect(() => parseProject('{"a":1}')).toThrow(/not a Designer/);
    expect(() => parseProject('nope')).toThrow(/JSON/);
  });
});
