import { Link, useParams } from 'react-router-dom';
import { CalendarClock, History, Globe, ListChecks, Network, ScrollText, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAiStatus, useAgentSettings } from '@/queries/useOpsAgent';
import { SETTINGS_SECTIONS, settingsPath, settingsSectionFromSplat, type SettingsSectionKey } from '../agentTabs';
import { AdminScopeCard } from './AdminScopeCard';
import { AiCard } from './AiCard';
import { CalendarCard, CalendarSummary } from './CalendarCard';
import { AuditCard, DomainsCard } from './DomainsAuditCard';
import { PeopleCard } from './PeopleCard';
import { MonitoringRulesCard } from './MonitoringRulesCard';
import { RulesCard } from './RulesCard';
import { ScopeCard } from './ScopeCard';

const ICONS: Record<SettingsSectionKey, LucideIcon> = {
  claude: Sparkles, team: Users, calendar: CalendarClock, coverage: Network, rules: ListChecks, brief: ScrollText, sites: Globe, changes: History,
};

/** The rail: a vertical list on desktop, a row of scrollable chips on a phone. One section is shown at a time. */
function SectionRail({ current }: { current: SettingsSectionKey }) {
  const status = useAiStatus();
  const needsKey = !!status.data && !status.data.key_configured;
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 pb-1 lg:sticky lg:top-0 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0 lg:pb-0" data-testid="settings-rail">
      <ul className="flex gap-1.5 lg:flex-col lg:gap-0.5">
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = ICONS[s.key];
          const active = s.key === current;
          return (
            <li key={s.key} className="shrink-0">
              <Link
                to={settingsPath(s.key)} aria-current={active ? 'page' : undefined} data-testid={`settings-nav-${s.key}`}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm no-underline kd-transition lg:rounded-lg lg:border-transparent lg:py-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary/30 bg-primary/10 font-medium text-foreground lg:bg-muted' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'opacity-70')} aria-hidden="true" />
                <span className="flex-1">{s.label}</span>
                {s.key === 'claude' && needsKey && <span className="h-2 w-2 rounded-full bg-warning" title="No Claude key yet" aria-label="needs attention" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Super Admins change everything here. Admins can read the settings that shape what they see, but every control is
 * switched off for them (and the database refuses their writes regardless). The address names the section:
 * /agent/settings/<section>.
 */
export function SettingsTab({ canConfigure }: { canConfigure: boolean }) {
  const settings = useAgentSettings();
  const section = settingsSectionFromSplat(useParams()['*']);
  const meta = SETTINGS_SECTIONS.find((s) => s.key === section)!;

  if (settings.isLoading) return <Skeleton className="h-64 w-full" />;
  if (settings.isError || !settings.data) return <p className="text-sm text-destructive" role="alert">Settings could not be loaded{settings.error ? `: ${settings.error.message}` : '.'} Refresh the page to try again.</p>;
  const s = settings.data;
  const readOnly = !canConfigure;

  return (
    <div className="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10" data-testid="agent-settings" data-section={section}>
      <SectionRail current={section} />
      <div className="min-w-0 max-w-3xl space-y-4">
        <header>
          <h2 className="text-lg font-semibold tracking-tight">{meta.label}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.blurb}</p>
        </header>
        {readOnly && <p className="rounded-lg border bg-muted/40 p-3 text-sm" role="note">These settings are read only. A Super Admin changes them.</p>}

        {section === 'claude' && <AiCard settings={s} readOnly={readOnly} />}
        {section === 'team' && <PeopleCard settings={s} readOnly={readOnly} />}
        {section === 'calendar' && <><CalendarSummary settings={s} /><CalendarCard settings={s} readOnly={readOnly} /></>}
        {section === 'coverage' && <><ScopeCard readOnly={readOnly} />{canConfigure && <AdminScopeCard />}</>}
        {section === 'rules' && <MonitoringRulesCard readOnly={readOnly} />}
        {section === 'brief' && <RulesCard settings={s} readOnly={readOnly} />}
        {section === 'sites' && <DomainsCard readOnly={readOnly} />}
        {section === 'changes' && <AuditCard />}
      </div>
    </div>
  );
}

