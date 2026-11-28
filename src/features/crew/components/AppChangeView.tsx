import { useSupabaseQuery } from '@/queries/useSupabaseQuery';
import { cn } from '@/lib/utils';
import { cdb } from '../crewDb';

/**
 * What an app.create / app.update / app.soft_delete proposal will do, as a small table: the field, its value now and the value proposed.
 * For a waiting proposal the "now" column is read from the real row by crew_app_preview (owner only); for a finished one it shows what was
 * recorded. Only the columns an agent may write are ever shown.
 */
interface PreviewField { column: string; before: unknown; after: unknown; changed?: boolean }
interface Preview { source: string; op: string; exists?: boolean | null; fields: PreviewField[]; set_by_system?: Record<string, unknown> | null; delete_means?: string | null }
interface Props {
  proposal: { id: string; action: string; status: string; payload: Record<string, unknown>; result?: Record<string, unknown> | null };
  tone?: 'light' | 'dark';
}

const pretty = (column: string) => column.replace(/_/g, ' ');
function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What to draw when we cannot (or need not) read the live row: the proposed values, or what the executor recorded. */
function fromPayload(p: Props['proposal']): Preview {
  const op = p.action.replace('app.', '');
  const values = isObj(p.payload.values) ? p.payload.values : {};
  const before = isObj(p.result?.before) ? (p.result?.before as Record<string, unknown>) : {};
  const after = isObj(p.result?.after) ? (p.result?.after as Record<string, unknown>) : values;
  const keys = [...new Set([...Object.keys(values), ...Object.keys(before)])].sort();
  return { source: String(p.payload.source ?? ''), op, fields: keys.map((column) => ({ column, before: before[column] ?? null, after: after[column] ?? values[column] ?? null, changed: before[column] !== (after[column] ?? values[column]) })) };
}

/** The live preview of one waiting app.* proposal (owner only). Cards use isError to fall back to their own before/after table. */
export function useAppPreview(proposal: Props['proposal']) {
  const live = proposal.status === 'pending' && proposal.action.startsWith('app.');
  return useSupabaseQuery<Preview>(['crew', 'app-preview', proposal.id], () => cdb.rpc('crew_app_preview', { p_proposal: proposal.id }) as never, { enabled: live, staleTime: 15_000, retry: false });
}

export function AppChangeView({ proposal, tone = 'light' }: Props) {
  const live = proposal.status === 'pending' && proposal.action.startsWith('app.');
  const q = useAppPreview(proposal);
  if (!proposal.action.startsWith('app.')) return null;
  const data: Preview = q.data ?? fromPayload(proposal);
  const dark = tone === 'dark';
  const create = data.op === 'create';
  const remove = data.op === 'soft_delete';
  const missing = live && !create && data.exists === false;
  const title = `${data.source ? pretty(data.source) : 'record'} · ${create ? 'new record' : remove ? 'hide this record' : 'change a record'}`;
  return (
    <div className={cn('mt-2 rounded-lg p-2 text-xs', dark ? 'bg-slate-950/60 text-slate-200' : 'bg-muted/50')}>
      <p className={cn('mb-1 text-[11px] font-bold uppercase tracking-wide', dark ? 'text-slate-500' : 'text-muted-foreground')}>{title}</p>
      {live && q.isLoading ? <p className={dark ? 'text-slate-400' : 'text-muted-foreground'}>Reading the current record…</p> : null}
      {missing ? <p className="font-semibold text-red-500">That record no longer exists or has changed state: approving will fail and change nothing.</p> : null}
      {data.fields.length > 0 ? (
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className={cn('text-left', dark ? 'text-slate-400' : 'text-muted-foreground')}>
              <th className="w-1/3 py-0.5 pr-2 font-semibold">Field</th>
              <th className="w-1/3 py-0.5 pr-2 font-semibold">{create ? '' : remove ? 'Value' : 'Now'}</th>
              <th className="py-0.5 font-semibold">{create ? 'New value' : remove ? '' : 'Proposed'}</th>
            </tr>
          </thead>
          <tbody>
            {data.fields.map((f) => (
              <tr key={f.column} className={cn('border-t align-top', dark ? 'border-slate-800' : 'border-border', f.changed === false && 'opacity-50')}>
                <td className="break-words py-0.5 pr-2 font-medium">{pretty(f.column)}</td>
                <td className={cn('break-words py-0.5 pr-2', !create && !remove && f.changed ? 'text-red-500 line-through' : '')}>{create ? '' : show(f.before)}</td>
                <td className={cn('break-words py-0.5', f.changed !== false && !remove ? 'font-semibold text-emerald-600' : '')}>{remove ? '' : show(f.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {data.set_by_system && Object.keys(data.set_by_system).length > 0 ? (
        <p className={cn('mt-1', dark ? 'text-slate-400' : 'text-muted-foreground')}>The system also sets: {Object.entries(data.set_by_system).map(([k, v]) => `${pretty(k)} = ${show(v)}`).join(', ')}.</p>
      ) : null}
      {remove ? <p className={cn('mt-1', dark ? 'text-slate-400' : 'text-muted-foreground')}>{data.delete_means ?? 'The record is hidden, nothing is erased.'}</p> : null}
    </div>
  );
}
