// Decides whether a capture is a "work tool" (productive), "red" (unproductive/blocked) or
// neutral, from the admin's rules. The same logic lives in the web app
// (src/features/timetrack/pages/activity/shared.tsx) so reports can apply rules to PAST
// captures too; keep the two in step.
//
// Precedence (most specific wins):
//   1. a rule naming the SITE the browser is on (e.g. "instagram.com")
//   2. a rule matching the window title (optionally also the app)
//   3. a rule naming the APPLICATION (e.g. "Google Chrome", "Slack")
// So "instagram.com = red" beats "Google Chrome = productive". Inside a level, lower priority
// number first.

export interface ProductivityRule {
  app_name_contains: string | null;
  title_contains: string | null;
  category: string;
  priority: number;
}

function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function matchProductivityRule(
  rules: ProductivityRule[],
  appName: string | null | undefined,
  title: string | null | undefined,
  url: string | null | undefined,
): string | null {
  const app = (appName ?? '').toLowerCase();
  const t = (title ?? '').toLowerCase();
  const host = hostOf(url);
  const has = (needle: string | null, haystack: string) => !!needle && !!haystack && haystack.includes(needle.toLowerCase());
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  if (host) {
    const site = sorted.find((r) => !r.title_contains && has(r.app_name_contains, host));
    if (site) return site.category;
  }
  const byTitle = sorted.find((r) => has(r.title_contains, t) && (!r.app_name_contains || has(r.app_name_contains, app)));
  if (byTitle) return byTitle.category;
  const byApp = sorted.find((r) => !r.title_contains && has(r.app_name_contains, app));
  return byApp ? byApp.category : null;
}
