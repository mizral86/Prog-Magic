import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Prog Magic — Simulatore MTG",
        short_name: "Prog Magic",
        description:
          "Collezione, mazzi e simulazione di partite per Magic: The Gathering.",
        lang: "it",
        theme_color: "#0f1116",
        background_color: "#0f1116",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Immagini delle carte Scryfall: cache di lunga durata.
            urlPattern: /^https:\/\/cards\.scryfall\.io\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "scryfall-images",
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Dati carte Scryfall: rete prima, poi cache di riserva.
            urlPattern: /^https:\/\/api\.scryfall\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "scryfall-api",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  worker: {
    format: "es",
  },
});
