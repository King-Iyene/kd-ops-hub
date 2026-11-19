import { useMemo, useState } from 'react';
import { Archive, Brain, Check, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAddMemory, useAgentMemory, useEditMemory, useSetMemoryStatus } from '@/queries/useOpsAgentMemory';
import type { AgentMemory, MemoryScope, MemoryStatus, MemoryType } from '../agentDb';
import { formatEst } from '../time';
import { Field } from './shared';
import { useAgentToast } from './useAgentToast';

type Tab = 'active' | 'proposed' | 'archived';
const TABS: { key: Tab; label: string }[] = [{ key: 'active', label: 'Active' }, { key: 'proposed', label: 'Waiting' }, { key: 'archived', label: 'Archived' }];
const tabOf = (s: MemoryStatus): Tab => (s === 'active' ? 'active' : s === 'proposed' ? 'proposed' : 'archived');
const TYPES: MemoryType[] = ['fact', 'correction', 'preference', 'exemption', 'rule'];
const SCOPES: MemoryScope[] = ['global', 'company', 'person', 'module'];
const SOURCE: Record<string, string> = { chat: 'Chat', manual: 'Added by hand', dismissal: 'A dismissed item', question_answer: 'An answered question' };
const MAX = 2000;

const scopeLabel = (m: Pick<AgentMemory, 'scope' | 'scope_ref'>) => (m.scope === 'global' ? 'Everyone' : `${m.scope}${m.scope_ref ? `: ${m.scope_ref}` : ''}`);

function TypeBadge({ type }: { type: string }) {
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold capitalize text-primary" data-testid="memory-type">{type}</span>;
}

/** The form for a new memory, or the text and detail of an existing one. */
function MemoryDialog({ open, onOpenChange, editing, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; editing: AgentMemory | null; onDone: (msg: string) => void }) {
  const toast = useAgentToast();
  const add = useAddMemory();
  const edit = useEditMemory();
  const [type, setType] = useState<MemoryType>((editing?.type as MemoryType) ?? 'fact');
  const [content, setContent] = useState(editing?.content ?? '');
  const [detail, setDetail] = useState(editing?.detail ?? '');
  const [scope, setScope] = useState<MemoryScope>((editing?.scope as MemoryScope) ?? 'global');
  const [ref, setRef] = useState(editing?.scope_ref ?? '');
  const refNeeded = !editing && scope !== 'global';
  const ready = content.trim().length > 0 && content.length <= MAX && detail.length <= MAX && (!refNeeded || ref.trim().length > 0);
  const busy = add.isPending || edit.isPending;

  const submit = () => {
    const d = detail.trim() || null;
    if (editing) edit.mutate({ id: editing.id, content: content.trim(), detail: d }, { onSuccess: () => { onOpenChange(false); onDone('Memory updated'); }, onError: toast.failed });
    else add.mutate({ type, content: content.trim(), detail: d, scope, scope_ref: scope === 'global' ? null : ref.trim() }, { onSuccess: () => { onOpenChange(false); onDone('Memory added'); }, onError: toast.failed });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="memory-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit memory' : 'Add a memory'}</DialogTitle>
          <DialogDescription>Short and plain. The agent reads active memories before it answers or raises an item.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="mem-type">
                <Select value={type} onValueChange={(v) => setType(v as MemoryType)}>
                  <SelectTrigger id="mem-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Applies to" htmlFor="mem-scope">
                <Select value={scope} onValueChange={(v) => setScope(v as MemoryScope)}>
                  <SelectTrigger id="mem-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>{SCOPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t === 'global' ? 'Everyone (global)' : t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          )}
          {refNeeded && (
            <Field label={`Which ${scope}?`} htmlFor="mem-ref" hint="A name or code, for example a person's name or the module key.">
              <Input id="mem-ref" value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} />
            </Field>
          )}
          <Field label="Memory" htmlFor="mem-content" hint={`${content.length} of ${MAX}`}>
            <Textarea id="mem-content" rows={3} value={content} maxLength={MAX} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <Field label="Detail (optional)" htmlFor="mem-detail" hint="Why, or when it applies.">
            <Textarea id="mem-detail" rows={3} value={detail} maxLength={MAX} onChange={(e) => setDetail(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!ready || busy} data-testid="memory-save">{editing ? 'Save changes' : 'Add memory'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ m, readOnly, busy, onStatus, onEdit }: { m: AgentMemory; readOnly: boolean; busy: boolean; onStatus: (m: AgentMemory, s: MemoryStatus, done: string) => void; onEdit: (m: AgentMemory) => void }) {
  return (
    <li className="space-y-1.5 rounded-lg border bg-card p-3" data-testid="memory-row" data-status={m.status}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TypeBadge type={m.type} />
        <span className="text-xs text-muted-foreground" data-testid="memory-scope">{scopeLabel(m)}</span>
        <span className="text-xs text-muted-foreground">· {SOURCE[m.source] ?? m.source}</span>
        <time dateTime={m.created_at} className="text-xs tabular-nums text-muted-foreground">· {formatEst(m.created_at, { year: true })}</time>
        {m.status === 'rejected' && <span className="text-2xs font-medium text-muted-foreground">· Not saved</span>}
      </div>
      <p className="whitespace-pre-wrap text-sm">{m.content}</p>
      {m.detail && <p className="whitespace-pre-wrap text-xs text-muted-foreground" data-testid="memory-detail">{m.detail}</p>}
      {!readOnly && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {m.status === 'proposed' && (
            <>
              <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => onStatus(m, 'active', 'Memory approved')} data-testid="memory-approve"><Check className="mr-1.5 h-3.5 w-3.5" /> Approve</Button>
              <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => onStatus(m, 'rejected', 'Memory rejected')} data-testid="memory-reject"><X className="mr-1.5 h-3.5 w-3.5" /> Reject</Button>
            </>
          )}
          {m.status === 'active' && <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => onStatus(m, 'archived', 'Memory archived')} data-testid="memory-archive"><Archive className="mr-1.5 h-3.5 w-3.5" /> Archive</Button>}
          {(m.status === 'archived' || m.status === 'rejected') && <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => onStatus(m, 'active', 'Memory restored')} data-testid="memory-restore"><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore</Button>}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => onEdit(m)} aria-label={`Edit memory: ${m.content.slice(0, 40)}`} data-testid="memory-edit"><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
        </div>
      )}
    </li>
  );
}

