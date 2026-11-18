import { useState } from 'react';
import { Circle, DoorClosed, DoorOpen, Hammer, Lock, LockOpen, Minus, Palette, Pencil, Plus, Settings, Video } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { STATUSES, statusOf } from './status';
import { SkyPanel, phaseOf, seasonBadge } from './SkyPanel';
import { seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import type { Weather } from './world/weather';
import { LABEL, SURFACE } from './ui';

interface Props {
  name: string;
  skin: string;
  status: string;
  onStatus: (id: string) => void;
  onAvatar: () => void;
  timeMode: TimeMode;
  onTimeMode: (m: TimeMode) => void;
  seasonMode: SeasonMode;
  onSeasonMode: (m: SeasonMode) => void;
  sound: boolean;
  onToggleSound: () => void;
  volume: number;
  onVolume: (v: number) => void;
  weather: Weather | null;
  place: string;
  onPlace: (id: string) => void;
  zoom: number;
  onZoom: (delta: number) => void;
  traySize: 0 | 1 | 2 | 3;
  onTraySize: (s: 0 | 1 | 2 | 3) => void;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  canRecord: boolean;
  onRecordings: () => void;
  canSettings: boolean;
  onSettings: () => void;
  canManage: boolean;
  onManage: () => void;
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

type Tab = 'you' | 'sky' | 'space';

/**
 * The control panel, from the profile card at the left of the bottom bar. Three tabs:
 * You (status, avatar, your office), Sky and sound (live weather, hour, season, sounds) and Space (tools and view).
 */
export function ProfileMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('you');
  const st = statusOf(p.status);
  const now = Date.now();
  const sky = skyState(p.timeMode, now);
  const season = seasonFor(p.seasonMode, now, p.weather);
  const act = (fn: () => void) => () => { setOpen(false); fn(); };

  const tile = (key: string, icon: JSX.Element, title: string, text: string, run: () => void, tone: 'normal' | 'danger' = 'normal') => (
    <button key={key} type="button" onClick={act(run)}
      className={`group flex min-w-0 items-start gap-2.5 rounded-xl p-3 text-left ring-1 transition ${tone === 'danger' ? 'bg-red-500/[0.05] ring-red-500/20 hover:bg-red-500/10' : 'bg-white/[0.04] ring-white/[0.07] hover:bg-white/[0.08] hover:ring-white/15'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone === 'danger' ? 'bg-red-500/15 text-red-400' : 'bg-primary/15 text-primary'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold tracking-tight">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{text}</span>
      </span>
    </button>
  );

  const tabs: { id: Tab; label: string }[] = [{ id: 'you', label: 'You' }, { id: 'sky', label: 'Sky and sound' }, { id: 'space', label: 'Space' }];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 items-center gap-2 rounded-lg px-1.5 pr-2.5 text-left transition-colors hover:bg-muted" aria-label="Your profile, sky and settings">
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-slate-900" style={{ background: p.skin }}>
            {p.name.slice(0, 1).toUpperCase()}
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500" />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[8rem] truncate text-xs font-medium leading-tight">{p.name}</span>
            <span className="block max-w-[8rem] truncate text-[10px] leading-tight text-muted-foreground">{st ? `${st.emoji} ${st.label}` : 'Set a status'}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={12} className={`ko ${SURFACE} w-[25rem] max-w-[calc(100vw-1rem)] p-0`}>
        <div className="flex items-center gap-3 px-4 pt-4">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-slate-900" style={{ background: p.skin }}>
            {p.name.slice(0, 1).toUpperCase()}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-popover bg-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold leading-tight tracking-tight">{p.name}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{st ? `${st.emoji} ${st.label}` : 'Available'}</p>
          </div>
          <button type="button" onClick={() => setTab('sky')} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-white/[0.08] transition hover:bg-white/[0.12]" title="Weather and sky">
            {phaseOf(sky.hour).icon}{p.weather ? `${p.weather.temp}°` : phaseOf(sky.hour).label}
            <span className="h-3 w-px bg-white/15" />{seasonBadge(season).icon}
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/[0.06]">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition ${tab === t.id ? 'bg-white/[0.13] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="max-h-[min(60vh,32rem)] overflow-y-auto px-4 pb-4 pt-3.5">
          {tab === 'you' && (
            <div className="space-y-4">
              <div>
                <p className={`${LABEL} mb-1.5`}>Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button key={s.id} type="button" onClick={() => p.onStatus(s.id)} aria-pressed={p.status === s.id}
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${p.status === s.id ? 'bg-primary/15 text-primary ring-primary/40' : 'bg-white/[0.04] ring-white/[0.08] hover:bg-white/[0.09]'}`}>
                      <span>{s.emoji}</span>{s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {tile('avatar', <Palette className="h-4 w-4" />, 'Avatar', 'Hair, clothes, accessories', p.onAvatar)}
                {p.myOffice
                  ? tile('walk', <DoorOpen className="h-4 w-4" />, 'My office', 'Walk there (Ctrl+D)', p.onWalkToOffice)
                  : tile('claim', <DoorOpen className="h-4 w-4" />, 'Claim an office', 'Take a free one', p.onClaimOffice)}
                {p.canCustomiseMine && tile('cust', <Pencil className="h-4 w-4" />, 'Decorate', 'Add and move things in it', p.onCustomiseMine)}
                {p.isMyOffice && tile('lock', p.officeLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />, p.officeLocked ? 'Unlock' : 'Lock', p.officeLocked ? 'Let people walk in' : 'Visitors must knock', p.onOfficeLock)}
                {p.myOffice && tile('give', <DoorClosed className="h-4 w-4" />, 'Give up office', 'Free it for someone else', p.onUnclaimOffice, 'danger')}
              </div>
            </div>
          )}

          {tab === 'sky' && (
            <SkyPanel timeMode={p.timeMode} seasonMode={p.seasonMode} onTime={p.onTimeMode} onSeason={p.onSeasonMode} sound={p.sound} onSound={p.onToggleSound} volume={p.volume} onVolume={p.onVolume} weather={p.weather} place={p.place} onPlace={p.onPlace} />
          )}

          {tab === 'space' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                {p.canManage && tile('manage', <Settings className="h-4 w-4" />, 'Manage space', 'Offices, seats, people', p.onManage)}
                {p.canEdit && !p.editing && tile('edit', <Hammer className="h-4 w-4" />, 'Edit the space', 'Objects, walls, floors', p.onEdit)}
                {p.canSettings && tile('settings', <Settings className="h-4 w-4" />, 'Permissions', 'Builders and recorders', p.onSettings)}
                {p.canRecord && tile('rec', <Video className="h-4 w-4" />, 'Recordings', 'Watch and download', p.onRecordings)}
              </div>
              <div className="space-y-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">Video bubble size</span>
                  <span className="flex gap-1 rounded-lg bg-white/[0.05] p-0.5">
                    {(['S', 'M', 'L', 'XL'] as const).map((l, i) => (
                      <button key={l} type="button" onClick={() => p.onTraySize(i as 0 | 1 | 2 | 3)} aria-label={`Video size ${l}`} className={`flex h-6 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-bold ${p.traySize === i ? 'bg-white/[0.15]' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
                    ))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">Zoom {Math.round(p.zoom * 100)}%</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => p.onZoom(-0.2)} aria-label="Zoom out" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.12]"><Minus className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => p.onZoom(0.2)} aria-label="Zoom in" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.12]"><Plus className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
              </div>
              {!p.canManage && !p.canEdit && !p.canSettings && !p.canRecord && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Circle className="h-2 w-2 fill-current" />Admins manage the space; you can change the view here.</p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
