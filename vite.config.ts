import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
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
  plugins: [react()].filter(Boolean),
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
