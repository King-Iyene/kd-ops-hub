import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';
import { BTN_ICON, BTN_MAIN, BTN_QUIET, SURFACE } from './ui';

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
  const w = 248;
  const h = 110;
  // beside the pointer, flipping to stay on screen
  const left = x + 16 + w > window.innerWidth - 8 ? Math.max(8, x - w - 16) : x + 16;
  const top = Math.max(8, Math.min(y - 12, window.innerHeight - h - 8));
  const main = actions.find((a) => a.primary) ?? null;
  const quiet = actions.filter((a) => a !== main && !a.compact);
  const icons = actions.filter((a) => a !== main && a.compact);
  return createPortal(
    <div className="ko fixed z-[64]" style={{ left, top, width: w }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className={`${SURFACE} animate-in fade-in zoom-in-95 p-3 duration-100`}>
        <div className="flex items-center gap-2.5">
          {avatar
            ? <AvatarFace avatar={avatar} size={38} />
            : <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-dashed border-white/20 text-base text-muted-foreground">+</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold leading-tight tracking-tight">{title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] leading-tight text-muted-foreground">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${owner ? 'bg-primary' : 'bg-emerald-500'}`} />
              <span className="truncate">{owner ? `Claimed by ${owner}` : note ?? 'Free to claim'}{locked ? ' · locked' : ''}</span>
            </p>
          </div>
        </div>
        {actions.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            {main && <button type="button" onClick={main.run} className={`${BTN_MAIN} min-w-0 flex-1`}>{main.icon}<span className="truncate">{main.label}</span></button>}
            {quiet.map((a) => <button key={a.key} type="button" onClick={a.run} className={`${BTN_QUIET} min-w-0 flex-1`}>{a.icon}<span className="truncate">{a.label}</span></button>)}
            {icons.map((a) => <button key={a.key} type="button" title={a.label} aria-label={a.label} onClick={a.run} className={BTN_ICON}>{a.icon as ReactNode}</button>)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
