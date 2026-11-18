import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';

export interface OfficeAction { key: string; label: string; icon: ReactNode; run: () => void; primary?: boolean; /** icon only */ compact?: boolean }

/** A small card right beside the pointer when you rest it on an office or a seat: who has it, and what you can do. */
export function OfficeCard({ x, y, title, kind, owner, avatar, locked, note, actions, onEnter, onLeave }: {
  x: number;
  y: number;
  title: string;
  kind: 'office' | 'seat';
  owner: string | null;
  avatar?: AvatarStyle;
  locked: boolean;
  /** a short line instead of the default one (such as why you cannot claim it) */
  note?: string;
  actions: OfficeAction[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  // centred just above the pointer (it overlaps the pointer a little, so there is no gap to cross on the way up)
  const w = 300;
  const left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
  const above = y > 80;
  const pos = above ? { bottom: window.innerHeight - y - 24 } : { top: y + 18 };
  return createPortal(
    <div className="ko fixed z-[64] flex justify-center" style={{ left, ...pos, width: w }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="animate-in fade-in slide-in-from-bottom-1 flex items-center gap-2 rounded-2xl bg-black/60 py-1.5 pl-2 pr-1.5 text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md duration-100">
        {avatar
          ? <AvatarFace avatar={avatar} size={28} />
          : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-white/30 text-sm text-white/60">+</span>}
        <div className="min-w-0 max-w-[9.5rem] pr-1">
          <p className="truncate text-[12.5px] font-bold leading-tight">{title}</p>
          <p className="truncate text-[10.5px] leading-tight text-white/60">{owner ? `Claimed by ${owner}` : note ?? 'Free to claim'}{locked ? ' · locked' : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          {actions.map((a) => (
            <button key={a.key} type="button" title={a.label} aria-label={a.label} onClick={a.run}
              className="group flex h-7 items-center rounded-full bg-white/10 px-2 text-white transition-colors hover:bg-white/20">
              {a.icon}
              <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-semibold opacity-0 transition-all duration-150 group-hover:ml-1.5 group-hover:max-w-[6rem] group-hover:opacity-100">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
