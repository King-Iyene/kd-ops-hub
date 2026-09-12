import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co"
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder"
    ),
  },
  test: {
    environment: "jsdom",
    // Without an explicit url, jsdom's default document origin is opaque
    // (like about:blank) — window.localStorage throws SecurityError
    // ("localStorage is not available for opaque origins") the instant
    // anything touches it. Vitest swallows that during environment setup,
    // so the visible symptom in a test is just `window.localStorage` being
    // undefined, not the real underlying error. A real origin fixes it —
    // this app leans on localStorage for the org timezone cache
    // (src/lib/format.ts) and more, so any test touching that code needs
    // a working localStorage, not a silently-broken one.
    environmentOptions: {
      jsdom: { url: "http://localhost:3000" },
    },
    globals: true,
    // Must be an absolute path anchored to this config file's own directory,
    // not a bare relative string. This repo is nested inside a second,
    // separate clone of itself at the parent directory (both point at the
    // same GitHub origin) — with a plain relative string here, Vitest's
    // internal root resolution has been found one level too high, looking
    // for src/test/setup.ts in the OUTER clone instead of this one, failing
    // every single test file with "Cannot find module ... setup.ts".
    setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
