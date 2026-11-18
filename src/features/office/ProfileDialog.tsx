import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { AvatarStyle } from './world/types';
import { AvatarFace } from './AvatarFace';

export interface ProfileAction { key: string; label: string; icon: ReactNode; run: () => void; primary?: boolean; off?: string }

/**
 * Someone's profile: their face, whether they are around, where, and the things you can do right away
 * (wave, ring, message, go to them). Offline people can still be messaged.
 */
export function ProfileDialog({ open, onClose, name, avatar, online, status, where, actions }: {
  open: boolean;
  onClose: () => void;
  name: string;
  avatar: AvatarStyle | null;
  online: boolean;
  status: string | null;
  where: string | null;
  actions: ProfileAction[];
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="ko w-[calc(100vw-2rem)] max-w-sm gap-0 overflow-hidden rounded-3xl border-white/10 p-0 md:max-w-sm">
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <DialogDescription className="sr-only">Profile and quick actions for {name}</DialogDescription>
        <div className="flex flex-col items-center bg-gradient-to-b from-primary/15 to-transparent px-6 pb-4 pt-8 text-center">
          <div className="relative">
            {avatar && <AvatarFace avatar={avatar} size={84} dim={!online} />}
            <span className={`absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-popover ${online ? 'bg-emerald-500' : 'bg-slate-500'}`} aria-label={online ? 'Online' : 'Offline'} />
          </div>
          <p className="mt-3 max-w-full truncate text-lg font-extrabold tracking-tight">{name}</p>
          <p className="mt-0.5 max-w-full truncate text-[13px] text-muted-foreground">{online ? status ?? 'Available' : 'Offline'}{online && where ? ` · ${where}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-1">
          {actions.map((a) => (
            <button
              key={a.key} type="button" disabled={!!a.off} title={a.off} onClick={a.run}
              className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${a.primary ? 'bg-white/90 text-slate-900 hover:bg-white' : 'bg-white/[0.07] hover:bg-white/[0.13]'}`}
            >
              {a.icon}<span className="truncate">{a.label}</span>
            </button>
          ))}
        </div>
        {!online && <p className="px-6 pb-5 text-center text-xs text-muted-foreground">They are not in the office right now. Messages are saved and they will see them when they are back.</p>}
      </DialogContent>
    </Dialog>
  );
}
