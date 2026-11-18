import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';
import { BTN_ICON, SURFACE } from './ui';

export interface CardAction { key: string; label: string; icon: ReactNode; run: () => void; /** shown but greyed out, with why */ off?: string; primary?: boolean }

/**
 * The card that appears when you rest the pointer on someone: face, name, status, one clear main action
 * (wave if they are far, ring if you are close) and a few quiet icon buttons.
 */
export function PersonCard({ x, y, name, avatar, online, status, hint, actions, onEnter, onLeave }: {
  x: number;
  y: number;
  name: string;
  avatar: AvatarStyle;
  online: boolean;
  /** emoji and words, such as "🚀 Hustling mode" */
  status: string | null;
  /** one short line of advice */
  hint: string | null;
  actions: CardAction[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  const w = 252;
  // tucked against the pointer, so there is no gap to cross on the way to a button
  const left = x + 14 + w > window.innerWidth - 8 ? Math.max(8, x - w - 14) : x + 14;
  const top = Math.max(8, Math.min(y - 26, window.innerHeight - 200));
  const main = actions.find((a) => a.primary && !a.off) ?? null;
  const rest = actions.filter((a) => a !== main);
  return createPortal(
    <div className="ko fixed z-[65]" style={{ left, top, width: w }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className={`${SURFACE} animate-in fade-in zoom-in-95 p-3 duration-100`}>
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <AvatarFace avatar={avatar} size={46} dim={!online} />
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-popover ${online ? 'bg-emerald-500' : 'bg-slate-500'}`} aria-label={online ? 'Online' : 'Offline'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight tracking-tight">{name}</p>
            <p className="mt-0.5 truncate text-[12px] leading-tight text-muted-foreground">{online ? status ?? 'Available' : 'Offline'}</p>
          </div>
        </div>
        {hint && <p className="mt-2.5 text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
        {actions.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            {main && <button type="button" onClick={main.run} className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-white/90 px-3 text-xs font-semibold text-slate-900 transition-colors hover:bg-white">{main.icon}<span className="truncate">{main.label}</span></button>}
            {rest.map((a) => (
              <button key={a.key} type="button" disabled={!!a.off} title={a.off ?? a.label} aria-label={a.label} onClick={a.run} className={BTN_ICON}>{a.icon}</button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
