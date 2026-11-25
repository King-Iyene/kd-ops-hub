import { useState } from 'react';
import { Bell, ChevronDown, Download, Circle, DoorClosed, UserPlus, DoorOpen, Hammer, Lock, LockOpen, Minus, Palette, Pencil, Plus, Settings, Video, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MAX_STATUS_TEXT, STATUSES, STATUS_EMOJI, customStatusId, dotColor, statusOf } from './status';
import { AvatarFace } from './AvatarFace';
import { desktopDownload } from './desktopApp';
import type { AvatarStyle } from './world/types';
import { WeatherCard, phaseOf, seasonBadge } from './SkyPanel';
import { seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import type { Weather } from './world/weather';
import { LABEL, SURFACE } from './ui';

interface Props {
  name: string;
  skin: string;
  avatar: AvatarStyle;
  status: string;
  onStatus: (id: string) => void;
  /** start a focus session of this many minutes (status goes to Focusing, and back by itself) */
  onFocus?: (minutes: number) => void;
  /** minutes left in the running focus session, or null */
  focusLeft?: number | null;
  onAvatar: () => void;
  timeMode: TimeMode;
  seasonMode: SeasonMode;
  sound: boolean;
  onToggleSound: () => void;
  volume: number;
  onVolume: (v: number) => void;
  /** system notifications for rings, waves and messages */
  notify: { on: boolean; denied: boolean; supported: boolean; toggle: () => void; desktop: boolean };
  /** the weather where I am (my own choice of city, only for me) */
  myWeather: Weather | null;
  myPlace: string;
  onMyPlace: (id: string) => void;
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
  /** guests: open the panel, and how many are waiting at the door */
  onGuests: () => void;
  guestsWaiting: number;
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

type Tab = 'you' | 'space';

/**
 * The control panel, from the profile card at the left of the bottom bar. Two tabs:
 * You (status, avatar, your office, your sounds) and Space (tools and your view). The sky is set for everyone in Manage space.
 */
export function ProfileMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('you');
  const [customEmoji, setCustomEmoji] = useState('💬');
  const [customText, setCustomText] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const st = statusOf(p.status);
  const now = Date.now();
  const sky = skyState(p.timeMode, now);
  const season = seasonFor(p.seasonMode, now);
  const act = (fn: () => void) => () => { setOpen(false); fn(); };

  const tile = (key: string, icon: JSX.Element, title: string, text: string, run: () => void, tone: 'normal' | 'danger' = 'normal') => (
    <button key={key} type="button" onClick={act(run)} title={text} aria-label={`${title}. ${text}`}
      className={`group flex min-w-0 flex-col items-center justify-center gap-2.5 rounded-2xl px-3 py-4 text-center ring-1 transition duration-150 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 ${tone === 'danger' ? 'bg-red-500/[0.06] ring-red-500/25 hover:bg-red-500/[0.12]' : 'bg-white/[0.05] ring-white/[0.08] hover:bg-white/[0.09] hover:ring-white/20'}`}>
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl [&>svg]:h-6 [&>svg]:w-6 ${tone === 'danger' ? 'bg-red-500/15 text-red-400' : 'bg-primary/15 text-primary'}`}>{icon}</span>
      <span className="block max-w-full truncate text-[14px] font-bold tracking-tight">{title}</span>
    </button>
  );

  const tabs: { id: Tab; label: string }[] = [{ id: 'you', label: 'You' }, { id: 'space', label: 'Space' }];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 items-center gap-2 rounded-lg px-1.5 pr-2.5 text-left transition-colors hover:bg-muted" aria-label="Your profile, sky and settings">
          <span className="relative flex h-7 w-7 shrink-0">
            <AvatarFace avatar={p.avatar} size={28} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background transition-colors" style={{ background: dotColor(p.status) }} />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[8rem] truncate text-xs font-medium leading-tight">{p.name}</span>
            <span className="block max-w-[8rem] truncate text-[10px] leading-tight text-muted-foreground">{st ? st.label : 'Set a status'}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={12} onWheel={(e) => e.stopPropagation()} className={`ko ${SURFACE} w-[25rem] max-w-[calc(100vw-1rem)] overscroll-contain p-0`}>
        <div className="flex items-center gap-3 px-4 pt-4">
          <span className="relative flex h-12 w-12 shrink-0">
            <AvatarFace avatar={p.avatar} size={48} />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-popover transition-colors" style={{ background: dotColor(p.status) }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[15px] font-extrabold leading-tight tracking-tight">{p.name}</p>
              {<button type="button" title={`Download the KD Ops desktop app for ${desktopDownload().label}`} aria-label="Download the desktop app" onClick={() => { window.open(desktopDownload().url, '_blank', 'noopener'); }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-muted-foreground ring-1 ring-white/[0.08] transition hover:bg-white/[0.14] hover:text-foreground"><Download className="h-3.5 w-3.5" /></button>}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{st ? st.label : 'Available'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-white/[0.08]" title="The sky, the same for everyone">
            {phaseOf(sky.hour).icon}{p.myWeather ? `${p.myWeather.temp}°` : phaseOf(sky.hour).label}
            <span className="h-3 w-px bg-white/15" />{seasonBadge(season).icon}
          </div>
        </div>

        <div className="px-4 pt-3">
          <div className="flex rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/[0.06]">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition ${tab === t.id ? 'bg-white/[0.13] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain px-4 pb-4 pt-3.5">
          {tab === 'you' && (
            <div className="space-y-4">
              <div>
                <p className={`${LABEL} mb-1.5`}>Status</p>
                <div className="relative">
                  <button type="button" onClick={() => setStatusOpen((o) => !o)} aria-expanded={statusOpen}
                    className="flex h-10 w-full items-center gap-2 rounded-xl bg-white/[0.06] px-3 text-left text-[13px] font-semibold ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]">
                    {STATUSES.some((s) => s.id === (p.status || 'available')) ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(p.status || 'available') }} /> : <span className="text-[13px]">{st?.emoji}</span>}
                    <span className="min-w-0 flex-1 truncate">{st ? st.label : 'Available'}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${statusOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {statusOpen && (
                    <div className="mt-1 overflow-hidden rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                      {p.onFocus && (
                        <div className="mb-1 rounded-lg bg-[#00ECFF]/[0.07] p-2 ring-1 ring-inset ring-[#00ECFF]/15">
                          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#9ff6ff]">{p.focusLeft ? `Focusing · ${p.focusLeft} min left` : 'Focus session'}</p>
                          <div className="flex gap-1">
                            {[25, 50, 90].map((m) => <button key={m} type="button" onClick={() => { p.onFocus?.(m); setStatusOpen(false); }} className="flex-1 rounded-md bg-white/[0.08] py-1 text-[12px] font-semibold transition hover:bg-[#00ECFF]/20">{m}m</button>)}
                            {p.focusLeft ? <button type="button" onClick={() => { p.onFocus?.(0); setStatusOpen(false); }} className="rounded-md bg-white/[0.08] px-2 py-1 text-[12px] font-semibold transition hover:bg-red-500/25">End</button> : null}
                          </div>
                          <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">Rings and waves arrive silently, then you go back to Available on your own.</p>
                        </div>
                      )}
                      {STATUSES.map((s) => (
                        <button key={s.id} type="button" onClick={() => { p.onStatus(s.id); setStatusOpen(false); }} aria-pressed={p.status === s.id}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${p.status === s.id ? 'bg-primary/15 text-primary' : 'hover:bg-white/[0.08]'}`}>
                          {s.id === 'available' || s.id === 'busy' || s.id === 'dnd' ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(s.id) }} /> : <span className="text-[13px]">{s.emoji}</span>}<span className="flex-1">{s.label}</span>
                          {s.id === 'busy' && <span className="text-[10.5px] text-muted-foreground">Ctrl+I</span>}
                          {s.id === 'dnd' && <span className="text-[10.5px] text-muted-foreground">Ctrl+U</span>}
                          {s.id === 'available' && <span className="text-[10.5px] text-muted-foreground">Ctrl+O</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2.5 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.06]">
                  <p className="mb-1.5 text-[11.5px] font-semibold text-muted-foreground">Or write your own</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {STATUS_EMOJI.map((e) => (
                      <button key={e} type="button" aria-label={`Use ${e}`} aria-pressed={customEmoji === e} onClick={() => setCustomEmoji(e)} className={`flex h-7 w-7 items-center justify-center rounded-lg text-base transition ${customEmoji === e ? 'bg-primary/20 ring-1 ring-primary/50' : 'hover:bg-white/10'}`}>{e}</button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input value={customText} maxLength={MAX_STATUS_TEXT} onChange={(e) => setCustomText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { const id = customStatusId(customEmoji, customText); if (id) { p.onStatus(id); setCustomText(''); } } }}
                      placeholder="For example: Back at 2" className="h-8 min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2.5 text-[12.5px] outline-none ring-1 ring-white/[0.07] placeholder:text-muted-foreground focus:ring-primary/60" />
                    <button type="button" disabled={!customStatusId(customEmoji, customText)} onClick={() => { p.onStatus(customStatusId(customEmoji, customText)); setCustomText(''); }} className="h-8 rounded-lg bg-white/90 px-3 text-xs font-semibold text-slate-900 transition hover:bg-white disabled:opacity-40">Set</button>
                    {p.status && <button type="button" onClick={() => p.onStatus('')} className="h-8 rounded-lg bg-white/[0.07] px-2.5 text-xs font-semibold transition hover:bg-white/[0.13]">Clear</button>}
                  </div>
                </div>
              </div>
              <div>
                <p className={`${LABEL} mb-1.5`}>Weather where you are</p>
                <WeatherCard weather={p.myWeather} place={p.myPlace} onPlace={p.onMyPlace} />
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]" title="Water, fire, piano, pets, footsteps, rain and wind. Only for you.">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-semibold">{p.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}Office sounds</span>
                  <button type="button" role="switch" aria-checked={p.sound} onClick={p.onToggleSound} className={`relative h-5 w-9 rounded-full transition-colors ${p.sound ? 'bg-primary' : 'bg-white/15'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.sound ? 'left-[1.15rem]' : 'left-0.5'}`} />
                  </button>
                </div>
                <input type="range" min={0} max={100} value={Math.round(p.volume * 100)} disabled={!p.sound} onChange={(e) => p.onVolume(Number(e.target.value) / 100)} aria-label="Volume" className="mt-2.5 h-1 w-full cursor-pointer accent-primary disabled:opacity-40" />
              </div>
              {p.notify.supported && (
                <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]" title={p.notify.denied ? 'Blocked in your browser. Allow notifications for this site, then turn this on.' : p.notify.desktop ? 'Rings, waves and messages pop up on your desktop.' : 'Get a pop-up when someone rings, waves or messages you while this window is behind others.'}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[13px] font-semibold"><Bell className="h-4 w-4" />Notifications{p.notify.denied ? <span className="text-[11px] font-medium text-red-400">Blocked</span> : null}</span>
                    </span>
                    <button type="button" role="switch" aria-checked={p.notify.on} onClick={p.notify.toggle} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${p.notify.on ? 'bg-primary' : 'bg-white/15'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.notify.on ? 'left-[1.15rem]' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>
              )}
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

          {tab === 'space' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                {tile('guests', <UserPlus className="h-4 w-4" />, p.guestsWaiting ? `Guests (${p.guestsWaiting})` : 'Guests', p.guestsWaiting ? `${p.guestsWaiting} waiting at the door` : 'Invite visitors by email', p.onGuests)}
                {tile('download', <Download className="h-4 w-4" />, 'Get the desktop app', `For ${desktopDownload().label}: KD Ops and the Office in one app`, () => { window.open(desktopDownload().url, '_blank', 'noopener'); })}
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
