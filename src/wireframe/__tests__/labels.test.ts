import { describe, expect, it } from 'vitest';
import { labelLayout } from '../canvas/labels';

describe('frame label strip', () => {
  it('shows everything when wide', () => {
    expect(labelLayout('Settings', 'Phone', 390, 600, 60)).toEqual({ name: 'Settings', detail: 'Phone · 390', badge: true });
  });

  it('truncates the name first, keeping Phone and the badge', () => {
    const l = labelLayout('A very long screen name indeed', 'Phone', 390, 260, 60);
    expect(l.detail).toBe('Phone');
    expect(l.badge).toBe(true);
    expect(l.name.endsWith('…')).toBe(true);
    expect(l.name.length).toBeLessThan('A very long screen name indeed'.length);
  });

  it('drops the size before the platform, and the badge only when name and Phone do not fit beside it', () => {
    expect(labelLayout('Settings', 'Phone', 390, 190, 60)).toMatchObject({ detail: 'Phone', badge: true });
    const narrow = labelLayout('Settings', 'Phone', 390, 130, 60);
    expect(narrow.badge).toBe(false);
    expect(narrow.detail).toBe('Phone');
  });

  it('without a status the platform still survives a narrow strip', () => {
    const l = labelLayout('Settings and more', 'Phone', 390, 110, 0);
    expect(l.detail).toBe('Phone');
    expect(l.badge).toBe(false);
  });
});
