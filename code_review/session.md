# Session Context — LogoGo

> Last updated: 2026-07-04

---

## About the Project

**Name:** LogoGo (`logo-designer`)
**Type:** React 19 + TypeScript, Vite 8, Tailwind v4, shadcn/ui (`radix-sera` style, `olive` base — the shared hfps design system). Zustand for state. Hand-rolled SVG canvas (no fabric.js/konva). `vite-plugin-pwa` for offline support.
**Key commands:**
- `bun run dev` — Vite dev server (port 5173)
- `bun run build` — production build (also runs the PWA service-worker generation)
- `bun run lint` — ESLint
- `bunx tsc --noEmit` — typecheck (no dedicated script, run directly)
- `bun run deploy` — build + `wrangler pages deploy` to Cloudflare Pages, project `logogo`

### Relevant file structure

```
src/
  components/
    editor/            EditorShell, Toolbar, ProjectSwitcher, TemplateGallery,
                        AboutDialog, ShortcutsDialog, ThemeToggle
      Canvas/           CanvasStage, CanvasSvg, ElementNode, ShapeContent,
                        SelectionOverlay, MarqueeSelect, AlignmentGuides
      panels/           AddPanel, BackgroundPanel, LayersPanel, PropertiesPanel,
                        ExportPanel, IconPicker/
    ui/                 shadcn-generated primitives
  hooks/                useCanvasDrag, useCanvasZoomPan, useShapeDrawing,
                        useKeyboardShortcuts, useVirtualGrid, useCanvasRef
  store/                useProjectStore (persisted, gesture-based undo/redo),
                        useUIStore (ephemeral: selection/zoom/pan/tabs + persisted-lite theme/favorites)
  lib/                  fonts.ts, palettes.ts, randomLogo.ts, projectFile.ts,
                        templates.ts, snapping.ts, alignment.ts, elementBounds.ts
    export/             svgSerialize.ts, iconPack.ts
    icons/              iconModules.ts, lucideIconNames.ts, phosphorIconNames.ts
    storage/            persistStorage.ts (debounced localStorage), migrateLegacyStorage.ts
  types/                element.ts, canvas.ts, project.ts
public/                 manifest.json, robots.txt, sitemap.xml, og-image.jpg, icons
index.html              SEO meta, JSON-LD, theme-flash-prevention script
```

---

## Architecture

- **Two Zustand stores, intentionally split:**
  - `useProjectStore` — persisted (debounced localStorage), holds `projects`/`projectOrder`/`activeProjectId` plus per-project undo/redo history. Mutations go through `beginGesture()` → (live updates) → `commit()`; only `commit()` pushes a history snapshot, so a whole drag/slider gesture is one undo step, not one per pixel.
  - `useUIStore` — mostly ephemeral (selection, zoom/pan, active tab/tool, mobile sheet open state), with a persisted-lite slice for theme/favorite icons/recent icons. Keeping live drag/zoom state out of the persisted store is what prevents every `pointermove` from hitting localStorage.
- **Canvas** (`CanvasStage` → `CanvasSvg` → `ElementNode`/`ShapeContent`) is plain SVG, driven by unified Pointer Events. Background shape uses a real `clipPath` shared between the visible fill and the elements group, so raster export is actually clipped, not just the on-screen preview.
- **Editor shell is two distinct layouts, not one responsive one:** `DesktopSidebar` (Radix `Tabs`, persistent) for `md:`+, and a `MobileTabBar` (persistent bottom nav) + `MobilePanelSheet` (bottom sheet with its own in-sheet tab strip) below it. They share `PanelBody(tab)` for the actual panel content but differ in chrome because a modal sheet's backdrop covers whatever's outside it — see §6 below.
- **Icon libraries are lazy-loaded** (`iconModules.ts` dynamic `import()`), so neither Lucide's nor Phosphor's full icon set ships in the initial bundle — only whichever tab the user actually opens.
- **No backend, no accounts.** Everything lives in `localStorage`; the only backup path is exporting/importing a `.logogo.json` project file (`lib/projectFile.ts`).

