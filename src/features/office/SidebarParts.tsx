import type { ReactNode } from 'react';
import { Building2, ChevronDown, DoorOpen, Lock, MapPin, MonitorUp, Sofa } from 'lucide-react';
import { AvatarFace } from './AvatarFace';
import type { AvatarStyle } from './world/types';

/** The people sidebar: a few calm pieces (a title with a count, one-line people, folded-away offline), in the KD colours. */

const two = (n: number) => String(n).padStart(2, '0');

/** A section title: a small glowing marker, the name, the count in gold, and a hairline that fades out. Click to fold. */
export function SideTitle({ title, count, open, onToggle, right }: { title: string; count?: number; open: boolean; onToggle: () => void; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="group flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-[#00ECFF] shadow-[0_0_8px_#00ECFF]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9ff6ff]/85 transition-colors group-hover:text-[#9ff6ff]">{title}</span>
        {count !== undefined && <span className="font-mono text-[10.5px] font-semibold text-[#D6AC50]">{two(count)}</span>}
        <span className="h-px min-w-3 flex-1 bg-gradient-to-r from-[#00ECFF]/35 to-transparent" />
        <ChevronDown className={`h-3 w-3 shrink-0 text-[#9ff6ff]/50 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {right}
    </div>
  );
}

/** A quiet three-way filter: text with a glowing underline under the one that is on (no big coloured pills). */
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count: number }[] }) {
  return (
    <div role="tablist" className="mb-1.5 flex items-center gap-3 border-b border-white/[0.06] px-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`relative -mb-px pb-1.5 text-[11px] font-semibold transition-colors ${value === o.id ? 'text-[#9ff6ff]' : 'text-muted-foreground hover:text-foreground'}`}>
          {o.label} <span className="font-mono text-[10px] opacity-70">{o.count}</span>
          {value === o.id && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#00ECFF] shadow-[0_0_8px_#00ECFF]" />}
        </button>
      ))}
    </div>
  );
}

/** Where somebody is, without the "In" in front. */
export const shortWhere = (s: string) => s.replace(/^In /, '');

/** One person who is here now. The picture has a ring in their status colour (and pulses while they talk). */
export function PersonRow({ avatar, name, isMe, color, statusLabel, where, speaking, sharing, recording, onOpen, actions }: {
  avatar: AvatarStyle;
  name: string;
  isMe: boolean;
  /** the status colour (green free, amber busy, red do not disturb) */
  color: string;
  /** shown only when it says something (not Available) */
  statusLabel: string | null;
  where: string;
  speaking: boolean;
  sharing: boolean;
  recording: boolean;
  onOpen: (e: React.MouseEvent) => void;
  actions: ReactNode;
}) {
  return (
    <div className="group relative flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-white/[0.045]">
      <button type="button" onClick={onOpen} title={isMe ? 'Your profile' : `See ${name}'s profile`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className={`relative shrink-0 rounded-full ${speaking ? 'animate-pulse' : ''}`} style={{ boxShadow: `0 0 0 2px ${speaking ? '#34d399' : color}, 0 0 12px ${speaking ? '#34d399' : color}66` }}>
          <AvatarFace avatar={avatar} size={32} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold leading-tight">{name}</span>
            {isMe && <span className="shrink-0 rounded bg-[#00ECFF]/15 px-1 text-[9px] font-bold uppercase tracking-wider text-[#9ff6ff]">you</span>}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0 opacity-60" /><span className="truncate">{where}</span>
          </span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1 group-hover:hidden group-focus-within:hidden">
        {sharing && <span title="Sharing their screen" className="flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-emerald-400"><MonitorUp className="h-3 w-3" />Live</span>}
        {recording && <span title="Recording a meeting" className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
        {statusLabel && <span className="rounded px-1 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ color, background: `${color}22` }}>{statusLabel}</span>}
      </span>
      {/* the few things you do with a person show on hover, over the right-hand end of the row */}
      <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-full bg-popover/95 px-1 py-0.5 shadow-md ring-1 ring-[#00ECFF]/25 backdrop-blur group-hover:flex group-focus-within:flex">{actions}</span>
    </div>
  );
}

/** Somebody who is not here: a small, dim line with when they were last here. */
export function OfflineRow({ avatar, name, seen, active, onOpen }: { avatar: AvatarStyle; name: string; seen: string; /** using the app somewhere else right now */ active?: boolean; onOpen: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" onClick={onOpen} title={`See ${name}'s profile`} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground">
      <span className="relative shrink-0"><AvatarFace avatar={avatar} size={22} dim={!active} />{active && <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border border-popover bg-[#00ECFF] shadow-[0_0_6px_#00ECFF]" />}</span>
      <span className="min-w-0 flex-1 truncate text-[12px]">{name}</span>
      <span className={`shrink-0 font-mono text-[9.5px] ${active ? 'text-[#9ff6ff]' : 'opacity-60'}`}>{active ? 'in the app' : seen}</span>
    </button>
  );
}

/** A room people can walk into: a lamp that is lit when somebody is in it, the name, a stack of the faces inside, and a lock if it is shut. */
export function PlaceRow({ name, kind, people, locked, onOpen }: {
  name: string;
  kind: 'meeting' | 'lounge' | string;
  people: { id: string; name: string; avatar: AvatarStyle }[];
  locked: boolean;
  onOpen: () => void;
}) {
  const Icon = kind === 'lounge' ? Sofa : DoorOpen;
  const busy = people.length > 0;
  const shown = people.slice(0, 3);
  return (
    <button type="button" onClick={onOpen} title={locked ? `${name} is locked` : `Go to ${name}`}
      className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors ${busy ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' : 'bg-white/[0.03] text-muted-foreground ring-white/10 group-hover:text-foreground'}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold leading-tight">{name}</span>
          {locked && <Lock className="h-3 w-3 shrink-0 text-amber-400" aria-label="Locked" />}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted-foreground">
          {busy ? (people.length === 1 ? `${people[0].name} is in` : `${people.length} people in`) : locked ? 'Locked' : 'Empty'}
        </span>
      </span>
      {busy && (
        <span className="flex shrink-0 items-center">
          {shown.map((p, i) => <span key={p.id} className="rounded-full ring-2 ring-popover" style={{ marginLeft: i ? -7 : 0 }}><AvatarFace avatar={p.avatar} size={20} /></span>)}
          {people.length > shown.length && <span className="ml-1 font-mono text-[10px] font-semibold text-emerald-300">+{people.length - shown.length}</span>}
        </span>
      )}
    </button>
  );
}

/** One of the office spaces you can switch to. The one you are in has a glowing edge. */
export function SpaceRow({ name, current, onOpen, actions }: { name: string; current: boolean; onOpen: () => void; actions?: ReactNode }) {
  return (
    <div className={`group relative flex items-center rounded-lg transition-colors hover:bg-white/[0.05] ${current ? 'bg-[#00ECFF]/[0.07]' : ''}`}>
      {current && <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-[#00ECFF] shadow-[0_0_8px_#00ECFF]" />}
      <button type="button" onClick={onOpen} aria-current={current ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1.5 text-left">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${current ? 'bg-[#00ECFF]/10 text-[#00ECFF] ring-[#00ECFF]/30' : 'bg-white/[0.03] text-muted-foreground ring-white/10'}`}><Building2 className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[12.5px] leading-tight ${current ? 'font-bold' : 'font-semibold'}`}>{name}</span>
          <span className="mt-0.5 block text-[10.5px] leading-tight text-muted-foreground">{current ? 'You are here' : 'Switch to this space'}</span>
        </span>
      </button>
      {actions}
    </div>
  );
}
