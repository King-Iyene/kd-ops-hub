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
  optimizeDeps: {
    include: ['@react-google-maps/api'],
  },
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
          // React must be isolated BEFORE recharts/d3 — recharts pulls in
          // victory-vendor which bundles d3 alongside CJS React helpers.
          // If recharts runs first, React's CJS code lands in 'charts' and
          // every page chunk that needs React imports from 'charts' → cycle.
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/react-is/') || id.includes('/scheduler/')) return 'react-core';
          // NOTE: recharts intentionally left unassigned — putting it in its own chunk
          // created a circular dep (LiveTracking → charts → LiveTracking TDZ crash).
          // Let Rolldown decide where to place it (entry chunk or shared chunk).
          if (id.includes('@react-google-maps')) return 'google-maps';
          if (id.includes('/date-fns/')) return 'dates';
          if (id.includes('/@radix-ui/')) return 'radix-ui';
          // react-redux bundles its own react-is symbols; keep it in data-layer so
          // charts chunk doesn't carry React-like code that triggers LiveTracking TDZ.
          if (id.includes('/@supabase/') || id.includes('/@tanstack/') || id.includes('/zustand/') || id.includes('/react-redux/') || id.includes('/use-sync-external-store/') || id.includes('/redux/') || id.includes('/reselect/') || id.includes('/immer/')) return 'data-layer';
        },
      },
    },
  },
}));