/** What the agent has been taught. Chat proposes ("Remember this?"); a Super Admin approves, edits, archives or adds by hand. */
export function MemoryCard({ readOnly }: { readOnly: boolean }) {
  const q = useAgentMemory();
  const setStatus = useSetMemoryStatus();
  const toast = useAgentToast();
  const [tab, setTab] = useState<Tab>('active');
  const [dialog, setDialog] = useState<{ open: boolean; editing: AgentMemory | null }>({ open: false, editing: null });
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const counts = useMemo(() => ({ active: rows.filter((r) => tabOf(r.status) === 'active').length, proposed: rows.filter((r) => tabOf(r.status) === 'proposed').length, archived: rows.filter((r) => tabOf(r.status) === 'archived').length }), [rows]);
  const visible = rows.filter((r) => tabOf(r.status) === tab);

  const change = (m: AgentMemory, status: MemoryStatus, done: string) => setStatus.mutate({ id: m.id, status }, { onSuccess: () => toast.saved(done), onError: toast.failed });

  return (
    <div className="space-y-4" data-testid="agent-memory">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which memories to show">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key} type="button" aria-pressed={on} onClick={() => setTab(t.key)} data-testid={`memory-tab-${t.key}`}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm kd-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'border-primary/40 bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}
              >{t.label}<span className="text-xs tabular-nums text-muted-foreground">{counts[t.key]}</span></button>
            );
          })}
        </div>
        {!readOnly && <Button size="sm" variant="outline" className="h-8" onClick={() => setDialog({ open: true, editing: null })} data-testid="memory-add"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add a memory</Button>}
      </div>

      {q.isLoading ? <Skeleton className="h-32 w-full" /> : q.isError ? (
        <p className="text-sm text-destructive" role="alert">Memory could not be loaded: {q.error.message}. Refresh the page to try again.</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Brain} compact
          title={tab === 'active' ? 'Nothing remembered yet' : tab === 'proposed' ? 'Nothing is waiting' : 'Nothing archived'}
          description={tab === 'active' ? 'When you tell the agent something in Chat it may ask "Remember this?". Anything you say yes to, or add here, is listed and can be edited or removed at any time.' : tab === 'proposed' ? 'Suggestions the agent has made that nobody has answered yet appear here.' : 'Archived and rejected memories are kept here and can be restored.'}
        />
      ) : (
        <ul className="space-y-2">{visible.map((m) => <Row key={m.id} m={m} readOnly={readOnly} busy={setStatus.isPending} onStatus={change} onEdit={(x) => setDialog({ open: true, editing: x })} />)}</ul>
      )}

      {dialog.open && <MemoryDialog key={dialog.editing?.id ?? 'new'} open editing={dialog.editing} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} onDone={toast.saved} />}
    </div>
  );
}
