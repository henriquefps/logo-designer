import type { StateStorage } from 'zustand/middleware';
import { toast } from 'sonner';

const DEBOUNCE_MS = 400;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * localStorage adapter for zustand's `persist` middleware that debounces writes
 * per storage key and surfaces quota errors as a toast instead of failing silently.
 * This is what stops rapid slider/drag updates from thrashing localStorage the way
 * the original app's un-debounced autosave effect did.
 */
export const debouncedLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    const existing = timers.get(name);
    if (existing) clearTimeout(existing);

    timers.set(
      name,
      setTimeout(() => {
        timers.delete(name);
        try {
          localStorage.setItem(name, value);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            toast.error('Storage is full', {
              description: 'Your browser storage limit was reached. Remove large images or delete unused projects to keep saving.',
            });
          } else {
            toast.error('Could not save your changes locally.');
          }
        }
      }, DEBOUNCE_MS),
    );
  },
  removeItem: (name) => {
    const existing = timers.get(name);
    if (existing) clearTimeout(existing);
    timers.delete(name);
    localStorage.removeItem(name);
  },
};
