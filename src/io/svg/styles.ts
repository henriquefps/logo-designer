// Computed style for SVG import: presentation attributes < <style> rules < style="" attribute,
// with CSS inheritance for inherited properties.

export type Style = Record<string, string>;

export const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'display',
  'visibility',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'stop-color',
  'stop-opacity',
  'mix-blend-mode',
] as const;

const NOT_INHERITED = new Set(['opacity', 'display', 'stop-color', 'stop-opacity', 'mix-blend-mode']);

export const INITIAL_STYLE: Style = {
  fill: '#000000',
  'fill-opacity': '1',
  'fill-rule': 'nonzero',
  stroke: 'none',
  'stroke-opacity': '1',
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-dasharray': 'none',
  color: '#000000',
  'font-family': 'Inter Variable',
  'font-size': '16',
  'font-weight': '400',
  'font-style': 'normal',
  'letter-spacing': '0',
  'text-anchor': 'start',
  visibility: 'visible',
};

export interface Rule {
  selector: { tag?: string; id?: string; classes: string[] };
  specificity: number;
  order: number;
  decls: Style;
}

export function parseDeclarations(text: string): Style {
  const out: Style = {};
  for (const part of text.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part
      .slice(idx + 1)
      .replace(/!important/i, '')
      .trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/** Parses simple <style> rules: tag, .class, #id, tag.class, compound classes, comma lists. */
export function parseStyleSheet(css: string): Rule[] {
  const rules: Rule[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!\[CDATA\[|\]\]>/g, '');
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let order = 0;
  while ((m = re.exec(clean))) {
    const decls = parseDeclarations(m[2]);
    for (const raw of m[1].split(',')) {
      const sel = raw.trim();
      // Only simple selectors (no combinators or pseudo-classes).
      if (!sel || /[\s>+~:[]/.test(sel)) continue;
      const parts = sel.match(/[.#]?[^.#]+/g) ?? [];
      const selector: Rule['selector'] = { classes: [] };
      for (const p of parts) {
        if (p.startsWith('.')) selector.classes.push(p.slice(1));
        else if (p.startsWith('#')) selector.id = p.slice(1);
        else if (p !== '*') selector.tag = p.toLowerCase();
      }
      const specificity = (selector.id ? 100 : 0) + selector.classes.length * 10 + (selector.tag ? 1 : 0);
      rules.push({ selector, specificity, order: order++, decls });
    }
  }
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}

function matches(rule: Rule, el: Element): boolean {
  const { tag, id, classes } = rule.selector;
  if (tag && el.localName.toLowerCase() !== tag) return false;
  if (id && el.getAttribute('id') !== id) return false;
  if (classes.length) {
    const own = (el.getAttribute('class') ?? '').split(/\s+/);
    if (!classes.every((c) => own.includes(c))) return false;
  }
  return true;
}

/** Style of `el` given its parent's computed style. */
export function computeStyle(el: Element, parent: Style, rules: Rule[]): Style {
  const style: Style = {};
  for (const [k, v] of Object.entries(parent)) if (!NOT_INHERITED.has(k)) style[k] = v;
  for (const prop of STYLE_PROPS) {
    const v = el.getAttribute(prop);
    if (v != null && v.trim() !== '') style[prop] = v.trim();
  }
  for (const rule of rules) if (matches(rule, el)) Object.assign(style, rule.decls);
  const inline = el.getAttribute('style');
  if (inline) Object.assign(style, parseDeclarations(inline));
  // `inherit` keeps the parent's value.
  for (const [k, v] of Object.entries(style)) if (v === 'inherit') style[k] = parent[k] ?? INITIAL_STYLE[k] ?? '';
  return style;
}
