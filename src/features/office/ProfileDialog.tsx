import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Clock, MapPin, X } from 'lucide-react';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';
import type { PresenceInfo } from './presenceState';

export interface ProfileAction { key: string; label: string; icon: ReactNode; run: () => void; primary?: boolean; off?: string }

/**
 * Someone's profile as a small card that opens right where you clicked (their desk, or their row in the list),
 * not a big window in the middle of the screen. Click anywhere else, or press Escape, to close it.
 *
 * Top to bottom: a banner glowing in their status colour, the picture in a ring of that colour, their name and role,
 * what they are doing and where, then the one thing you most likely want (a wide gold button) and the rest as small labelled tiles.
 */
export function ProfileDialog({ x, y, onClose, name, avatar, online, presence, status, where, role, actions }: {
  x: number;
  y: number;
  onClose: () => void;
  name: string;
  avatar: AvatarStyle | null;
  online: boolean;
  /** how they show up everywhere (in the Office, active in the app, away); when given it decides the dot and the words */
  presence?: PresenceInfo;
  status: string | null;
  where: string | null;
  /** their job title, such as "Finance" */
  role?: string | null;
  actions: ProfileAction[];
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const w = 288;
  // beside the list when opened from it, otherwise centred over what was clicked
  const left = x < 300 ? x + 24 : Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
  const pos = y > 300 ? { bottom: Math.max(8, window.innerHeight - y - 24) } : { top: Math.max(8, y - 12) };
  const away = presence ? presence.kind === 'offline' : !online;
  const color = presence ? presence.color : online ? '#34d399' : '#94a3b8';
  const words = presence ? (presence.kind === 'office' ? status ?? presence.label : presence.label) : online ? status ?? 'Available' : 'Offline';
  const main = actions.find((a) => a.primary && !a.off) ?? null;
  const rest = actions.filter((a) => a !== main);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[66]" onMouseDown={onClose} />
      <div className="ko fixed z-[67]" style={{ left, ...pos, width: w }} role="dialog" aria-label={`${name} profile`}>
        <div className="animate-in fade-in zoom-in-95 kd-card relative overflow-hidden rounded-2xl text-white duration-100">
          {/* the banner: a faint grid and a glow in their colour */}
          <div aria-hidden className="relative h-[68px]" style={{ background: `radial-gradient(90% 140% at 50% 120%, ${color}${away ? '22' : '55'}, transparent 70%)` }}>
            <div className="absolute inset-0 opacity-[0.22]" style={{ backgroundImage: 'linear-gradient(rgba(0,236,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(0,236,255,.35) 1px,transparent 1px)', backgroundSize: '16px 16px', maskImage: 'linear-gradient(180deg,#000,transparent)', WebkitMaskImage: 'linear-gradient(180deg,#000,transparent)' }} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          <div className="relative px-4 pb-4">
            <div className="-mt-10 flex items-end gap-3">
              {avatar && (
                <span className="relative shrink-0 rounded-full bg-[#052d3f] p-[3px]" style={{ boxShadow: `0 0 0 2px ${color}${away ? '66' : ''}, 0 0 22px ${color}${away ? '00' : '55'}` }}>
                  <AvatarFace avatar={avatar} size={64} dim={away} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#052d3f]" style={{ background: color }} aria-label={presence ? presence.label : online ? 'Online' : 'Offline'} />
                </span>
              )}
              {role ? <span className="mb-1 ml-auto rounded-md border border-[#D6AC50]/35 bg-[#D6AC50]/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#E6C275]">{role}</span> : null}
            </div>
            <p className="mt-2.5 truncate text-[16px] font-bold leading-tight tracking-tight">{name}</p>
            <p className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ color: away ? '#b6c7d0' : '#eafcff', background: `${color}${away ? '1c' : '26'}` }}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${away ? '' : 'animate-pulse'}`} style={{ background: color }} /><span className="truncate">{words}</span>
            </p>
            {online && where && <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[#9fc9d8]"><MapPin className="h-3 w-3 shrink-0 text-[#00ECFF]/70" /><span className="truncate">{where}</span></p>}
            {!online && <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-[#7fa9b9]"><Clock className="mt-px h-3 w-3 shrink-0" />Not in the office right now. Messages are saved for when they are back.</p>}
            {actions.length > 0 && (
              <div className="mt-3.5 space-y-2">
                {main && (
                  <button type="button" onClick={main.run} title={main.label} className="kd-gold inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold shadow-[0_6px_18px_-8px_rgba(214,172,80,.8)] transition hover:brightness-110 active:scale-[0.99]">{main.icon}{main.label}</button>
                )}
                {rest.length > 0 && (
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(rest.length, 4)}, minmax(0, 1fr))` }}>
                    {rest.map((a) => (
                      <button
                        key={a.key} type="button" disabled={!!a.off} title={a.off ?? a.label} onClick={a.run}
                        className="flex flex-col items-center gap-1 rounded-xl bg-[#00ECFF]/[0.08] px-1 py-1.5 text-[10.5px] font-semibold text-[#d8fbff] ring-1 ring-inset ring-[#00ECFF]/15 transition hover:-translate-y-px hover:bg-[#00ECFF]/[0.18] hover:ring-[#00ECFF]/40 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
                      ><span className="text-[#00ECFF]">{a.icon}</span><span className="max-w-full truncate">{a.label}</span></button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
