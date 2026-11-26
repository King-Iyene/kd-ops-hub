import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, RotateCw, Undo2 as UndoIcon, Redo2 as RedoIcon, X as CloseIcon, Save as SaveIcon, Map as MapIcon, BellRing, Download, Hand, MoreHorizontal, Settings, Building2, ChevronDown, Link as LinkIcon, UserPlus, Volume2, VolumeX, Pencil, Trash2, Minus, Plus, Footprints, LocateFixed, Lock, MessageCircle, Mic, Search, Video, Users, UserCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OfficeCanvas } from './OfficeCanvas';
import { EditorPanel, type EditTool } from './EditorPanel';
import { RoomNameDialog, type RoomOverride } from './RoomNameDialog';
import { OfficeSettingsDialog } from './OfficeSettingsDialog';
import { DeskDialog } from './DeskDialog';
import { AvatarDialog, LOOKS } from './AvatarDialog';
import { supabase } from '@/lib/supabase';
import { ToastAction } from '@/components/ui/toast';
import { type Msg } from './MessageDialog';
import { ChatDialog } from './ChatDialog';
import { allowed, canDo } from './OfficeSettingsDialog';
import { desktopDownload, inDesktopApp } from './desktopApp';
import { useDesktopMini } from './useDesktopMini';
import { markOfficeAlive, setOfficeHere } from '@/lib/officeAlive';
import { isHeld, useVehicles } from './useVehicles';
import { ProfileDialog, type ProfileAction } from './ProfileDialog';
import { VisitorsDialog } from './guest/VisitorsDialog';
import { useGuestInvites } from './guest/useGuestInvites';
import { ALL, isPicture, safeFileName, shouldNotify, useChat, type ChatMsg } from './chat';
import { playChime, playRecordingCue, playRing, playWave } from './chime';
import { canSendTo, cleanText, matches, parsePing } from './social';
import { CallDock } from './calls/CallDock';
import { MeetingView } from './calls/MeetingView';
import { ProfileMenu } from './ProfileMenu';
import { statusOf, dotColor } from './status';
import { canEnter as canEnterRoom, lockedRooms, occupants, parseDoor, pruneAdmitted, shouldTakeOver } from './calls/locks';
import { useCalls } from './calls/useCalls';
import { useRecorder } from './calls/useRecorder';
import { RecordingsDialog } from './calls/RecordingsDialog';
import { useOffice } from './useOffice';
import { AvatarFace } from './AvatarFace';
import { InviteDialog } from './InviteDialog';
import { ManageDialog, type Claimable, type ManageTab } from './ManageDialog';
import { petBus, petCmdFor, petName, petRegistry } from './world/pets';
import { seenLabel } from './lastSeen';
import { useKeepSeen, useLastSeen } from './useLastSeen';
import { PersonCard, type CardAction } from './PersonCard';
import { SkyControl } from './SkyControl';
import { SkyPanel } from './SkyPanel';
import { ambient } from './ambient';
import { GamesDialog } from './GamesDialog';
import { TownHallBanner, TownHallDialog } from './TownHall';
import { ReactionWheel } from './ReactionWheel';
import { MiniGamesDialog, type MiniGame } from './MiniGamesDialog';
import { PollsDialog, TaskBoardDialog } from './BoardDialogs';
import { useBoards } from './useBoards';
import { EventsDialog } from './EventsDialog';
import { isLive, upcoming, useOfficeLife } from './useOfficeLife';
import { gamesOn } from './games';
import { useOfficeFont } from './ui';
import { notifyPing, useMissedReset, useNotifySetting, isDesktopApp } from './notify';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_PLACE, PLACES, fetchWeather } from './world/weather';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ensurePersonalOffice, useOfficeMembers, useOfficeDecor, useDeskClaims, useDirectory, useMyAvatar, useOfficeMutations, useSpaces, type SpaceRow } from './data';
import { buildTemplate, type TemplateName } from './world/templates';
import { ITEM_DEFS, applyTileEdits, canPlace, isRoom, wallBetween, itemCells, itemSize, newItemId, sanitizeItems, zoneAt } from './world/world';
import { defaultAvatar, officeInfo } from './world/render';
import { BoardDialog, ClockDialog, type BoardData } from './Interact';
import { cleanZones } from './world/clock';
import { skyState, type SeasonMode, type TimeMode } from './world/sky';
import type { AvatarStyle, Item, TileEdits, Zone } from './world/types';


/**
 * The people / rooms / spaces list. It lives in the app's main left sidebar (under "Virtual Office") so the map gets the whole page;
 * when that sidebar is collapsed or on a phone it stays beside the map as before.
 */
