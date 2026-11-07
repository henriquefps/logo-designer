import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      // The Cloudflare plugin writes client assets into cf's Build Output, not dist/.
      outDir: '.cloudflare/output/v0/workers/default/assets',
      manifest: false,
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Icon libraries and font files are big: cached on first use instead of precached. Bundled
        // fonts (~3 MB of TTF) load one by one when a text uses them; Inter's non-Latin subsets load
        // only for those scripts (unicode-range).
        globIgnores: ['**/lucide-react-*.js', '**/server.browser-*.js', '**/decompress-*.js', '**/*.ttf', '**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/.*\.(ttf|woff2?)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 40 }, cacheableResponse: { statuses: [200] } },
          },
          { urlPattern: ({ url }) => /\/assets\/(lucide-react|server\.browser|decompress)-.*\.js$/.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'icon-libs', expiration: { maxEntries: 8 } } },
          { urlPattern: /^https:\/\/api\.iconify\.design\//, handler: 'CacheFirst', options: { cacheName: 'iconify-api', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [200] } } },
        ],
      },
    }),
  ],
  base: '/',
  build: {
    // The main chunk is React + Radix + the editor (~220 kB gzip); heavy parts are lazy chunks.
    chunkSizeWarningLimit: 900,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