---

## Work Log

#### 1. v1 → v2 full rewrite (commit `2fdbdcd`)

The original app (`dddc29d`…`e804d85`, plain JSX + hand-rolled CSS) was completely rebuilt in place onto the hfps design system (shadcn CLI, `radix-sera`/`olive`, Tailwind v4) with TypeScript, Zustand, and a rewritten SVG canvas, per the approved plan at `~/.claude/plans/bright-roaming-dragonfly.md`.

- **Fixed real bugs along the way, not just reskinned:**
  - Background-shape "clip" previously only shaped the fill `<rect>`, never actually clipped foreground elements — fixed with a shared `clipPath`, verified against an actual exported PNG (not just the live preview).
  - Icon search silently capped results at 48 matches — removed.
  - Mouse/touch handled via separate listener branches — unified to Pointer Events.
  - Selection bounds were a text-length heuristic (`-el.text.length * size * 0.3`) — replaced with real `getBBox()`.
- **Verified:** `bunx tsc --noEmit` + `bun run lint` + `bun run build` clean; extensive Playwright-driven manual passes (screenshots + console-error capture) since no `chromium-cli` was available in this environment — Playwright + Chromium were installed fresh into the session scratchpad.

#### 2. Shape-drawing tool (rectangle/ellipse/line/freehand pen)

User request: besides icons, be able to draw basic shapes as their own layers, filled or not where that makes sense. Added `useShapeDrawing.ts`, `ShapeContent.tsx`, a `ShapeElement` union member, and toolbar wiring in `AddPanel`/`PropertiesPanel`/`LayersPanel`.

Testing this feature surfaced two previously-unrelated real bugs, both fixed in the same pass:

- **Background clicks never fired at all.** The transparent "catcher" `<rect>` meant to detect clicks on empty canvas sat *underneath* the visible background fill shape in paint order, and that fill shape had no `pointer-events: none`, so it silently swallowed every click across the whole session — meaning marquee-select and click-to-deselect had likely never worked. Diagnosed via `document.elementFromPoint()` showing the fill rect instead of the catcher. Fixed by adding `pointerEvents="none"` to the visible background shape in `CanvasSvg.tsx`.
- **Thin lines/freehand paths were unselectable.** A near-horizontal/vertical line has a near-zero-height bounding box, so the invisible hit-area rect was too thin to click. Fixed with a `MIN_HIT_THICKNESS = 16` floor applied only to the hit-area (not the visible selection outline) for `line`/`path` shapes in `ElementNode.tsx`.
- **Verified:** dedicated Playwright scripts (`shapes_test.mjs`, `marquee_test.mjs`) — drew all 4 shape kinds, confirmed layers list reflected them, confirmed marquee-drag multi-select and background-click-deselect both work, `CONSOLE_ERRORS: []`.

#### 3. Feature pack: About/Shortcuts/Fonts/Backup/Surprise-me/PWA (commit `165d0b6`)

Follow-up feature request after positive feedback on the rebuild, covering: creator credit + privacy disclosure, a discoverability gap for keyboard shortcuts, single-font limitation, no backup path for a no-login/localStorage-only app, blank-canvas problem, and installability.

