// Line illustrations of the three design modes (New document, step 1). Drawn like the app's own
// canvas: hairline outlines in currentColor on the card, light fills from the theme tokens, so they
// follow light/dark and the palette. Each uses the same viewBox, stroke and weight: no mode stands out.
import type { DesignMode } from './modes';

const frame = 'fill-card stroke-current';
const soft = 'fill-current opacity-15';

function IconArt() {
  return (
    <>
      {/* the tile with its keyline circle and a glyph */}
      <rect x="34" y="14" width="72" height="72" rx="16" className={frame} strokeWidth="2" />
      <circle cx="70" cy="50" r="23" fill="none" className="stroke-current opacity-40" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M70 32 L86 62 H54 Z" className={soft} />
      <path d="M70 32 L86 62 H54 Z" fill="none" className="stroke-current" strokeWidth="2" strokeLinejoin="round" />
      {/* the export sizes */}
      <rect x="116" y="34" width="32" height="32" rx="7" className={frame} strokeWidth="2" />
      <path d="M132 42 L139 56 H125 Z" className="fill-current opacity-50" />
      <rect x="116" y="72" width="16" height="16" rx="4" className={frame} strokeWidth="2" />
      <rect x="12" y="62" width="14" height="14" rx="3.5" className={frame} strokeWidth="2" />
      <rect x="12" y="38" width="14" height="14" rx="7" className={soft} />
    </>
  );
}

function WireframeArt() {
  const phone = (x: number, highlight: boolean) => (
    <g>
      <rect x={x} y="12" width="44" height="76" rx="7" className={frame} strokeWidth="2" />
      <rect x={x + 7} y="22" width="30" height="5" rx="2.5" className="fill-current opacity-50" />
      <rect x={x + 7} y="33" width="30" height="18" rx="3" className={soft} />
      <rect x={x + 7} y="56" width="22" height="4" rx="2" className="fill-current opacity-30" />
      <rect x={x + 7} y="64" width="26" height="4" rx="2" className="fill-current opacity-30" />
      <rect x={x + 7} y="75" width="30" height="7" rx="3.5" className={highlight ? 'fill-current opacity-60' : soft} />
    </g>
  );
  return (
    <>
      {phone(18, true)}
      {phone(98, false)}
      {/* the flow arrow from a button to the next screen */}
      <path d="M62 78 C 78 78, 80 50, 94 50" fill="none" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
      <path d="M89 45 L95 50 L89 55" fill="none" className="stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function FreeArt() {
  return (
    <>
      {/* the artboard with a bezier path, its anchors and one handle */}
      <rect x="22" y="14" width="116" height="72" rx="4" className={frame} strokeWidth="2" />
      <path d="M38 70 C 52 26, 74 26, 82 50 S 112 74, 122 32 L 122 70 Z" className={soft} />
      <path d="M38 70 C 52 26, 74 26, 82 50 S 112 74, 122 32" fill="none" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="38" x2="98" y2="62" className="stroke-current opacity-50" strokeWidth="1.5" />
      <circle cx="66" cy="38" r="3" className={frame} strokeWidth="1.5" />
      <circle cx="98" cy="62" r="3" className={frame} strokeWidth="1.5" />
      <rect x="78" y="46" width="8" height="8" className="fill-current" />
      <rect x="34" y="66" width="8" height="8" className={frame} strokeWidth="1.5" />
      <rect x="118" y="28" width="8" height="8" className={frame} strokeWidth="1.5" />
    </>
  );
}

const ART: Record<DesignMode, () => React.JSX.Element> = { icon: IconArt, wireframe: WireframeArt, free: FreeArt };

export function ModeIllustration({ mode, className }: { mode: DesignMode; className?: string }) {
  const Art = ART[mode];
  return (
    <svg viewBox="0 0 160 100" className={className} aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
