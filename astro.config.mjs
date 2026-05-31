// @ts-check
import { defineConfig } from "astro/config";
import AstroPWA from "@vite-pwa/astro";

// Base path.
// - Cloudflare Pages serves from the root, so the default is "/".
// - For a GitHub Pages project site (https://<user>.github.io/<repo>/) set
//   BASE_PATH="/<repo>/" in the build env (the GH Actions workflow does this).
// Everything downstream (start_url, scope, navigateFallback, and
// import.meta.env.BASE_URL used for plan fetches) inherits this value.
const base = process.env.BASE_PATH || "/";

// Optional: full site URL (used for canonical/SEO). Override per deployment.
const site = process.env.SITE_URL || "https://recomp.pages.dev";

export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  integrations: [
    AstroPWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Recomp Command Center",
        short_name: "Recomp",
        description:
          "Track macros, groceries, meal prep, and morning prep for body recomposition.",
        id: base,
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#f6f4ef",
        theme_color: "#0e8a6a",
        categories: ["health", "fitness", "lifestyle"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        // Precache the built shell + assets (hashed filenames are handled here).
        globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest}"],
        // Single-page app: serve the shell for navigations when offline.
        navigateFallback: base,
        // Plan JSON should prefer fresh network so new months load.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/plans/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "recomp-plans",
              expiration: { maxEntries: 12 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
