// Crew HQ: the app shell. A slim rail on the left (a bottom bar on a phone), a top bar with the command bar, and one section at a time.
// The section, sub-view, open profile and focused decision all live in the address (?view=&sub=&agent=&focus=), so back, forward and links work.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain, CalendarClock, Columns3, ListChecks, PanelLeftClose, PanelLeftOpen, Settings2, Sun, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CrewAgent } from '../crewDb';
import { useCrewMeetings } from '../useCrew';
import { useHqActions } from './actions';
import { AgentDrawer } from './AgentDrawer';
import { AgentsView } from './AgentsView';
import { CommandBar, type CommandBarHandle } from './CommandBar';
import { DecisionsView } from './DecisionsView';
import { isView, VIEWS, type HqView, type Navigate } from './logic';
import { MeetingsView, type MeetingsSub } from './MeetingsView';
import { MemoryView, type MemorySub } from './MemoryView';
import { SettingsView } from './SettingsView';
import { TodayView } from './TodayView';
import { useHqData } from './useHq';
import { WorkView, type WorkSub } from './WorkView';
import './hq.css';

const NAV: Record<HqView, { label: string; short: string; icon: typeof Sun; blurb: string }> = {
  today: { label: 'Today', short: 'Today', icon: Sun, blurb: 'Your briefing: what changed, what waits, who is working' },
  decisions: { label: 'Decisions', short: 'Decide', icon: ListChecks, blurb: 'One decision at a time, most urgent first' },
  work: { label: 'Work', short: 'Work', icon: Columns3, blurb: 'What the team is doing, from planned to done' },
  agents: { label: 'Agents', short: 'Agents', icon: Users, blurb: 'The team, who reports to whom, and each profile' },
  meetings: { label: 'Meetings', short: 'Meet', icon: CalendarClock, blurb: 'Call a meeting, read the team channel and your messages' },
  memory: { label: 'Memory', short: 'Memory', icon: Brain, blurb: 'The company brain and what the agents learned this week' },
  settings: { label: 'Settings', short: 'Settings', icon: Settings2, blurb: 'Cliq, who can see the office, permissions and keys' },
};

