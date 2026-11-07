import { useSyncExternalStore } from 'react';

export const MOBILE_BREAKPOINT = 768;
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};

/** True below 768px (phones): full-screen canvas, bottom tool strip, panels in a Sheet. */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