function SlotAside({ slot, children }: { slot: HTMLElement | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (slot) return createPortal(<div className="flex flex-col gap-4 px-3 pb-3 pt-2">{children}</div>, slot);
  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-3 md:flex">{children}</aside>
      {/* on a phone there is no room beside the map: the same lists open from a button */}
      <button type="button" onClick={() => setOpen(true)} className="ko fixed left-3 top-[4.75rem] z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-background/85 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md md:hidden"><Users className="h-3.5 w-3.5" />People and rooms</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex h-[85vh] w-[calc(100vw-1rem)] flex-col gap-4 overflow-y-auto rounded-3xl p-4 md:hidden">
          <DialogTitle className="sr-only">People and rooms</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** True when someone can be reached right now: no status, or Available. */
const isFreeStatus = (id: unknown) => !id || id === 'available';

/** A sidebar section title you can click to fold the list away (so there is room for other things). */
function SecHead({ id, shut, flip, children }: { id: string; shut: (id: string) => boolean; flip: (id: string) => void; children: ReactNode }) {
  const closed = shut(id);
  return (
    <button type="button" onClick={() => flip(id)} aria-expanded={!closed} className="mb-1.5 flex w-full items-center gap-1.5 border-b border-primary/15 pb-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-primary/80 transition-colors hover:text-primary">
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${closed ? '-rotate-90' : ''}`} />
      <span className="flex items-center gap-1.5">{children}</span>
    </button>
  );
}

/** Focusing or in a meeting: rings and waves arrive without a sound. */
function quietNow(): boolean {
  try { const s = localStorage.getItem('kd:office:status'); return s === 'focus' || s === 'meeting' || s === 'dnd'; } catch { return false; }
}

/** On Do not disturb: nobody can ring or wave at me, and nothing of the kind reaches me. */
function dndNow(): boolean {
  try { return localStorage.getItem('kd:office:status') === 'dnd'; } catch { return false; }
}

function OfficeRoom() {
  useOfficeFont();
  useMissedReset();
  const notify = useNotifySetting();
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { data: spaces } = useSpaces();
  const { data: directory } = useDirectory();
  const { data: lastSeen } = useLastSeen();
  useKeepSeen(profile?.id);
  const { data: myAvatar } = useMyAvatar(profile?.id);
  const actions = useOfficeMutations();

  const me = useMemo(() => {
    if (!profile) return null;
    return {
      id: profile.id,
      // the full name, as it is on the profile
      name: (profile.full_name || profile.email || 'Me').split(' ').filter(Boolean).join(' '),
      avatar: myAvatar ?? defaultAvatar(profile.id),
    };
  }, [profile, myAvatar]);

  // My character: chosen in the avatar menu, worn only while I have it on (key C). It is never saved over my real look:
  // it only changes what is drawn and what the others are told, and it is gone when I press C again or leave.
  const [charId, setCharIdState] = useState<string | null>(null);
  const [charOn, setCharOn] = useState(false);
  useEffect(() => {
    if (!profile?.id) return;
    try { setCharIdState(localStorage.getItem(`kd:office:character:${profile.id}`)); } catch { /* none chosen */ }
  }, [profile?.id]);
  const chooseCharacter = (id: string | null) => {
    setCharIdState(id);
    try { if (profile?.id) { if (id) localStorage.setItem(`kd:office:character:${profile.id}`, id); else localStorage.removeItem(`kd:office:character:${profile.id}`); } } catch { /* fine */ }
  };
  const charLook = useMemo(() => LOOKS.find((l) => l.id === charId) ?? null, [charId]);
  const meLive = useMemo(() => {
    if (!me || !charOn || !charLook) return me;
    return { ...me, avatar: { ...me.avatar, ...charLook.apply(me.avatar) } as AvatarStyle };
  }, [me, charOn, charLook]);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  // make sure my personal office exists (the database also creates it automatically)
  const provisioned = useRef(false);
  useEffect(() => {
    if (profile?.id && !provisioned.current) {
      provisioned.current = true;
      void ensurePersonalOffice(profile.id);
    }
  }, [profile?.id]);

  const myPersonal = spaces?.find((s) => s.kind === 'personal' && s.owner_id === profile?.id) ?? null;
  const teamSpaces = spaces?.filter((s) => s.kind === 'team') ?? [];
  // for now everyone shares one office (other spaces, such as a bigger one for leadership, come later)
  const myTeam = teamSpaces.find((s) => s.name.toLowerCase().includes('kd squares')) ?? teamSpaces[0] ?? null;

  const [spaceId, setSpaceIdRaw] = useState<string | null>(null);
  // every way of changing office goes through here, so a locked personal office stops visitors (guard set below)
  const enterGuard = useRef<(id: string | null) => void>((id) => setSpaceIdRaw(id));
  const setSpaceId = useCallback((id: string | null) => enterGuard.current(id), []);
  const lastTeam = useRef<string | null>(null);
  useEffect(() => {
    if (!spaceId && myTeam) setSpaceId(myTeam.id);
  }, [spaceId, myTeam]);

  const space: SpaceRow | null = spaces?.find((s) => s.id === spaceId) ?? null;
  useEffect(() => { if (space?.kind === 'team') lastTeam.current = space.id; }, [space]);

  const template: TemplateName = space ? (space.layout?.template ?? space.kind) : 'team';
  // names on the plates: who was assigned to each private office, else the leaders in order; meeting rooms can be renamed
  const [overrides, setOverrides] = useState<Record<string, RoomOverride>>({});
  const savedOverrides = space?.layout?.rooms;
  useEffect(() => { setOverrides(savedOverrides ?? {}); }, [savedOverrides]);
  // who has claimed each private office (people claim and unclaim; an admin can also assign or revoke)
  const { data: claims } = useDeskClaims(space?.id ?? null);
  const plateTable = useMemo(() => Array.from({ length: 33 }, (_, i) => {
    const id = i < 9 ? 'office-' + (i + 1) : 'seat-' + (i - 8);
    const o = overrides[id];
    if (o?.free) return undefined;
    if (o?.label) return { name: o.label };
    const c = (claims ?? []).find((x) => x.office_id === id);
    const p = c ? (directory ?? []).find((d) => d.id === c.user_id) : undefined;
    return p ? { name: p.name, avatar: p.avatar } : undefined;
  }), [overrides, claims, directory]);
  const plateKey = plateTable.map((p) => (p ? p.name + JSON.stringify(p.avatar ?? '') : '-')).join('|') + JSON.stringify(Object.entries(overrides).filter(([k]) => k.startsWith('meeting') || k === 'boardroom' || k === 'auditorium' || k === 'lounge' || k === 'music'));
  // the shared office is the headquarters; the older plain layouts stay available
  const baseMap = useMemo(() => {
    const m = buildTemplate(template === 'team' ? 'hq' : template, plateTable);
    if (template !== 'team') return m;
    return { ...m, zones: m.zones.map((z) => (overrides[z.id]?.label && z.kind !== 'office' ? { ...z, name: overrides[z.id].label as string } : z)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, plateKey]);
  // walls and floors painted by an admin (saved with the office); while editing, the draft is shown
  const savedTiles = space?.layout?.tiles;
  const [tileDraft, setTileDraft] = useState<TileEdits | undefined>(undefined);
  const [tilesEditing, setTilesEditing] = useState(false);
  const map = useMemo(() => applyTileEdits(baseMap, tilesEditing ? tileDraft : savedTiles), [baseMap, tilesEditing, tileDraft, savedTiles]);
  const savedItems = useMemo(
    () => (space && Array.isArray(space.layout?.items) ? sanitizeItems(map, space.layout.items) : map.items),
    [space, map],
  );
  // each private office shows what its owner put there (the building's own furniture fills the rest)
  const { data: decor } = useOfficeDecor(space?.id ?? null);
  const composedItems = useMemo(() => {
    let list = savedItems;
    for (const z of map.zones) {
      if (z.kind !== 'office' || !decor?.[z.id]) continue;
      const inside = (i: Item) => i.x >= z.x && i.x < z.x + z.w && i.y >= z.y && i.y < z.y + z.h;
      list = [...list.filter((i) => !inside(i)), ...sanitizeItems(map, decor[z.id]).filter(inside)];
    }
    return list;
  }, [savedItems, decor, map]);

  const { connId, multi, superseded, claim, ghosts, roster, connected, peers, update, announce, setRecording, setLocked, setStatus, setRiding, setDancing, setGhost, setTownHall, setTownMuted, mine, sendRtc, setRtcHandler, sendDoor, setDoorHandler, sendPing, setPingHandler, sendSpeaking, peerTalking, sendEmote, emotes, sendPet, petInbox } = useOffice(meLive, space?.id ?? null);

  // ---- voice and video (who hears whom is decided in calls/rules.ts) ----
  const meetingIds = useMemo(() => new Set(map.zones.filter((z) => isRoom(z)).map((z) => z.id)), [map]);
  const roomRef = useRef<string | null>(null);
  /** the meeting room I have locked, if any */
  const myLockRoom = useRef<string | null>(null);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const myLiveRef = useRef(false);
  const townMutedRef2 = useRef(false);
  const calls = useCalls({
    meId: connId,
    spaceId: space?.id ?? null,
    roster,
    peerIds: () => [...peers.current.keys()].filter((id) => !ghosts.current.has(id)),
    lookup: (id) => {
      const pm = peers.current.get(id);
      if (!pm) return null;
      const dt = Math.min(4, (Date.now() - pm.at) / 1000);
      const x = pm.x + pm.vx * dt;
      const y = pm.y + pm.vy * dt;
      // which meeting room they are in comes from where they stand, so privacy never depends on the online list
      const z = zoneAt(map, x, y);
      const r = rosterRef.current.find((q) => q.id === id);
      return { x, y, room: z && isRoom(z) ? z.id : null, live: !!r?.live, townMuted: !!r?.townMuted };
    },
    occluded: (a, b) => wallBetween(map.walls, a.x, a.y, b.x, b.y),
    self: () => ({ x: mine.current.m.x, y: mine.current.m.y, room: roomRef.current, live: myLiveRef.current, townMuted: townMutedRef2.current }),
    send: sendRtc,
    setHandler: setRtcHandler,
  });

  // ---- editing furniture ----
  const canEdit = !!space && (space.kind === 'personal' ? space.owner_id === profile?.id || isAdmin : isAdmin || (template !== 'hq' && template !== 'team' && allowed(space.layout?.settings?.buildersMode, space.layout?.settings?.builders, profile?.id)));
  const [editing, setEditing] = useState(false);
  // the version of the space I started editing from: if somebody else saves meanwhile, I am told straight away
  const editBase = useRef<string | null>(null);
  const [draft, setDraft] = useState<Item[]>([]);
  const [tool, setTool] = useState<EditTool>(null);
  /** a piece of furniture picked up with the Move tool, and which of its tiles was grabbed */
  const [held, setHeld] = useState<{ item: Item; dx: number; dy: number; copy?: boolean } | null>(null);
  // undo and redo: every change to the furniture while editing can be stepped back and forward (Ctrl+Z, Ctrl+Y)
  const hist = useRef<{ past: Item[][]; future: Item[][]; last: Item[] | null; skip: boolean }>({ past: [], future: [], last: null, skip: false });
  const [histTick, setHistTick] = useState(0);
  useEffect(() => { if (tool !== 'move') setHeld(null); }, [tool]);
  useEffect(() => {
    if (!held) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHeld(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [held]);
  const [rot, setRot] = useState<0 | 1 | 2 | 3>(0);
  useEffect(() => {
    const h = hist.current;
    if (!editing) { h.past = []; h.future = []; h.last = null; h.skip = false; return; }
    if (h.skip) { h.skip = false; h.last = draft; return; }
    if (h.last && h.last !== draft) { h.past.push(h.last); if (h.past.length > 100) h.past.shift(); h.future = []; setHistTick((n) => n + 1); }
    h.last = draft;
  }, [draft, editing]);
  const undo = () => { const h = hist.current; const prev = h.past.pop(); if (!prev) return; h.future.push(draft); h.skip = true; setDraft(prev); setHeld(null); setHistTick((n) => n + 1); };
  const redo = () => { const h = hist.current; const next = h.future.pop(); if (!next) return; h.past.push(draft); h.skip = true; setDraft(next); setHeld(null); setHistTick((n) => n + 1); };
  const duplicate = () => { if (held) setHeld({ item: { ...held.item, id: newItemId() }, dx: held.dx, dy: held.dy, copy: true }); };
  /** turn the piece being carried a quarter turn (or, when carrying nothing, the way the next piece will be placed) */
  const turnHeld = () => { if (held) setHeld({ ...held, item: { ...held.item, r: (((held.item.r ?? 0) + 1) % 4) as 0 | 1 | 2 | 3 } }); else setRot((r) => (((r + 1) % 4) as 0 | 1 | 2 | 3)); };
  /** throw away the piece being carried */
  const deleteHeld = () => { if (!held) return; if (!held.copy) setDraft((d) => d.filter((i) => i.id !== held.item.id)); setHeld(null); };
  const editKeys = useRef<{ undo: () => void; redo: () => void; duplicate: () => void; turnHeld: () => void; deleteHeld: () => void; holding: boolean; cancel: () => void }>({ undo, redo, duplicate, turnHeld, deleteHeld, holding: false, cancel: () => undefined });
  editKeys.current = { undo, redo, duplicate, turnHeld, deleteHeld, holding: !!held, cancel: () => undefined };
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) editKeys.current.redo(); else editKeys.current.undo(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); editKeys.current.redo(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); editKeys.current.duplicate(); }
      else if (k === 'r' && !e.ctrlKey && !e.metaKey) editKeys.current.turnHeld();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && editKeys.current.holding) { e.preventDefault(); editKeys.current.deleteHeld(); }
      else if (e.key === 'Escape' && !editKeys.current.holding) editKeys.current.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);
  const [color, setColor] = useState<number | undefined>(undefined);
  const [floorKind, setFloorKind] = useState('wood');
  const [brush, setBrush] = useState<1 | 3>(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const isSuper = profile?.role === 'super_admin';
  const [renaming, setRenaming] = useState<SpaceRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const removeSpace = async (sp: SpaceRow) => {
    if (!window.confirm('Delete "' + sp.name + '"? Everything built in it is removed and this cannot be undone.')) return;
    try {
      await actions.deleteSpace(sp.id);
      if (space?.id === sp.id) setSpaceId(myTeam?.id ?? null);
      toast({ title: 'Space deleted' });
    } catch (err) { toast({ title: 'Could not delete', description: errorMessage(err), variant: 'destructive' }); }
  };
  const [newSpaceName, setNewSpaceName] = useState('');
  const [deskZone, setDeskZone] = useState<Zone | null>(null);
  const [deskBusy, setDeskBusy] = useState(false);
  const myClaim = (claims ?? []).find((c) => c.user_id === profile?.id) ?? null;
  const ownerOf = (officeId: string) => {
    const c = (claims ?? []).find((x) => x.office_id === officeId);
    return c ? (directory ?? []).find((p) => p.id === c.user_id) ?? null : null;
  };
  const [savingSettings, setSavingSettings] = useState(false);
  const [nameZone, setNameZone] = useState<{ id: string; name: string; kind: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing || !editBase.current || !space?.updated_at || space.updated_at === editBase.current) return;
    editBase.current = space.updated_at;
    toast({ title: 'Someone else just saved changes to this space', description: 'You can keep going. When you save you will be asked first, so nothing of theirs is lost by accident.' });
  }, [editing, space?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = editing ? draft : composedItems;
  const [scope, setScope] = useState<Zone | null>(null);
  const inScope = (i: { x: number; y: number }) => !scope || (i.x >= scope.x && i.x < scope.x + scope.w && i.y >= scope.y && i.y < scope.y + scope.h);
  const OFFICE_LIMIT = 40;

  const startEdit = (only?: Zone) => { setTilesEditing(true); setTileDraft(savedTiles ?? { wallsOn: [], wallsOff: [], floors: {} }); setScope(only ?? null); setDraft(composedItems.map((i) => ({ ...i }))); setHeld(null); setTool('move'); editBase.current = space?.updated_at ?? null; setEditing(true); };
  const stopEdit = () => { setTilesEditing(false); setTileDraft(undefined); setEditing(false); setScope(null); setTool(null); setNameZone(null); setOverrides(savedOverrides ?? {}); };
  useEffect(() => { stopEdit(); }, [spaceId]);
  // leaving the editor: if nothing was changed it closes straight away, otherwise ONE question (keep editing is the safe default)
  const [discardOpen, setDiscardOpen] = useState(false);
  const editDirty = () => {
    if (hist.current.past.length > 0) return true;
    if (tileDraft && JSON.stringify(tileDraft) !== JSON.stringify(savedTiles ?? { wallsOn: [], wallsOff: [], floors: {} })) return true;
    return JSON.stringify(overrides) !== JSON.stringify(savedOverrides ?? {});
  };
  const requestCancel = () => { if (editDirty()) setDiscardOpen(true); else stopEdit(); };
  editKeys.current.cancel = requestCancel;

  const itemAt = (tile: { x: number; y: number }) => {
    const hits = draft.filter((i) => itemCells(i).some((c) => c.x === tile.x && c.y === tile.y));
    return hits.find((i) => i.t !== 'rug') ?? hits[0] ?? null;
  };
  /** paint walls or floors under the brush */
  const paintTiles = (tile: { x: number; y: number }) => {
    const r = brush === 3 ? 1 : 0;
    setTileDraft((d) => {
      const cur = d ?? { wallsOn: [], wallsOff: [], floors: {} };
      const on = new Set(cur.wallsOn);
      const off = new Set(cur.wallsOff);
      const floors = { ...cur.floors };
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = tile.x + dx;
          const y = tile.y + dy;
          if (x < 0 || y < 0 || x >= baseMap.w || y >= baseMap.h) continue;
          const i = y * baseMap.w + x;
          if (tool === 'wall') { on.add(i); off.delete(i); }
          else if (tool === 'unwall') { off.add(i); on.delete(i); }
          else if (tool === 'floor') floors[x + ',' + y] = floorKind;
        }
      }
      return { wallsOn: [...on], wallsOff: [...off], floors };
    });
  };
  const ghost = (tile: { x: number; y: number }) => {
    if (tool === 'wall' || tool === 'unwall' || tool === 'floor') return { ok: true };
    if (tool === 'plate') { const z = zoneAt(map, tile.x + 0.5, tile.y + 0.5); return { ok: !!z && (z.kind === 'office' || z.kind === 'meeting') }; }
    if (scope && !inScope(tile)) return { ok: false };
    if (tool === 'move') {
      if (!held) return { ok: !!itemAt(tile) };
      const moved = { ...held.item, x: tile.x - held.dx, y: tile.y - held.dy };
      return { ok: inScope(moved) && canPlace(map, draft.filter((i) => i.id !== held.item.id), moved).ok };
    }
    if (tool === 'erase' || tool === 'paint') return { ok: !!itemAt(tile) };
    if (!tool) return { ok: false };
    return { ok: canPlace(map, draft, { id: 'g', t: tool, x: tile.x, y: tile.y, r: rot }).ok };
  };
  const onTile = (tile: { x: number; y: number }) => {
    if (!editing || !tool) return;
    if (scope && !inScope(tile)) { toast({ title: 'Only inside your own office', variant: 'destructive' }); return; }
    if (tool === 'wall' || tool === 'unwall' || tool === 'floor') { if (!scope && isAdmin) paintTiles(tile); else if (!isAdmin) toast({ title: 'Walls and floors are for admins', description: 'You can still place and move furniture.' }); return; }
    if (tool === 'move') {
      if (!held) {
        const hit = itemAt(tile);
        if (hit) setHeld({ item: hit, dx: tile.x - hit.x, dy: tile.y - hit.y });
        return;
      }
      const moved = { ...held.item, x: tile.x - held.dx, y: tile.y - held.dy };
      if (!inScope(moved)) { toast({ title: 'Only inside your own office', variant: 'destructive' }); return; }
      const res = canPlace(map, draft.filter((i) => i.id !== held.item.id), moved);
      if (!res.ok) { toast({ title: 'reason' in res ? res.reason : 'It does not fit there', variant: 'destructive' }); return; }
      if (held.copy) { setDraft((d) => [...d, moved]); setHeld({ ...held, item: { ...held.item, id: newItemId() } }); return; }
      setDraft((d) => d.map((i) => (i.id === held.item.id ? moved : i)));
      setHeld(null);
      return;
    }
    if (tool === 'erase') {
      const hit = itemAt(tile);
      if (hit) setDraft((d) => d.filter((i) => i.id !== hit.id));
      return;
    }
    if (tool === 'plate') {
      const z = zoneAt(map, tile.x + 0.5, tile.y + 0.5);
      if (z && (z.kind === 'office' || z.kind === 'meeting')) setNameZone({ id: z.id, name: z.name, kind: z.kind });
      return;
    }
    if (tool === 'paint') {
      const hit = itemAt(tile);
      if (hit) setDraft((d) => d.map((i) => {
        if (i.id !== hit.id) return i;
        const { c: _old, ...rest } = i;
        return color === undefined ? rest : { ...rest, c: color };
      }));
      return;
    }
    const item: Item = { id: newItemId(), t: tool, x: tile.x, y: tile.y, r: rot, ...(color !== undefined ? { c: color } : {}) };
    if (scope && draft.filter(inScope).length >= OFFICE_LIMIT) { toast({ title: `Your office is full (${OFFICE_LIMIT} things)`, description: 'Remove something to add something new.', variant: 'destructive' }); return; }
    const res = canPlace(map, draft, item);
    if (!res.ok) { toast({ title: 'reason' in res ? res.reason : 'Cannot place that here', variant: 'destructive' }); return; }
    setDraft((d) => [...d, item]);
  };
  const save = async () => {
    if (!space) return;
    setSaving(true);
    try {
      if (scope) {
        // an owner saves only their own office
        await actions.saveDecor(space.id, scope.id, draft.filter(inScope), profile?.id);
        toast({ title: 'Looking good. Your office is saved.' });
        stopEdit();
        return;
      }
      // keep following the template's furniture unless it was really changed
      const limit = space.layout?.settings?.maxItems;
      if (!isAdmin && limit && draft.length > limit) {
        toast({ title: `Too much furniture (${draft.length} of ${limit} allowed)`, description: 'Remove a few things or ask an admin to raise the limit.', variant: 'destructive' });
        setSaving(false);
        return;
      }
      const changed = JSON.stringify(draft) !== JSON.stringify(map.items);
      // walls and floors are the building: only an admin's changes to them are saved, everybody else's save keeps what is already there
      await actions.saveLayout(space, template, changed ? draft : undefined, overrides, isAdmin ? tileDraft : savedTiles);
      // offices decorated by their owners keep following what the owner sees, so keep them in step
      for (const z of map.zones) if (z.kind === 'office' && decor?.[z.id]) await actions.saveDecor(space.id, z.id, draft.filter((i) => i.x >= z.x && i.x < z.x + z.w && i.y >= z.y && i.y < z.y + z.h), profile?.id);
      toast({ title: 'Space saved', description: 'Everyone sees the new look right away.' });
      stopEdit();
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ---- avatar ----
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // ---- where am I, doors ----
  const [zone, setZone] = useState<Zone | null>(null);
  const onZone = (z: Zone | null) => {
    setZone(z);
    roomRef.current = z && isRoom(z) ? z.id : null;
    // a lock only lasts while its holder stands in that room
    if (myLockRoom.current && roomRef.current !== myLockRoom.current) { setLocked(false); myLockRoom.current = null; }
    announce(z && z.kind !== 'portal' ? z.id : null);
  };
  const onPortal = (target: 'team' | 'mine') => {
    if (target === 'mine' && myPersonal) setSpaceId(myPersonal.id);
    if (target === 'team') setSpaceId(lastTeam.current ?? myTeam?.id ?? null);
  };

  // ---- recording (only designated people; the whole room is told) ----
  // admins record, plus anyone an admin added under Office settings (the database enforces the same rule)
  const canRecord = isAdmin || allowed(space?.layout?.settings?.recordersMode, space?.layout?.settings?.recorders, profile?.id);
  const meetingRoom = zone && isRoom(zone) ? { id: zone.id, name: zone.name } : null;
  const mapCanvas = useRef<HTMLCanvasElement | null>(null);
  const recorder = useRecorder({
    meId: me?.id ?? null,
    spaceId: space?.id ?? null,
    canRecord,
    joined: calls.joined,
    room: meetingRoom,
    getStreams: calls.audioStreams,
    getNames: () => [me?.name ?? 'Me', ...calls.tiles.map((t) => t.name)],
    // the recording is a video of the office as you see it (people, camera bubbles and all), with everyone's voices
    getVideoTrack: () => { try { return mapCanvas.current?.captureStream(24).getVideoTracks()[0] ?? null; } catch { return null; } },
    announce: setRecording,
  });
  const recorders = meetingRoom ? roster.filter((r) => r.rec && r.spaceId === space?.id && r.zone === meetingRoom.id) : [];
  const savedRef = useRef(0);
  useEffect(() => {
    if (recorder.saved > savedRef.current) toast({ title: 'Recording saved', description: 'Open Recordings in your profile menu to listen or download it.' });
    savedRef.current = recorder.saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.saved]);
  const recNotice = recorders.length
    ? recorders.some((r) => r.id === connId)
      ? 'You are recording this meeting. Everyone in the room can see this.'
      : `This room is being recorded by ${recorders.map((r) => r.name).join(', ')}.`
    : null;
  // a sound for everyone in the room when a recording starts or stops, so nobody is recorded without knowing
  const wasRecording = useRef(false);
  useEffect(() => {
    const now = recorders.length > 0;
    if (now !== wasRecording.current) { wasRecording.current = now; playRecordingCue(now); }
  }, [recorders.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  // like Gather: on arrival, offer to turn the camera and microphone on (once per visit)
  const [joinPrompt, setJoinPrompt] = useState(() => { try { return !localStorage.getItem('kd:office:prompted'); } catch { return true; } });
  const closeJoinPrompt = () => { setJoinPrompt(false); try { localStorage.setItem('kd:office:prompted', '1'); } catch { /* fine */ } };
  // like Gather: if the browser has already decided about the microphone, join the call by ourselves
  // (allowed: speak and listen; blocked: listen only). Only a first-time visitor sees the question above.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || !me) return;
    autoJoined.current = true;
    navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((st) => {
      if (st.state === 'granted' || st.state === 'denied') {
        closeJoinPrompt();
        // you always arrive with the microphone and the camera OFF; turn them on yourself when you want to
        void calls.join();
      }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);
  // the camera and microphone always start off, whatever was chosen last time
  const joinWith = async () => {
    closeJoinPrompt();
    await calls.join();
  };

  // ---- locking meeting rooms (rules in calls/locks.ts) ----
  const locked = useMemo(() => lockedRooms(roster, space?.id ?? null, meetingIds), [roster, space?.id, meetingIds]);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const admitted = useRef(new Set<string>());
  const prevLocked = useRef<{ space: string | null; rooms: Set<string> }>({ space: null, rooms: new Set() });
  const unlockedAt = useRef(new Map<string, number>());
  const lastKnock = useRef(new Map<string, number>());
  const [knocks, setKnocks] = useState<{ id: string; name: string; room: string }[]>([]);
  const roomLocked = !!meetingRoom && locked.has(meetingRoom.id);

  useEffect(() => {
    admitted.current = pruneAdmitted(admitted.current, locked);
    // standing inside a locked room counts as being let in (so stepping out for a moment does not lock you out)
    if (meetingRoom && locked.has(meetingRoom.id)) admitted.current.add(meetingRoom.id);
    // the holder walked out but people are still in: the lowest id inside takes the lock over
    const prev = prevLocked.current;
    if (prev.space === (space?.id ?? null) && me) {
      for (const room of prev.rooms) {
        if (locked.has(room)) continue;
        const inside = occupants(roster, space?.id ?? null, room);
        const explicit = Date.now() - (unlockedAt.current.get(room) ?? 0) < 4000;
        if (meetingRoom?.id === room && shouldTakeOver(true, false, inside, connId, explicit)) {
          setLocked(true);
          myLockRoom.current = room;
        }
      }
    }
    prevLocked.current = { space: space?.id ?? null, rooms: locked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, meetingRoom?.id]);

  const toggleLock = () => {
    if (!meetingRoom || !me) return;
    const room = meetingRoom.id;
    if (locked.has(room)) {
      unlockedAt.current.set(room, Date.now());
      if (myLockRoom.current === room) { setLocked(false); myLockRoom.current = null; }
      else sendDoor({ k: 'unlock', f: connId, r: room });
    } else {
      setLocked(true);
      myLockRoom.current = room;
      admitted.current.add(room);
    }
  };

  const onBlocked = (z: Zone) => {
    if (!me) return;
    const now = Date.now();
    if (now - (lastKnock.current.get(z.id) ?? 0) < 6000) return;
    lastKnock.current.set(z.id, now);
    sendDoor({ k: 'knock', f: connId, n: me.name, r: z.id });
    ambient.knock();
    toast({ title: `${z.name} is locked`, description: 'We knocked for you. Hang tight, someone will let you in.' });
  };

  const handleDoor = (raw: unknown) => {
    const m = parseDoor(raw);
    if (!m || !me || m.f === connId) return;
    const sender = rosterRef.current.find((r) => r.id === m.f);
    const senderInside = !!sender && sender.spaceId === space?.id && sender.zone === m.r;
    if (m.k === 'knock') {
      if (roomRef.current !== m.r || !lockedRef.current.has(m.r)) return;
      if (!quietNow()) ambient.knock();
      setKnocks((k) => (k.some((x) => x.id === m.f) ? k : [...k, { id: m.f, name: m.n || sender?.name || 'Someone', room: m.r }]));
      setTimeout(() => setKnocks((k) => k.filter((x) => x.id !== m.f)), 60_000);
    } else if (m.k === 'let') {
      if (m.t !== connId || !senderInside) return;
      admitted.current.add(m.r);
      toast({ title: 'The door is open', description: 'Walk on in.' });
    } else if (m.k === 'unlock') {
      if (!senderInside) return;
      unlockedAt.current.set(m.r, Date.now());
      if (myLockRoom.current === m.r && roomRef.current === m.r) { setLocked(false); myLockRoom.current = null; }
    }
  };
  const handleDoorRef = useRef(handleDoor);
  handleDoorRef.current = handleDoor;
  useEffect(() => {
    setDoorHandler((raw) => handleDoorRef.current(raw));
    return () => setDoorHandler(null);
  }, [setDoorHandler]);

  // ---- find, go to, follow, ring, message (rules in social.ts) ----
  const teamMap = map;
  const [query, setQuery] = useState('');
  const [presence, setPresence] = useState<'all' | 'free' | 'busy'>('all');
  const [jump, setJump] = useState<{ key: number; x: number; y: number } | null>(null);
  const [follow, setFollow] = useState<string | null>(null);
  const [followOnce, setFollowOnce] = useState(false);
  const [chatWith, setChatWith] = useState<{ id: string; name: string } | null>(null);
  const chatWithRef = useRef(chatWith);
  chatWithRef.current = chatWith;
  const [inbox, setInbox] = useState<Msg[]>([]);
  const lastSent = useRef(new Map<string, number>());
  /** personal offices whose owner has let me in (kept only while that office stays locked) */
  const admittedOffices = useRef(new Set<string>());
  const roomSpaceId = space?.kind === 'team' ? space.id : (lastTeam.current ?? myTeam?.id ?? null);

  // ---- chat: everyone in the space, and direct messages (saved, so people who were away see them)
  const [chatOpen, setChatOpen] = useState(false);
  const [conv, setConv] = useState<string>(ALL);
  const openChat = (c: string) => { setConv(c); setChatOpen(true); };
  const chatCtx = useRef({ open: false, conv: ALL });
  chatCtx.current = { open: chatOpen, conv };
  const onChatIncoming = (m: ChatMsg) => {
    const alert = shouldNotify(m, me?.id ?? '', { quiet: quietNow(), openConv: chatCtx.current.open ? chatCtx.current.conv : null, focused: document.hasFocus() && !document.hidden });
    if (alert !== 'pop') return; // the unread badge on the chat button is enough for everything else
    const sender = (directory ?? []).find((d) => d.id === m.sender_id)?.name ?? 'Someone';
    const dm = m.to_id !== null;
    const target = dm ? m.sender_id : ALL;
    const title = m.kind === 'announcement' ? `Announcement from ${sender}` : dm ? sender : `${sender} mentioned you`;
    const body = (m.body === '(picture)' ? 'Sent a picture' : m.body).slice(0, 160);
    playChime(0.1);
    notifyPing(title, body, () => openChat(target), `chat:${target}`);
    toast({ title, description: body, action: <ToastAction altText="Open the chat" onClick={() => openChat(target)}>Open</ToastAction> });
  };
  const chat = useChat(me?.id ?? null, roomSpaceId, (m) => onChatIncoming(m));

  // ---- guests: people from outside, invited by email, who meet someone in a private visitor room
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  // whose profile is open (a user id), from the people lists
  const [profileCard, setProfileCard] = useState<{ uid: string; x: number; y: number } | null>(null);
  const profileCardUid = profileCard?.uid ?? null;
  const setProfileCardUid = (uid: string | null, x = 0, y = 0) => setProfileCard(uid ? { uid, x, y } : null);
  const guests = useGuestInvites(roomSpaceId, (g) => {
    if (!quietNow()) playChime(0.08);
    notifyPing(`${g.name} is at the door`, 'A guest is waiting to come in.', () => setVisitorsOpen(true), 'guest:' + g.id);
    toast({ title: `${g.name} is at the door`, description: 'A guest is waiting to come in.', action: <ToastAction altText="Open guests" onClick={() => setVisitorsOpen(true)}>Let in</ToastAction> });
  });
  const chatPeople = useMemo(() => (directory ?? []).map((d) => ({ id: d.id, name: d.name, avatar: d.avatar, online: roster.some((r) => r.uid === d.id) })), [directory, roster]);
  const sendChat = async (p: { text: string; file: File | null; to: string | null; announce: boolean; kudos?: string }) => {
    if (!me) return false;
    const people = chatPeople.map((x) => ({ id: x.id, name: x.name }));
    if (!p.file) return chat.send({ text: p.text, to: p.to, announce: p.announce, everyone: isAdmin, kudos: p.kudos, people });
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    if (isPicture(p.file.type)) {
      const img = `${me.id}/${id}.${p.file.type.split('/')[1].replace('jpeg', 'jpg')}`;
      const up = await supabase.storage.from('office-shared').upload(img, p.file, { contentType: p.file.type });
      if (up.error) return false;
      return chat.send({ text: p.text, to: p.to, img, announce: p.announce, everyone: isAdmin, people });
    }
    // any other file: kept in its own private bucket, shown as a download card
    const path = `${me.id}/${id}-${safeFileName(p.file.name)}`;
    const up = await supabase.storage.from('office-files').upload(path, p.file, { contentType: p.file.type });
    if (up.error) return false;
    return chat.send({ text: p.text, to: p.to, file: { path, name: p.file.name.slice(0, 200), size: p.file.size, type: p.file.type }, announce: p.announce, everyone: isAdmin, people });
  };

  // a shared link (?space=…&room=… or &at=x,y): go to that space, then walk to that spot
  const deepLink = useRef<{ space: string | null; room: string | null; at: { x: number; y: number } | null; started: boolean } | null>(null);
  useEffect(() => {
    if (!space || !spaces) return;
    if (!deepLink.current) {
      const q = new URLSearchParams(window.location.search);
      const at = (q.get('at') ?? '').split(',').map(Number);
      const hasAt = at.length === 2 && at.every((n) => Number.isFinite(n));
      const sp = q.get('space');
      deepLink.current = { space: sp, room: q.get('room'), at: hasAt ? { x: at[0], y: at[1] } : null, started: false };
      if (!sp && !deepLink.current.room && !hasAt) { deepLink.current = null; return; }
    }
    const d = deepLink.current;
    if (!d) return;
    if (d.space && d.space !== space.id && spaces.some((x) => x.id === d.space)) { setSpaceId(d.space); return; }
    if (d.started) return;
    d.started = true;
    const z = d.room ? map.zones.find((q) => q.id === d.room) : undefined;
    if (z) setJump({ key: Date.now(), x: z.x + z.w / 2, y: z.y + z.h / 2 });
    else if (d.at) setJump({ key: Date.now(), x: d.at.x + 0.5, y: d.at.y + 0.5 });
  }, [space, spaces, map]);

  // Ghost mode (hold G): fade out and drift through things. Everybody sees you faded; a short hint the first time.
  const onGhost = (on: boolean) => {
    setGhost(on);
    try {
      if (on && !localStorage.getItem('kd:office:ghost-hint')) {
        localStorage.setItem('kd:office:ghost-hint', '1');
        toast({ title: 'Ghost mode', description: 'You can walk through walls, furniture and people. Locked rooms stay closed. Hold G to stay a ghost; let go to come back.' });
      }
    } catch { /* fine */ }
  };
  const goToPerson = (id: string, theirSpace: string | null) => {
    if (theirSpace && theirSpace !== space?.id) setSpaceId(theirSpace);
    // walk over to them (and stop when we arrive); across offices we walk in after arriving
    setFollowOnce(true);
    setFollow(id);
  };
  const goToRoom = (z: Zone) => {
    if (roomSpaceId && roomSpaceId !== space?.id) setSpaceId(roomSpaceId);
    setJump({ key: Date.now(), x: z.x + z.w / 2, y: z.y + z.h / 2 });
  };
  // claiming private offices: anyone can claim a free one and unclaim theirs; an admin can assign or revoke
  const claimOffice = async (officeId: string, uid?: string) => {
    if (!space || !profile) return;
    setDeskBusy(true);
    try {
      await actions.claimDesk(space.id, officeId, uid ?? profile.id, !!uid && isAdmin);
      toast({ title: uid && uid !== profile.id ? 'Office assigned' : 'The office is yours', description: uid && uid !== profile.id ? 'Their name and face are on the door now.' : 'Your name and face are on the door now.' });
      setDeskZone(null);
    } catch (err) {
      const have = err instanceof Error && err.message === 'already_have_one';
      toast({ title: 'Could not claim that office', description: have ? 'You already have one. Give it up first, then claim this one.' : 'Someone just beat you to it. Pick another door.', variant: 'destructive' });
    } finally {
      setDeskBusy(false);
    }
  };
  const unclaimOffice = async (officeId: string) => {
    if (!space) return;
    setDeskBusy(true);
    try {
      await actions.unclaimDesk(space.id, officeId);
      toast({ title: 'Office freed up', description: 'Anyone can claim it now.' });
      setDeskZone(null);
    } catch (err) {
      toast({ title: 'Could not unclaim', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setDeskBusy(false);
    }
  };
  const walkToOffice = (officeId?: string) => {
    const z = map.zones.find((q) => q.id === (officeId ?? myClaim?.office_id));
    if (!z) return;
    // a desk seat: go and sit on its chair (the desk itself is in the way)
    const chair = z.seat ? items.find((i) => i.t === 'chair' && i.x >= z.x && i.x < z.x + z.w && i.y >= z.y && i.y < z.y + z.h) : undefined;
    if (chair) setJump({ key: Date.now(), x: chair.x + 0.5, y: chair.y + 0.5 });
    else setJump({ key: Date.now(), x: z.x + z.w / 2, y: z.y + z.h - 1.5 });
  };
  const claimFree = () => {
    const taken = new Set((claims ?? []).map((c) => c.office_id));
    const free = map.zones.find((z) => z.kind === 'office' && !z.seat && !taken.has(z.id));
    if (free) void claimOffice(free.id);
    else toast({ title: 'No free office right now', description: 'Every office has an owner. An admin can free one up for you.' });
  };
  // Ctrl+D (like Gather's "walk to my desk")
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && myClaim) { e.preventDefault(); walkToOffice(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myClaim?.office_id, map]);
  const startFollow = (id: string) => { setFollowOnce(false); setFollow((f) => (f === id ? null : id)); };
  // following someone who walks into another office: follow them through
  useEffect(() => {
    if (!follow) return;
    const t = roster.find((r) => r.id === follow);
    if (!t) { setFollow(null); return; }
    if (t.spaceId && t.spaceId !== space?.id) setSpaceId(t.spaceId);
  }, [follow, roster, space?.id]);

  const ring = (r: { id: string; name: string }) => {
    if (!me) return;
    if (rosterRef.current.find((q) => q.id === r.id)?.status === 'dnd') { toast({ title: `${r.name} is on Do not disturb`, description: 'Try again later, or send a message.' }); return; }
    if (!canSendTo(lastSent.current, r.id, Date.now(), 'ring')) { toast({ title: `You just rang ${r.name}`, description: 'Give them a moment before ringing again.' }); return; }
    lastSent.current.set(`ring:${r.id}`, Date.now());
    sendPing({ k: 'ring', f: connId, n: me.name, t: r.id, s: space?.id ?? null });
    toast({ title: `Rang ${r.name}` });
  };

  const wave = (r: { id: string; name: string }) => {
    if (!me) return;
    if (rosterRef.current.find((q) => q.id === r.id)?.status === 'dnd') { toast({ title: `${r.name} is on Do not disturb`, description: 'Try again later, or send a message.' }); return; }
    if (!canSendTo(lastSent.current, r.id, Date.now(), 'wave')) { toast({ title: `You just waved at ${r.name}`, description: 'Give them a moment.' }); return; }
    lastSent.current.set(`wave:${r.id}`, Date.now());
    sendPing({ k: 'wave', f: connId, n: me.name, t: r.id, s: space?.id ?? null });
    sendEmote('👋');
    playWave(0.2);
    toast({ title: `You waved at ${r.name}`, description: 'If they are free they will come over.' });
  };

  const sendMessage = async (text: string, file: File | null) => {
    const target = chatWith;
    if (!target || !me) return;
    if (!roster.some((r) => r.id === target.id)) throw new Error(`${target.name} is offline.`);
    if (!canSendTo(lastSent.current, target.id, Date.now(), 'dm')) throw new Error('Slow down a little.');
    let img: string | undefined;
    let imgUrl: string | undefined;
    if (file) {
      img = `${me.id}/${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}.${file.type.split('/')[1].replace('jpeg', 'jpg')}`;
      const up = await supabase.storage.from('office-shared').upload(img, file, { contentType: file.type });
      if (up.error) throw up.error;
      imgUrl = URL.createObjectURL(file);
    }
    const clean = cleanText(text);
    if (!clean && !img) return;
    lastSent.current.set(`dm:${target.id}`, Date.now());
    sendPing({ k: 'dm', f: connId, n: me.name, t: target.id, s: space?.id ?? null, text: clean || undefined, img });
    setInbox((l) => [...l.slice(-99), { id: crypto.randomUUID(), withId: target.id, mine: true, text: clean || undefined, imgUrl, at: Date.now() }]);
  };

  const handlePing = async (raw: unknown) => {
    const m = me ? parsePing(raw, connId) : null;
    if (!m) return;
    if (m.k === 'knock') {
      // only the owner, standing in their own office, hears a knock (and not on Do not disturb)
      if (!(space?.kind === 'personal' && space.owner_id === me?.id && m.s === space.id) || dndNow()) return;
      if (!quietNow()) ambient.knock();
      notifyPing(`${m.n} is at your door`, 'Let them in?', undefined, 'knock:' + m.f);
      toast({
        title: `${m.n} is at your door`, description: 'Let them in?',
        action: <ToastAction altText="Let in" onClick={() => me && sendPing({ k: 'let', f: connId, n: me.name, t: m.f, s: space.id })}>Let in</ToastAction>,
      });
      return;
    }
    if (m.k === 'let') {
      const door = spaces?.find((x) => x.id === m.s);
      if (!door || door.owner_id !== rosterRef.current.find((r) => r.id === m.f)?.uid) return;
      admittedOffices.current.add(door.id);
      setSpaceIdRaw(door.id);
      toast({ title: 'The door is open', description: `You are in ${door.name}.` });
      return;
    }
    if (m.k === 'wave') {
      if (dndNow()) return;
      if (!quietNow()) { playWave(); notifyPing(`${m.n} is waving at you`, 'Want to go and say hi?', () => goToPerson(m.f, m.s), 'wave:' + m.f); }
      toast({
        title: `${m.n} is waving at you 👋`, description: 'Want to go and say hi?',
        action: <ToastAction altText="Walk over" onClick={() => goToPerson(m.f, m.s)}>Walk over</ToastAction>,
      });
      return;
    }
    if (m.k === 'ring') {
      if (dndNow()) return;
      if (!quietNow()) { playRing(); notifyPing(`${m.n} wants a word`, 'Walk over and say hi.', () => goToPerson(m.f, m.s), 'ring:' + m.f); }
      toast({
        title: `${m.n} wants a word`, description: 'Walk over and say hi.',
        action: <ToastAction altText="Walk over" onClick={() => goToPerson(m.f, m.s)}>Walk over</ToastAction>,
      });
      return;
    }
    let imgUrl: string | undefined;
    if (m.img) {
      const s = await supabase.storage.from('office-shared').createSignedUrl(m.img, 3600);
      imgUrl = s.data?.signedUrl;
    }
    setInbox((l) => [...l.slice(-99), { id: crypto.randomUUID(), withId: m.f, mine: false, text: m.text, imgUrl, at: Date.now() }]);
    // a message makes the same soft chime as a ring (a little quieter), unless you are on focus, meeting or do not disturb
    if (!quietNow()) playChime(0.1);
    notifyPing(m.n, m.text || 'Sent a picture', () => openChat(m.f), 'dm:' + m.f);
    if (chatWithRef.current?.id !== m.f) {
      toast({
        title: m.n, description: m.text || 'Sent a picture',
        action: <ToastAction altText="Reply" onClick={() => openChat(m.f)}>Reply</ToastAction>,
      });
    }
  };
  const handlePingRef = useRef(handlePing);
  handlePingRef.current = handlePing;
  useEffect(() => {
    setPingHandler((raw) => { void handlePingRef.current(raw); });
    return () => setPingHandler(null);
  }, [setPingHandler]);

  // ---- locking my personal office (visitors knock; I let them in) ----
  const officeLock = useRef(false);
  const [myOfficeLocked, setMyOfficeLocked] = useState(false);
  const isMyOffice = !!space && space.kind === 'personal' && space.owner_id === profile?.id;
  const lockedOffice = (s: SpaceRow | undefined) =>
    !!s && s.kind === 'personal' && s.owner_id !== profile?.id && !admittedOffices.current.has(s.id)
    && rosterRef.current.some((r) => r.uid === s.owner_id && r.locked && r.spaceId === s.id);

  enterGuard.current = (id) => {
    const target = spaces?.find((s) => s.id === id);
    if (me && target && lockedOffice(target)) {
      if (canSendTo(lastSent.current, `k${target.id}`, Date.now(), 'ring')) {
        lastSent.current.set(`ring:k${target.id}`, Date.now());
        sendPing({ k: 'knock', f: connId, n: me.name, t: rosterRef.current.find((r) => r.uid === target.owner_id && r.spaceId === target.id)?.id ?? (target.owner_id as string), s: target.id });
      }
      toast({ title: `${target.name} is locked`, description: 'We knocked for you. You will be let in the moment they open the door.' });
      return;
    }
    setSpaceIdRaw(id);
  };

  useEffect(() => {
    for (const id of [...admittedOffices.current]) {
      const s = spaces?.find((x) => x.id === id);
      if (!s || !roster.some((r) => r.uid === s.owner_id && r.locked && r.spaceId === id)) admittedOffices.current.delete(id);
    }
  }, [roster, spaces]);

  const toggleOfficeLock = () => {
    if (!isMyOffice) return;
    const on = !officeLock.current;
    officeLock.current = on;
    setMyOfficeLocked(on);
    setLocked(on);
  };
  // leaving my office unlocks it (the lock lives only while I am inside)
  useEffect(() => {
    if (officeLock.current && !isMyOffice) { officeLock.current = false; setMyOfficeLocked(false); setLocked(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyOffice]);

  const letIn = (k: { id: string; room: string }) => {
    if (!me) return;
    sendDoor({ k: 'let', f: connId, t: k.id, r: k.room });
    setKnocks((list) => list.filter((x) => x.id !== k.id));
  };

  const [zoom, setZoom] = useState(1);
  const wheelAcc = useRef(0);
  const wheelRaf = useRef(0);
  const [meeting, setMeeting] = useState(false);
  // the walking hint shows only the first time, for a few seconds (or until someone moves), then never again
  const [hintSeen, setHintSeen] = useState(() => { try { return localStorage.getItem('kd:office:hint') === '1'; } catch { return false; } });
  useEffect(() => {
    if (hintSeen) return;
    const done = () => { setHintSeen(true); try { localStorage.setItem('kd:office:hint', '1'); } catch { /* fine */ } };
    const timer = setTimeout(done, 9000);
    const onKey = (e: KeyboardEvent) => { if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) done(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); };
  }, [hintSeen]);
  /** a counter: every change brings the view back to my avatar */
  const [recenter, setRecenter] = useState(0);
  const [ctx, setCtx] = useState<{ cx: number; cy: number; wx: number; wy: number; personId: string | null; isMe: boolean } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', close); window.removeEventListener('resize', close); };
  }, [ctx]);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<ManageTab>('places');
  const [zoneCard, setZoneCard] = useState<{ zoneId: string; cx: number; cy: number } | null>(null);
  const zoneLatest = useRef<{ zoneId: string; cx: number; cy: number } | null>(null);
  const zoneTimer = useRef<number | undefined>(undefined);
  const overZone = useRef(false);
  useEffect(() => { if (!zoneCard) overZone.current = false; }, [zoneCard]);
  const hoverZone = (h: { zoneId: string; cx: number; cy: number } | null) => {
    zoneLatest.current = h;
    window.clearTimeout(zoneTimer.current);
    if (!h) { zoneTimer.current = window.setTimeout(() => { if (!overZone.current) setZoneCard(null); }, 700); return; }
    if (zoneCard) {
      if (zoneCard.zoneId === h.zoneId) return;
      // reaching for the card: a seat next to it must not take it over
      if (Math.hypot(h.cx - zoneCard.cx, h.cy - zoneCard.cy) < 190) return;
    }
    zoneTimer.current = window.setTimeout(() => setZoneCard(zoneLatest.current), 280);
  };
  const keepZoneCard = () => { overZone.current = true; window.clearTimeout(zoneTimer.current); };
  const leaveZoneCard = () => { overZone.current = false; window.clearTimeout(zoneTimer.current); zoneTimer.current = window.setTimeout(() => setZoneCard(null), 400); };
  const [card, setCard] = useState<{ personId: string; isMe: boolean; cx: number; cy: number; near: boolean } | null>(null);
  const cardTimer = useRef<number | undefined>(undefined);
  const overCard = useRef(false);
  useEffect(() => { if (!card) overCard.current = false; }, [card]);
  const personLatest = useRef<{ personId: string; isMe: boolean; cx: number; cy: number; near: boolean } | null>(null);
  const hoverPerson = (h: { personId: string; isMe: boolean; cx: number; cy: number; near: boolean } | null) => {
    personLatest.current = h;
    window.clearTimeout(cardTimer.current);
    if (!h) { cardTimer.current = window.setTimeout(() => { if (!overCard.current) setCard(null); }, 700); return; }
    if (card) {
      if (card.personId === h.personId) return;
      // reaching for the card: someone standing next to them must not take it over
      if (Math.hypot(h.cx - card.cx, h.cy - card.cy) < 220) return;
    }
    cardTimer.current = window.setTimeout(() => setCard(personLatest.current), 180);
  };
  const keepCard = () => { overCard.current = true; window.clearTimeout(cardTimer.current); };
  const leaveCard = () => { overCard.current = false; window.clearTimeout(cardTimer.current); cardTimer.current = window.setTimeout(() => setCard(null), 450); };
  const [panel, setPanel] = useState<Item | null>(null);
  const [savingPanel, setSavingPanel] = useState(false);
  const boardsAll = space?.layout?.settings?.boards ?? {};
  const clockZones = cleanZones(space?.layout?.settings?.clock);
  officeInfo.zones = clockZones;
  officeInfo.titles = Object.fromEntries(Object.entries(boardsAll).map(([k, v]) => [k, v.title]));
  const savePanel = async (patch: { boards?: Record<string, BoardData>; clock?: string[] }) => {
    if (!space) return;
    setSavingPanel(true);
    try {
      await actions.saveSettings(space, { ...(space.layout?.settings ?? {}), ...patch });
      toast({ title: 'Saved', description: 'Everyone sees the update.' });
      setPanel(null);
    } catch (err) {
      toast({ title: 'That did not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSavingPanel(false);
    }
  };
  const [folded, setFolded] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('kd:office:folded') ?? '[]') as string[]; } catch { return []; } });
  const shut = (id: string) => folded.includes(id);
  const flip = (id: string) => setFolded((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try { localStorage.setItem('kd:office:folded', JSON.stringify(next)); } catch { /* fine */ }
    return next;
  });
  const spaceLink = (extra = '') => `${window.location.origin}/office?space=${space?.id ?? ''}${extra}`;
  const copySpaceLink = async (sp: { id: string; name: string }) => {
    const url = `${window.location.origin}/office?space=${sp.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: `It opens ${sp.name}. Paste it anywhere.` });
    } catch {
      toast({ title: 'Copy this link', description: url });
    }
  };
  const copyLink = async (extra: string, what: string) => {
    const url = spaceLink(extra);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: what + ' Paste it anywhere.' });
    } catch {
      toast({ title: 'Copy this link', description: url });
    }
  };
  useEffect(() => {
    const look = () => { const el = document.getElementById('office-sidebar-slot'); setSlot((cur) => (cur === el ? cur : el)); };
    look();
    const t = window.setInterval(look, 400);
    return () => window.clearInterval(t);
  }, []);
  const [traySize, setTraySize] = useState<0 | 1 | 2 | 3>(() => { try { const v = Number(localStorage.getItem('kd:office:tray')); return v === 0 || v === 2 || v === 3 ? v : 1; } catch { return 1; } });
  const chooseTray = (n: 0 | 1 | 2 | 3) => { setTraySize(n); try { localStorage.setItem('kd:office:tray', String(n)); } catch { /* fine */ } };
  // a window that is not the newest one for this account hangs up (so there is never a second copy of me)
  useEffect(() => { if (superseded && calls.joined) calls.leave(); }, [superseded, calls.joined]); // eslint-disable-line react-hooks/exhaustive-deps
  // the update prompt must not reload the page while I am in a call or recording
  useEffect(() => { (window as unknown as { __kdBusy?: boolean }).__kdBusy = calls.joined || recorder.recording; return () => { (window as unknown as { __kdBusy?: boolean }).__kdBusy = false; }; }, [calls.joined, recorder.recording]);

  // everyone sees who is talking: my own state is sent out, and what others send is merged with what our audio hears
  const talking = useRef(new Set<string>());
  const iAmTalking = calls.speakingIds.has('');
  useEffect(() => {
    sendSpeaking(iAmTalking);
    if (!iAmTalking) return;
    const beat = setInterval(() => sendSpeaking(true), 2000);
    return () => clearInterval(beat);
  }, [iAmTalking, sendSpeaking]);
  useEffect(() => {
    const t = setInterval(() => {
      const next = new Set(calls.speaking.current);
      const now = Date.now();
      for (const [id, until] of peerTalking.current) {
        if (until > now) next.add(id); else peerTalking.current.delete(id);
      }
      talking.current = next;
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!calls.joined) setMeeting(false); }, [calls.joined]);
  const [status, setStatusState] = useState(() => { try { return localStorage.getItem('kd:office:status') ?? ''; } catch { return ''; } });
  const chooseStatus = (id: string) => { setStatusState(id); try { localStorage.setItem('kd:office:status', id); } catch { /* fine */ } };
  // a focus session: Focusing now, Available again when the time is up (kept in the browser so a reload does not lose it)
  const [focusEnd, setFocusEnd] = useState<number | null>(() => { try { const v = Number(localStorage.getItem('kd:office:focusEnd')); return v > Date.now() ? v : null; } catch { return null; } });
  const [focusTick, setFocusTick] = useState(0);
  const startFocus = (minutes: number) => {
    if (minutes <= 0) { setFocusEnd(null); try { localStorage.removeItem('kd:office:focusEnd'); } catch { /* fine */ } chooseStatus(''); return; }
    const end = Date.now() + minutes * 60_000;
    setFocusEnd(end);
    try { localStorage.setItem('kd:office:focusEnd', String(end)); } catch { /* fine */ }
    chooseStatus('focus');
  };
  useEffect(() => {
    if (!focusEnd) return;
    const t = window.setInterval(() => {
      if (Date.now() >= focusEnd) {
        setFocusEnd(null);
        try { localStorage.removeItem('kd:office:focusEnd'); } catch { /* fine */ }
        // only go back if nothing else was chosen meanwhile
        setStatusState((cur) => { if (cur !== 'focus') return cur; try { localStorage.setItem('kd:office:status', ''); } catch { /* fine */ } return ''; });
        toast({ title: 'Focus session finished', description: 'You are Available again.' });
      } else setFocusTick((x) => x + 1);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [focusEnd, toast]);
  const focusLeft = focusEnd && status === 'focus' ? Math.max(1, Math.ceil((focusEnd - Date.now()) / 60_000)) : null;
  void focusTick;
  useEffect(() => { setStatus(status); }, [status, setStatus, connected]);
  // while the Office is open nobody is signed out for being idle (the idle sign-out reads this heartbeat)
  useEffect(() => {
    setOfficeHere(true);
    markOfficeAlive();
    const beat = () => markOfficeAlive();
    const id = window.setInterval(beat, 15_000);
    // when the computer wakes up or the window comes back, say so at once instead of waiting for the next beat
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('focus', beat);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', beat); window.removeEventListener('focus', beat); setOfficeHere(false); };
  }, []);
  // the KD Ops desktop app's small window shows who is around and sets Do not disturb while the computer is locked (nothing happens in a browser)
  useDesktopMini({ name: me?.name ?? '', avatar: meLive?.avatar, status, roster, myUid: me?.id ?? '', onStatus: chooseStatus });
  // like Gather: Ctrl+O available, Ctrl+I busy, Ctrl+U do not disturb
  useEffect(() => {
    const keys: Record<string, string> = { o: 'available', i: 'busy', u: 'dnd' };
    const onKey = (e: KeyboardEvent) => {
      const id = keys[e.key.toLowerCase()];
      if (!id || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      chooseStatus(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
     
  }, []);
  // a power bike: you ride until you press F again, leave the space, or are moved to another window
  const [riding, setRidingState] = useState(false);
  const [rideBike, setRideBike] = useState<string | null>(null);
  useEffect(() => { setRiding(riding, rideBike); }, [riding, rideBike, setRiding, connected]);
  // a bike somebody is riding is not parked any more: it leaves its spot and goes with them
  const takenBikes = roster.filter((r) => r.bike && r.spaceId === space?.id).map((r) => r.bike as string).concat(riding && rideBike ? [rideBike] : []).sort().join(',');
  // bikes and go-karts stay where the last rider left them, for everybody, until somebody else takes them
  const vehicles = useVehicles(space?.id ?? null);
  const boards = useBoards(space?.id ?? null, !!space);
  const life = useOfficeLife(space?.id ?? null, !!space);
  const [eventsOpen, setEventsOpen] = useState(false);
  // a heads-up when something is about to start (once per event)
  const warned = useRef(new Set<string>());
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const e of upcoming(life.events, now)) {
        const mins = (Date.parse(e.starts_at) - now) / 60000;
        if ((isLive(e, now) || mins <= 5) && !warned.current.has(e.id) && Date.parse(e.ends_at) > now) {
          warned.current.add(e.id);
          toast({ title: isLive(e, now) ? `Happening now: ${e.title}` : `Starting in ${Math.max(1, Math.round(mins))} min: ${e.title}`, description: 'Open the events board to see where.' });
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [life.events]); // eslint-disable-line react-hooks/exhaustive-deps
  // ---- town hall: speak to the whole office ----
  const [townOpen, setTownOpen] = useState(false);
  const [myLive, setMyLive] = useState(false);
  const [townMuted, setTownMutedState] = useState(false);
  const townSpeaker = roster.find((r) => r.live && r.spaceId === space?.id) ?? null;
  const someoneLive = !!townSpeaker || myLive;
  const canSpeakToAll = canDo(space?.layout?.settings, 'speak', profile?.id, isAdmin);
  const goLive = async (title: string) => {
    if (townSpeaker && !myLive) { toast({ title: 'Someone is already speaking to the office', variant: 'destructive' }); return; }
    if (!calls.joined) await calls.join();
    if (!calls.micOn) await calls.toggleMic();
    myLiveRef.current = true;
    setMyLive(true);
    setTownHall(true, title);
    ambient.gong();
    sendEmote('📣');
    toast({ title: 'You are live', description: 'Everyone with voice on can hear you now.' });
  };
  const endTownHall = () => {
    myLiveRef.current = false;
    setMyLive(false);
    setTownHall(false);
    toast({ title: 'Town hall ended' });
  };
  const muteTown = () => { const next = !townMuted; townMutedRef2.current = next; setTownMutedState(next); setTownMuted(next); };
  // when somebody else goes live, everyone is told once (and the gong rings)
  const toldAbout = useRef<string | null>(null);
  useEffect(() => {
    const id = townSpeaker?.id ?? null;
    if (id === toldAbout.current) return;
    toldAbout.current = id;
    if (!townSpeaker || townSpeaker.id === connId) return;
    ambient.gong();
    toast({ title: `${townSpeaker.name} is speaking to the whole office`, description: townSpeaker.townTitle || 'Town hall is live. Turn on voice to listen; you can mute it from the red strip.' });
  }, [townSpeaker, connId]); // eslint-disable-line react-hooks/exhaustive-deps
  // if I stop being live for any reason (a different office, leaving), say so
  useEffect(() => { if (superseded && myLiveRef.current) { myLiveRef.current = false; setMyLive(false); setTownHall(false); } }, [superseded]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pollsOpen, setPollsOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  // C: turn into my character (chosen in the avatar menu) and back. Nothing is saved: it is a costume, not a change of look.
  const [lookLabel, setLookLabel] = useState<string | null>(null);
  const lookLabelTimer = useRef<number | null>(null);
  const toggleCharacter = () => {
    if (!me || editing || avatarOpen) return;
    const say = (t: string) => {
      setLookLabel(t);
      if (lookLabelTimer.current) window.clearTimeout(lookLabelTimer.current);
      lookLabelTimer.current = window.setTimeout(() => setLookLabel(null), 2200);
    };
    if (!charLook) { say('Pick your character: Avatar menu, Looks, then tap the star'); return; }
    if (charOn) { setCharOn(false); say('Back to you'); } else { setCharOn(true); say(`You are ${charLook.label}`); }
  };
  const toggleCharacterRef = useRef(toggleCharacter);
  toggleCharacterRef.current = toggleCharacter;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      toggleCharacterRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'e' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      setWheelOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [mini, setMini] = useState<{ game: MiniGame; key: string } | null>(null);
  const [taskBoardId, setTaskBoardId] = useState<string | null>(null);
  const vrows = vehicles.rows;
  const myId = me?.id ?? '';
  const parkedItems = useMemo(() => {
    const away = takenBikes ? takenBikes.split(',') : [];
    const heldByOthers = Object.values(vrows).filter((v) => isHeld(v) && v.holder_id !== myId).map((v) => v.item_id);
    return items
      .filter((i) => !away.includes(i.id) && !heldByOthers.includes(i.id))
      .map((i) => { const v = i.t === 'bike' || i.t === 'kart' ? vrows[i.id] : undefined; return v ? { ...i, x: v.x, y: v.y, r: (v.dir === 1 ? 1 : 0) as 0 | 1 } : i; });
  }, [items, takenBikes, vrows, myId]);
  const vehicleKinds = useMemo(() => Object.fromEntries(items.filter((i) => i.t === 'bike' || i.t === 'kart').map((i) => [i.id, i.t as 'bike' | 'kart'])), [items]);
  const handleRide = async (on: boolean, bikeId?: string, pos?: { x: number; y: number; dir: number }) => {
    if (on && bikeId) {
      const it = items.find((i) => i.id === bikeId);
      const v = vrows[bikeId];
      setRidingState(true); // hop on at once; if somebody was quicker we hop off again
      setRideBike(bikeId);
      const res = await vehicles.take(bikeId, v?.x ?? it?.x ?? 0, v?.y ?? it?.y ?? 0);
      if (res === 'taken') { setRidingState(false); setRideBike(null); toast({ title: 'Somebody just took that one', description: 'Try another, or wait until they leave it.' }); }
    } else {
      const id = rideBike;
      setRidingState(false);
      setRideBike(null);
      if (id && pos) void vehicles.drop(id, Math.floor(pos.x), Math.floor(pos.y), pos.dir);
    }
  };
  // while you ride you keep hold of it; if you vanish, it is free again after a few seconds
  useEffect(() => {
    if (!riding || !rideBike) return;
    // every few seconds (and when the tab is hidden) renew the lease and save where the vehicle is now
    const beat = () => {
      let pos: { x?: number; y?: number } = {};
      try { pos = JSON.parse(localStorage.getItem('kd:office:pos:' + (space?.id ?? '')) ?? '{}') as { x?: number; y?: number }; } catch { /* keep without a position */ }
      void vehicles.keep(rideBike, pos.x, pos.y);
    };
    const id = window.setInterval(beat, 5000);
    document.addEventListener('visibilitychange', beat);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', beat); };
  }, [riding, rideBike, vehicles.keep]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRidingState(false); setRideBike(null); }, [space?.id, superseded]);
  // the office is bright by default (cream floors, daylight); a switch makes it a night office
  // the sky is the same for everyone in the office; admins set it in Manage space
  const skyCfg = space?.layout?.settings?.sky;
  const timeMode: TimeMode = (['auto', 'morning', 'afternoon', 'evening', 'night'] as const).find((m) => m === skyCfg?.time) ?? 'auto';
  const seasonMode: SeasonMode = (['auto', 'clear', 'harmattan', 'rainy'] as const).find((m) => m === skyCfg?.season) ?? 'auto';
  const saveSky = async (patch: { time?: TimeMode; season?: SeasonMode }) => {
    if (!space || !isAdmin) return;
    try {
      await actions.saveSettings(space, { ...(space.layout?.settings ?? {}), sky: { time: timeMode, season: seasonMode, place: skyCfg?.place ?? DEFAULT_PLACE, ...patch } });
      toast({ title: 'Sky updated', description: 'Everyone in the office sees it now.' });
    } catch (err) {
      toast({ title: 'That did not save', description: errorMessage(err), variant: 'destructive' });
    }
  };
  // the palette follows the hour (checked every half minute, so dusk arrives by itself)
  const [skyTick, setSkyTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setSkyTick((n) => n + 1), 30000); return () => window.clearInterval(t); }, []);
  const dark = useMemo(() => skyState(timeMode, Date.now()).dark, [timeMode, skyTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('kd:office:sound') !== '0'; } catch { return true; } });
  const [volume, setVolume] = useState(() => { try { const v = Number(localStorage.getItem('kd:office:volume')); return Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem('kd:office:volume') !== null ? v : 0.8; } catch { return 0.8; } });
  const chooseVolume = (v: number) => { setVolume(v); ambient.setVolume(v); try { localStorage.setItem('kd:office:volume', String(v)); } catch { /* fine */ } };
  useEffect(() => { ambient.setVolume(volume); }, [volume]);
  // the real weather where we are, refreshed every ten minutes
  // my own weather: the city I choose for myself (people sit in different places), only on my screen
  const [myPlace, setMyPlaceRaw] = useState<string | null>(() => { try { const v = localStorage.getItem('kd:office:myplace'); return PLACES.some((x) => x.id === v) ? v : null; } catch { return null; } });
  const myCity = myPlace ?? DEFAULT_PLACE;
  const chooseMyPlace = (id: string) => { setMyPlaceRaw(id); try { localStorage.setItem('kd:office:myplace', id); } catch { /* fine */ } };
  const { data: myWeather = null } = useQuery({
    queryKey: ['office', 'weather', myCity],
    queryFn: () => fetchWeather(PLACES.find((x) => x.id === myCity) ?? PLACES[0]),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
  const toggleSound = () => { setSound((v) => { try { localStorage.setItem('kd:office:sound', v ? '0' : '1'); } catch { /* fine */ } return !v; }); };

  // live cameras as bubbles above heads: one hidden, playing video element per person
  const bubbles = useRef(new Map<string, HTMLVideoElement>());
  useEffect(() => {
    const want = new Map<string, MediaStream>();
    for (const t of calls.tiles) if (!t.screen && t.hasVideo) want.set(t.id, t.stream);
    if (me && calls.selfCam) want.set(connId, calls.selfCam);
    for (const [id, v] of [...bubbles.current]) {
      if (want.get(id) !== v.srcObject) { v.srcObject = null; bubbles.current.delete(id); }
    }
    for (const [id, stream] of want) {
      if (bubbles.current.has(id)) continue;
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;
      void v.play().catch(() => undefined);
      bubbles.current.set(id, v);
    }
  }, [calls.tiles, calls.selfCam, me]);

  const nameOfSpace = (id: string | null) => spaces?.find((s) => s.id === id)?.name ?? 'an office';
  /** Where someone is right now, in words: the room they stand in, or the open floor, or another office. */
  const whereIs = (r: { id: string; spaceId: string | null }): string => {
    if (r.spaceId && r.spaceId !== space?.id) return `In ${nameOfSpace(r.spaceId)}`;
    const pm = peers.current.get(r.id);
    if (!pm) return space ? `In ${space.name}` : 'In the office';
    const z = zoneAt(map, pm.x, pm.y);
    if (!z || z.kind === 'portal') return 'In the open office';
    return z.kind === 'meeting' ? `In ${z.name}` : z.kind === 'office' ? `In ${z.name}` : `At ${z.name}`;
  };
  const here = roster.filter((r) => r.spaceId === space?.id);
  const roomPeople = (zid: string) => roster.filter((r) => r.spaceId === roomSpaceId && r.zone === zid);
  const otherOffices = (spaces ?? []).filter((s) => s.kind === 'personal' && s.owner_id !== profile?.id);

  if (!me || !spaces) {
    return <div className="p-6 text-sm text-muted-foreground">Loading the office…</div>;
  }
  if (!space) {
    return <div className="p-6 text-sm text-muted-foreground">No office is set up yet. An admin can create one.</div>;
  }

  return (
    <div className={inDesktopApp() ? 'flex h-screen min-h-[480px] flex-col gap-0' : 'flex h-[calc(100vh-7rem)] min-h-[480px] flex-col gap-3'}>
      <div className={inDesktopApp() ? 'hidden' : 'flex flex-wrap items-center justify-between gap-2'}>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Building2 className="h-5 w-5" />Virtual Office</h1>
          <p className="text-sm text-muted-foreground">
            {space.name}{zone && zone.kind !== 'area' && zone.kind !== 'portal' ? ` · ${zone.name}` : ''} · {here.length} {here.length === 1 ? 'person' : 'people'} here
            {!connected && ' · connecting…'}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <SlotAside slot={slot}>
          <div className="flex gap-1.5">
            <button type="button" className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-[#0089b8] px-3 text-[11.5px] font-bold text-white shadow-sm transition hover:brightness-110" onClick={() => setInviteOpen(true)}><UserPlus className="h-3 w-3 shrink-0" /><span>Invite</span></button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="More" title="More" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"><MoreHorizontal className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => { window.open(desktopDownload().url, '_blank', 'noopener'); }}><Download className="mr-2 h-4 w-4" />Get the KD Ops desktop app</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setVisitorsOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Guests{guests.waitingCount ? ` (${guests.waitingCount} waiting)` : ''}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copyLink(zone && isRoom(zone) ? `&room=${zone.id}` : '', 'It opens the office at this room.')}><LinkIcon className="mr-2 h-4 w-4" />Copy link to here</DropdownMenuItem>
                {(isAdmin || canEdit) && <DropdownMenuItem onSelect={() => setManageOpen(true)}><Settings className="mr-2 h-4 w-4" />Manage space</DropdownMenuItem>}
                {canEdit && !editing && <DropdownMenuItem onSelect={() => startEdit()}><Pencil className="mr-2 h-4 w-4" />Edit the space</DropdownMenuItem>}
                {canRecord && <DropdownMenuItem onSelect={() => setRecordingsOpen(true)}><Video className="mr-2 h-4 w-4" />Recordings</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person or room…" aria-label="Find a person or room"
              className="h-9 w-full rounded-xl border border-input bg-background pl-8 pr-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <section>
            <SecHead id="spaces" shut={shut} flip={flip}>Spaces</SecHead>
            {!shut('spaces') && (<>
            <div className="space-y-0.5">
              {teamSpaces.filter((sp) => isAdmin || sp.id === myTeam?.id).map((sp) => (
                <div key={sp.id} className={`group flex items-center rounded-lg transition-colors hover:bg-muted ${sp.id === space.id ? 'bg-muted font-medium' : ''}`}>
                  <button type="button" onClick={() => setSpaceId(sp.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm">
                    <Building2 className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{sp.name}</span>
                  </button>
                  <button type="button" aria-label={`Copy link to ${sp.name}`} title="Copy link" onClick={() => void copySpaceLink(sp)} className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 hover:bg-background group-hover:opacity-100"><LinkIcon className="h-3.5 w-3.5" /></button>
                  {isSuper && (
                    <span className="mr-1 flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                      <button type="button" aria-label={`Rename ${sp.name}`} title="Rename" onClick={() => { setRenaming(sp); setRenameValue(sp.name); }} className="flex h-6 w-6 items-center justify-center rounded hover:bg-background"><Pencil className="h-3.5 w-3.5" /></button>
                      {sp.id !== myTeam?.id && <button type="button" aria-label={`Delete ${sp.name}`} title="Delete" onClick={() => void removeSpace(sp)} className="flex h-6 w-6 items-center justify-center rounded text-destructive hover:bg-background"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </span>
                  )}
                </div>
              ))}
              {isAdmin && <button type="button" onClick={() => setNewSpaceOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-primary hover:bg-muted"><Plus className="h-4 w-4" />New space</button>}
            </div>
          </>)}
          </section>
          {roomSpaceId && (
            <section>
              <SecHead id="rooms" shut={shut} flip={flip}>Rooms</SecHead>
            {!shut('rooms') && (<>
              <div className="space-y-1">
                {teamMap.zones.filter((z) => (z.kind === 'meeting' || z.kind === 'lounge') && matches(z.name, query)).map((z) => {
                  const people = roomPeople(z.id);
                  return (
                    <button key={z.id} type="button" onClick={() => goToRoom(z)} title={`Go to ${z.name}`} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted">
                      <div className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5">{z.name}{locked.has(z.id) && <Lock className="h-3 w-3 text-amber-500" aria-label="Locked" />}</span><span className={`text-xs ${people.length ? 'font-semibold text-emerald-500' : 'text-muted-foreground'}`}>{people.length}</span></div>
                      {people.length > 0 && <p className="truncate text-xs text-muted-foreground">{people.map((p) => p.name.split(' ')[0]).join(', ')}</p>}
                    </button>
                  );
                })}
              </div>
            </>)}
          </section>
          )}

          <section>
            <SecHead id="online" shut={shut} flip={flip}><Users className="h-3.5 w-3.5" />Online ({roster.length})</SecHead>
            {!shut('online') && (<>
            {roster.length > 1 && (
              <div className="mb-1.5 flex gap-1" role="group" aria-label="Show people">
                {([['all', `All ${roster.length}`], ['free', `Free ${roster.filter((r) => isFreeStatus(r.status)).length}`], ['busy', `Busy ${roster.filter((r) => !isFreeStatus(r.status)).length}`]] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={presence === k} onClick={() => setPresence(k)} className={`flex-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums transition ${presence === k ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{label}</button>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {roster.filter((r) => matches(r.name, query) && (presence === 'all' || (presence === 'free') === isFreeStatus(r.status))).map((r) => {
                const isMe = r.id === connId;
                const act = 'flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';
                return (
                  <div key={r.id} className="group relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-[#D6AC50] before:opacity-0 before:transition-opacity hover:bg-primary/[0.07] hover:before:opacity-100">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" title={isMe ? 'Your profile' : `See ${r.name}'s profile`} onClick={(e) => setProfileCardUid(r.uid, e.clientX, e.clientY)}>
                    <span className="relative shrink-0"><AvatarFace avatar={r.avatar} size={36} /><span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card shadow-[0_0_0_2px_rgba(0,236,255,.0)] transition-colors" style={{ background: dotColor(r.status) }} title={statusOf(r.status)?.label ?? 'Available'} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}{isMe ? ' (you)' : ''}</span><span className="flex min-w-0 items-center text-xs text-muted-foreground"><span className="truncate">{statusOf(r.status) ? statusOf(r.status)?.label : 'Active now'} · {whereIs(r)}</span></span></span>
                    </button>
                    {!isMe && (
                      <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-px rounded-full bg-popover/95 px-1 py-0.5 opacity-0 shadow-sm ring-1 ring-border/70 backdrop-blur transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        {calls.tiles.some((t) => t.id === r.id && !t.screen) && (
                          <button type="button" className={act} title={calls.tiles.find((t) => t.id === r.id)?.muted ? `Unmute ${r.name}` : `Mute ${r.name} (only for you)`} aria-label={`Mute ${r.name}`} onClick={() => calls.toggleMutePeer(r.id)}>
                            {calls.tiles.find((t) => t.id === r.id)?.muted ? <VolumeX className="h-3 w-3 text-red-500" /> : <Volume2 className="h-3 w-3" />}
                          </button>
                        )}
                        <button type="button" className={act} title={`View ${r.name}'s profile`} aria-label={`View ${r.name}'s profile`} onClick={(e) => setProfileCardUid(r.uid, e.clientX, e.clientY)}><UserCircle className="h-3 w-3" /></button>
                        <button type="button" className={act} title={`Go to ${r.name}`} onMouseEnter={(e) => { e.currentTarget.title = `Go to ${r.name} · ${whereIs(r)}`; }} aria-label={`Go to ${r.name}`} onClick={() => goToPerson(r.id, r.spaceId)}><LocateFixed className="h-3 w-3" /></button>
                        <button type="button" className={`${act} ${follow === r.id ? 'bg-primary/15 text-primary' : ''}`} title={follow === r.id ? 'Stop following' : `Follow ${r.name}`} aria-label={`Follow ${r.name}`} onClick={() => startFollow(r.id)}><Footprints className="h-3 w-3" /></button>
                        <button type="button" className={act} title={`Ring ${r.name}`} aria-label={`Ring ${r.name}`} onClick={() => ring(r)}><BellRing className="h-3 w-3" /></button>
                        <button type="button" className={act} title={`Message ${r.name}`} aria-label={`Message ${r.name}`} onClick={() => openChat(r.id)}><MessageCircle className="h-3 w-3" /></button>
                      </span>
                    )}
                  </div>
                );
              })}
              {roster.length === 0 && <p className="px-2.5 text-xs text-muted-foreground">Nobody yet.</p>}
            </div>
          </>)}
          </section>

          {(directory ?? []).filter((p) => !roster.some((r) => r.uid === p.id) && matches(p.name, query)).length > 0 && (
            <section>
              <SecHead id="offline" shut={shut} flip={flip}>Offline ({(directory ?? []).filter((p) => !roster.some((r) => r.uid === p.id)).length})</SecHead>
            {!shut('offline') && (<>
              <div className="space-y-0.5">
                {(directory ?? []).filter((p) => !roster.some((r) => r.uid === p.id) && matches(p.name, query))
                  // the people who were here most recently come first
                  .sort((a, b) => (Date.parse(lastSeen?.get(b.id) ?? '') || 0) - (Date.parse(lastSeen?.get(a.id) ?? '') || 0))
                  .map((p) => (
                  <button key={p.id} type="button" onClick={(e) => setProfileCardUid(p.id, e.clientX, e.clientY)} title={`See ${p.name}'s profile`} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground">
                    <AvatarFace avatar={p.avatar} size={32} dim />
                    <span className="min-w-0 flex-1"><span className="block truncate">{p.name}</span><span className="flex items-center gap-1.5 text-[11px] opacity-80"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" /><span className="truncate">{lastSeen?.get(p.id) ? seenLabel(lastSeen.get(p.id)) : 'Not seen yet'}</span></span></span>
                  </button>
                ))}
              </div>
            </>)}
          </section>
          )}
        </SlotAside>

        <div
          className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/30"
          onWheel={(e) => {
            if (editing) return;
            // a menu, popup or dialog opened from here scrolls itself; its wheel ticks must not zoom the map behind it
            // (events from a portal still travel up through this element)
            if ((e.target as HTMLElement | null)?.closest?.('[data-radix-popper-content-wrapper],[role="dialog"],[role="menu"],[role="listbox"]')) return;
            // gather the wheel ticks of one frame into a single zoom change (each change redraws the whole page)
            wheelAcc.current += e.deltaY;
            if (wheelRaf.current) return;
            wheelRaf.current = requestAnimationFrame(() => {
              const d = wheelAcc.current;
              wheelAcc.current = 0;
              wheelRaf.current = 0;
              setZoom((z) => Math.min(2.2, Math.max(0.5, +(z * Math.exp(-d * 0.0014)).toFixed(2))));
            });
          }}
        >
          {!editing && <SkyControl timeMode={timeMode} seasonMode={seasonMode} canEdit={isAdmin} onOpen={() => { setManageTab('sky'); setManageOpen(true); }} />}
          <OfficeCanvas
            vehicleKinds={vehicleKinds} rideKind={rideBike ? vehicleKinds[rideBike] ?? 'bike' : 'bike'} map={map} spaceId={space.id} items={parkedItems} me={{ ...(meLive ?? me), id: connId, uid: me.id }} showOwnTabs={multi} roster={roster} peers={peers} sendPet={sendPet} petInbox={petInbox} bubbles={bubbles} speaking={talking} update={update}
            onZone={onZone} onPortal={onPortal} canEnter={(id) => canEnterRoom(id, lockedRef.current, admitted.current)} onBlocked={onBlocked}
            jump={jump} follow={follow} followOnce={followOnce} onFollowEnd={() => setFollow(null)}
            editArea={scope ? { x: scope.x, y: scope.y, w: scope.w, h: scope.h } : null}
            noteDesks={myClaim ? (() => { const mine = life.notes.filter((n) => n.desk === myClaim.office_id); return mine.length ? { [myClaim.office_id]: { n: mine.length, gift: mine.find((n) => n.gift)?.gift ?? null } } : undefined; })() : undefined}
            recenter={recenter} emotes={emotes} sound={sound} timeMode={timeMode} seasonMode={seasonMode} onGhost={onGhost} onHoverPerson={hoverPerson} onHoverZone={hoverZone} canvasEl={mapCanvas} onZoomBy={(f) => setZoom((z) => Math.min(2.2, Math.max(0.5, +(z * f).toFixed(2))))} onWalkTo={(x, y) => setJump({ key: Date.now(), x, y })} riding={riding} myStatus={status} onDance={setDancing} onRide={(on, bikeId, pos) => { void handleRide(on, bikeId, pos); }} onNear={(it) => {
              if (!it || it.t !== 'valueswall') return;
              try { if (localStorage.getItem('kd:office:seen-values')) return; localStorage.setItem('kd:office:seen-values', '1'); } catch { return; }
              toast({ title: 'Our core values are on this wall', description: 'Press F to read them.' });
            }} onInteract={(it) => { if (it.t === 'podium') { setTownOpen(true); return; } if (it.t === 'eventboard') { setEventsOpen(true); return; } if (it.t === 'foosball' || it.t === 'tabletennis') { if (gamesOn(space?.layout?.settings)) setMini({ game: it.t === 'foosball' ? 'football' : 'tennis', key: it.id }); else toast({ title: 'Games are switched off', description: 'An admin can turn them back on in the office settings.' }); return; } if (it.t === 'pollboard') { setPollsOpen(true); return; } if (it.t === 'kanban') { setTaskBoardId(it.id); return; } if (it.t === 'arcade' || it.t === 'gametable') { if (gamesOn(space?.layout?.settings)) setGamesOpen(true); else toast({ title: 'Games are switched off', description: 'An admin can turn them back on in the office settings.' }); return; } if (it.t === 'gong') { ambient.gong(); sendEmote('🔔'); toast({ title: 'You rang the gong', description: 'Everyone in the office heard it.' }); return; } setPanel(it); }} bubbleScale={[0.65, 1, 1.5, 2.1][traySize]}
            onContext={(c) => setCtx(c)}
            onMapClick={(t) => {
              const hit = items.find((i) => (i.t === 'wallclock' || i.t === 'valueswall' || i.t === 'missionwall' || i.t === 'noticeboard' || i.t === 'pollboard' || i.t === 'eventboard' || i.t === 'podium' || i.t === 'kanban' || i.t === 'foosball' || i.t === 'tabletennis') && t.x >= i.x && t.y >= i.y && t.x < i.x + itemSize(i).w && t.y < i.y + itemSize(i).h);
              if (hit && (hit.t === 'foosball' || hit.t === 'tabletennis')) { if (gamesOn(space?.layout?.settings)) setMini({ game: hit.t === 'foosball' ? 'football' : 'tennis', key: hit.id }); return; }
              if (hit && hit.t === 'eventboard') { setEventsOpen(true); return; }
              if (hit && hit.t === 'podium') { setTownOpen(true); return; }
              if (hit && hit.t === 'pollboard') { setPollsOpen(true); return; }
              if (hit && hit.t === 'kanban') { setTaskBoardId(hit.id); return; }
              if (hit) { setPanel(hit); return; }
            }} dark={dark} zoom={zoom}
            editing={editing} tool={tool} ghost={ghost} held={held} onTile={onTile} onSecondary={turnHeld}
          />
          {!editing && (
            <div className="absolute bottom-16 right-3 z-10 flex flex-col gap-1">
              {[
                { label: 'Zoom in', icon: <Plus className="h-4 w-4" />, run: () => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(1))) },
                { label: 'Zoom out', icon: <Minus className="h-4 w-4" />, run: () => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(1))) },
                { label: 'Show or hide the map (M)', icon: <MapIcon className="h-4 w-4" />, run: () => window.dispatchEvent(new Event('kd-office-minimap')) },
                { label: 'Find me: zoom in on my avatar (zoom out again with the minus button)', icon: <LocateFixed className="h-4 w-4" />, run: () => { setRecenter((n) => n + 1); setZoom((z) => Math.max(z, 1.7)); } },
              ].map((b) => (
                <button key={b.label} type="button" onClick={b.run} aria-label={b.label} title={b.label} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/90 text-foreground shadow backdrop-blur hover:bg-muted">{b.icon}</button>
              ))}
            </div>
          )}
          {superseded && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 p-4 backdrop-blur">
              <div className="max-w-sm space-y-3 rounded-xl border border-border bg-card p-5 text-center shadow-lg">
                <p className="font-medium">The office is open in another window</p>
                <p className="text-sm text-muted-foreground">You can only be in the office once, so this window is paused and you do not appear twice.</p>
                <Button onClick={claim}>Use this window</Button>
              </div>
            </div>
          )}
          {meeting && calls.joined && (
            <MeetingView me={me.name} selfCam={calls.selfCam} micOn={calls.micOn} camOn={calls.camOn} tiles={calls.tiles} speaking={calls.speakingIds} onMutePeer={calls.toggleMutePeer} onClose={() => setMeeting(false)} />
          )}
          {follow && (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs shadow">
              <Footprints className="h-3.5 w-3.5 text-primary" />Following {roster.find((r) => r.id === follow)?.name ?? 'someone'}
              <button type="button" className="font-medium text-primary" onClick={() => setFollow(null)}>Stop</button>
            </div>
          )}
          {!editing && (
            <CallDock
              chatUnread={chat.totalUnread} onChat={() => openChat(conv)}
              devices={{ mics: calls.devices.mics, cams: calls.devices.cams, speakers: calls.devices.speakers, pick: calls.pick, noise: calls.noise, dataSaver: calls.dataSaver, onDataSaver: calls.setDataSaver, onMic: (id) => void calls.selectMic(id), onCam: (id) => void calls.selectCam(id), onSpeaker: calls.selectSpeaker, onNoise: calls.setNoise, onOpen: () => void calls.refreshDevices() }}
              joined={calls.joined} busy={calls.busy} error={calls.error} micOn={calls.micOn} camOn={calls.camOn} sharing={calls.sharing} onShare={() => void calls.toggleShare()} onMeeting={() => setMeeting(true)} onEmote={sendEmote} tiles={calls.tiles}
              roomName={zone && isRoom(zone) ? zone.name : null}
              onJoin={calls.join} onLeave={calls.leave} onMic={() => void calls.toggleMic()} onCam={() => void calls.toggleCam()}
              canRecord={canRecord} recording={recorder.recording} recSeconds={recorder.seconds} recNotice={recNotice}
              leading={(
                <ProfileMenu
                  name={me.name} skin={(meLive ?? me).avatar.skin} avatar={(meLive ?? me).avatar} status={status} onStatus={chooseStatus} onFocus={startFocus} focusLeft={focusLeft} onAvatar={() => setAvatarOpen(true)}
                  timeMode={timeMode} seasonMode={seasonMode} sound={sound} onToggleSound={toggleSound} volume={volume} onVolume={chooseVolume} notify={{ on: notify.on, denied: notify.denied, supported: notify.supported, toggle: () => void notify.toggle(), desktop: isDesktopApp() }} myWeather={myWeather} myPlace={myCity} onMyPlace={chooseMyPlace} zoom={zoom} onZoom={(d) => setZoom((z) => Math.min(2.2, Math.max(0.5, +(z + d).toFixed(1))))} traySize={traySize} onTraySize={chooseTray}
                  canEdit={canEdit} editing={editing} onEdit={() => startEdit()} canRecord={canRecord} onRecordings={() => setRecordingsOpen(true)} canSettings={isAdmin} onSettings={() => setSettingsOpen(true)} canManage={isAdmin || canEdit} onManage={() => setManageOpen(true)} onGuests={() => setVisitorsOpen(true)} guestsWaiting={guests.waitingCount}
                  myOffice={myClaim ? (map.zones.find((q) => q.id === myClaim.office_id)?.name ?? 'My office') : null}
                  canCustomiseMine={!!myClaim && !canEdit && !editing && canDo(space?.layout?.settings, 'customise', profile?.id, isAdmin)} onCustomiseMine={() => { const z = map.zones.find((q) => q.id === myClaim?.office_id); if (z) startEdit(z); }}
                  onClaimOffice={claimFree} onUnclaimOffice={() => { if (myClaim) void unclaimOffice(myClaim.office_id); }} onWalkToOffice={() => walkToOffice()}
                  isMyOffice={isMyOffice} officeLocked={myOfficeLocked} onOfficeLock={toggleOfficeLock}
                />
              )}
              roomLocked={roomLocked} knocks={knocks.filter((k) => k.room === meetingRoom?.id)} onToggleLock={toggleLock} onLetIn={letIn}
              onDismissKnock={(id) => setKnocks((l) => l.filter((x) => x.id !== id))}
              recError={recorder.error} unsent={recorder.unsent} onRecord={recorder.start} onStopRecord={recorder.stop} onDismissUnsent={recorder.dismissUnsent}
            />
          )}
          {!editing && !hintSeen && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur">
              Walk with <kbd className="rounded border px-1">W</kbd><kbd className="ml-0.5 rounded border px-1">A</kbd><kbd className="ml-0.5 rounded border px-1">S</kbd><kbd className="ml-0.5 rounded border px-1">D</kbd> or the arrow keys. Walk through a door to change rooms. Hold <kbd className="rounded border px-1">Shift</kbd> to slip through people.
            </div>
          )}

          {editing && (
            <div role="toolbar" aria-label="Editing" className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/95 px-2 py-1 shadow-lg backdrop-blur">
              <span className="px-2 text-xs font-medium">{scope ? 'Customising your office' : 'Editing'}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={undo} disabled={!(hist.current.past.length > 0 && histTick >= 0)} aria-label="Undo" title="Undo (Ctrl+Z)"><UndoIcon className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={redo} disabled={!(hist.current.future.length > 0)} aria-label="Redo" title="Redo (Ctrl+Y)"><RedoIcon className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={requestCancel} title="Leave without saving (Esc)"><CloseIcon className="mr-1 h-3.5 w-3.5" />Cancel</Button>
              <Button size="sm" className="h-7 px-3 text-xs" onClick={save} disabled={saving}><SaveIcon className="mr-1 h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          )}
          {lookLabel && !editing && (
            <div role="status" className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs font-medium shadow-lg backdrop-blur">
              {lookLabel} <kbd className="ml-1 rounded border px-1">C</kbd>
            </div>
          )}
          {editing && held && (
            <div role="toolbar" aria-label="Carrying" className="absolute left-1/2 top-14 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/95 px-2 py-1 shadow-lg backdrop-blur">
              <span className="px-2 text-xs font-medium">{ITEM_DEFS[held.item.t]?.label ?? 'Piece'}: click a spot, or drag it there</span>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={turnHeld} title="Turn it (R, or right-click)"><RotateCw className="mr-1 h-3.5 w-3.5" />Turn</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={duplicate} title="Make another one (Ctrl+D)"><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={deleteHeld} title="Delete it (Delete)"><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setHeld(null)} title="Put it back (Esc)">Put back</Button>
            </div>
          )}
          {editing && (
            <EditorPanel
              onUndo={undo} onRedo={redo} canUndo={hist.current.past.length > 0 && histTick >= 0} canRedo={hist.current.future.length > 0} onDuplicate={duplicate}
              tool={tool} onTool={setTool} color={color} onColor={setColor}
              onTurn={turnHeld}
              onReset={() => { if (tool === 'wall' || tool === 'unwall' || tool === 'floor') setTileDraft({ wallsOn: [], wallsOff: [], floors: {} }); else setDraft(map.items.map((i) => ({ ...i }))); }}
              onCancel={requestCancel} onSave={save} saving={saving} limited={!!scope} canWalls={isAdmin}
              floorKind={floorKind} onFloorKind={setFloorKind} brush={brush} onBrush={setBrush}
            />
          )}
        </div>
      </div>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="ko md:max-w-sm">
          <DialogHeader><DialogTitle>Discard your changes?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Everything you changed since you started editing is thrown away. The space stays exactly as it was.</p>
          <div className="flex gap-2">
            <Button className="flex-1" autoFocus onClick={() => setDiscardOpen(false)}>Keep editing</Button>
            <Button className="flex-1" variant="outline" onClick={() => { setDiscardOpen(false); stopEdit(); }}>Discard changes</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={joinPrompt && !calls.joined} onOpenChange={(o) => { if (!o) closeJoinPrompt(); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko md:max-w-sm">
          <DialogHeader><DialogTitle>Join the voice and video?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            People near you will see and hear you, and you will see and hear them. Walk away and the sound fades. Inside a meeting room only the people in that room can hear you. Your camera and microphone start off. Turn them on with the buttons at the bottom when you want to.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => void joinWith()}><Mic className="mr-2 h-4 w-4" />Join (camera and microphone off)</Button>
            <Button variant="ghost" onClick={closeJoinPrompt}>Not now</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!renaming} onOpenChange={(o) => { if (!o) setRenaming(null); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko md:max-w-sm">
          <DialogHeader><DialogTitle>Rename space</DialogTitle></DialogHeader>
          <input value={renameValue} onChange={(e) => setRenameValue(e.target.value.slice(0, 40))} aria-label="Space name" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button disabled={!renameValue.trim()} onClick={async () => { if (!renaming) return; try { await actions.renameSpace(renaming.id, renameValue.trim()); setRenaming(null); toast({ title: 'Space renamed' }); } catch (err) { toast({ title: 'Could not rename', description: errorMessage(err), variant: 'destructive' }); } }}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={newSpaceOpen} onOpenChange={(o) => { if (!o) setNewSpaceOpen(false); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko md:max-w-sm">
          <DialogHeader><DialogTitle>New space</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">An empty room with a wooden floor. Open Edit this office to paint walls and floors and add furniture.</p>
          <input value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value.slice(0, 40))} placeholder="Name, for example Leadership" aria-label="Space name" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewSpaceOpen(false)}>Cancel</Button>
            <Button disabled={!newSpaceName.trim()} onClick={async () => {
              try {
                const id = await actions.createSpace(newSpaceName.trim());
                setNewSpaceOpen(false);
                setNewSpaceName('');
                setSpaceId(id);
                toast({ title: 'Space created' });
              } catch (err) { toast({ title: 'Could not create the space', description: errorMessage(err), variant: 'destructive' }); }
            }}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
      {someoneLive && <TownHallBanner speaker={townSpeaker?.name ?? ''} title={myLive ? '' : townSpeaker?.townTitle ?? ''} mine={myLive} listening={!townMuted} joined={calls.joined} onMute={muteTown} onEnd={endTownHall} onJoinVoice={() => { void calls.join(); }} />}
      <TownHallDialog open={townOpen} onClose={() => setTownOpen(false)} canSpeak={canSpeakToAll} live={someoneLive} mine={myLive} speaker={townSpeaker?.name ?? ''} title={townSpeaker?.townTitle ?? ''} audience={Math.max(0, roster.filter((r) => r.spaceId === space?.id).length - 1)} micOn={calls.micOn} onGoLive={goLive} onEnd={endTownHall} onToggleMic={() => { void calls.toggleMic(); }} />
      <EventsDialog open={eventsOpen} onClose={() => setEventsOpen(false)} events={life.events} rooms={map.zones.filter((z) => z.kind === 'meeting' || z.kind === 'lounge').map((z) => ({ id: z.id, name: z.name }))} me={profile?.id ?? ''} isAdmin={isAdmin} canCreate={canDo(space?.layout?.settings, 'events', profile?.id, isAdmin)} onCreate={life.createEvent} onDelete={(id) => void life.deleteEvent(id)} onWalk={(zid) => { const z = map.zones.find((q) => q.id === zid); if (z) setJump({ key: Date.now(), x: z.x + z.w / 2, y: z.y + z.h / 2 }); }} />
      <PollsDialog open={pollsOpen} onClose={() => setPollsOpen(false)} polls={boards.polls} votes={boards.votes} me={profile?.id ?? ''} isAdmin={isAdmin} canCreate={canDo(space?.layout?.settings, 'polls', profile?.id, isAdmin)} onCreate={boards.createPoll} onVote={(p, o) => { if (profile?.id) void boards.vote(p, o, profile.id); }} onClosePoll={(p) => void boards.closePoll(p)} />
      <TaskBoardDialog open={!!taskBoardId} onClose={() => setTaskBoardId(null)} cards={taskBoardId ? boards.boardCards(taskBoardId) : []} me={profile?.id ?? ''} isAdmin={isAdmin} onAdd={(c, b) => boards.addCard(taskBoardId ?? '', c, b)} onMove={(c, col) => void boards.moveCard(c, col)} onDelete={(c) => void boards.deleteCard(c)} />
      <MiniGamesDialog game={gamesOn(space?.layout?.settings) ? mini?.game ?? null : null} roomKey={(space?.id ?? "") + ":" + (mini?.key ?? "")} playerId={profile?.id ?? ""} onClose={() => setMini(null)} />
      <ReactionWheel open={wheelOpen && !editing} onClose={() => setWheelOpen(false)} onPick={(e) => { sendEmote(e); setWheelOpen(false); }} />
      <GamesDialog open={gamesOpen && gamesOn(space?.layout?.settings)} onClose={() => setGamesOpen(false)} />
      <OfficeSettingsDialog
        open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={space?.layout?.settings ?? {}} directory={directory ?? []} saving={savingSettings}
        onSave={async (st) => {
          if (!space) return;
          setSavingSettings(true);
          try { await actions.saveSettings(space, { ...(space.layout?.settings ?? {}), ...st }); toast({ title: 'Settings saved' }); setSettingsOpen(false); } catch (err) { toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' }); } finally { setSavingSettings(false); }
        }}
      />
      <DeskDialog
        notes={deskZone ? life.notes.filter((n) => n.desk === deskZone.id) : []} authorName={(id) => (directory ?? []).find((p) => p.id === id)?.name ?? 'Someone'} meId={profile?.id ?? ''}
        onLeaveNote={(b, g) => (deskZone ? life.leaveNote(deskZone.id, b, g) : Promise.resolve('No office chosen'))} onDeleteNote={(id) => void life.deleteNote(id)}
        zone={deskZone} owner={deskZone ? ownerOf(deskZone.id) : null} mine={!!deskZone && myClaim?.office_id === deskZone.id}
        iHaveOffice={!!myClaim} isAdmin={isAdmin} busy={deskBusy}
        onClaim={() => { if (deskZone) void claimOffice(deskZone.id); }}
        onUnclaim={() => { if (deskZone) void unclaimOffice(deskZone.id); }}
        onWalk={() => { if (deskZone) { walkToOffice(deskZone.id); setDeskZone(null); } }}
        onCustomise={() => { const z = deskZone; setDeskZone(null); if (z) startEdit(z); }}
        onAssign={() => { if (deskZone) { setNameZone({ id: deskZone.id, name: deskZone.name, kind: deskZone.kind }); setDeskZone(null); } }}
        onClose={() => setDeskZone(null)}
      />
      <RoomNameDialog
        zone={nameZone} directory={directory ?? []}
        current={nameZone ? { ...overrides[nameZone.id], ...(ownerOf(nameZone.id) ? { uid: ownerOf(nameZone.id)?.id } : {}) } : undefined}
        onClose={() => setNameZone(null)}
        onSave={(o) => {
          if (nameZone) {
            const id = nameZone.id;
            const without = (cur: Record<string, RoomOverride>) => { const n = { ...cur }; delete n[id]; return n; };
            if (nameZone.kind === 'office' && o?.uid) {
              void claimOffice(id, o.uid);
              setOverrides(without);
            } else if (nameZone.kind === 'office' && o?.free) {
              void unclaimOffice(id);
              setOverrides(without);
            } else {
              const next = o ? { ...overrides, [id]: o } : without(overrides);
              setOverrides(next);
              // outside edit mode a rename is saved straight away (the saved furniture is kept as it is)
              if (!editing && space) void actions.saveLayout(space, template, Array.isArray(space.layout?.items) ? savedItems : undefined, next).catch((err) => toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' }));
            }
          }
          setNameZone(null);
        }}
      />
      {zoneCard && !card && !ctx && !editing && (() => {
        const z = map.zones.find((q) => q.id === zoneCard.zoneId);
        if (!z) return null;
        const c = (claims ?? []).find((x) => x.office_id === z.id) ?? null;
        const who = c ? (directory ?? []).find((d) => d.id === c.user_id) : undefined;
        const mine = !!c && c.user_id === profile?.id;
        // an office or seat that somebody has: show that person, like Gather does, online or not
        if (c && who) {
          const live = roster.find((r) => r.uid === who.id) ?? null;
          const st = live ? statusOf(live.status) : null;
          const go = (fn: () => void) => () => { setZoneCard(null); fn(); };
          const pa: CardAction[] = [{ key: 'prof', label: 'View profile', icon: <UserCircle className="h-4 w-4" />, run: go(() => setProfileCardUid(who.id, zoneCard.cx, zoneCard.cy)) }];
          if (!mine) {
            pa.push({ key: 'wave', label: 'Wave', icon: <Hand className="h-4 w-4" />, primary: !!live, off: live ? undefined : 'They are offline', run: go(() => live && wave(live)) });
            pa.push({ key: 'msg', label: 'Message', icon: <MessageCircle className="h-4 w-4" />, primary: !live, run: go(() => openChat(who.id)) });
          }
          pa.push({ key: 'walk', label: 'Walk there', icon: <Footprints className="h-4 w-4" />, run: go(() => walkToOffice(z.id)) });
          // give it up (yours) or free it (an admin), right on the card: no right-click needed
          if (mine || isAdmin) pa.push({ key: 'unclaim', label: mine ? (z.seat ? 'Give up my seat' : 'Give up my office') : 'Unclaim (free it)', icon: <Minus className="h-4 w-4" />, run: go(() => void unclaimOffice(z.id)) });
          pa.push({ key: 'link', label: 'Copy link', icon: <LinkIcon className="h-4 w-4" />, run: go(() => void copyLink(`&room=${z.id}`, `It opens ${z.name}.`)) });
          return (
            <PersonCard x={zoneCard.cx} y={zoneCard.cy} name={who.name + (mine ? ' (you)' : '')} avatar={who.avatar} online={!!live} status={st ? st.emoji + ' ' + st.label : null} actions={pa} onEnter={keepZoneCard} onLeave={leaveZoneCard} />
          );
        }
        // nobody has it yet: the same card, with a plus for a face
        const free: CardAction[] = [];
        const gof = (fn: () => void) => () => { setZoneCard(null); fn(); };
        // one seat each: with one already, Claim is greyed out and says why, and Give up is right beside it
        free.push({ key: 'claim', label: z.seat ? 'Claim this seat' : 'Claim this office', icon: <Building2 className="h-4 w-4" />, primary: !myClaim, off: myClaim ? 'You already have one. Give yours up first.' : undefined, run: gof(() => void claimOffice(z.id)) });
        if (myClaim) free.push({ key: 'giveup', label: 'Give up my current ' + (map.zones.find((q) => q.id === myClaim.office_id)?.seat ? 'seat' : 'office'), icon: <Minus className="h-4 w-4" />, run: gof(() => void unclaimOffice(myClaim.office_id)) });
        free.push({ key: 'walk', label: 'Walk there', icon: <Footprints className="h-4 w-4" />, run: gof(() => walkToOffice(z.id)) });
        free.push({ key: 'link', label: 'Copy link', icon: <LinkIcon className="h-4 w-4" />, run: gof(() => void copyLink(`&room=${z.id}`, `It opens ${z.name}.`)) });
        if (isAdmin) free.push({ key: 'manage', label: 'Manage', icon: <Settings className="h-4 w-4" />, run: gof(() => setDeskZone(z)) });
        return (
          <PersonCard x={zoneCard.cx} y={zoneCard.cy} name={z.name} avatar={null} online={false} status={null} sub={(myClaim ? 'You already have one' : 'Free to claim') + (lockedRef.current.has(z.id) ? ' · locked' : '')} actions={free} onEnter={keepZoneCard} onLeave={leaveZoneCard} />
        );
      })()}
      {card && !ctx && (() => {
        const who = roster.find((r) => r.id === card.personId);
        if (!who) return null;
        const st = statusOf(who.status);
        const acts: CardAction[] = [];
        if (card.isMe) {
          acts.push({ key: 'av', label: 'Avatar', icon: <Users className="h-3.5 w-3.5" />, run: () => { setCard(null); setAvatarOpen(true); } });
          if (myClaim) acts.push({ key: 'mine', label: 'My office', icon: <Building2 className="h-3.5 w-3.5" />, run: () => { setCard(null); walkToOffice(); } });
        } else {
          acts.push({ key: 'wave', label: 'Wave', icon: <Hand className="h-3.5 w-3.5" />, primary: !card.near, run: () => { setCard(null); wave(who); } });
          if (card.near) acts.push({ key: 'ring', label: 'Ring', icon: <BellRing className="h-3.5 w-3.5" />, primary: true, run: () => { setCard(null); ring(who); } });
          acts.push({ key: 'msg', label: 'Message', icon: <MessageCircle className="h-3.5 w-3.5" />, run: () => { setCard(null); openChat(who.id); } });
          acts.push({ key: 'prof', label: 'View profile', icon: <UserCircle className="h-3.5 w-3.5" />, run: () => { setCard(null); setProfileCardUid(who.uid, card.cx, card.cy); } });
          acts.push({ key: 'go', label: card.near ? 'Follow' : 'Go to', icon: card.near ? <Footprints className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />, run: () => { setCard(null); if (card.near) startFollow(who.id); else goToPerson(who.id, who.spaceId); } });
        }
        return (
          <PersonCard
            x={card.cx} y={card.cy} name={who.name + (card.isMe ? ' (you)' : '')} avatar={who.avatar} online status={st ? st.emoji + ' ' + st.label : null}
            hint={card.isMe ? null : card.near ? 'You are close. Ring to get their attention.' : 'Far away? Wave and they will see you.'}
            actions={acts} onEnter={keepCard} onLeave={leaveCard}
          />
        );
      })()}
      {ctx && (() => {
        const mi = 'group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-primary/10';
        const done = (fn: () => void) => () => { setCtx(null); fn(); };
        const pet = ctx.personId?.startsWith('pet:') ? petRegistry.get(ctx.personId.slice(4)) ?? null : null;
        const person = ctx.personId && !ctx.isMe && !pet ? roster.find((r) => r.id === ctx.personId) ?? null : null;
        const zone = zoneAt(map, ctx.wx, ctx.wy);
        const office = zone && zone.kind === 'office' ? zone : null;
        const claim = office ? (claims ?? []).find((c) => c.office_id === office.id) ?? null : null;
        const mine = !!claim && claim.user_id === profile?.id;
        const tx = Math.floor(ctx.wx);
        const ty = Math.floor(ctx.wy);
        const rows: ReactNode[] = [];
        const item = (key: string, icon: ReactNode, label: string, run: () => void, danger = false, off?: string) => rows.push(
          off
            ? <button key={key} type="button" disabled title={off} className={mi + ' cursor-not-allowed opacity-40 hover:bg-transparent'}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted/70">{icon}</span><span className="min-w-0 flex-1 truncate">{label}</span><span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{off}</span></button>
            : <button key={key} type="button" className={mi + (danger ? ' text-red-500 hover:bg-red-500/10' : '')} onClick={done(run)}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${danger ? 'bg-red-500/10' : 'bg-muted/70 text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary'}`}>{icon}</span><span className="truncate">{label}</span></button>,
        );
        const sep = (key: string) => { if (rows.length) rows.push(<div key={key} className="mx-2 my-1.5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />); };
        const ic = 'h-4 w-4';
        let title = 'Here';
        const label = (key: string, text: string) => rows.push(<div key={key} className="truncate px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{text}</div>);
        if (pet) {
          const pn = petName(pet.id, pet.kind);
          title = pn + ' the ' + pet.kind;
          item('pp', <Hand className={ic} />, 'Pet ' + pn, () => petBus.queue.push({ kind: 'pet', id: pet.id }));
          item('pf', <Footprints className={ic} />, petCmdFor(pet, connId) === 'stay' ? 'Send back to its place' : 'Follow me', () => petBus.queue.push({ kind: petCmdFor(pet, connId), id: pet.id }));
          if (pet.kind === 'dog') item('pb', <LocateFixed className={ic} />, 'Throw a ball', () => petBus.queue.push({ kind: 'ball', id: pet.id }));
          item('pt', <Users className={ic} />, pet.kind === 'dog' ? 'Give a treat' : 'Give a treat', () => petBus.queue.push({ kind: 'treat', id: pet.id }));
        } else if (person) {
          title = person.name;
          const tl = calls.tiles.find((t) => t.id === person.id && !t.screen);
          item('go', <LocateFixed className={ic} />, 'Go to ' + person.name, () => goToPerson(person.id, person.spaceId));
          item('fol', <Footprints className={ic} />, follow === person.id ? 'Stop following' : 'Follow', () => startFollow(person.id));
          item('ring', <BellRing className={ic} />, 'Ring', () => ring(person));
          item('msg', <MessageCircle className={ic} />, 'Send a message', () => openChat(person.id));
          if (tl) item('mute', tl.muted ? <Volume2 className={ic} /> : <VolumeX className={ic} />, tl.muted ? 'Unmute (only for you)' : 'Mute (only for you)', () => calls.toggleMutePeer(person.id));
        } else if (ctx.isMe) {
          title = me.name + ' (you)';
          item('av', <Users className={ic} />, 'Change my avatar', () => setAvatarOpen(true));
          if (myClaim) item('mine', <Building2 className={ic} />, 'Walk to my office', () => walkToOffice());
          if (myClaim && !editing) item('cust', <Pencil className={ic} />, 'Customise my office', () => { const z = map.zones.find((q) => q.id === myClaim.office_id); if (z) startEdit(z); });
          item('rc', <LocateFixed className={ic} />, 'Centre the view on me', () => setRecenter((n) => n + 1));
        }
        const owner = claim ? (directory ?? []).find((d) => d.id === claim.user_id) : undefined;
        if (office) {
          if (!person && !ctx.isMe) title = office.name;
          else { sep('z'); label('zl', office.name); }
          if (!person && !ctx.isMe) label('own', claim ? 'Claimed by ' + (owner?.name ?? 'someone') : 'Free to claim');
          item('walk', <Footprints className={ic} />, office.seat ? 'Walk to this seat' : 'Walk to this office', () => walkToOffice(office.id));
          // claiming is always listed on an office; it greys out with the reason when it cannot be done
          item('claim', <Building2 className={ic} />, office.seat ? 'Claim this seat' : 'Claim this office', () => void claimOffice(office.id), false, claim ? (mine ? 'Yours' : 'Taken') : myClaim ? 'You have one' : undefined);
          if (mine) item('unclaim', <Minus className={ic} />, office.seat ? 'Give up my seat' : 'Give up my office', () => void unclaimOffice(office.id), true);
          if (mine && !editing) item('cust', <Pencil className={ic} />, 'Customise this office', () => startEdit(office));
          item('olink', <LinkIcon className={ic} />, 'Copy link to this office', () => void copyLink(`&room=${office.id}`, 'It opens the office at this door.'));
          if (isAdmin) {
            sep('adm');
            label('al', 'Admin');
            item('assign', <UserPlus className={ic} />, claim ? 'Change who has this office' : 'Assign to someone', () => setDeskZone(office));
            if (claim && !mine) item('free', <Minus className={ic} />, 'Unclaim (free this office)', () => void unclaimOffice(office.id), true);
            item('rename', <Pencil className={ic} />, office.seat ? 'Rename this seat' : 'Rename this office', () => setNameZone({ id: office.id, name: office.name, kind: office.kind }));
            if (!editing) item('build', <Pencil className={ic} />, 'Edit this office (objects, walls)', () => startEdit(office));
          }
        } else if (zone && isRoom(zone)) {
          if (!person && !ctx.isMe) title = zone.name;
          else { sep('z'); label('zl', zone.name); }
          item('link', <LinkIcon className={ic} />, 'Copy link to this room', () => void copyLink(`&room=${zone.id}`, 'It opens the office at this room.'));
          if (!person && !ctx.isMe) item('here', <Footprints className={ic} />, 'Walk here', () => setJump({ key: Date.now(), x: tx + 0.5, y: ty + 0.5 }));
          if (isAdmin) { sep('adm'); label('al', 'Admin'); item('rrename', <Pencil className={ic} />, 'Rename this room', () => setNameZone({ id: zone.id, name: zone.name, kind: zone.kind })); }
          if (canEdit && !editing) item('redit', <Pencil className={ic} />, 'Edit the space', () => startEdit());
        } else if (!person && !ctx.isMe) {
          item('link', <LinkIcon className={ic} />, 'Copy link to this spot', () => void copyLink(`&at=${tx},${ty}`, 'It opens the office right there.'));
          item('here', <Footprints className={ic} />, 'Walk here', () => setJump({ key: Date.now(), x: tx + 0.5, y: ty + 0.5 }));
          item('rc2', <LocateFixed className={ic} />, 'Centre the view on me', () => setRecenter((n) => n + 1));
          if (isAdmin || canEdit) { sep('adm'); item('manage', <Settings className={ic} />, 'Manage this space', () => setManageOpen(true)); }
          if (canEdit && !editing) item('redit', <Pencil className={ic} />, 'Edit the space', () => startEdit());
        }
        const left = Math.max(8, Math.min(ctx.cx, window.innerWidth - 232));
        const top = Math.max(8, Math.min(ctx.cy, window.innerHeight - (rows.length * 34 + 56)));
        return createPortal(
          <div className="ko fixed inset-0 z-[70]" onPointerDown={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }}>
            <div className="animate-in fade-in zoom-in-95 absolute max-h-[80vh] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-popover/85 p-1.5 text-popover-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-xl duration-100" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
              <div className="mb-1 flex items-center gap-2 border-b border-border/60 px-2.5 pb-2 pt-1.5"><span className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/70" /><span className="truncate text-sm font-semibold tracking-tight">{title}</span></div>
              {rows}
            </div>
          </div>,
          document.body,
        );
      })()}
      <BoardDialog
        open={!!panel && (panel.t === 'valueswall' || panel.t === 'missionwall' || panel.t === 'noticeboard')}
        kind={panel?.t === 'noticeboard' ? 'noticeboard' : panel?.t === 'missionwall' ? 'missionwall' : 'valueswall'}
        data={panel ? boardsAll[panel.id] ?? { title: panel.t === 'noticeboard' ? 'Notice board' : panel.t === 'missionwall' ? 'Mission & vision' : 'Our core values', cards: [] } : { title: '', cards: [] }}
        canEdit={isAdmin} saving={savingPanel} onClose={() => setPanel(null)}
        onSave={(d) => { if (panel) void savePanel({ boards: { ...boardsAll, [panel.id]: d } }); }}
      />
      <ClockDialog open={panel?.t === 'wallclock'} zones={clockZones} canEdit={isAdmin} saving={savingPanel} onClose={() => setPanel(null)} onSave={(z) => void savePanel({ clock: z })} />
      <ManageDialog
        open={manageOpen} onClose={() => { setManageOpen(false); setManageTab('places'); }} startTab={manageTab} spaceName={space.name}
        skyPanel={<SkyPanel timeMode={timeMode} seasonMode={seasonMode} onTime={(m) => void saveSky({ time: m })} onSeason={(m) => void saveSky({ season: m })} />} isAdmin={isAdmin} isSuper={isSuper} canEdit={canEdit}
        canDelete={space.id !== myTeam?.id}
        rows={map.zones.filter((z) => z.kind === 'office').map((z): Claimable => {
          const c = (claims ?? []).find((x) => x.office_id === z.id);
          return { id: z.id, name: z.name, kind: z.seat ? 'seat' : 'office', owner: c ? (directory ?? []).find((d) => d.id === c.user_id)?.name ?? 'Someone' : null };
        })}
        onAssign={(id) => { const z = map.zones.find((q) => q.id === id); if (z) setDeskZone(z); }}
        onUnclaim={(id) => void unclaimOffice(id)}
        onRename={(id) => { const z = map.zones.find((q) => q.id === id); if (z) setNameZone({ id: z.id, name: z.name, kind: z.kind }); }}
        onWalk={(id) => walkToOffice(id)}
        onCopyLink={(id) => { const z = map.zones.find((q) => q.id === id); void copyLink(`&room=${id}`, `It opens ${z?.name ?? 'it'}.`); }}
        onInvite={() => setInviteOpen(true)} onSettings={() => setSettingsOpen(true)} onEdit={() => startEdit()} onRecordings={() => setRecordingsOpen(true)}
        onRenameSpace={() => { setRenaming(space); setRenameValue(space.name); }} onDeleteSpace={() => void removeSpace(space)} onNewSpace={() => setNewSpaceOpen(true)}
      />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} link={spaceLink(zone && isRoom(zone) ? `&room=${zone.id}` : '')} canInvite={canDo(space?.layout?.settings, 'invite', profile?.id, isAdmin)} meId={me.id} />
      {(() => {
        if (!profileCardUid) return null;
        const live = roster.find((r) => r.uid === profileCardUid) ?? null;
        const dir = (directory ?? []).find((d) => d.id === profileCardUid) ?? null;
        const name = live?.name ?? dir?.name ?? 'Someone';
        const avatar = live?.avatar ?? dir?.avatar ?? null;
        const isMe = profileCardUid === me.id;
        const st = live ? statusOf(live.status) : null;
        const done = (fn: () => void) => () => { setProfileCardUid(null); fn(); };
        const acts: ProfileAction[] = [];
        if (live && !isMe) {
          acts.push({ key: 'wave', label: 'Wave', icon: <Hand className="h-4 w-4" />, primary: true, run: done(() => wave(live)) });
          acts.push({ key: 'ring', label: 'Ring', icon: <BellRing className="h-4 w-4" />, run: done(() => ring(live)) });
        }
        if (!isMe) acts.push({ key: 'msg', label: 'Message', icon: <MessageCircle className="h-4 w-4" />, primary: !live, run: done(() => openChat(profileCardUid)) });
        if (live && !isMe) {
          acts.push({ key: 'go', label: 'Go to', icon: <LocateFixed className="h-4 w-4" />, run: done(() => goToPerson(live.id, live.spaceId)) });
          acts.push({ key: 'fol', label: 'Follow', icon: <Footprints className="h-4 w-4" />, run: done(() => startFollow(live.id)) });
        }
        if (isMe) acts.push({ key: 'av', label: 'Change avatar', icon: <Users className="h-4 w-4" />, primary: true, run: done(() => setAvatarOpen(true)) });
        return <ProfileDialog x={profileCard?.x ?? 0} y={profileCard?.y ?? 0} onClose={() => setProfileCardUid(null)} name={name + (isMe ? ' (you)' : '')} avatar={avatar} online={!!live} status={st ? st.emoji + ' ' + st.label : null} where={live ? nameOfSpace(live.spaceId) : null} actions={acts} />;
      })()}
      <VisitorsDialog open={visitorsOpen} onClose={() => setVisitorsOpen(false)} meName={me.name} meId={me.id} isAdmin={isAdmin} invites={guests.invites} known={guests.known} create={guests.create} decide={guests.decide} forget={guests.forget} />
      <ChatDialog
        open={chatOpen} onClose={() => setChatOpen(false)} meId={me.id} spaceName={spaces?.find((x) => x.id === roomSpaceId)?.name ?? space.name}
        people={chatPeople} conv={conv} onConv={setConv} msgs={chat.msgs} unread={chat.unread} isAdmin={isAdmin} loading={chat.loading} onRead={chat.markRead} onSend={sendChat} onDelete={chat.remove} lastRead={chat.lastRead}
      />
      <RecordingsDialog open={recordingsOpen} onOpenChange={setRecordingsOpen} meId={me.id} isAdmin={isAdmin} />

      <AvatarDialog
        open={avatarOpen} onOpenChange={setAvatarOpen} value={me.avatar} name={me.name} saving={savingAvatar} characterId={charId} onCharacter={chooseCharacter}
        onSave={async (a) => {
          setSavingAvatar(true);
          try {
            await actions.saveAvatar(me.id, a);
            setAvatarOpen(false);
            toast({ title: 'Avatar saved' });
          } catch (err) {
            toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
          } finally {
            setSavingAvatar(false);
          }
        }}
      />
    </div>
  );
}

/** Only people in the office (admin pay groups, directors, admins, or invited) get in; the rest are told how. */
export default function OfficePage() {
  const { profile } = useAuthStore();
  const members = useOfficeMembers();
  if (profile && members.data && !members.data.includes(profile.id)) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-xl border bg-card p-6 text-center">
        <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">This office is invite-only</h2>
        <p className="mt-1 text-sm text-muted-foreground">KDS administration and directors work here. Ask an admin to invite you and the door opens.</p>
      </div>
    );
  }
  return <OfficeRoom />;
}
