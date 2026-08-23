import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // Progressive Web App — installs to home screen on iOS/Android,
    // works offline for cached pages, supports push notifications later.
    // registerType "prompt" (not "autoUpdate") + injectRegister false:
    // src/components/PwaUpdatePrompt.tsx registers the SW itself via
    // useRegisterSW and shows a visible "reload to update" banner instead
    // of silently swapping bundles under an open tab — a stale service
    // worker serving an old build with zero user-visible signal was a real
    // support issue (a deployed change looked "not built" for anyone whose
    // tab had been open since before the deploy).
    VitePWA({
      // injectManifest lets us use a custom src/sw.ts that adds push +
      // notificationclick handlers on top of workbox's precaching.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "KD Ops",
        short_name: "KD Ops",
        description:
          "KD Squares operations platform — payroll, payments, fleet, expenses, and HR for Nigerian businesses.",
        theme_color: "#006994",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        lang: "en-NG",
        categories: ["business", "finance", "productivity"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{html,css,svg,png,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        // Don't run service worker locally — too easy to debug stale chunks.
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // React core must be isolated so page chunks don't each inline the
          // React CJS scheduler factory (which causes TDZ crashes when the
          // factory fires MessagePort callbacks during lazy-chunk init).
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/react-is/') || id.includes('/scheduler/')) return 'react-core';
          // date-fns is large, pure JS, safe to isolate (no React).
          if (id.includes('/date-fns/')) return 'dates';
          // NOTE: @radix-ui, @supabase, @tanstack, recharts, @react-google-maps,
          // react-redux, zustand and all other React-using packages are intentionally
          // left UNASSIGNED. Giving any of them their own chunk causes Rolldown to
          // inline the React CJS scheduler factory into that chunk. A lazy page chunk
          // (Fleet, LiveTracking, etc.) that statically imports from it gets a
          // circular init: scheduler fires before the page module scope finishes
          // → Cannot access 'Z' before initialization (TDZ crash).
          // Rolldown places unassigned modules into the shared index chunk, which
          // initialises before any lazy page → no TDZ.
        },
      },
    },
  },
}));
