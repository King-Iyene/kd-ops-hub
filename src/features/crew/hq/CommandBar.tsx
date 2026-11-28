// The command bar: Ctrl+K or "/" focuses it. Type to search agents, decisions and messages; "tell <agent> <text>" sends; "meet <topic>" opens the
// meeting form; a section name goes there. Nothing is sent until Enter is pressed on the preview line.
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CalendarClock, CornerDownLeft, MessageSquare, Search, Send, User, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CrewAgent, CrewMessage } from '../crewDb';
import type { HqActions } from './actions';
import { parseCommand, searchHq, type DecisionItem, type Navigate } from './logic';
import { Kbd } from './ui';

interface Option { id: string; icon: typeof Search; label: string; hint?: string; group: string; run: () => void }

export interface CommandBarHandle { focus: () => void }

export const CommandBar = forwardRef<CommandBarHandle, { agents: CrewAgent[]; decisions: DecisionItem[]; messages: CrewMessage[]; actions: HqActions; onNavigate: Navigate; onOpenAgent: (a: CrewAgent, tab?: 'messages') => void }>(
  function CommandBar({ agents, decisions, messages, actions, onNavigate, onOpenAgent }, ref) {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const id = useId();
    useImperativeHandle(ref, () => ({ focus: () => { input.current?.focus(); input.current?.select(); setOpen(true); } }), []);

    // Ctrl/Cmd+K and "/" focus the bar. Capture phase, so the app's own palette and shortcuts do not also react while Crew HQ is showing.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        const inDialog = !!t?.closest?.('[role="dialog"], [role="alertdialog"]');
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !inDialog) { e.preventDefault(); e.stopPropagation(); input.current?.focus(); input.current?.select(); setOpen(true); return; }
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && !inDialog) { e.preventDefault(); e.stopPropagation(); input.current?.focus(); setOpen(true); }
      };
      window.addEventListener('keydown', onKey, true);
      return () => window.removeEventListener('keydown', onKey, true);
    }, []);

    const cmd = useMemo(() => parseCommand(text, agents), [text, agents]);
    const close = () => { setOpen(false); setActive(0); };
    const clear = () => { setText(''); close(); };

    const options = useMemo<Option[]>(() => {
      const out: Option[] = [];
      if (cmd.type === 'tell') {
        out.push({ id: 'tell', icon: Send, group: 'Send', label: `Tell ${cmd.agent.name.split(' ')[0]}: ${cmd.text}`, hint: 'Enter sends', run: () => actions.send(cmd.agent.id, cmd.text, 'command', clear) });
      } else if (cmd.type === 'meet') {
        out.push({ id: 'meet', icon: CalendarClock, group: 'Meeting', label: `Call a meeting: ${cmd.topic}`, hint: 'Opens the form, nothing is called yet', run: () => { onNavigate('meetings', { sub: 'meetings', topic: cmd.topic }); clear(); } });
      } else if (cmd.type === 'go') {
        out.push({ id: 'go', icon: ArrowRight, group: 'Go to', label: `Open ${cmd.view[0].toUpperCase() + cmd.view.slice(1)}`, run: () => { onNavigate(cmd.view); clear(); } });
      } else if (cmd.type === 'search') {
        const r = searchHq(cmd.query, { agents, decisions, messages });
        const name = (aid: string | null) => agents.find((a) => a.id === aid)?.name.split(' ')[0] ?? '';
        for (const a of r.agents) out.push({ id: 'a' + a.id, icon: User, group: 'Agents', label: a.name, hint: a.title, run: () => { onOpenAgent(a); clear(); } });
        for (const d of r.decisions) {
          const label = d.kind === 'proposal' ? d.proposal.summary : d.kind === 'question' ? d.message.body : d.order.text;
          out.push({ id: 'd' + d.id, icon: MessageSquare, group: 'Decisions', label: label.length > 90 ? label.slice(0, 90) + '…' : label, hint: d.kind, run: () => { onNavigate('decisions', { focus: d.id }); clear(); } });
        }
        for (const m of r.messages) {
          const other = m.from_agent ?? m.to_agent;
          const a = agents.find((x) => x.id === other);
          out.push({ id: 'm' + m.id, icon: MessageSquare, group: 'Messages', label: m.body.length > 90 ? m.body.slice(0, 90) + '…' : m.body, hint: m.from_agent ? `from ${name(m.from_agent)}` : `to ${name(m.to_agent)}`, run: () => { if (a) onOpenAgent(a, 'messages'); clear(); } });
        }
      }
      return out;
      // clear/close only touch local state
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cmd, agents, decisions, messages, actions, onNavigate, onOpenAgent]);

    const hint = cmd.type === 'incomplete' ? cmd.hint : cmd.type === 'search' && options.length === 0 ? `Nothing matches "${cmd.query}".` : null;
    const showPanel = open;
    const safeActive = Math.min(active, Math.max(options.length - 1, 0));

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (options.length ? (i + 1) % options.length : 0)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (options.length ? (i - 1 + options.length) % options.length : 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); options[safeActive]?.run(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (text) setText(''); else input.current?.blur(); close(); }
    };

    let lastGroup = '';
    return (
      <div className="relative min-w-0 flex-1" role="search">
        <label htmlFor={id + '-in'} className="sr-only">Command bar: search, or tell an agent something</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id={id + '-in'} ref={input} value={text} autoComplete="off" spellCheck={false}
            role="combobox" aria-expanded={showPanel} aria-controls={id + '-list'} aria-autocomplete="list" aria-activedescendant={showPanel && options[safeActive] ? `${id}-o${safeActive}` : undefined}
            onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(close, 120)} onKeyDown={onKeyDown}
            placeholder="Search, tell hale …, meet …"
            className="hq-focus h-11 w-full rounded-2xl border border-input bg-card pl-10 pr-16 text-sm shadow-sm placeholder:text-muted-foreground md:h-10"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex" aria-hidden><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </div>
        {showPanel ? (
          <div className="absolute inset-x-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl" onMouseDown={(e) => e.preventDefault()}>
            <ul id={id + '-list'} role="listbox" aria-label="Command bar results">
              {options.map((o, i) => {
                const header = o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                return (
                  <li key={o.id} role="presentation">
                    {header ? <p className="hq-eyebrow px-2.5 pb-1 pt-2">{header}</p> : null}
                    <div id={`${id}-o${i}`} role="option" aria-selected={i === safeActive} onMouseEnter={() => setActive(i)} onClick={o.run}
                      className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm', i === safeActive ? 'bg-[hsl(var(--hq-signal)/0.13)]' : 'hover:bg-muted')}>
                      <o.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                      {o.hint ? <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{o.hint}</span> : null}
                      {i === safeActive ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {hint ? <p className="px-3 py-2 text-sm text-muted-foreground" role="status">{hint}</p> : null}
            {cmd.type === 'empty' ? (
              <div className="space-y-1 px-3 py-2 text-sm text-muted-foreground" role="status">
                <p><span className="font-semibold text-foreground">tell hale</span> check this week&apos;s income against the emails</p>
                <p><span className="font-semibold text-foreground">meet</span> cash runway for December</p>
                <p>Or type a name, a word from a decision, or a section like <span className="font-semibold text-foreground">memory</span>.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);
