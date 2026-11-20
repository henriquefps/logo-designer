// Runs inside the page (Playwright addInitScript, before the app loads): a fake cursor that follows
// the real mouse events Playwright sends, a click ripple, and a caption bar above the app. The app
// is pushed down by the bar's height so the caption never covers the menu bar. Pointer events pass
// through everything here; nothing in this file touches the app's state.

export interface OverlayOptions {
  captionHeight: number;
}

export function installOverlay(opts: OverlayOptions): void {
  const H = opts.captionHeight;
  const w = window as unknown as Record<string, unknown>;
  if (w.__demoOverlay) return;
  w.__demoOverlay = true;

  const style = document.createElement('style');
  style.textContent = `
    #root { position: fixed !important; top: ${H}px !important; left: 0; right: 0; bottom: 0; height: auto !important; }
    #root .h-dvh { height: 100% !important; }
    #demo-caption { position: fixed; top: 0; left: 0; right: 0; height: ${H}px; z-index: 2147483646;
      display: flex; align-items: center; justify-content: center; gap: 12px; padding: 0 20px;
      background: #111; color: #fff; font: 600 17px/1.2 Inter, system-ui, sans-serif; letter-spacing: 0;
      pointer-events: none; }
    #demo-caption .step { font-weight: 500; color: #9a9a9a; font-variant-numeric: tabular-nums; }
    #demo-caption .text { transition: opacity .2s; }
    #demo-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647;
      pointer-events: none; transform: translate(-100px, -100px); will-change: transform; }
    #demo-cursor svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
    #demo-cursor.down svg { transform: scale(.88); transform-origin: 3px 2px; }
    .demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px;
      margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid rgba(255, 92, 0, .95);
      background: rgba(255, 92, 0, .18); animation: demo-ripple .55s ease-out forwards; }
    @keyframes demo-ripple { from { transform: scale(.25); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }
    #demo-keys { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; pointer-events: none;
      padding: 6px 12px; border-radius: 8px; background: rgba(17,17,17,.88); color: #fff;
      font: 600 15px/1.2 Inter, system-ui, sans-serif; opacity: 0; transition: opacity .2s; }
    #demo-keys.on { opacity: 1; }
    #demo-term { position: fixed; left: 76px; bottom: 44px; width: 640px; z-index: 2147483645; pointer-events: none;
      padding: 8px 12px; border-radius: 8px; background: rgba(11, 15, 20, .94); color: #d4d4d8; display: none;
      font: 12.5px/1.45 ui-monospace, 'JetBrains Mono', 'DejaVu Sans Mono', monospace; white-space: pre; overflow: hidden;
      box-shadow: 0 8px 30px rgba(0,0,0,.3); }
    #demo-term .cmd { color: #86efac; }
    #demo-term .dim { color: #a1a1aa; }
    #demo-speed { position: fixed; top: ${H + 12}px; left: 50%; transform: translateX(-50%); z-index: 2147483646;
      pointer-events: none; padding: 6px 14px; border-radius: 999px; background: #ff5c00; color: #fff; display: none;
      font: 700 15px/1.2 Inter, system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.25); }
    #demo-card { position: fixed; inset: 0; z-index: 2147483647; display: none; flex-direction: column;
      align-items: center; justify-content: center; gap: 18px; background: #0f1115; color: #fff; pointer-events: none;
      font-family: Inter, system-ui, sans-serif; opacity: 0; transition: opacity .35s ease; text-align: center; padding: 0 80px; }
    #demo-card.on { opacity: 1; }
    #demo-card .num { font: 700 15px/1 Inter, system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: #ff7a2e; }
    #demo-card .title { font: 800 54px/1.1 Inter, system-ui, sans-serif; letter-spacing: -.02em; }
    #demo-card .line { font: 400 22px/1.4 Inter, system-ui, sans-serif; color: #b4b8c2; max-width: 900px; }
    #demo-card .rule { width: 56px; height: 4px; border-radius: 2px; background: #ff7a2e; }
    #demo-card ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 10px; text-align: left;
      font: 400 20px/1.35 Inter, system-ui, sans-serif; color: #d4d7de; }
    #demo-card li::before { content: '→ '; color: #ff7a2e; font-weight: 700; }
    #demo-doc { position: fixed; z-index: 2147483640; display: flex; flex-direction: column; background: #fff;
      border: 1px solid #d4d4d4; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.25); overflow: hidden; }
    #demo-doc header { padding: 10px 14px; background: #f4f4f5; border-bottom: 1px solid #e4e4e7;
      font: 600 14px/1.3 Inter, system-ui, sans-serif; color: #18181b; }
    #demo-doc .body { flex: 1; display: flex; min-height: 0; }
    #demo-doc .tree { width: 290px; overflow: auto; padding: 10px 12px; border-right: 1px solid #e4e4e7; background: #fafafa;
      font: 13px/1.6 ui-monospace, 'DejaVu Sans Mono', monospace; color: #27272a; white-space: pre; }
    #demo-doc .tree .on { background: #ffedd5; border-radius: 4px; }
    #demo-doc .text { flex: 1; overflow: auto; padding: 12px 16px; font: 13px/1.55 ui-monospace, 'DejaVu Sans Mono', monospace;
      color: #18181b; white-space: pre-wrap; }
    #demo-paste { position: fixed; z-index: 2147483640; display: flex; flex-direction: column;
      background: #fff; border: 1px solid #d4d4d4; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.25); overflow: hidden; }
    #demo-paste header { padding: 10px 14px; background: #f4f4f5; border-bottom: 1px solid #e4e4e7;
      font: 600 14px/1.3 Inter, system-ui, sans-serif; color: #18181b; }
    #demo-paste textarea { flex: 1; border: 0; outline: 0; resize: none; padding: 12px 14px;
      font: 13px/1.5 ui-monospace, 'DejaVu Sans Mono', monospace; color: #18181b; background: #fff; }
  `;

  const caption = document.createElement('div');
  caption.id = 'demo-caption';
  caption.innerHTML = '<span class="step"></span><span class="text"></span>';
  const cursor = document.createElement('div');
  cursor.id = 'demo-cursor';
  // An arrow: black fill, white outline (reads on the light canvas and on the dark present backdrop).
  cursor.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 20 L8 15.5 L11.5 23 L14.5 21.6 L11 14.4 L17.5 14.4 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
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

  let keysTimer = 0;
  Object.assign(w, {
    __demoCaption(step: string, text: string) {
      (caption.querySelector('.step') as HTMLElement).textContent = step;
      (caption.querySelector('.text') as HTMLElement).textContent = text;
      caption.style.display = text ? 'flex' : 'none';
    },
    /** The fast-forward badge under the caption ("⏩ acelerado ×8"); '' hides it. */
    __demoSpeed(label: string) {
      speed.textContent = label;
      speed.style.display = label ? 'block' : 'none';
    },
    /** A full-screen chapter card (over everything, the cursor too); `null` fades it out. */
    __demoCard(c: { num: string; title: string; line?: string; items?: string[] } | null) {
      if (!c) {
        card.classList.remove('on');
        setTimeout(() => (card.style.display = card.classList.contains('on') ? 'flex' : 'none'), 380);
        return;
      }
      const el = (tag: string, cls: string, text: string) => {
        const e = document.createElement(tag);
        e.className = cls;
        e.textContent = text;
        return e;
      };
      const parts: HTMLElement[] = [el('div', 'num', c.num), el('div', 'title', c.title), el('div', 'rule', '')];
      if (c.line) parts.push(el('div', 'line', c.line));
      if (c.items?.length) {
        const ul = document.createElement('ul');
        for (const i of c.items) ul.appendChild(el('li', '', i));
        parts.push(ul);
      }
      card.replaceChildren(...parts);
      card.style.display = 'flex';
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
    __demoKeys(label: string) {
      keys.textContent = label;
      keys.classList.add('on');
      clearTimeout(keysTimer);
      keysTimer = window.setTimeout(() => keys.classList.remove('on'), 1100);
    },
  });
}
