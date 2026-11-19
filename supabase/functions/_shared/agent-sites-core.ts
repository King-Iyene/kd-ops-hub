// Ops Agent, sites: pure parts (no Deno APIs, so it can be unit tested).
// Claude is asked only about domains (never a page, a URL path or a person) and answers work / personal / unknown.

export type SiteVerdict = 'work' | 'personal' | 'unknown';
export interface SiteResult { domain: string; verdict: SiteVerdict; reason: string }

/** "https://www.Example.com/a?b" -> "example.com". Null when it is not a plausible host name. */
export function cleanDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const d = raw.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/[/?#:].*$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && d.length <= 120 ? d : null;
}

export const SITE_TASK = [
  'You help KD Squares, a staffing, payroll, HR and operations company, decide whether a website is plausibly part of its staff\'s work.',
  'You are given only domain names. You never see a page, a URL path or who visited.',
  'For each domain answer with verdict "work" (a business, software, finance, HR, education, productivity or industry tool), "personal" (social, entertainment, shopping, gambling, personal media) or "unknown".',
  'Prefer "unknown" to guessing. Give one short plain-English reason, at most 20 words.',
  'Reply with JSON only, no other text: [{"domain":"example.com","verdict":"work","reason":"..."}]',
].join(' ');

/** Reads Claude's answer. Anything missing, extra or malformed becomes "unknown"; it never throws. */
export function parseSiteVerdicts(text: string, domains: string[]): SiteResult[] {
  let parsed: unknown = [];
  const m = text.match(/\[[\s\S]*\]/);
  if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = []; } }
  const byDomain = new Map<string, SiteResult>();
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const d = cleanDomain(r.domain);
      if (!d || !domains.includes(d)) continue;
      const verdict: SiteVerdict = r.verdict === 'work' || r.verdict === 'personal' ? r.verdict : 'unknown';
      const reason = typeof r.reason === 'string' ? r.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
      byDomain.set(d, { domain: d, verdict, reason: reason || 'No reason given.' });
    }
  }
  return domains.map((d) => byDomain.get(d) ?? { domain: d, verdict: 'unknown', reason: 'Claude could not tell.' });
}
