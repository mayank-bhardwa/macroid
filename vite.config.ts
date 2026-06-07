import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Macroid',
        short_name: 'Macroid',
        description: 'Personal nutrition & body-recomposition tracker',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // Never let the SW handle API navigations — they must hit the network.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Plan JSON: network-first so new months load when online.
            urlPattern: /\/plans\/.*\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'macroid-plans',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // Hard rule: API is never cached.
            urlPattern: /\/api\//,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        // Register the service worker in dev too, so the PWA install prompt
        // (beforeinstallprompt) can fire against `pnpm dev` on port 5173 — e.g.
        // when testing install on a phone through an HTTPS port-forward/tunnel.
        // Requires a secure context (HTTPS or localhost); a plain-HTTP LAN
        // address will still not offer install. Trade-off: the SW caches assets
        // in dev, so a hard reload is occasionally needed after code changes.
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
        suppressWarnings: true,
      }
    })
  ],
  build: {
    outDir: 'dist'
  },
  server: {
    // Make 5173 the single front door in dev: forward backend /api calls to the
    // Cloudflare Pages Functions dev server (Wrangler on 8788) so you only ever
    // open http://localhost:5173. Start the backend with `pnpm pages:dev`.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  }
})
