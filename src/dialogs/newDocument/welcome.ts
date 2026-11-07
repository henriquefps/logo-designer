const KEY = 'designer.welcomed';

/** True until the welcome (New document) dialog has been seen once in this browser. */
export function isFirstVisit(): boolean {
  try {
    return !localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function markWelcomed() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable */
  }
}
