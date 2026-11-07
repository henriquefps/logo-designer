import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['favicon.png', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Icon libraries are big: cached on first use instead of precached.
        globIgnores: ['**/lucide-react-*.js', '**/server.browser-*.js'],
        runtimeCaching: [
          { urlPattern: ({ url }) => /\/assets\/(lucide-react|server\.browser)-.*\.js$/.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'icon-libs', expiration: { maxEntries: 8 } } },
          { urlPattern: /^https:\/\/api\.iconify\.design\//, handler: 'CacheFirst', options: { cacheName: 'iconify-api', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [200] } } },
        ],
      },
    }),
  ],
  base: '/',
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
