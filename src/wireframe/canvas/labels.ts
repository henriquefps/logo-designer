/** Height of the name strip above a screen frame, in screen pixels (drawn by ScreenLabels, clickable). */
export const LABEL_STRIP_PX = 22;

/** Rough width of a 12 px Inter label (the overlay is not measured). */
export const labelWidth = (s: string, weight = 400) => s.length * (weight >= 500 ? 7 : 6.6);

export interface LabelLayout {
  /** The name, shortened with "…" when it does not fit; '' when there is no room for it. */
  name: string;
  /** "Phone · 390", "Phone", or '' (only for strips too narrow for the name and "Phone"). */
  detail: string;
  /** Whether the status badge fits. */
  badge: boolean;
}

/** Narrowest name worth showing next to the platform, in characters before the ellipsis. */
const MIN_NAME_CHARS = 3;
const GAP = 6;

const fitName = (name: string, room: number) => {
  if (labelWidth(name, 500) <= room) return name;
  const chars = Math.floor((room - 7) / 7);
  return chars >= MIN_NAME_CHARS ? `${name.slice(0, chars).trimEnd()}…` : '';
};

/**
 * What fits on a frame's label strip of `width` pixels: the name is truncated first, the platform
 * ("Phone") stays at least, the status badge goes last (dropped only when name + platform do not fit
 * beside it). `badgeWidth` is 0 without a status.
 */
export function labelLayout(name: string, platform: string, size: number, width: number, badgeWidth: number): LabelLayout {
  const full = `${platform} · ${size}`;
  const attempt = (room: number): Omit<LabelLayout, 'badge'> | null => {
    if (labelWidth(name, 500) + GAP + labelWidth(full) <= room) return { name, detail: full };
    const short = fitName(name, room - GAP - labelWidth(platform));
    return short ? { name: short, detail: platform } : null;
  };
  if (badgeWidth > 0) {
    const l = attempt(width - badgeWidth - GAP);
    if (l) return { ...l, badge: true };
  }
  return { ...(attempt(width) ?? { name: fitName(name, width), detail: '' }), badge: false };
}
