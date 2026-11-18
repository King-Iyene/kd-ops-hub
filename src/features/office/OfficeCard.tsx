import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';

export interface OfficeAction { key: string; label: string; icon: ReactNode; run: () => void; primary?: boolean }

/** A small card that appears when you rest the pointer on an office or a seat: who has it, and the few things you can do. */
export function OfficeCard({ x, y, title, kind, owner, avatar, locked, actions, onEnter, onLeave }: {
  x: number;
  y: number;
  title: string;
  kind: 'office' | 'seat';
  owner: string | null;
  avatar?: AvatarStyle;
  locked: boolean;
  actions: OfficeAction[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  const w = 232;
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 8));
  const top = Math.max(8, Math.min(y + 14, window.innerHeight - 150));
  return createPortal(
    <div className="fixed z-[64]" style={{ left, top, width: w }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="animate-in fade-in zoom-in-95 rounded-2xl border border-white/10 bg-popover/85 p-2.5 text-popover-foreground shadow-2xl backdrop-blur-xl duration-100">
        <div className="flex items-center gap-2.5">
          {avatar
            ? <AvatarFace avatar={avatar} size={34} />
            : <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-dashed text-lg text-muted-foreground">+</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">{title}</p>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {owner ? `${kind === 'seat' ? 'Seat' : 'Office'} of ${owner}` : `Free ${kind === 'seat' ? 'seat' : 'office'}`}
              {locked ? ' · locked' : ''}
            </p>
          </div>
        </div>
        {actions.length > 0 && (
          <div className="mt-2 flex gap-1.5">
            {actions.map((a) => (
              <button key={a.key} type="button" onClick={a.run} className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${a.primary ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted/70 hover:bg-muted'}`}>
                {a.icon}<span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
