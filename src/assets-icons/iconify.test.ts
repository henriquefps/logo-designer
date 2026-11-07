import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from './cache';
import { fetchIconifySvg, isOpenLicense, parseCollections, searchIcons, splitId } from './iconify';

const collections = {
  mdi: { name: 'Material Design Icons', total: 7000, license: { title: 'Apache 2.0', spdx: 'Apache-2.0' } },
  nc: { name: 'Non commercial', total: 10, license: { title: 'CC BY-NC 4.0', spdx: 'CC-BY-NC-4.0' } },
  unknown: { name: 'Mystery', total: 1 },
  a: { name: 'Alpha', total: 5, license: { title: 'MIT', spdx: 'MIT' }, author: { name: 'Me' } },
};

describe('iconify', () => {
  beforeEach(() => clearMemoryCache());
  afterEach(() => vi.unstubAllGlobals());

  it('filters open licenses', () => {
    expect(isOpenLicense('MIT')).toBe(true);
    expect(isOpenLicense('CC-BY-NC-4.0')).toBe(false);
    expect(isOpenLicense(undefined)).toBe(false);
    expect(parseCollections(collections).map((c) => c.prefix)).toEqual(['a', 'mdi']);
  });

  it('splits ids', () => {
    expect(splitId('mdi:home-outline')).toEqual(['mdi', 'home-outline']);
  });

  it('search drops closed collections and caches', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('/collections') ? collections : url.includes('mdi.json') ? { width: 24, height: 24, icons: { home: { body: '<path d="M0 0"/>' } } } : { icons: ['mdi:home', 'nc:home', 'a:home'] },
      text: async () => '<svg/>',
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchIcons('home-test', null)).toEqual(['mdi:home', 'a:home']);
    await searchIcons('home-test', null);
    expect(fetchMock).toHaveBeenCalledTimes(2); // collections + one search
    expect(await fetchIconifySvg("mdi:home")).toContain("<svg");
    await fetchIconifySvg('mdi:home');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

import { filterPhosphor, phosphorWeightOf } from './catalog';

describe('phosphor via iconify', () => {
  it('splits the ph collection by weight', () => {
    const ids = ['ph:heart', 'ph:heart-bold', 'ph:heart-fill', 'ph:heart-straight', 'ph:heart-straight-thin'];
    expect(phosphorWeightOf('heart-straight-thin')).toBe('thin');
    expect(filterPhosphor(ids, 'regular')).toEqual(['ph:heart', 'ph:heart-straight']);
    expect(filterPhosphor(ids, 'bold')).toEqual(['ph:heart-bold']);
  });
});
