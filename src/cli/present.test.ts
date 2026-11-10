import { describe, expect, it } from 'vitest';
import { escapeHtml, galleryHtml, pickOpener } from './present';

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
