import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
// promise rejections, third-party scripts). If Sentry is later installed
// and exposes window.Sentry, errors are forwarded automatically — you
// don't need to change this code, just add the @sentry/react package and
// initialise it before <App /> renders.
//
// Without Sentry, errors are still logged to the console with a structured
// shape so they're easy to grep when debugging.
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
