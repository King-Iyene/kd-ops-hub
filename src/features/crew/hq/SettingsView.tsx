// SETTINGS: the existing Cliq, office-viewer and daemon-key cards, plus a read-only look at what each agent is standing-permitted to do.
import { useCrewPrivate } from '../useCrew';
import { CliqSettings } from '../components/CliqSettings';
import { DaemonKeys } from '../components/DaemonKeys';
import { OfficeViewers } from '../components/OfficeViewers';
import { actionLabel } from './logic';
import { usePausedIds } from './pause';
import { Chip, ErrorState, Eyebrow, Face, HqCard, LoadingRows } from './ui';
import type { HqData } from './useHq';

function StandingPermissions({ data }: { data: HqData }) {
  const priv = useCrewPrivate();
  const paused = usePausedIds();
  return (
    <HqCard flat className="p-4">
      <Eyebrow>Standing permissions</Eyebrow>
      <p className="mt-1 text-sm text-muted-foreground">What each agent may propose, always for you to approve. Nothing here lets an agent change anything on its own.</p>
      {priv.isLoading ? <div className="mt-3"><LoadingRows rows={2} /></div> : null}
      {priv.error ? <div className="mt-3"><ErrorState message={priv.error.message} onRetry={() => void priv.refetch()} /></div> : null}
      <ul className="mt-3 divide-y divide-border">
        {data.agents.map((a) => {
          const p = priv.data?.find((x) => x.agent_id === a.id);
          return (
            <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <div className="flex w-48 shrink-0 items-center gap-2"><Face agent={a} size={28} paused={paused.has(a.id)} /><span className="min-w-0"><span className="block truncate text-sm font-bold">{a.name.split(' ')[0]}</span><span className="block truncate text-[11px] text-muted-foreground">{a.title}</span></span></div>
              <div className="min-w-0 flex-1">
                <ul className="flex flex-wrap gap-1.5">{(p?.allowed_actions ?? []).map((x) => <li key={x}><Chip tone="signal" title={x}>{actionLabel(x)}</Chip></li>)}{p && p.allowed_actions.length === 0 ? <li className="text-xs text-muted-foreground">Advice only</li> : null}</ul>
                {p ? <p className="mt-1 text-[11px] text-muted-foreground">{p.max_runs_per_day === null ? 'No run limit' : `${p.max_runs_per_day} runs a day`} · up to {p.max_pending} proposals waiting</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </HqCard>
  );
}

export function SettingsView({ data }: { data: HqData }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="min-w-0 space-y-5"><CliqSettings /><OfficeViewers /></div>
      <div className="min-w-0 space-y-5"><StandingPermissions data={data} /><DaemonKeys /></div>
    </div>
  );
}
