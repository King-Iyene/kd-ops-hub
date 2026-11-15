import type { ReactNode } from 'react';
// Self-hosted (no runtime network request) — Inter is the de facto standard
// UI typeface for modern time-tracking / productivity SaaS (TimeCamp,
// Linear, Notion, ClickUp, Asana all use it or a close relative), chosen
// over the rest of the app's OS-system-font stack specifically so this
// module reads as a polished, TimeCamp-grade product rather than "a page in
// our internal tool." Scoped to the Time Tracking module only via the
// `font-timetrack` Tailwind class (see tailwind.config.ts) — the rest of
// KDOps (Payroll, CRM, etc.) is untouched.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

export function TimetrackFontScope({ children }: { children: ReactNode }) {
  return <div className="font-timetrack contents">{children}</div>;
}
