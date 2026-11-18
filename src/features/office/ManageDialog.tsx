import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, CloudSun, Footprints, Hammer, MoreHorizontal, Pencil, Search, Settings, Trash2, UserMinus, UserPlus, Users, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BTN_MAIN, BTN_QUIET, LABEL } from './ui';

export interface Claimable { id: string; name: string; kind: 'office' | 'seat'; owner: string | null }

export type ManageTab = 'places' | 'people' | 'tools' | 'sky' | 'space';
type Tab = ManageTab;

/**
 * One calm place to run the space. Offices are rows; the 24 desk seats are a compact grid of chips (a seat shows its owner,
 * or a plus when free) so nothing repeats down the page.
 */
export function ManageDialog({ open, onClose, startTab, skyPanel, spaceName, isAdmin, isSuper, canEdit, canDelete, rows, onAssign, onUnclaim, onRename, onWalk, onInvite, onSettings, onEdit, onRecordings, onRenameSpace, onDeleteSpace, onNewSpace }: {
  open: boolean;
  onClose: () => void;
  /** which tab to open on */
  startTab?: ManageTab;
  /** the sky controls (time of day, season, place) for the whole office */
  skyPanel?: ReactNode;
  spaceName: string;
  isAdmin: boolean;
  isSuper: boolean;
  canEdit: boolean;
  canDelete: boolean;
  rows: Claimable[];
  onAssign: (id: string) => void;
  onUnclaim: (id: string) => void;
  onRename: (id: string) => void;
  onWalk: (id: string) => void;
  onInvite: () => void;
  onSettings: () => void;
  onEdit: () => void;
  onRecordings: () => void;
  onRenameSpace: () => void;
  onDeleteSpace: () => void;
  onNewSpace: () => void;
}) {
  const [tab, setTab] = useState<Tab>(startTab ?? 'places');
  useEffect(() => { if (open) setTab(startTab ?? 'places'); }, [open, startTab]);
  const [q, setQ] = useState('');
  const offices = useMemo(() => rows.filter((r) => r.kind === 'office'), [rows]);
  const seats = useMemo(() => rows.filter((r) => r.kind === 'seat'), [rows]);
  const match = (r: Claimable) => { const n = q.trim().toLowerCase(); return !n || r.name.toLowerCase().includes(n) || (r.owner ?? '').toLowerCase().includes(n); };
  const taken = (list: Claimable[]) => list.filter((r) => r.owner).length;
  const go = (fn: () => void) => () => { onClose(); fn(); };

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'places', label: 'Places', icon: <Building2 className="h-3.5 w-3.5" /> },
    { id: 'people', label: 'People', icon: <Users className="h-3.5 w-3.5" /> },
    { id: 'tools', label: 'Tools', icon: <Hammer className="h-3.5 w-3.5" /> },
    ...(isAdmin ? [{ id: 'sky' as Tab, label: 'Sky', icon: <CloudSun className="h-3.5 w-3.5" /> }] : []),
    { id: 'space', label: 'Space', icon: <Settings className="h-3.5 w-3.5" /> },
  ];

  const rowMenu = (r: Claimable) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Options for ${r.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="ko w-48">
        <DropdownMenuItem onSelect={go(() => onWalk(r.id))}><Footprints className="mr-2 h-4 w-4" />Walk there</DropdownMenuItem>
        {isAdmin && <DropdownMenuItem onSelect={go(() => onAssign(r.id))}><UserPlus className="mr-2 h-4 w-4" />{r.owner ? 'Change who has it' : 'Assign to someone'}</DropdownMenuItem>}
        {isAdmin && <DropdownMenuItem onSelect={go(() => onRename(r.id))}><Pencil className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>}
        {isAdmin && r.owner && <><DropdownMenuSeparator /><DropdownMenuItem className="text-red-500 focus:text-red-500" onSelect={() => onUnclaim(r.id)}><UserMinus className="mr-2 h-4 w-4" />Free it up</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const stat = (label: string, used: number, total: number) => (
    <div className="flex-1 rounded-xl bg-white/[0.04] px-3.5 py-2.5 ring-1 ring-white/[0.06]">
      <p className={LABEL}>{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tracking-tight">{used}<span className="text-sm font-semibold text-muted-foreground"> / {total} taken</span></p>
    </div>
  );

  const tile = (icon: JSX.Element, title: string, text: string, run: () => void) => (
    <button type="button" onClick={go(run)} className="group flex min-w-0 items-start gap-3 rounded-xl bg-white/[0.04] p-3.5 text-left ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:ring-white/15">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold tracking-tight">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{text}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex max-h-[86vh] w-[calc(100vw-2rem)] md:max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl border-white/[0.08] bg-popover/95 p-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-2xl">
        <DialogHeader className="space-y-1 px-6 pb-4 pt-6 text-left">
          <DialogTitle className="text-xl font-extrabold tracking-tight">Manage {spaceName}</DialogTitle>
          <DialogDescription className="text-[13px]">Offices, seats, people and tools in one place.</DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <div className="inline-flex rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/[0.06]">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${tab === t.id ? 'bg-white/[0.12] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {tab === 'places' && (
            <div className="space-y-5">
              <div className="flex gap-3">
                {stat('Offices', taken(offices), offices.length)}
                {stat('Seats', taken(seats), seats.length)}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an office, seat or person" className="h-9 w-full rounded-xl bg-white/[0.05] pl-9 pr-3 text-[13px] outline-none ring-1 ring-white/[0.07] placeholder:text-muted-foreground focus:ring-primary/60" />
              </div>

              <div>
                <p className={`${LABEL} mb-2`}>Private offices</p>
                <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.07]">
                  {offices.filter(match).map((r, i) => (
                    <div key={r.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i ? 'border-t border-white/[0.06]' : ''}`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${r.owner ? 'bg-primary' : 'bg-emerald-500'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">{r.owner ? `Claimed by ${r.owner}` : 'Free to claim'}</span>
                      </span>
                      {isAdmin && !r.owner && <button type="button" onClick={go(() => onAssign(r.id))} className={BTN_QUIET}>Assign</button>}
                      {rowMenu(r)}
                    </div>
                  ))}
                  {offices.filter(match).length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No office matches.</p>}
                </div>
              </div>

              <div>
                <p className={`${LABEL} mb-2`}>Desk seats</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {seats.filter(match).map((r, i) => (
                    <DropdownMenu key={r.id}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className={`min-w-0 rounded-xl px-3 py-2 text-left ring-1 transition hover:bg-white/[0.08] ${r.owner ? 'bg-primary/10 ring-primary/30' : 'bg-white/[0.03] ring-white/[0.07]'}`}>
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seat {r.id.replace('seat-', '') || i + 1}</span>
                          <span className={`block truncate text-[13px] font-semibold ${r.owner ? '' : 'text-muted-foreground'}`}>{r.owner ?? 'Free'}</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="ko w-48">
                        <DropdownMenuItem onSelect={go(() => onWalk(r.id))}><Footprints className="mr-2 h-4 w-4" />Walk there</DropdownMenuItem>
                        {isAdmin && <DropdownMenuItem onSelect={go(() => onAssign(r.id))}><UserPlus className="mr-2 h-4 w-4" />{r.owner ? 'Change who has it' : 'Assign to someone'}</DropdownMenuItem>}
                        {isAdmin && r.owner && <DropdownMenuItem className="text-red-500 focus:text-red-500" onSelect={() => onUnclaim(r.id)}><UserMinus className="mr-2 h-4 w-4" />Free it up</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'people' && (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">KDS administration and directors are in the office. Everyone else comes by invite.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {isAdmin && tile(<UserPlus className="h-4 w-4" />, 'Invite people', 'Add employees who are not in an admin pay group.', onInvite)}
                {isAdmin && tile(<Settings className="h-4 w-4" />, 'Builders and recorders', 'Choose who can edit the space and who can record.', onSettings)}
              </div>
              {!isAdmin && <p className="text-xs text-muted-foreground">Only admins can change who is in the office.</p>}
            </div>
          )}

          {tab === 'tools' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {canEdit && tile(<Hammer className="h-4 w-4" />, 'Edit the space', 'Objects, walls, floors and name plates.', onEdit)}
                {tile(<Video className="h-4 w-4" />, 'Recordings', 'Watch and download recorded meetings.', onRecordings)}
                {isAdmin && tile(<Settings className="h-4 w-4" />, 'Permissions and limits', 'Builders, recorders and furniture limit.', onSettings)}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">Walk up to the core values wall, the notice board or the wall clock and press F to edit what they say.</p>
            </div>
          )}

          {tab === 'sky' && isAdmin && (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">Set the sky for everyone in the office: the time of day, the season and the weather's location.</p>
              {skyPanel}
            </div>
          )}

          {tab === 'space' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {isSuper && tile(<Pencil className="h-4 w-4" />, 'Rename this space', 'Change the name people see.', onRenameSpace)}
                {isAdmin && tile(<Building2 className="h-4 w-4" />, 'Create another space', 'A blank space you can build from scratch.', onNewSpace)}
              </div>
              {isSuper && canDelete && (
                <div className="rounded-xl bg-red-500/[0.06] p-3.5 ring-1 ring-red-500/20">
                  <p className="text-sm font-bold text-red-400">Delete this space</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Removes the space and everything built in it. This cannot be undone.</p>
                  <button type="button" onClick={go(onDeleteSpace)} className={`${BTN_MAIN} mt-2.5 bg-red-600 hover:bg-red-600`}><Trash2 className="h-3.5 w-3.5" />Delete space</button>
                </div>
              )}
              {!isAdmin && <p className="text-xs text-muted-foreground">Only admins can change the space itself.</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
