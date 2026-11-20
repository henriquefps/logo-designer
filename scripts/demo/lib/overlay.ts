// Runs inside the page (Playwright addInitScript, before the app loads): a fake cursor that follows the real mouse
// events Playwright sends, a click ripple, a caption bar above the app, and the cards and badges a video needs, all in
// Henrique's hfps identity (lib/hfps.ts: tokens, Inter, Phosphor icons, the one card on a tinted background). The app
// is pushed down by the bar's height so the caption never covers the menu bar. Pointer events pass through everything
// here; nothing in this file touches the app's state.
//
// This function is serialized into the page: it may only use its options, never imports.
import type { OverlayOptions } from './hfps.ts';

export type { OverlayOptions } from './hfps.ts';

/** A scene card: `scene` between parts of a video, `title` the opening one, `end` the closing one (app icon + url). */
export interface DemoCard {
  variant?: 'scene' | 'title' | 'end';
  eyebrow?: string;
  title: string;
  line?: string;
  items?: string[];
  url?: string;
}

export function installOverlay(opts: OverlayOptions): void {
  const H = opts.captionHeight;
  const w = window as unknown as Record<string, unknown>;
  if (w.__demoOverlay) return;
  w.__demoOverlay = true;
  const F = opts.font;
  const M = opts.mono;
  const icon = (d: string, size: number, cls = '') =>
    `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;

  const style = document.createElement('style');
  style.textContent = `
    ${opts.tokens}
    #root { position: fixed !important; top: ${H}px !important; left: 0; right: 0; bottom: 0; height: auto !important; }
    #root .h-dvh { height: 100% !important; }
    #demo-caption { position: fixed; top: 0; left: 0; right: 0; height: ${H}px; z-index: 2147483646; box-sizing: border-box;
      display: flex; align-items: center; justify-content: center; gap: 14px; padding: 0 20px;
      background: var(--demo-card); color: var(--demo-fg); border-bottom: 1px solid var(--demo-hair);
      font: 600 16px/1.2 ${F}; letter-spacing: -0.005em; pointer-events: none; }
    #demo-caption .step { font: 500 12px/1 ${F}; letter-spacing: .08em; text-transform: uppercase; color: var(--demo-accent);
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    #demo-caption .step:empty { display: none; }
    #demo-caption .sep { width: 1px; height: 16px; background: var(--demo-border); }
    #demo-caption .step:empty + .sep { display: none; }
    #demo-caption .text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #demo-caption .text.in { animation: demo-text-in .28s cubic-bezier(.2,.7,.2,1); }
    @keyframes demo-text-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
    #demo-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647;
      pointer-events: none; transform: translate(-100px, -100px); will-change: transform; }
    #demo-cursor svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
    #demo-cursor.down svg { transform: scale(.88); transform-origin: 3px 2px; }
    .demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px;
      margin: -22px 0 0 -22px; border-radius: 50%; border: 2.5px solid var(--demo-accent);
      background: color-mix(in oklch, var(--demo-accent) 16%, transparent); animation: demo-ripple .55s ease-out forwards; }
    @keyframes demo-ripple { from { transform: scale(.25); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }
    #demo-keys { position: fixed; right: 16px; bottom: 40px; z-index: 2147483646; pointer-events: none;
      display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 10px;
      background: var(--demo-card); color: var(--demo-fg); border: 1px solid var(--demo-border);
      box-shadow: 0 1px 2px rgba(0,0,0,.06); font: 600 14px/1.2 ${F};
      opacity: 0; transform: translateY(4px); transition: opacity .18s, transform .18s; }
    #demo-keys svg { color: var(--demo-muted-fg); }
    #demo-keys.on { opacity: 1; transform: none; }
    #demo-term { position: fixed; left: 76px; bottom: 44px; width: 640px; z-index: 2147483645; pointer-events: none;
      padding: 10px 14px; border-radius: 12px; background: var(--demo-card); color: var(--demo-fg); display: none;
      border: 1px solid var(--demo-border); box-shadow: 0 1px 2px rgba(0,0,0,.06);
      font: 12.5px/1.5 ${M}; white-space: pre; overflow: hidden; }
    #demo-term .cmd { color: var(--demo-accent); font-weight: 600; }
    #demo-term .dim { color: var(--demo-muted-fg); }
    #demo-speed { position: fixed; top: ${H + 12}px; left: 50%; transform: translateX(-50%); z-index: 2147483646;
      pointer-events: none; display: none; align-items: center; gap: 6px; padding: 6px 12px 6px 10px; border-radius: 999px;
      background: var(--demo-accent); color: var(--demo-accent-fg); font: 600 14px/1 ${F}; font-variant-numeric: tabular-nums;
      box-shadow: 0 1px 2px rgba(0,0,0,.12); }
    #demo-speed.on { display: flex; animation: demo-pop .25s cubic-bezier(.2,.7,.2,1.4); }
    @keyframes demo-pop { from { opacity: 0; transform: translateX(-50%) scale(.8) } to { opacity: 1; transform: translateX(-50%) scale(1) } }

    /* Scene cards: the tinted background slides in from the right, one white card rises into place, the background
       slides out to the left. Short and the same every time. (A transform, not clip-path: animating a full-screen
       clip-path left blank white frames in the headless recording.) */
    #demo-card { position: fixed; inset: 0; z-index: 2147483647; display: none; align-items: center; justify-content: center;
      background: var(--demo-bg); pointer-events: none; font-family: ${F}; color: var(--demo-fg);
      transform: translateX(100%); will-change: transform; }
    #demo-card.go { transition: transform .42s cubic-bezier(.65,0,.35,1); }
    #demo-card.on { transform: none; }
    #demo-card.off { transform: translateX(-100%); }
    #demo-card .panel { background: var(--demo-card); border: 1px solid var(--demo-hair); border-radius: 18px;
      box-shadow: 0 1px 2px rgba(0,0,0,.05); padding: 44px 56px 46px; min-width: 520px; max-width: 860px; box-sizing: border-box;
      display: flex; flex-direction: column; gap: 14px; opacity: 0; transform: translateY(14px);
      transition: opacity .3s ease .16s, transform .38s cubic-bezier(.2,.7,.2,1) .16s; }
    #demo-card.on .panel { opacity: 1; transform: none; }
    #demo-card.off .panel { opacity: 0; transform: translateY(-8px); transition: opacity .2s ease, transform .25s ease; }
    #demo-card .eyebrow { font: 500 13px/1 ${F}; letter-spacing: .08em; text-transform: uppercase; color: var(--demo-accent); }
    #demo-card .title { font: 600 44px/1.12 ${F}; letter-spacing: -.022em; }
    #demo-card .line { font: 400 19px/1.45 ${F}; color: var(--demo-muted-fg); }
    #demo-card ul { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 10px; font: 400 18px/1.35 ${F}; }
    #demo-card li { display: flex; align-items: center; gap: 10px; }
    #demo-card li svg { color: var(--demo-accent); flex: none; }
    #demo-card.title .panel { padding: 52px 64px 54px; }
    #demo-card.title .title { font-size: 52px; }
    #demo-card.end .panel { align-items: center; text-align: center; padding: 52px 72px 50px; }
    #demo-card.end .icon { width: 76px; height: 76px; margin-bottom: 6px; }
    #demo-card.end .icon svg { width: 100%; height: 100%; display: block; }
    #demo-card.end .title { font-size: 52px; }
    #demo-card .url { margin-top: 6px; display: inline-flex; align-items: center; gap: 8px; font: 600 18px/1 ${F};
      color: var(--demo-accent); padding: 10px 16px; border-radius: 999px; background: var(--demo-accent-soft); }

    #demo-doc, #demo-paste { position: fixed; z-index: 2147483640; display: flex; flex-direction: column; background: var(--demo-card);
      border: 1px solid var(--demo-border); border-radius: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.12); overflow: hidden; }
    #demo-doc header, #demo-paste header { padding: 11px 16px; background: var(--demo-bg); border-bottom: 1px solid var(--demo-hair);
      font: 600 14px/1.3 ${F}; color: var(--demo-fg); }
    #demo-doc .body { flex: 1; display: flex; min-height: 0; }
    #demo-doc .tree { width: 290px; overflow: auto; padding: 10px 12px; border-right: 1px solid var(--demo-hair); background: var(--demo-bg);
      font: 13px/1.7 ${M}; color: var(--demo-fg); white-space: pre; }
    #demo-doc .tree .on { background: var(--demo-accent-soft); color: var(--demo-accent); border-radius: 6px; font-weight: 600; }
    #demo-doc .text { flex: 1; overflow: auto; padding: 14px 18px; font: 13px/1.55 ${M}; color: var(--demo-fg); white-space: pre-wrap; }
    #demo-paste textarea { flex: 1; border: 0; outline: 0; resize: none; padding: 14px 16px;
      font: 13px/1.5 ${M}; color: var(--demo-fg); background: var(--demo-card); }
  `;

  const caption = document.createElement('div');
  caption.id = 'demo-caption';
  caption.innerHTML = '<span class="step"></span><span class="sep"></span><span class="text"></span>';
  const cursor = document.createElement('div');
  cursor.id = 'demo-cursor';
  // An arrow: ink fill, white outline (reads on the light canvas and on the dark present backdrop).
  cursor.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 20 L8 15.5 L11.5 23 L14.5 21.6 L11 14.4 L17.5 14.4 Z" fill="var(--demo-fg)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const keys = document.createElement('div');
  keys.id = 'demo-keys';
  const term = document.createElement('div');
  term.id = 'demo-term';
  const speed = document.createElement('div');
  speed.id = 'demo-speed';
  const card = document.createElement('div');
  card.id = 'demo-card';

  const mount = () => {
    if (!document.body) return void requestAnimationFrame(mount);
    document.head.appendChild(style);
    document.body.append(caption, cursor, keys, term, speed, card);
  };
  mount();

  let x = -100;
  let y = -100;
  const place = (cx: number, cy: number) => {
    x = cx;
    y = cy;
    cursor.style.transform = `translate(${cx - 3}px, ${cy - 2}px)`;
  };
  const opt = { capture: true, passive: true } as const;
  for (const type of ['pointermove', 'mousemove', 'dragover', 'drag', 'pointerdown', 'mousedown']) {
    window.addEventListener(type, (e) => {
      const m = e as MouseEvent;
      // HTML5 drag events report 0,0 at the very end of a drag; ignore those.
      if ((type === 'drag' || type === 'dragover') && m.clientX === 0 && m.clientY === 0) return;
      place(m.clientX, m.clientY);
    }, opt);
  }
  const ripple = () => {
    const r = document.createElement('div');
    r.className = 'demo-ripple';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 700);
  };
  window.addEventListener('pointerdown', () => {
    cursor.classList.add('down');
    ripple();
  }, opt);
  // A native drag swallows pointerup; dragend/drop end the press too.
  for (const type of ['pointerup', 'mouseup', 'dragend', 'drop']) window.addEventListener(type, () => cursor.classList.remove('down'), opt);

  const el = (tag: string, cls: string, text: string) => {
    const e = document.createElement(tag);
    e.className = cls;
    e.textContent = text;
    return e;
  };

  let keysTimer = 0;
  let cardTimer = 0;
  Object.assign(w, {
    /** The caption bar: an eyebrow (the scene, or "3/7") and one sentence; an empty text hides the bar's content. */
    __demoCaption(step: string, text: string) {
      const t = caption.querySelector('.text') as HTMLElement;
      (caption.querySelector('.step') as HTMLElement).textContent = step;
      if (t.textContent !== text) {
        t.textContent = text;
        t.classList.remove('in');
        void t.offsetWidth;
        t.classList.add('in');
      }
      caption.style.visibility = text ? 'visible' : 'hidden';
    },
    /** The sped-up badge under the caption (a Phosphor fast-forward icon and "×8"); '' hides it. */
    __demoSpeed(label: string) {
      speed.innerHTML = label ? `${icon(opts.icons.fastForward, 15)}<span></span>` : '';
      if (label) (speed.querySelector('span') as HTMLElement).textContent = label;
      speed.classList.toggle('on', !!label);
    },
    /** A full-screen scene card (over everything, the cursor too); `null` slides it out. `instant`: up at once. */
    __demoCard(c: DemoCard | null, instant = false) {
      clearTimeout(cardTimer);
      if (!c) {
        card.classList.add('off');
        card.classList.remove('on');
        cardTimer = window.setTimeout(() => {
          card.style.display = 'none';
          card.className = '';
        }, 460);
        return;
      }
      const panel = el('div', 'panel', '');
      if (c.variant === 'end') {
        const i = el('div', 'icon', '');
        i.innerHTML = opts.appIcon;
        panel.appendChild(i);
      }
      if (c.eyebrow) panel.appendChild(el('div', 'eyebrow', c.eyebrow));
      panel.appendChild(el('div', 'title', c.title));
      if (c.line) panel.appendChild(el('div', 'line', c.line));
      if (c.items?.length) {
        const ul = document.createElement('ul');
        for (const it of c.items) {
          const li = document.createElement('li');
          li.innerHTML = icon(opts.icons.check, 18);
          li.appendChild(document.createTextNode(it));
          ul.appendChild(li);
        }
        panel.appendChild(ul);
      }
      if (c.url) {
        const u = el('div', 'url', '');
        u.innerHTML = icon(opts.icons.arrowRight, 16);
        u.appendChild(document.createTextNode(c.url));
        panel.appendChild(u);
      }
      card.replaceChildren(panel);
      card.className = c.variant ?? 'scene';
      card.style.display = 'flex';
      if (instant) return void card.classList.add('on');
      void card.offsetWidth;
      card.classList.add('go');
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('on')));
    },
    /**
     * A file viewer outside the app (a floating panel): a list of files on the left (`on` = the one shown) and a
     * text on the right; `null` removes it.
     */
    __demoDoc(d: { title: string; files: string[]; on?: number; text: string; rect: { x: number; y: number; width: number; height: number } } | null) {
      document.getElementById('demo-doc')?.remove();
      if (!d) return;
      const box = document.createElement('div');
      box.id = 'demo-doc';
      Object.assign(box.style, { left: `${d.rect.x}px`, top: `${d.rect.y}px`, width: `${d.rect.width}px`, height: `${d.rect.height}px` });
      const head = document.createElement('header');
      head.textContent = d.title;
      const body = document.createElement('div');
      body.className = 'body';
      const tree = document.createElement('div');
      tree.className = 'tree';
      d.files.forEach((f, i) => {
        const row = document.createElement('div');
        row.textContent = f;
        if (i === d.on) row.className = 'on';
        tree.appendChild(row);
      });
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = d.text;
      body.append(tree, text);
      box.append(head, body);
      document.body.appendChild(box);
    },
    __demoCursor(cx: number, cy: number) {
      place(cx, cy);
    },
    /** A paste target outside the app (an empty textarea in a floating panel), to show clipboard contents. */
    __demoPasteBox(title: string, rect: { x: number; y: number; width: number; height: number }) {
      document.getElementById('demo-paste')?.remove();
      const box = document.createElement('div');
      box.id = 'demo-paste';
      Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const head = document.createElement('header');
      head.textContent = title;
      const area = document.createElement('textarea');
      area.placeholder = 'Ctrl + V';
      area.spellcheck = false;
      box.append(head, area);
      document.body.appendChild(box);
    },
    /** A terminal strip (bottom left, over the canvas): the agent's commands and their output. [] hides it. */
    __demoTerminal(lines: string[], width?: number) {
      term.style.width = width ? `${width}px` : '';
      term.replaceChildren(
        ...lines.map((l) => {
          const row = document.createElement('div');
          row.className = l.startsWith('$ ') ? 'cmd' : 'dim';
          row.textContent = l;
          return row;
        }),
      );
      term.style.display = lines.length ? 'block' : 'none';
    },
    /** The key badge (bottom right): the shortcut just pressed, with a Phosphor keyboard icon. */
    __demoKeys(label: string) {
      keys.innerHTML = icon(opts.icons.keyboard, 16);
      keys.appendChild(document.createTextNode(label));
      keys.classList.add('on');
      clearTimeout(keysTimer);
      keysTimer = window.setTimeout(() => keys.classList.remove('on'), 1100);
    },
  });
}
