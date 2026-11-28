import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Send, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import type { CrewAgent, CrewMessage } from '../crewDb';
import { useCrewAgents, useIsCrewOwner, usePeopleNames, useVisitorConversations, useVisitorSay, useVisitorThread } from '../useCrew';
import { ago } from '../helpers';

/**
 * For the people the owner let into the Office: see the executives and ask them questions. That is all. A question is not an order: the executives are told
 * to answer, never to change anything and never to share private finance details. The owner opens the same panel to read every conversation.
 */

const NOTE = 'You can ask questions. Only the owner can give orders or approve anything.';
const STATUS: Record<string, string> = { offline: 'Offline', idle: 'Idle', working: 'Working', thinking: 'Thinking', waiting_approval: 'Waiting for the owner', walking: 'Walking', meeting: 'In a meeting' };
const first = (a?: CrewAgent) => a?.name.split(' ')[0] ?? 'They';

function Face({ agent, size = 44 }: { agent?: CrewAgent; size?: number }) {
  return agent ? <AvatarFace avatar={agentAvatar(agent)} size={size} /> : <span className="shrink-0 rounded-full bg-slate-700" style={{ width: size, height: size }} aria-hidden />;
}

function Btn({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...p} className={cn('rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50', className)} />;
}

// ── a visitor: the list of executives, then one chat ────────────────────────────────────────────────────────────────────────────────────────────
function Chat({ agent, onBack }: { agent: CrewAgent; onBack: () => void }) {
  const { toast } = useToast();
  const thread = useVisitorThread(agent.id);
  const say = useVisitorSay();
  const [text, setText] = useState('');
  const lines = thread.data?.messages ?? [];
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length]);

  const send = () => {
    if (!text.trim()) return;
    say.mutate({ agentId: agent.id, body: text }, {
      onSuccess: (r) => {
        setText('');
        toast({ title: 'Sent', description: r?.woken ? `${first(agent)} will read it and answer.` : `${first(agent)} was busy a moment ago, so the answer may take a few minutes.` });
      },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-800 p-3">
        <button type="button" onClick={onBack} aria-label="Back to the team" className="rounded-md p-2 text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><ArrowLeft className="h-4 w-4" aria-hidden /></button>
        <Face agent={agent} />
        <div className="min-w-0"><p className="truncate text-base font-bold text-white">{agent.name}</p><p className="truncate text-xs text-sky-300">{agent.title}</p></div>
      </div>
      <div ref={box} role="log" aria-live="polite" aria-label={`Conversation with ${agent.name}`} tabIndex={0} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
        {thread.isError ? <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Could not load the conversation: {thread.error.message}</p> : null}
        {!thread.isLoading && lines.length === 0 ? <p className="p-4 text-center text-sm text-slate-400">Nothing yet. Ask {first(agent)} a question below.</p> : null}
        {lines.map((l) => (
          <div key={l.id} className={cn('max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed', l.mine ? 'ml-auto rounded-tr-sm bg-sky-600/30 text-sky-50 ring-1 ring-sky-500/40' : 'rounded-tl-sm bg-slate-800 text-slate-100')}>
            <p className="whitespace-pre-wrap break-words">{l.body}</p>
            <p className="mt-1 text-[10px] text-slate-400">{l.mine ? 'You' : first(agent)} · {ago(l.at)}</p>
          </div>
        ))}
        {thread.data?.waiting ? <p className="text-xs text-slate-400" aria-live="polite">{first(agent)} has your question and will answer soon…</p> : null}
      </div>
      <div className="border-t border-slate-800 p-3">
        <label htmlFor="visitor-ask" className="sr-only">Your question for {agent.name}</label>
        <Textarea id="visitor-ask" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder={`Ask ${first(agent)} a question…`}
          className="border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
        <div className="mt-2 flex items-center gap-2"><Btn onClick={send} disabled={!text.trim() || say.isPending}><Send className="mr-1 inline h-4 w-4" aria-hidden />Ask</Btn><span className="text-[11px] text-slate-500">Ctrl+Enter sends · {text.length}/1000</span></div>
      </div>
    </div>
  );
}

function TeamList({ agents, onPick }: { agents: CrewAgent[]; onPick: (id: string) => void }) {
  if (agents.length === 0) return <p className="p-6 text-center text-sm text-slate-400">No one to show yet.</p>;
  return (
    <ul className="space-y-1.5 p-3" aria-label="The team">
      {agents.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onPick(a.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
            <Face agent={a} />
            <span className="min-w-0 flex-1"><span className="block truncate text-base font-bold text-white">{a.name}</span><span className="block truncate text-xs text-sky-300">{a.title}</span></span>
            <span className="shrink-0 text-xs text-slate-400">{STATUS[a.status] ?? a.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── the owner: every conversation, read-only ──────────────────────────────────────────────────────────────────────────────────────────────────────
function OwnerConversations({ agents }: { agents: CrewAgent[] }) {
  const rows = useVisitorConversations(true);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const groups = useMemo(() => {
    const m = new Map<string, { person: string; agent: string; lines: CrewMessage[] }>();
    for (const l of rows.data ?? []) {
      const person = l.from_agent ? l.to_profile : l.from_profile;
      const agent = l.from_agent ?? l.to_agent;
      if (!person || !agent) continue;
      const key = person + ':' + agent;
      const g = m.get(key) ?? { person, agent, lines: [] };
      g.lines.push(l);
      m.set(key, g);
    }
    return [...m.values()].map((g) => ({ ...g, lines: [...g.lines].sort((a, b) => a.created_at.localeCompare(b.created_at)) }));   // newest conversation first: rows came newest first
  }, [rows.data]);
  const names = usePeopleNames(groups.map((g) => g.person));
  const nameOf = (id: string) => names.data?.find((p) => p.id === id)?.full_name?.trim() || 'Someone';
  const [open, setOpen] = useState<string | null>(null);

  if (rows.isError) return <p role="alert" className="m-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Could not load the conversations: {rows.error.message}</p>;
  if (!rows.isLoading && groups.length === 0) return <p className="p-6 text-center text-sm text-slate-400">Nobody has asked the team anything yet. People you allow in the Office (Crew settings) can ask questions here, and you read every conversation.</p>;
  return (
    <ul className="space-y-2 p-3" aria-label="Conversations with your team">
      {groups.map((g) => {
        const key = g.person + ':' + g.agent;
        const a = byId.get(g.agent);
        const last = g.lines[g.lines.length - 1];
        const expanded = open === key;
        return (
          <li key={key} className="rounded-xl border border-slate-700 bg-slate-900">
            <button type="button" onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
              <Face agent={a} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{nameOf(g.person)} and {first(a)}</span>
                <span className="block truncate text-xs text-slate-400">{last.body}</span>
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">{g.lines.length} · {ago(last.created_at)}</span>
            </button>
            {expanded ? (
              <div className="space-y-2 border-t border-slate-800 p-3">
                {g.lines.map((l) => (
                  <div key={l.id} className={cn('rounded-lg p-2.5 text-[13px]', l.from_agent ? 'bg-slate-800 text-slate-100' : 'bg-sky-900/40 text-sky-50')}>
                    <p className="text-[11px] font-semibold text-slate-300">{l.from_agent ? `${first(a)} answered ${nameOf(g.person)}:` : `${nameOf(g.person)} asked ${first(a)}:`} <span className="font-normal text-slate-400">{ago(l.created_at)}</span></p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{l.body}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CrewVisitorPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const owner = useIsCrewOwner();
  const agents = useCrewAgents();
  const [pick, setPick] = useState<string | null>(null);
  const team = useMemo(() => agents.data ?? [], [agents.data]);
  const chosen = team.find((a) => a.id === pick) ?? null;
  const isOwner = owner.data === true;

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPick(null); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-slate-700 bg-slate-950 p-0 text-white sm:max-w-md">
        <SheetHeader className="border-b border-slate-800 p-4 text-left">
          <SheetTitle className="text-white">{isOwner ? 'Conversations with your team' : 'Your Crew'}</SheetTitle>
          <SheetDescription className="text-slate-400">{isOwner ? 'What the people you let in asked the executives, and what they answered. Read-only.' : NOTE}</SheetDescription>
        </SheetHeader>
        {owner.isLoading || agents.isLoading ? <p className="p-6 text-center text-sm text-slate-400">Loading…</p> : isOwner ? <div className="min-h-0 flex-1 overflow-y-auto"><OwnerConversations agents={team} /></div> : chosen ? (
          <Chat key={chosen.id} agent={chosen} onBack={() => setPick(null)} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto"><TeamList agents={team} onPick={setPick} /></div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The small amber "Crew" button for the Office: opens the panel. Give it the same placement as the other Office buttons. */
export function CrewVisitorButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={cn('inline-flex items-center gap-1.5 rounded-md bg-amber-400 px-3 py-1.5 text-sm font-bold text-slate-900 shadow transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200', className)}>
        <Users className="h-4 w-4" aria-hidden />Crew
      </button>
      <CrewVisitorPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
