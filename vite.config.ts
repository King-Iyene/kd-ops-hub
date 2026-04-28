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
    include: ['leaflet'],
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
        manualChunks: {
          // Core React runtime — tiny, loads first
          'react-core': ['react', 'react-dom', 'react-router-dom'],
          // Data layer — Supabase + React Query + Zustand
          'data-layer': ['@supabase/supabase-js', '@tanstack/react-query', 'zustand'],
          // Charts — recharts is large (~500 KB); isolate so other pages don't wait for it
          'charts': ['recharts'],
          // Date utilities
          'dates': ['date-fns'],
          // Radix UI primitives (shared across all UI components)
          'radix-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
            '@radix-ui/react-label',
          ],
        },
      },
    },
  },
}));
