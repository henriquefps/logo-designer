import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, XIcon } from '@phosphor-icons/react';
import { platformDef, type ScreenNode, type ScreenPlatform } from '@/model';
import { NodeRenderer } from '@/canvas/renderers/NodeRenderer';
import { useDocStore } from '@/store/useDocStore';
import { canGoBack, hotspots, platformsOf, presentedFrame } from '../present';
import { usePresentStore } from '../presentStore';

const MAX_SCALE = 1.5;
const MARGIN = 24;

/** The area left for the frame: measured once per resize. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/**
 * Present mode (docs/wireframe-mode.md → Present mode): one screen frame at a time on a dark
 * backdrop, hotspots on elements with flows, Back and Esc. Read-only: it never writes to the document.
 */
export function PresentMode() {
  const presenting = usePresentStore((s) => s.state);
  if (!presenting) return null;
  return <Presenter />;
}

function Presenter() {
  const doc = useDocStore((s) => s.doc);
  const state = usePresentStore((s) => s.state)!;
  const { exit, follow, back, setPlatform } = usePresentStore.getState();
  const frame = presentedFrame(doc, state);
  const [stageRef, box] = useBox<HTMLDivElement>();
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  // The frame went away (another tab synced, a project switch): leave.
  useEffect(() => {
    if (!frame) exit();
  }, [frame, exit]);

  // Keys: Esc leaves, ← and Backspace go back; everything else is swallowed so the editor
  // underneath (Delete, Cmd+D…) cannot change anything while presenting.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        usePresentStore.getState().exit();
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        usePresentStore.getState().back();
      } else if (e.metaKey || e.ctrlKey) {
        // Browser shortcuts (reload, zoom, dev tools) keep working; the editor's do not.
      } else if (!/^F\d+$/.test(e.key)) {
        e.preventDefault();
      }
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const shown = useMemo<ScreenNode | null>(() => (frame ? { ...frame, transform: { ...frame.transform, x: 0, y: 0 } } : null), [frame]);
  const spots = useMemo(() => hotspots(doc, state), [doc, state]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  if (!frame || !shown) return null;

  const { width, height } = frame.screen;
  const scale = Math.max(0.05, Math.min(MAX_SCALE, (box.width - MARGIN * 2) / width, (box.height - MARGIN * 2) / height));
  const platforms = platformsOf(doc, state);
  const flashSpots = () => {
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 900);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Present: ${frame.name}`} data-slot="present-mode" className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-neutral-300 select-none">
      <div className="flex h-11 shrink-0 items-center gap-2 px-3 text-sm">
        <button
          type="button"
          onClick={back}
          disabled={!canGoBack(state)}
          aria-label="Back"
          title="Back (← or Backspace)"
          className="flex size-8 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowLeftIcon className="size-4" />
        </button>
        <div className="min-w-0 truncate" data-slot="present-title">
          <span className="font-medium text-neutral-100">{frame.name}</span>
          <span className="ml-2 text-neutral-500">{platformDef(frame.screen.platform).label}</span>
        </div>
        {platforms.length > 1 && (
          <div className="ml-2 flex rounded-md bg-white/5 p-0.5" role="group" aria-label="Platform">
            {platforms.map((p: ScreenPlatform) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                aria-pressed={p === frame.screen.platform}
                className={`h-7 rounded px-2.5 text-xs ${p === frame.screen.platform ? 'bg-white/15 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'}`}
              >
                {platformDef(p).label}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <span className="hidden text-xs text-neutral-500 sm:inline">Esc to leave</span>
        <button type="button" onClick={exit} aria-label="Leave present mode" title="Leave (Esc)" className="flex size-8 items-center justify-center rounded-md hover:bg-white/10">
          <XIcon className="size-4" />
        </button>
      </div>
      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden" onPointerDown={(e) => e.target === e.currentTarget && flashSpots()}>
        <div className="relative shrink-0 shadow-2xl shadow-black/60" style={{ width: width * scale, height: height * scale }} onPointerDown={(e) => e.target === e.currentTarget && flashSpots()}>
          <svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`} className="block" pointerEvents="none">
            <NodeRenderer node={shown} />
          </svg>
          {spots.map((h) => (
            <button
              key={h.nodeId}
              type="button"
              data-slot="hotspot"
              onClick={() => follow(h.flow)}
              aria-label={h.flow.label || `Open ${doc.wireframe?.screens.find((s) => s.id === h.flow.to)?.name ?? 'screen'}`}
              title={h.flow.label}
              className={`absolute cursor-pointer rounded-sm outline-2 -outline-offset-1 transition-colors hover:bg-sky-400/20 hover:outline hover:outline-sky-400 focus-visible:bg-sky-400/20 focus-visible:outline focus-visible:outline-sky-400 ${flash ? 'bg-sky-400/15 outline outline-sky-400/70' : ''}`}
              style={{ left: h.rect.x * scale, top: h.rect.y * scale, width: h.rect.width * scale, height: h.rect.height * scale }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
