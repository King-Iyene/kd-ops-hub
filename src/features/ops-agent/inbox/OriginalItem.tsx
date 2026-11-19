import { CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isEscalationRule, type FlagEvidence } from '../liveTypes';

/** For an escalation (ES01 or ES02): the item it chases, how long it has been that way, and a way to open it. */
export function OriginalItem({ ruleCode, evidence, onOpen }: { ruleCode: string; evidence: FlagEvidence | null | undefined; onOpen: (flagId: string) => void }) {
  if (!isEscalationRule(ruleCode) || !evidence?.flag_id) return null;
  const how = ruleCode.toUpperCase() === 'ES01'
    ? evidence.open_for ? `open for ${evidence.open_for}` : 'still open'
    : evidence.handled_for ? `marked handled ${evidence.handled_for} ago` : 'marked handled';
  const id = evidence.flag_id;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="original-item">
      <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Original item</p>
        <p className="truncate">{evidence.rule && <span className="mr-1.5 font-mono text-xs">{evidence.rule}</span>}{how}{evidence.original_severity && <span className="text-muted-foreground"> · was {evidence.original_severity}</span>}</p>
      </div>
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onOpen(id)} data-testid="open-original">Open original</Button>
    </div>
  );
}
