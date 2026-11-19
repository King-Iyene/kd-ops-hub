import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAgentRules, useFlagDetail } from '@/queries/useOpsAgentV4';
import { isSensitiveRule, isSystemLevel, type LiveFlag } from '../liveTypes';
import { formatEst } from '../time';
import { DetailHistoryAndMessages } from './DetailHistorySection';
import { DraftEditor } from './DraftEditor';
import { Evidence } from './Evidence';
import { OriginalItem } from './OriginalItem';
import { FlagActions, type OnAct } from './FlagActions';
import { PersonBlock } from './DetailPerson';
import { RecurrenceBanner } from './RecurrenceBanner';
import { SeverityPill, STRIPE } from './severity';
import { SiteReview } from './SiteReview';

const STATUS: Record<string, string> = { open: 'Open', snoozed: 'Snoozed', handled: 'Handled', dismissed: 'Dismissed', auto_resolved: 'Cleared by the agent' };

function Block({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-2.5 border-t px-4 py-4 sm:px-6" aria-label={title} data-testid={testId}>
      <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The right-hand sheet that opens when an Inbox card is clicked (full screen on a phone). It reads `agent_flag_detail` and shows
 * the item in full: who and when, what is happening, how often, a drafted message that can be edited and sent, the sites
 * with a question about each unknown one, and the item's history. Reading it changes nothing.
 */
export function FlagDetailSheet({ flagId, listFlag, onClose, onOpenOther, busy, onAct }: {
  flagId: string | null; listFlag: LiveFlag | null; onClose: () => void; onOpenOther: (id: string) => void; busy: boolean; onAct: OnAct;
}) {
  const detail = useFlagDetail(flagId);
  const rules = useAgentRules(!!flagId);
  const d = detail.data;
  const flag = d?.flag ?? listFlag;
  const ruleName = (flag && (rules.data ?? []).find((r) => r.code === flag.rule_code)?.title) || flag?.rule_code || '';
  const countOnly = !!flag && isSensitiveRule(flag.rule_code);
  // Sensitive counts, escalations and system checks are about the system, not a person: no person block and no drafted message.
  const systemLevel = !!flag && isSystemLevel(flag.rule_code);
  const draft = !systemLevel && d?.draft && d.draft.recipient_id ? d.draft : null;
  // An item whose own page is the Inbox has nothing more to open.
  const link = d?.link && !d.link.path.startsWith('/agent/inbox') ? d.link : null;
  const photoFor = (id: string | null) => (!d || !id ? null : d.person?.id === id ? d.person.photo_url : d.person?.manager?.id === id ? d.person.manager.photo_url : null);
  const sites = d?.sites ?? [];

  return (
    <Sheet open={!!flagId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl" data-testid="flag-detail">
        <SheetHeader className="relative space-y-1.5 px-4 pb-4 pt-5 pr-12 text-left sm:px-6">
          {flag && <span className={cn('absolute bottom-4 left-0 top-5 w-1 rounded-r-full', STRIPE[flag.severity])} aria-hidden="true" />}
          <div className="flex flex-wrap items-center gap-2">
            {flag && <SeverityPill severity={flag.severity} />}
            {flag && <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground" data-testid="detail-status">{STATUS[flag.status] ?? flag.status}</span>}
            {countOnly && <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground" data-testid="count-only"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Count only</span>}
          </div>
          <SheetTitle className="text-base leading-snug">{flag?.title ?? (detail.isError ? 'This item could not be opened' : 'Loading')}</SheetTitle>
          <SheetDescription className="text-xs">
            {ruleName && <span data-testid="detail-rule">{ruleName}</span>}
            {flag && (
              <> · first seen <time dateTime={flag.first_seen_at} className="tabular-nums">{formatEst(flag.first_seen_at, { year: true })}</time>
              {' · '}last seen <time dateTime={flag.last_seen_at} className="tabular-nums">{formatEst(flag.last_seen_at, { year: true })}</time></>
            )}
          </SheetDescription>
          {link && (
            <Button asChild size="sm" variant="outline" className="mt-1 h-8 w-fit">
              <Link to={link.path} data-testid="open-in-kdops"><ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> {link.label}<span className="sr-only"> in KD Ops</span></Link>
            </Button>
          )}
        </SheetHeader>

        {detail.isLoading && (
          <div className="space-y-3 px-4 pb-6 sm:px-6" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
        )}
        {detail.isError && (
          <p className="mx-4 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:mx-6" role="alert" data-testid="detail-error">
            The full details could not be loaded: {detail.error.message}. What the card showed is below; try again in a moment.
          </p>
        )}

        {d?.person && !systemLevel && <div className="border-t px-4 py-4 sm:px-6"><PersonBlock person={d.person} today={d.today} /></div>}

        {flag && (
          <Block title="What is happening" testId="detail-happening">
            {flag.why && <p className="whitespace-pre-wrap text-sm leading-relaxed">{flag.why}</p>}
            <OriginalItem ruleCode={flag.rule_code} evidence={flag.evidence} onOpen={onOpenOther} />
            {flag.rule_code.toUpperCase() === 'TR05' && sites.length > 0 ? <SiteReview sites={sites} flagId={flag.id} /> : <Evidence flag={flag} now={Date.now()} />}
            {flag.suggested_action && <p className="text-sm"><span className="text-muted-foreground">Suggested:</span> {flag.suggested_action}</p>}
            {countOnly && <p className="text-xs text-muted-foreground">The agent only counts things here. It never shows names, amounts, bank details or documents.</p>}
          </Block>
        )}

        {d?.recurrence && !systemLevel && <div className="border-t px-4 py-4 sm:px-6"><RecurrenceBanner recurrence={d.recurrence} /></div>}

        {flag && draft && (
          <Block title="Message to send" testId="detail-draft">
            <DraftEditor
              key={flag.id} flagId={flag.id} draft={draft} recipientPhoto={photoFor(draft.recipient_id)}
              onClosed={onClose}
            />
          </Block>
        )}

        {d && <DetailHistoryAndMessages timeline={d.timeline ?? []} messages={d.messages ?? []} />}

        {flag && (
          <div className="sticky bottom-0 mt-auto border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-6" data-testid="detail-actions">
            <FlagActions flag={flag} busy={busy} onAct={onAct} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
