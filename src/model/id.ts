let counter = 0;

/** Short unique id, safe as an SVG id/XML name (starts with a letter). */
export function newId(prefix = 'n'): string {
  counter = (counter + 1) % 1679616;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
