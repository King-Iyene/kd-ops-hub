import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';
import type { PresenceInfo } from './presenceState';

export interface ProfileAction { key: string; label: string; icon: ReactNode; run: () => void; primary?: boolean; off?: string }

/**
 * Someone's profile as a small card that opens right where you clicked (their desk, or their row in the list),
 * not a big window in the middle of the screen. Click anywhere else, or press Escape, to close it.
 */
export function ProfileDialog({ x, y, onClose, name, avatar, online, presence, status, where, actions }: {
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
  actions: ProfileAction[];
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const w = 252;
  // beside the list when opened from it, otherwise centred over what was clicked
  const left = x < 300 ? x + 24 : Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
  const pos = y > 230 ? { bottom: window.innerHeight - y + 12 } : { top: y + 14 };
  return createPortal(
    <>
      <div className="fixed inset-0 z-[66]" onMouseDown={onClose} />
      <div className="ko fixed z-[67]" style={{ left, ...pos, width: w }} role="dialog" aria-label={`${name} profile`}>
        <div className="animate-in fade-in zoom-in-95 kd-card relative overflow-hidden rounded-2xl p-3 text-white duration-100">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          <div className="flex items-center gap-3 pr-5">
            <div className="relative shrink-0">
              {avatar && <AvatarFace avatar={avatar} size={48} dim={presence ? presence.kind === 'offline' : !online} />}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#052d3f] ${presence ? '' : online ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.22)]' : 'bg-slate-400'}`} style={presence ? { background: presence.color, boxShadow: presence.kind === 'offline' ? undefined : `0 0 0 3px ${presence.color}38` } : undefined} aria-label={presence ? presence.label : online ? 'Online' : 'Offline'} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold leading-tight">{name}</p>
              <p className="mt-0.5 truncate text-[12px] leading-tight text-[#9fc9d8]">{presence ? (presence.kind === 'office' ? status ?? presence.label : presence.label) : online ? status ?? 'Available' : 'Offline'}</p>
              {online && where && <p className="truncate text-[11px] leading-tight text-[#7fa9b9]">{where}</p>}
            </div>
          </div>
          {actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {actions.map((a) => (
                <button
                  key={a.key} type="button" disabled={!!a.off} title={a.off ?? a.label} onClick={a.run}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${a.primary && !a.off ? 'kd-gold hover:brightness-110' : 'bg-[#00ECFF]/10 text-[#d8fbff] ring-1 ring-inset ring-[#00ECFF]/15 hover:bg-[#00ECFF]/20'}`}
                >{a.icon}{a.label}</button>
              ))}
            </div>
          )}
          {!online && <p className="mt-2.5 text-[11px] leading-snug text-[#7fa9b9]">Not in the office right now. Messages are saved and they will see them when they are back.</p>}
        </div>
      </div>
    </>,
    document.body,
  );
}
