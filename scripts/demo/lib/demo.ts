// The driver a scenario uses: every action is a real Playwright mouse / keyboard input, moved in
// visible steps and followed by a short pause, so a viewer can follow it. Targets are locators
// (their centre, or a point inside them) or viewport points.
import type { Locator, Page } from 'playwright';

export interface Point {
  x: number;
  y: number;
}

export interface Box extends Point {
  width: number;
  height: number;
}

/** A locator (aimed inside its box), a box (same), or a viewport point. */
export type Target = Locator | Box | Point;

/** Where inside a locator's box to aim: fractions of its width / height (0.5, 0.5 = centre), plus pixels. */
export interface Aim {
  fx?: number;
  fy?: number;
  dx?: number;
  dy?: number;
}

export interface DemoOptions {
  page: Page;
  /** Height of the caption bar: the app's coordinates start below it. */
  captionHeight: number;
  /** Setup mode: no pauses, quick moves, no caption (the part before `begin()` is cut from the video). */
  fast?: boolean;
}

const isPoint = (t: Target): t is Point => typeof (t as Point).x === 'number' && typeof (t as Point).y === 'number' && !('click' in t);

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Demo {
  readonly page: Page;
  fast: boolean;
  /** Time (ms since the page opened) where the recorded part starts; set by `begin()`. */
  startedAt: number | null = null;
  readonly openedAt = Date.now();
  private pos: Point = { x: 640, y: 420 };
  private stepNo = 0;
  private stepCount = 0;

  constructor(opts: DemoOptions) {
    this.page = opts.page;
    this.fast = !!opts.fast;
  }

  /** Ends the setup: from here the video is kept, with pauses and captions. */
  async begin(steps: number): Promise<void> {
    await this.page.waitForTimeout(300);
    this.fast = false;
    this.stepCount = steps;
    this.startedAt = Date.now() - this.openedAt;
    await this.pause(400);
  }

  /** Shows a caption (Portuguese, one short sentence) for the next step. */
  async caption(text: string): Promise<void> {
    if (this.fast) return;
    this.stepNo += 1;
    const step = this.stepCount ? `${this.stepNo}/${this.stepCount}` : '';
    await this.page.evaluate(([s, t]) => (window as unknown as { __demoCaption(s: string, t: string): void }).__demoCaption(s, t), [step, text]);
    await this.pause(800);
  }

  async pause(ms = 550): Promise<void> {
    if (this.fast) ms = Math.min(ms, 120);
    await this.page.waitForTimeout(ms);
  }

  /** The viewport point of a target. */
  async point(target: Target, aim: Aim = {}): Promise<Point> {
    let box: Box | null;
    if (isPoint(target)) {
      if (!('width' in target)) return { x: target.x + (aim.dx ?? 0), y: target.y + (aim.dy ?? 0) };
      box = target as Box;
    } else {
      await target.waitFor({ state: 'visible' });
      await target.scrollIntoViewIfNeeded();
      box = await target.boundingBox();
      if (!box) throw new Error(`No box for ${target}`);
    }
    return { x: box.x + box.width * (aim.fx ?? 0.5) + (aim.dx ?? 0), y: box.y + box.height * (aim.fy ?? 0.5) + (aim.dy ?? 0) };
  }

  /** Moves the mouse to a target in visible steps (eased); with the button down this is a drag. */
  async move(target: Target, aim: Aim = {}, opts: { duration?: number; linear?: boolean } = {}): Promise<Point> {
    const to = await this.point(target, aim);
    const from = this.pos;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = this.fast ? 60 : (opts.duration ?? Math.min(750, 220 + dist * 0.7));
    const n = Math.max(2, Math.round(duration / 16));
    for (let i = 1; i <= n; i++) {
      const t = opts.linear ? i / n : ease(i / n);
      await this.page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      if (!this.fast) await this.page.waitForTimeout(8);
    }
    this.pos = to;
    return to;
  }

  async click(target: Target, aim: Aim = {}, opts: { pause?: number; modifiers?: string[] } = {}): Promise<void> {
    await this.move(target, aim);
    await this.pause(180);
    for (const m of opts.modifiers ?? []) await this.page.keyboard.down(m);
    await this.page.mouse.down();
    await this.page.waitForTimeout(70);
    await this.page.mouse.up();
    for (const m of opts.modifiers ?? []) await this.page.keyboard.up(m);
    await this.pause(opts.pause ?? 600);
  }

  async dblclick(target: Target, aim: Aim = {}): Promise<void> {
    await this.move(target, aim);
    await this.pause(180);
    await this.page.mouse.dblclick(this.pos.x, this.pos.y, { delay: 40 });
    await this.pause();
  }

  async hover(target: Target, aim: Aim = {}, ms = 700): Promise<void> {
    await this.move(target, aim);
    await this.pause(ms);
  }

  /** Press, move in steps (the app sees a real drag), release. `via` adds waypoints. */
  async drag(from: Target, to: Target, opts: { fromAim?: Aim; toAim?: Aim; via?: Target[]; hold?: number; duration?: number; modifiers?: string[] } = {}): Promise<void> {
    await this.move(from, opts.fromAim);
    await this.pause(200);
    await this.page.mouse.down();
    await this.page.waitForTimeout(120);
    // A small first step so pointer-down handlers see a drag start before the long move.
    await this.page.mouse.move(this.pos.x + 4, this.pos.y + 4);
    this.pos = { x: this.pos.x + 4, y: this.pos.y + 4 };
    for (const v of opts.via ?? []) await this.move(v);
    for (const m of opts.modifiers ?? []) await this.page.keyboard.down(m);
    // Linear: an eased tail ends in sub-pixel moves, which some gestures treat as "no change".
    await this.move(to, opts.toAim, { duration: opts.duration ?? 1100, linear: true });
    // Linger with the button down so the insertion line / drop target is visible.
    await this.pause(opts.hold ?? 700);
    await this.page.mouse.up();
    for (const m of opts.modifiers ?? []) await this.page.keyboard.up(m);
    await this.pause();
  }

  /** Ctrl + mouse wheel over a point: zooms the canvas around it by `factor` (> 1 zooms in), in small wheel steps. */
  async zoomAt(target: Target, factor: number, aim: Aim = {}): Promise<void> {
    await this.move(target, aim);
    await this.pause(200);
    if (!this.fast) await this.page.evaluate(() => (window as unknown as { __demoKeys(l: string): void }).__demoKeys('Ctrl + roda do mouse'));
    // The canvas zooms by exp(-deltaY × 0.01) per wheel event; one notch = 10 px (×1.105).
    const n = Math.max(1, Math.round(Math.abs(Math.log(factor)) / 0.1));
    await this.page.keyboard.down('Control');
    for (let i = 0; i < n; i++) {
      await this.page.mouse.wheel(0, factor > 1 ? -10 : 10);
      await this.page.waitForTimeout(this.fast ? 20 : 110);
    }
    await this.page.keyboard.up('Control');
    await this.pause();
  }

  /** Plain mouse wheel over the canvas: pans the view by (dx, dy) screen pixels, in small steps. */
  async scroll(dx: number, dy: number): Promise<void> {
    const n = this.fast ? 4 : Math.max(4, Math.round(Math.hypot(dx, dy) / 25));
    for (let i = 0; i < n; i++) {
      await this.page.mouse.wheel(dx / n, dy / n);
      await this.page.waitForTimeout(this.fast ? 10 : 20);
    }
    await this.pause(300);
  }

  /** Types into the focused field, one key at a time. */
  async type(text: string, opts: { delay?: number } = {}): Promise<void> {
    await this.page.keyboard.type(text, { delay: this.fast ? 0 : (opts.delay ?? 70) });
    await this.pause(400);
  }

  /** Clicks a field, selects its content and types a new value (Enter commits). */
  async fill(field: Target, text: string, opts: { enter?: boolean } = {}): Promise<void> {
    await this.click(field, {}, { pause: 250 });
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.type(text);
    if (opts.enter !== false) await this.key('Enter', { show: false });
  }

  /** Presses a key or shortcut; shows it in the corner badge so the viewer sees it. */
  async key(combo: string, opts: { show?: boolean | string } = {}): Promise<void> {
    if (!this.fast && opts.show !== false) {
      const label = typeof opts.show === 'string' ? opts.show : combo.replace('ControlOrMeta', 'Ctrl').replace(/\+/g, ' + ');
      await this.page.evaluate((l) => (window as unknown as { __demoKeys(l: string): void }).__demoKeys(l), label);
      await this.page.waitForTimeout(250);
    }
    await this.page.keyboard.press(combo);
    await this.pause();
  }

  /** Opens a menu bar menu and picks an item (submenus: pass the path). */
  async menu(...path: string[]): Promise<void> {
    const [top, ...rest] = path;
    await this.click(this.page.getByRole('menubar').getByRole('menuitem', { name: top, exact: true }), {}, { pause: 400 });
    for (const [i, item] of rest.entries()) {
      const el = this.page.getByRole('menuitem', { name: item, exact: false }).filter({ visible: true }).first();
      if (i < rest.length - 1) await this.hover(el, {}, 400);
      else await this.click(el);
    }
  }
}
