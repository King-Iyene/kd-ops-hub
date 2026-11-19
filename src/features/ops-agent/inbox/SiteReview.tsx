import { useMemo, useState, type ReactNode } from 'react';
import { Check, CircleHelp, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useClassifySites, useSetDomain } from '@/queries/useOpsAgentV4';
import { useAgentToast } from '../settings/useAgentToast';
import type { DetailSite, SiteVerdict } from '../detailTypes';
import { cleanDomain, spent, type SiteCategory } from '../liveTypes';
import { SiteIcon } from './SiteFavicon';

const VERDICT: Record<SiteVerdict, string> = { work: 'Looks like work', personal: 'Looks personal', unknown: 'Cannot tell' };

const LIST_LABEL = (list: SiteCategory | null) =>
  list === 'approved' ? 'On the approved list' : list === 'unproductive' ? 'On the unproductive list' : 'Not on the site list yet';

/** The question is asked unless the site is already approved. A site already marked unproductive can be reconsidered. */
export function needsQuestion(s: Pick<DetailSite, 'list' | 'category'>): boolean {
  if (s.list === 'approved') return false;
  return s.list == null || s.category === 'unknown' || s.category === 'unproductive';
}

function Stat({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

/**
 * One card per site: favicon, minutes, days seen, teammates using it and where it sits on the list. When the site is not
 * approved, it asks "Is <domain> part of our work?" with what the database knows (and, for a site it cannot place, what
 * Claude thinks). The list changes only when a button is pressed.
 */
export function SiteReview({ sites, flagId }: { sites: DetailSite[]; flagId: string }) {
  const toast = useAgentToast();
  const setDomain = useSetDomain();
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, Exclude<SiteCategory, 'unknown'>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const cleaned = useMemo(() => [...sites].sort((a, b) => b.seconds - a.seconds).map((s) => ({ ...s, domain: cleanDomain(s.domain) })), [sites]);
  const unknownDomains = useMemo(
    () => cleaned.filter((s) => needsQuestion(s) && (s.hint?.verdict ?? 'unknown') === 'unknown').map((s) => s.domain).slice(0, 6),
    [cleaned],
  );
  const claude = useClassifySites(unknownDomains);
  const thinks = new Map((claude.data ?? []).map((r) => [cleanDomain(r.domain), r]));

  const decide = (domain: string, category: Exclude<SiteCategory, 'unknown'>) => {
    setBusy(domain);
    setDomain.mutate({ domain, category, flagId }, {
      onSuccess: () => { setDone((d) => ({ ...d, [domain]: category })); toast.saved(category === 'approved' ? `${domain} added to the approved list` : `${domain} marked unproductive`); },
      onError: toast.failed,
      onSettled: () => setBusy(null),
    });
  };

  if (cleaned.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Sites visited" data-testid="site-review">
      {cleaned.map((s) => {
        const result = done[s.domain];
        const category: SiteCategory = result ?? s.category;
        const list = result ?? s.list;
        const ask = !result && !ignored.has(s.domain) && needsQuestion(s);
        const ai = thinks.get(s.domain);
        return (
          <li key={s.domain} className="space-y-2.5 rounded-lg border bg-background/50 p-3" data-testid="site-card" data-domain={s.domain}>
            <div className="flex items-center gap-2.5">
              <SiteIcon domain={s.domain} category={category} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.domain}</p>
                <p className="text-xs text-muted-foreground">{LIST_LABEL(list)}</p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">{spent(s.seconds)}</span>
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {typeof s.days_seen === 'number' && <span>Seen on <Stat>{s.days_seen}</Stat> {s.days_seen === 1 ? 'day' : 'days'} in 30</span>}
              {typeof s.team_users === 'number' && <span><Stat>{s.team_users}</Stat> {s.team_users === 1 ? 'person' : 'people'} on the team used it in 2 weeks</span>}
            </p>
            {result && (
              <p className="flex items-center gap-1.5 text-sm text-success" role="status"><Check className="h-4 w-4" aria-hidden="true" /> {result === 'approved' ? 'Added to the approved list.' : 'Marked unproductive.'}</p>
            )}
            {ask && (
              <div className="space-y-2 rounded-md bg-muted/50 p-2.5" data-testid="site-question">
                <p className="flex items-center gap-1.5 text-sm font-medium"><CircleHelp className="h-4 w-4 text-warning" aria-hidden="true" /> Is {s.domain} part of our work?</p>
                {s.hint?.reason && <p className="text-xs text-muted-foreground"><span className={cn('font-medium', s.hint.verdict === 'work' ? 'text-success' : s.hint.verdict === 'personal' ? 'text-orange-600 dark:text-orange-400' : 'text-foreground/80')}>{VERDICT[s.hint.verdict]}.</span> {s.hint.reason}</p>}
                {ai && ai.reason && <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="claude-thinks"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /><span>Claude thinks: {VERDICT[ai.verdict] ?? ai.verdict}. {ai.reason}</span></p>}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Button type="button" size="sm" className="h-8" disabled={busy !== null} onClick={() => decide(s.domain, 'approved')} data-testid="site-approve">
                    {busy === s.domain && setDomain.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />} Yes, add to approved list
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8" disabled={busy !== null} onClick={() => decide(s.domain, 'unproductive')} data-testid="site-unproductive">No, mark unproductive</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" disabled={busy !== null} onClick={() => setIgnored((i) => new Set(i).add(s.domain))} data-testid="site-ignore">Ignore for now</Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
