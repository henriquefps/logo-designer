# LogoGo

A client-side logo and app-icon designer. Compose icons (Lucide + Phosphor), text, and
images on a vector canvas, then export favicons, an iOS `AppIcon.appiconset`, and Android
mipmaps in one pack — no server, no account, everything runs in the browser.

## Features

- Vector canvas with multi-select, marquee-select, snapping guides, zoom/pan, and keyboard
  shortcuts (arrow-key nudge, `Cmd/Ctrl+D` duplicate, `Cmd/Ctrl+Z`/`Shift+Z` undo/redo,
  `Cmd/Ctrl+A` select all, `Delete`, `Escape`)
- Icon picker over Lucide and Phosphor, with search, favorites, and recents
- Text and image elements, with automatic downscaling/compression on upload
- Solid, gradient, or transparent backgrounds in square, rounded, squircle, or circle
  shapes — the shape actually clips every element to its bounds, in both the live preview
  and exported rasters
- Multiple named projects, switchable from the toolbar, plus a small starter-template
  gallery for the blank-canvas problem
- Export to SVG, PNG, WebP, or JPG at 256/512/1024px, or a full icon pack ZIP (web
  favicons, iOS `AppIcon.appiconset`, Android mipmaps)
- Everything autosaves to `localStorage`; light/dark theme

## Stack

Vite + React 19 + TypeScript, Tailwind v4, [shadcn](https://ui.shadcn.com) (`radix-sera`
style, `olive` base), Zustand for editor state, Phosphor icons for the UI chrome.

## Development

```bash
bun install
bun run dev       # start the dev server
bun run build     # production build
bun run lint      # eslint
bun run deploy    # build + deploy to Cloudflare Pages
```

## Known limitations

- Custom fonts (Inter Variable) don't currently survive SVG→raster export — exported
  PNG/WebP/JPG text falls back to a system serif, since the canvas rasterization pipeline
  can't reach the page's stylesheet/`@font-face` rules. The live preview and SVG export are
  unaffected.
