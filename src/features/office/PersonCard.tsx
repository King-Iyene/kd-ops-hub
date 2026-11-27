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
  const w = 216;
  const left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
  // just above the pointer and overlapping it a little, so there is no gap to cross on the way up
  const above = y > 190;
  const pos = above ? { bottom: window.innerHeight - y - 20 } : { top: y + 40 };
  return createPortal(
    <div className="ko fixed z-[65]" style={{ left, ...pos, width: w }} onMouseEnter={onEnter} onMouseLeave={onLeave} title={hint ?? undefined}>
      <div className="relative pt-7">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 drop-shadow-lg">{avatar ? <AvatarFace avatar={avatar} size={56} dim={presence ? presence.kind === 'offline' : !online} /> : <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[#00ECFF]/40 bg-[#052d3f] text-2xl text-[#9ff6ff]/60">+</span>}</div>
        <div className="animate-in fade-in zoom-in-95 kd-card relative overflow-hidden rounded-2xl px-3 pb-3 pt-9 text-center text-white duration-100">
          <p className="truncate text-[14px] font-bold leading-tight">
            {name}{avatar && <span className={`ml-1.5 inline-block h-2 w-2 rounded-full align-middle ${presence ? '' : online ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.22)]' : 'bg-slate-400'}`} style={presence ? { background: presence.color, boxShadow: presence.kind === 'offline' ? undefined : `0 0 0 3px ${presence.color}38` } : undefined} aria-label={presence ? presence.label : online ? 'Online' : 'Offline'} />}
          </p>
          <p className="mt-0.5 truncate text-[12px] leading-tight text-[#9fc9d8]">{sub ?? (presence ? (presence.kind === 'office' ? status ?? presence.label : presence.label) : online ? status ?? 'Available' : 'Offline')}</p>
          {actions.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {actions.map((a) => (
                <button
                  key={a.key} type="button" disabled={!!a.off} title={a.off ?? a.label} aria-label={a.label} onClick={a.run}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl hover:-translate-y-px transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${a.primary && !a.off ? 'kd-gold hover:brightness-110' : 'bg-[#00ECFF]/10 text-[#d8fbff] ring-1 ring-inset ring-[#00ECFF]/15 hover:bg-[#00ECFF]/20'}`}
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