- **`AboutDialog`** — privacy note (100% client-side, no accounts/cookies/analytics, data never leaves the browser) + "Developed by Henrique Silva · hfps.dev" credit.
- **`ShortcutsDialog`** — lists existing shortcuts (undo/redo/select-all/duplicate/nudge/escape/pan/zoom), opens via a toolbar icon or the `?` key.
- **Font picker** (`lib/fonts.ts`) — 5 curated `@fontsource` variable fonts (Inter, Space Grotesk, Playfair Display, JetBrains Mono, Bebas Neue), each with its own weight range, wired into `PropertiesPanel` for text elements.
- **Project backup** (`lib/projectFile.ts`) — export current project as `<name>.logogo.json`, import validates a `format: "logogo-project"` marker before accepting. This is the *only* backup mechanism given the no-login architecture.
- **"Surprise me"** (`lib/randomLogo.ts`) — generates a random icon + curated-palette color pair + background + optional text as a **new** project (never overwrites the current one, matching how templates already behave).
- **PWA** — added `vite-plugin-pwa` (`registerType: 'autoUpdate'`, `manifest: false` since a static `public/manifest.json` already existed, `maximumFileSizeToCacheInBytes` raised to 10 MB because the main bundle exceeds Workbox's 2 MB default). Also fixed `public/manifest.json`'s `background_color`/`theme_color`, which were still the old v1 violet/neon palette instead of the current dark-olive theme.
- **Verified:** typecheck/lint/build clean (same 4 pre-existing lint errors in unmodified shadcn `ui/*.tsx` files throughout this whole session — `react-refresh/only-export-components` in `badge.tsx`/`button.tsx`/`tabs.tsx`/`toggle.tsx`, not introduced by any of this work). Playwright: opened both dialogs, changed a text element's font and confirmed it rendered live, round-tripped export→import of a project file and confirmed the font survived, ran "Surprise me" and confirmed a new project appeared, confirmed the service worker reaches `state: "activated"` under `vite preview` and the app still renders after `context.setOffline(true)` + reload.

#### 4. Desktop sidebar layout bugs (commit `5c53c40`)

User-reported: the sidebar `<aside>` (360px, desktop) could scroll the whole page instead of just its own content, and the tab bar (`TabsList`) rendered wider than the sidebar.

- **Root cause (page-level scroll):** the classic flexbox "automatic minimum size" bug — `<aside>` was a flex item of `.flex.min-h-0.flex-1` but had no `min-h-0` of its own, so its default `min-height: auto` refused to let it shrink below its content's intrinsic height, growing the whole page instead of scrolling internally. Fixed by adding `overflow-hidden` + `md:min-h-0` to `<aside>` and `min-h-0` to the inner `ScrollArea` (every level in a nested-flex-scroll chain needs it, not just the outer container).
- **Root cause (tabs overflow):** shadcn's `TabsList` defaults to `inline-flex w-fit`, which hugs its content's natural width instead of the sidebar's. With labels like "Background"/"Layers (3)" that's wider than 360px. Fixed with `grid grid-cols-4` + `min-w-0` per trigger + `truncate` on the label `<span>` (grid items need their own `min-w-0` too, or the same auto-min-size bug reappears one level down).
- **Verified:** Playwright at a deliberately short 650px-tall viewport (to force the overflow condition) — confirmed via DOM metrics that `document.documentElement.scrollHeight === clientHeight` and `aside.scrollHeight === aside.clientHeight` and `tabsList.scrollWidth === clientWidth`, plus visual screenshots of all 4 tabs.

#### 5. Merge `redesign/v2` → `main`

All v2 work had been committed to a `redesign/v2` branch; `main` was a strict ancestor (no divergence), so `git merge redesign/v2` while on `main` fast-forwarded cleanly to `5c53c40`. Left unpushed to `origin/main` per explicit user choice (asked via a clarifying question rather than assuming).

#### 6. Mobile responsiveness pass (commit `52ca069`)

User-reported: the toolbar didn't adapt to mobile (wider than the viewport) and the Add/Layers mobile experience "didn't work very well."

- **Toolbar overflow:** the desktop toolbar had ~9 icon buttons plus separators (undo/redo, zoom −/%/+, fit, shortcuts, about, theme) with no responsive handling. Fixed by keeping only undo/redo/fit always visible, moving the rest into a `hidden md:flex` desktop cluster, and adding a `md:hidden` overflow `DropdownMenu` (zoom in/out, shortcuts, about, theme toggle) for narrow viewports. Required making `AboutDialog`/`ShortcutsDialog` accept optional `open`/`onOpenChange`/`hideTrigger` props so they could be triggered from a `DropdownMenuItem` instead of only their own built-in icon-button trigger.
- **Mobile Add/Layers UX rebuilt:** replaced the old floating-action-button + generic 4-tab sheet with a persistent bottom nav (`MobileTabBar`, icon + label per section, layer count on "Layers") that opens a per-tab `Sheet` (`MobilePanelSheet`).
- **Found and fixed a real pre-existing CSS bug in the process:** the shared `SheetContent` component's base classes include `data-[side=bottom]:h-auto` (and `bottom-0`) baked in for the bottom-side variant. A plain `className="h-[75vh]"` override loses to that because the attribute-scoped selector (`[data-side=bottom].h-auto`) has *higher CSS specificity* than a bare `.h-\[75vh\]` class, regardless of source order in the merged Tailwind string — so the sheet was actually sizing to its content's full height, not the intended 75vh. This was very likely the actual cause of the "doesn't work well" complaint, and probably predates this session (the original 80vh mobile sheet likely had the same bug, just never specifically diagnosed). Fixed by overriding with the *same* attribute-scoped variant (`data-[side=bottom]:h-[70vh]` / `data-[side=bottom]:bottom-14`) so `tailwind-merge` actually treats it as a conflicting, replaceable class.
- **Also discovered mid-fix:** a modal `Sheet`'s full-screen overlay (Radix Portal, rendered at `document.body` level) sits above the persistent bottom nav regardless of the nav's own `z-index`, because raising a *nested* element's z-index doesn't let it out-compete a `fixed` Portal-rendered sibling stacking context the way it would for a plain sibling. Rather than fight portal stacking order, moved tab-switching into a compact strip *inside* the sheet's own header, so switching tabs while the sheet is open no longer depends on reaching through the overlay at all.
- **Verified:** Playwright at 375×667 (iPhone SE-class, tightest common width) — confirmed `header.scrollWidth === clientWidth` and no page-level horizontal scroll, opened the sheet, switched all 4 tabs via the in-sheet strip, confirmed via bounding boxes that the sheet's bottom edge (`y + height`) exactly meets the nav's top with zero overlap, closed via the built-in close button and confirmed `[data-state="open"]` was gone. User's own assessment after reviewing: "não ficou perfeito, mas ficou bom" (not perfect, but good) — not claiming a pixel-perfect mobile experience, just a working, non-broken one.

#### 7. SEO pass (commit `52ca069`, same commit as §6)

User asked directly whether the site was SEO-ready; audited `index.html` + rendered DOM and found it wasn't — then implemented fixes once the deployment domain (`logogo.hfps.dev`) was confirmed.

- **Wrong domain in `canonical`/`og:url`/`og:image`:** all three pointed at `https://hfps.dev` (Henrique's personal site), leftover from the reference template — a self-referencing canonical mismatch that actively works against indexing the real pages, plus link-preview images pointing at the wrong site's asset. Fixed to `https://logogo.hfps.dev/`.
- **No real social-preview image:** `og:image` was the plain 512×512 square app icon. Built a proper 1200×630 card by screenshotting the app's own default-project canvas tile (Playwright, with the checkerboard background stripped via an injected style so the rounded corners came out truly transparent) and compositing it into a branded HTML card (gradient background matching the app's default palette, wordmark, tagline, feature badges), rendered at 2x and downsampled, then re-encoded as JPEG (`sips`) — 489 KB PNG → 81 KB JPEG at no visible quality loss. Saved as `public/og-image.jpg`.
- **Zero crawlable text content:** the entire app is the interactive editor — no `<h1>` existed anywhere in the codebase (confirmed via `grep`). Added a keyword-rich `<h1 className="sr-only">` in `Toolbar.tsx` (present in the DOM/accessibility tree at every viewport width, unlike the visible "LogoGo" wordmark span which is legitimately `hidden` below `sm` for space — decoupled the two so the SEO-bearing heading isn't accidentally `display:none` on mobile, which is what Google's mobile-first indexing actually crawls).
- **Also added:** `public/robots.txt` (allow-all + sitemap pointer), `public/sitemap.xml` (single URL, since this is a one-route SPA), a `WebApplication` JSON-LD block (free, `Person` author linking to hfps.dev), `meta name="robots"`, `og:site_name`, `og:image:width/height`, and tightened the title/description copy to lead with "Free" and "no login."
- **Verified:** `bun run build` output inspected directly (`dist/index.html` head, `dist/robots.txt`, `dist/sitemap.xml`, `dist/og-image.jpg` all present with correct URLs); Playwright confirmed the live DOM has exactly one `<h1>` with the expected text and that `document.querySelector('script[type="application/ld+json"]')` parses to `{"@type": "WebApplication", "name": "LogoGo"}`; zero console errors.

#### 8. hfps-profile skill updated with this project

Added `~/.claude/skills/hfps-profile/projects/logo-designer.md` (same format as the existing AppShot/OpenForms/Background-Sync-Plugin write-ups) and linked it from `SKILL.md`'s index. Explicitly documents a "Reuse potential" section: the user is planning a second, similar app (a QR code generator) and intends to reuse the SVG canvas/export pipeline, the shape-drawing infrastructure, the no-login/localStorage-only architecture, and the desktop-sidebar/mobile-bottom-sheet editor shell pattern from LogoGo. That skill is global (not scoped to this repo), so the context carries over automatically once that new project starts.

---

## Key Technical Notes

- **Gesture-based undo/redo is load-bearing.** Any new interaction that mutates elements must call `beginGesture()` once at the start and `commit()` once at the end — never on every intermediate update — or it'll either spam the history stack (one entry per pixel) or silently not undo at all. `beginGesture()` is itself idempotent (guarded by `historyPending`), so it's safe to call defensively.
- **`tailwind-merge` only dedupes classes within the same variant scope.** A plain utility (`h-[75vh]`) does *not* override a `data-[side=bottom]:h-auto` base class from a shared shadcn component, even though it comes later in the merged string — the attribute-scoped selector has higher CSS specificity. To override a variant-scoped base class, the override must use the *same* variant scope (`data-[side=bottom]:h-[70vh]`). Worth checking `ui/*.tsx` base classes for this pattern before assuming a plain override className will win.
- **Flex/grid items need their own `min-h-0`/`min-w-0` to actually shrink.** `min-h-0`/`overflow-hidden` on a *container* isn't enough if a *descendant* several levels down (e.g. a `ScrollArea` two levels inside a flex-col, or a `TabsTrigger` inside a `grid-cols-4` `TabsList`) doesn't also have it — each level's default `min-height/width: auto` re-triggers the same "won't shrink below content" behavior independently.
- **A `Sheet`/`Dialog`'s full-screen overlay is a React Portal rendered at `document.body`, not nested where it's declared in JSX.** A sibling element's `z-index`, even a high one, cannot reliably out-stack it by raising its own z-index if that sibling is nested inside an *unpositioned* ancestor elsewhere in the tree — put competing persistent UI (like a bottom nav) either outside the modal's blocking radius entirely, or move the interaction inside the modal itself.
- **No backend, no accounts, ever** — this is a stated product constraint (free, no-login, "entra, desenha, baixa, segue a vida"), not just an MVP shortcut. Don't propose auth/cloud-sync features without the user raising it first.
- **Deployment target:** `logogo.hfps.dev`, Cloudflare Pages, project name `logogo` (`bun run deploy` → `wrangler pages deploy dist --project-name logogo --branch production`). Not yet actually deployed as of this session — `main` has the work but hasn't been pushed to `origin` or deployed.
