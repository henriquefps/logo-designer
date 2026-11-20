import { describe, expect, it } from 'vitest';
import { chooseHandover, escapeHtml, formatBytes, galleryHtml, openLinkLimit, pickOpener } from './present';

describe('pickOpener', () => {
  const url = 'https://designer.hfps.dev/#open=abc&name=x';
  it('macOS uses open, even over SSH', () => {
    expect(pickOpener('darwin', {}, url)).toEqual({ command: 'open', args: [url] });
    expect(pickOpener('darwin', { SSH_CONNECTION: '1 2 3 4' }, url)?.command).toBe('open');
  });
  it('Windows uses the URL handler (no shell, & stays intact)', () => {
    expect(pickOpener('win32', {}, url)).toEqual({ command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] });
  });
  it('Linux needs a display', () => {
    expect(pickOpener('linux', { DISPLAY: ':0' }, url)).toEqual({ command: 'xdg-open', args: [url] });
    expect(pickOpener('linux', { WAYLAND_DISPLAY: 'wayland-0' }, url)?.command).toBe('xdg-open');
    expect(pickOpener('linux', { SSH_CONNECTION: '1 2 3 4' }, url)).toBeNull();
    expect(pickOpener('linux', {}, url)).toBeNull();
  });
});

describe('galleryHtml', () => {
  const items = [
    { name: 'Hoard <A>', width: 1024, height: 512.5, previewUrl: '/preview/0.svg', importLink: 'https://designer.hfps.dev/?import=http%3A%2F%2Flocalhost%3A8765%2Ffiles%2F0%2Fa.json' },
    { name: 'B', width: 128, height: 128, previewUrl: '/preview/1.svg', importLink: 'https://designer.hfps.dev/?import=x&y="z"' },
  ];
  const html = galleryHtml(items);
  it('has one card, preview and button per file', () => {
    expect(html.match(/class="card"/g)).toHaveLength(2);
    expect(html).toContain('src="/preview/1.svg"');
    expect(html.match(/Open in Designer<\/a>/g)).toHaveLength(2);
    expect(html).toContain('1024 × 512.5 px');
    expect(html).toContain('2 files');
  });
  it('escapes names and links', () => {
    expect(html).toContain('Hoard &lt;A&gt;');
    expect(html).not.toContain('Hoard <A>');
    expect(html).toContain('&amp;y=&quot;z&quot;');
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
  it('is self-contained and themed', () => {
    expect(html).not.toMatch(/(src|href)="https?:\/\/(?!designer)/);
    expect(html).not.toContain('<script');
    expect(html).toContain('prefers-color-scheme: dark');
  });
});

describe('chooseHandover (designer open: #open= link or ?import= from localhost)', () => {
  // Link lengths measured on real projects (docs/wireframe-mode.md → A6 → As built).
  const ICON = 1_500; // an app icon glyph
  const TEN_SCREENS = 101_129; // 10 phone screens, ~100 components each, shared tab bar, repeat lists
  const TEN_SCREENS_ONE_SCREENSHOT = 625_000; // + one embedded 1080×2243 JPEG reference
  const TEN_SCREENS_TWO_SCREENSHOTS = 1_900_000; // + two: still under Chrome's 2 MB, over every OS opener

  it('icons and small projects keep the #open= link everywhere', () => {
    for (const p of ['darwin', 'linux', 'win32']) expect(chooseHandover(ICON, p)).toBe('open-link');
    expect(chooseHandover(openLinkLimit('linux'), 'linux')).toBe('open-link');
  });
  it('a 10-screen wireframe is served for ?import=', () => {
    for (const p of ['darwin', 'linux', 'win32']) expect(chooseHandover(TEN_SCREENS, p)).toBe('import');
    expect(chooseHandover(openLinkLimit('linux') + 1, 'linux')).toBe('import');
  });
  it('embedded screenshots always go through ?import= (Linux E2BIG above 128 KB, macOS above 1 MB)', () => {
    for (const p of ['darwin', 'linux', 'win32']) {
      expect(chooseHandover(TEN_SCREENS_ONE_SCREENSHOT, p)).toBe('import');
      expect(chooseHandover(TEN_SCREENS_TWO_SCREENSHOTS, p)).toBe('import');
    }
  });
  it('limits stay under each OS opener', () => {
    expect(openLinkLimit('linux')).toBeLessThan(128 * 1024); // MAX_ARG_STRLEN
    expect(openLinkLimit('darwin')).toBeLessThan(1024 * 1024); // ARG_MAX
    expect(openLinkLimit('win32')).toBeLessThan(32_767); // CreateProcess command line
    expect(chooseHandover(31_000, 'win32')).toBe('import');
    expect(chooseHandover(31_000, 'linux')).toBe('open-link');
  });
  it('formatBytes', () => {
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(640 * 1024)).toBe('640 KB');
    expect(formatBytes(1.94 * 1024 * 1024)).toBe('1.9 MB');
  });
});

describe('galleryHtml for wireframes', () => {
  it('shows the screen count instead of the artboard size', () => {
    const html = galleryHtml([{ name: 'Hoard', width: 1024, height: 1024, screens: 2, previewUrl: '/p.svg', importLink: 'x' }]);
    expect(html).toContain('Wireframe · 2 screens');
    expect(html).not.toContain('1024 × 1024');
  });
});
