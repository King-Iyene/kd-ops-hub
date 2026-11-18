import { Circle, DoorClosed, DoorOpen, Settings, Lock, Minus, Moon, Palette, Pencil, Plus, Sun } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { STATUSES, statusOf } from './status';

interface Props {
  name: string;
  skin: string;
  status: string;
  onStatus: (id: string) => void;
  onAvatar: () => void;
  bright: boolean;
  onToggleBright: () => void;
  zoom: number;
  onZoom: (delta: number) => void;
  traySize: 0 | 1 | 2;
  onTraySize: (s: 0 | 1 | 2) => void;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  canRecord: boolean;
  onRecordings: () => void;
  canSettings: boolean;
  onSettings: () => void;
  /** my private office (its name), if I have claimed one */
  myOffice: string | null;
  /** I have claimed an office but am not a builder: I can decorate it */
  canCustomiseMine: boolean;
  onCustomiseMine: () => void;
  onClaimOffice: () => void;
  onUnclaimOffice: () => void;
  onWalkToOffice: () => void;
  isMyOffice: boolean;
  officeLocked: boolean;
  onOfficeLock: () => void;
}

/**
 * Everything that used to sit in the page header, in one place: a small profile card at the left of the bottom bar.
 * Click it for status, avatar, zoom, day or night, editing, recordings and locking your office.
 */
export function ProfileMenu(p: Props) {
  const st = statusOf(p.status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-8 items-center gap-2 rounded-lg px-1.5 pr-2.5 text-left transition-colors hover:bg-muted" aria-label="Your profile and settings">
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-slate-900" style={{ background: p.skin }}>
            {p.name.slice(0, 1).toUpperCase()}
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500" />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[8rem] truncate text-xs font-medium leading-tight">{p.name}</span>
            <span className="block max-w-[8rem] truncate text-[10px] leading-tight text-muted-foreground">{st ? `${st.emoji} ${st.label}` : 'Set a status'}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="text-xs">Status</DropdownMenuLabel>
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => p.onStatus(s.id)} className={p.status === s.id ? 'bg-muted font-medium' : ''}>
            <span className="mr-2">{s.emoji}</span>{s.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {p.myOffice ? (
          <>
            <DropdownMenuItem onSelect={p.onWalkToOffice}><DoorOpen className="mr-2 h-4 w-4" />Walk to my office <span className="ml-auto text-xs text-muted-foreground">Ctrl+D</span></DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onUnclaimOffice}><DoorClosed className="mr-2 h-4 w-4" />Unclaim my office</DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={p.onClaimOffice}><DoorOpen className="mr-2 h-4 w-4" />Claim a free office</DropdownMenuItem>
        )}
        {p.canCustomiseMine && <DropdownMenuItem onSelect={p.onCustomiseMine}><Pencil className="mr-2 h-4 w-4" />Customise my office</DropdownMenuItem>}
        <DropdownMenuItem onSelect={p.onAvatar}><Palette className="mr-2 h-4 w-4" />Customise avatar</DropdownMenuItem>
        <DropdownMenuItem onSelect={p.onToggleBright}>{p.bright ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}{p.bright ? 'Night office' : 'Bright office'}</DropdownMenuItem>
        <div className="flex items-center justify-between px-2 py-1.5 text-sm">
          <span>Video size</span>
          <span className="flex gap-1">
            {(['S', 'M', 'L'] as const).map((l, i) => (
              <button key={l} type="button" onClick={() => p.onTraySize(i as 0 | 1 | 2)} aria-label={`Video size ${l}`} className={`flex h-6 w-6 items-center justify-center rounded border text-xs ${p.traySize === i ? 'border-primary bg-primary/15 text-primary' : 'hover:bg-muted'}`}>{l}</button>
            ))}
          </span>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 text-sm">
          <span>Zoom {Math.round(p.zoom * 100)}%</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => p.onZoom(-0.2)} aria-label="Zoom out" className="flex h-6 w-6 items-center justify-center rounded border hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => p.onZoom(0.2)} aria-label="Zoom in" className="flex h-6 w-6 items-center justify-center rounded border hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
          </span>
        </div>
        {(p.canEdit && !p.editing) || p.canRecord || p.canSettings || p.isMyOffice ? <DropdownMenuSeparator /> : null}
        {p.canEdit && !p.editing && <DropdownMenuItem onSelect={p.onEdit}><Pencil className="mr-2 h-4 w-4" />Edit this office</DropdownMenuItem>}
        {p.isMyOffice && <DropdownMenuItem onSelect={p.onOfficeLock}><Lock className="mr-2 h-4 w-4" />{p.officeLocked ? 'Unlock my office' : 'Lock my office'}</DropdownMenuItem>}
        {p.canSettings && <DropdownMenuItem onSelect={p.onSettings}><Settings className="mr-2 h-4 w-4" />Office settings</DropdownMenuItem>}
        {p.canRecord && <DropdownMenuItem onSelect={p.onRecordings}><Circle className="mr-2 h-3.5 w-3.5 fill-red-500 text-red-500" />Recordings</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