const WORK_SUBS: WorkSub[] = ['board', 'orders', 'ideas', 'handoffs'];
const MEET_SUBS: MeetingsSub[] = ['meetings', 'channel', 'messages'];
const MEMORY_SUBS: MemorySub[] = ['week', 'brain'];
const RAIL_KEY = 'crew-hq-rail';
const readRail = () => { try { return localStorage.getItem(RAIL_KEY) !== 'collapsed'; } catch { return true; } };
const pick = <T extends string>(v: string | null, all: readonly T[], fallback: T): T => (all as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export function HqShell() {
  const [sp, setSp] = useSearchParams();
  const view: HqView = isView(sp.get('view')) ? (sp.get('view') as HqView) : 'today';
  const sub = sp.get('sub');
  const agentId = sp.get('agent');
  const focus = sp.get('focus');
  const topic = sp.get('topic') ?? undefined;
  const [expanded, setExpanded] = useState(readRail);
  const bar = useRef<CommandBarHandle>(null);
  const meetings = useCrewMeetings(true);

  const data = useHqData();
  const actions = useHqActions(data.agents);
  const live = (meetings.data ?? []).filter((m) => m.status !== 'closed').length;

  const navigate: Navigate = useCallback((v, o) => {
    const n = new URLSearchParams();
    n.set('view', v);
    if (o?.sub) n.set('sub', o.sub);
    if (o?.focus) n.set('focus', o.focus);
    if (o?.topic) n.set('topic', o.topic);
    setSp(n);
  }, [setSp]);

  const openAgent = useCallback((a: CrewAgent, tab?: 'messages') => {
    setSp((prev) => { const n = new URLSearchParams(prev); n.set('agent', a.id); if (tab) n.set('atab', tab); else n.delete('atab'); return n; });
  }, [setSp]);
  const closeAgent = useCallback(() => setSp((prev) => { const n = new URLSearchParams(prev); n.delete('agent'); n.delete('atab'); return n; }, { replace: true }), [setSp]);

  useEffect(() => { document.title = `${NAV[view].label} · Crew HQ`; }, [view]);
  const toggleRail = () => { const next = !expanded; setExpanded(next); try { localStorage.setItem(RAIL_KEY, next ? 'expanded' : 'collapsed'); } catch { /* private window */ } };

  const badge = (v: HqView): number => (v === 'decisions' ? data.items.length : v === 'meetings' ? live : 0);
  const onNavKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(e.currentTarget.querySelectorAll('button[data-rail]') as NodeListOf<HTMLButtonElement>)];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };

  const body = useMemo(() => {
    switch (view) {
      case 'today': return <TodayView data={data} onNavigate={navigate} onOpenAgent={openAgent} />;
      case 'decisions': return <DecisionsView focusId={focus} initialSub={sub === 'history' ? 'history' : undefined} />;
      case 'work': return <WorkView data={data} sub={pick(sub, WORK_SUBS, 'board')} onSub={(s) => navigate('work', { sub: s })} onNavigate={navigate} />;
      case 'agents': return <AgentsView data={data} onOpen={openAgent} />;
      case 'meetings': return <MeetingsView topic={topic} sub={pick(sub, MEET_SUBS, 'meetings')} onSub={(s) => navigate('meetings', { sub: s })} />;
      case 'memory': return <MemoryView data={data} sub={pick(sub, MEMORY_SUBS, 'week')} onSub={(s) => navigate('memory', { sub: s })} onOpenAgent={openAgent} />;
      default: return <SettingsView data={data} />;
    }
  }, [view, data, navigate, openAgent, focus, sub, topic]);

  return (
    <div className="crew-hq -m-1 md:m-0">
      <div className="flex gap-5">
        {/* the rail: icons and labels, collapsible; a bottom bar on a phone (below) */}
        <nav aria-label="Crew HQ sections" onKeyDown={onNavKey} className={cn('hidden shrink-0 transition-[width] duration-200 md:block', expanded ? 'w-52' : 'w-[4.25rem]')}>
          <div className="sticky top-0 flex flex-col gap-1 rounded-2xl border border-border bg-card p-2 shadow-sm">
            <div className={cn('mb-1 flex items-center gap-2 px-2 py-2', !expanded && 'justify-center px-0')}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--hq-signal))] text-sm font-black text-[hsl(252_100%_99%)] dark:text-[hsl(252_60%_12%)]" aria-hidden>C</span>
              {expanded ? <span className="min-w-0"><span className="block text-sm font-bold leading-tight">Crew HQ</span><span className="block text-[11px] text-muted-foreground">Mission control</span></span> : null}
            </div>
            {VIEWS.map((v) => {
              const n = NAV[v];
              const count = badge(v);
              return (
                <button key={v} type="button" data-rail aria-current={view === v ? 'page' : undefined} aria-label={`${n.label}${count ? `, ${count}` : ''}`} title={n.label} onClick={() => navigate(v)} className={cn('hq-rail-item hq-focus', !expanded && 'justify-center px-0')}>
                  <n.icon className="h-5 w-5 shrink-0" aria-hidden />
                  {expanded ? <span className="min-w-0 flex-1 truncate text-left">{n.label}</span> : null}
                  {count ? <span className={cn('hq-num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--hq-signal))] px-1.5 text-[11px] font-bold text-[hsl(252_100%_99%)] dark:text-[hsl(252_60%_12%)]', !expanded && 'absolute right-1.5 top-1.5 h-4 min-w-4 px-1 text-[10px]')} aria-hidden>{count > 99 ? '99+' : count}</span> : null}
                </button>
              );
            })}
            <button type="button" onClick={toggleRail} aria-expanded={expanded} aria-label={expanded ? 'Collapse the rail' : 'Expand the rail'} className={cn('hq-rail-item hq-focus mt-1', !expanded && 'justify-center px-0')}>
              {expanded ? <PanelLeftClose className="h-5 w-5 shrink-0" aria-hidden /> : <PanelLeftOpen className="h-5 w-5 shrink-0" aria-hidden />}
              {expanded ? <span>Collapse</span> : null}
            </button>
          </div>
        </nav>

        <div className="min-w-0 flex-1 pb-24 md:pb-6">
          <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 lg:w-72 lg:shrink-0">
              <h1 className="text-2xl font-bold tracking-tight">{NAV[view].label}</h1>
              <p className="text-sm text-muted-foreground">{NAV[view].blurb}</p>
            </div>
            <CommandBar ref={bar} agents={data.agents} decisions={data.items} messages={data.messages} actions={actions} onNavigate={navigate} onOpenAgent={openAgent} />
          </header>
          <section aria-label={NAV[view].label} key={view + (sub ?? '')} className="hq-rise outline-none">{body}</section>
        </div>
      </div>

      {/* phone: the same sections as a bottom bar, above the app's own tab bar */}
      <nav aria-label="Crew HQ sections" className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-7">
          {VIEWS.map((v) => {
            const n = NAV[v];
            const count = badge(v);
            return (
              <li key={v}>
                <button type="button" aria-current={view === v ? 'page' : undefined} aria-label={`${n.label}${count ? `, ${count}` : ''}`} onClick={() => navigate(v)} className={cn('hq-focus relative flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-bold', view === v ? 'text-[hsl(var(--hq-signal-ink))]' : 'text-muted-foreground')}>
                  <n.icon className="h-5 w-5" aria-hidden />
                  <span>{n.short}</span>
                  {count ? <span className="absolute right-1/4 top-1 h-2 w-2 rounded-full bg-[hsl(var(--hq-signal))]" aria-hidden /> : null}
                  {view === v ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-[hsl(var(--hq-signal))]" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <AgentDrawer agentId={agentId} data={data} onClose={closeAgent} initialTab={sp.get('atab') === 'messages' ? 'messages' : 'overview'} />
    </div>
  );
}
