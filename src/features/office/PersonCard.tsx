import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';

export interface CardAction { key: string; label: string; icon: ReactNode; run: () => void; /** shown but greyed out, with why */ off?: string; primary?: boolean }

/**
 * The card that appears when you hover someone: their face, name, whether they are here and what they are up to,
 * and what you can do right now (wave if they are far, ring if you are close, message, follow, go to).
 */
export function PersonCard({ x, y, name, avatar, online, status, hint, actions, onEnter, onLeave }: {
  x: number;
  y: number;
  name: string;
  avatar: AvatarStyle;
  online: boolean;
  /** emoji and words, such as "🚀 Hustling mode" */
  status: string | null;
  /** a line of advice such as "They are far away: wave and they will see you" */
  hint: string | null;
  actions: CardAction[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  const w = 248;
  const left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
  const top = Math.max(8, y - 168);
  return createPortal(
    <div className="fixed z-[65]" style={{ left, top, width: w }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="rounded-2xl border bg-popover p-3 text-popover-foreground shadow-2xl">
        <div className="flex items-center gap-3">
          <AvatarFace avatar={avatar} size={52} dim={!online} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-semibold">
              <span className="truncate">{name}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-label={online ? 'Online' : 'Offline'} />
            </p>
            <p className="truncate text-sm text-muted-foreground">{online ? status ?? 'Available' : 'Offline'}</p>
          </div>
        </div>
        {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <button key={a.key} type="button" disabled={!!a.off} title={a.off ?? a.label} onClick={a.run} aria-label={a.label}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${a.off ? 'cursor-not-allowed opacity-40' : a.primary ? 'border-primary bg-primary text-primary-foreground hover:opacity-90' : 'hover:bg-muted'}`}>
              {a.icon}<span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
