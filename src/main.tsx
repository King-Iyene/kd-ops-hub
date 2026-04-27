import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Sentry error monitoring (optional) ─────────────────────────────────
//
// Activates only when VITE_SENTRY_DSN is set in the build environment.
// Without the env var, Sentry is a no-op — code below still works,
// errors just don't get sent anywhere besides the console.
//
// Free tier comfortably covers a 700-user platform: errors only, no
// performance traces or session replays (those eat quota fast).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  // Async import keeps Sentry out of the bundle when not configured.
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      // Errors only — no traces, no replays. Stays well under 5K/mo.
      tracesSampleRate: 0,
      // Don't ping Sentry while developing locally.
      enabled: import.meta.env.MODE === "production",
      // Drop noisy browser-extension errors that aren't ours.
      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "Non-Error promise rejection captured",
        /chrome-extension:\/\//,
        /moz-extension:\/\//,
      ],
    });
    (window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;
  }).catch((err) => {
    console.warn("[KDOps] Sentry failed to load (non-blocking):", err);
  });
}

// ── Custom favicon override (was inline in index.html — moved here so
//    we can ship a stricter CSP with no 'unsafe-inline' on script-src). ──
try {
  const stored = localStorage.getItem("kdops_logo_url");
  if (stored) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = stored;
  }
} catch { /* ignore */ }

// ── Global error reporting hooks ───────────────────────────────────────
//
// Catches errors that React's <ErrorBoundary> can't see (async callbacks,
// promise rejections, third-party scripts). Forwards to Sentry if it's
// been loaded by the block above.
type SentryGlobal = { captureException?: (e: unknown) => void };
const sentry = (): SentryGlobal | undefined =>
  (window as unknown as { Sentry?: SentryGlobal }).Sentry;

window.addEventListener("error", (e) => {
  console.error("[KDOps] uncaught error:", { message: e.message, source: e.filename, lineno: e.lineno, error: e.error });
  sentry()?.captureException?.(e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[KDOps] unhandled promise rejection:", e.reason);
  sentry()?.captureException?.(e.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
