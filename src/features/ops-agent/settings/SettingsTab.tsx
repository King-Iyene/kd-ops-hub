import { Skeleton } from '@/components/ui/skeleton';
import { useAgentSettings } from '@/queries/useOpsAgent';
import { AdminScopeCard } from './AdminScopeCard';
import { AiCard } from './AiCard';
import { CalendarCard } from './CalendarCard';
import { AuditCard, DomainsCard } from './DomainsAuditCard';
import { ModeCard } from './ModeCard';
import { PeopleCard } from './PeopleCard';
import { RulesCard } from './RulesCard';
import { ScopeCard } from './ScopeCard';

/**
 * Super Admins change everything here. Admins can read the settings that shape what they see, but every control is
 * switched off for them (and the database refuses their writes regardless).
 */
export function SettingsTab({ canConfigure }: { canConfigure: boolean }) {
  const settings = useAgentSettings();
  if (settings.isLoading) return <Skeleton className="h-64 w-full" />;
  if (settings.isError || !settings.data) return <p className="text-sm text-destructive" role="alert">Settings could not be loaded{settings.error ? `: ${settings.error.message}` : '.'}</p>;
  const s = settings.data;
  const readOnly = !canConfigure;

  return (
    <div className="space-y-4" data-testid="agent-settings">
      {readOnly && <p className="rounded-lg border bg-muted/40 p-3 text-sm" role="note">These settings are read only. A Super Admin changes them.</p>}
      <ModeCard settings={s} readOnly={readOnly} />
      <AiCard settings={s} readOnly={readOnly} />
      <CalendarCard settings={s} readOnly={readOnly} />
      <ScopeCard readOnly={readOnly} />
      <PeopleCard settings={s} readOnly={readOnly} />
      {canConfigure && <AdminScopeCard />}
      <RulesCard settings={s} readOnly={readOnly} />
      <DomainsCard readOnly={readOnly} />
      <AuditCard />
    </div>
  );
}
