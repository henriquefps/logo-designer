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
    #root { position: fixed !important; top: ${H}px !important; left: 0; right: 0; bottom: 0; }
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

  const mount = () => {
    if (!document.body) return void requestAnimationFrame(mount);
    document.head.appendChild(style);
    document.body.append(caption, cursor, keys);
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
    __demoCursor(cx: number, cy: number) {
      place(cx, cy);
    },
    __demoKeys(label: string) {
      keys.textContent = label;
      keys.classList.add('on');
      clearTimeout(keysTimer);
      keysTimer = window.setTimeout(() => keys.classList.remove('on'), 1100);
    },
  });
}
