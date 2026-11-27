import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';
import type { PresenceInfo } from './presenceState';

export interface CardAction { key: string; label: string; icon: ReactNode; run: () => void; /** shown but greyed out, with why */ off?: string; primary?: boolean }

/**
 * The card that appears above someone (or above their desk) when you rest the pointer there, like Gather's:
 * the face sits on the top edge, then name, status and a row of round buttons (profile, wave, message...).
 * Offline owners get one too, so you can still open their profile or message them.
 */
export function PersonCard({ x, y, name, avatar, online, presence, status, sub, hint, actions, onEnter, onLeave }: {
  x: number;
  y: number;
  name: string;
  /** none for an office or seat nobody has yet */
  avatar: AvatarStyle | null;
  online: boolean;
  /** how they show up everywhere (in the Office, active in the app, away); when given it decides the dot and the words */
  presence?: PresenceInfo;
  /** emoji and words, such as "🚀 Hustling mode" */
  status: string | null;
  /** replaces the line under the name (such as "Free to claim") */
  sub?: string;
  /** one short line of advice (shown as a tooltip) */
  hint?: string | null;
  actions: CardAction[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  const w = 232;
  const left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
  // just above the pointer and overlapping it a little, so there is no gap to cross on the way up
  const above = y > 190;
  const pos = above ? { bottom: window.innerHeight - y - 20 } : { top: y + 40 };
  const away = presence ? presence.kind === 'offline' : !online;
  const color = presence ? presence.color : online ? '#34d399' : '#94a3b8';
  const words = sub ?? (presence ? (presence.kind === 'office' ? status ?? presence.label : presence.label) : online ? status ?? 'Available' : 'Offline');
  return createPortal(
    <div className="ko fixed z-[65]" style={{ left, ...pos, width: w }} onMouseEnter={onEnter} onMouseLeave={onLeave} title={hint ?? undefined}>
      <div className="relative pt-8">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
          {avatar
            ? <span className="block rounded-full bg-[#052d3f] p-[3px] drop-shadow-lg" style={{ boxShadow: `0 0 0 2px ${color}${away ? '66' : ''}, 0 0 18px ${color}${away ? '00' : '55'}` }}><AvatarFace avatar={avatar} size={56} dim={away} /></span>
            : <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[#D6AC50]/55 bg-[#052d3f] text-2xl text-[#E6C275]/80">+</span>}
        </div>
        <div className="animate-in fade-in zoom-in-95 kd-card relative overflow-hidden rounded-2xl px-3 pb-3 pt-10 text-center text-white duration-100">
          <p className="truncate text-[14.5px] font-bold leading-tight tracking-tight">{name}</p>
          <p className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ color: away ? '#b6c7d0' : '#eafcff', background: `${color}${away ? '1c' : '26'}` }}>
            {avatar && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${away ? '' : 'animate-pulse'}`} style={{ background: color }} aria-label={presence ? presence.label : online ? 'Online' : 'Offline'} />}
            <span className="truncate">{words}</span>
          </p>
          {actions.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {actions.map((a) => (
                <button
                  key={a.key} type="button" disabled={!!a.off} title={a.off ?? a.label} aria-label={a.label} onClick={a.run}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 ${a.primary && !a.off ? 'kd-gold shadow-[0_6px_16px_-8px_rgba(214,172,80,.9)] hover:brightness-110' : 'bg-[#00ECFF]/10 text-[#d8fbff] ring-1 ring-inset ring-[#00ECFF]/15 hover:bg-[#00ECFF]/20 hover:ring-[#00ECFF]/40'}`}
                >{a.icon}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
