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
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
          if (id.includes('/date-fns/')) return 'dates';
          if (id.includes('/@radix-ui/')) return 'radix-ui';
          if (id.includes('/@supabase/') || id.includes('/@tanstack/') || id.includes('/zustand/')) return 'data-layer';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react-core';
        },
      },
    },
  },
}));
