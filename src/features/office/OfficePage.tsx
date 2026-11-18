import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Building2, Circle, DoorOpen, Footprints, LocateFixed, Lock, MessageCircle, Mic, Search, Video, Palette, Pencil, Plus, Minus, Save, Trash2, RotateCw, Users, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OfficeCanvas, type EditTool } from './OfficeCanvas';
import { AvatarDialog } from './AvatarDialog';
import { supabase } from '@/lib/supabase';
import { ToastAction } from '@/components/ui/toast';
import { MessageDialog, type Msg } from './MessageDialog';
import { canSendTo, cleanText, matches, parsePing } from './social';
import { CallDock } from './calls/CallDock';
import { canEnter as canEnterRoom, lockedRooms, occupants, parseDoor, pruneAdmitted, shouldTakeOver } from './calls/locks';
import { useCalls } from './calls/useCalls';
import { useRecorder } from './calls/useRecorder';
import { RecordingsDialog } from './calls/RecordingsDialog';
import { useOffice } from './useOffice';
import { ensurePersonalOffice, useMyAvatar, useOfficeMutations, useSpaces, type SpaceRow } from './data';
import { buildTemplate, type TemplateName } from './world/templates';
import { ITEM_DEFS, canPlace, itemCells, newItemId, sanitizeItems } from './world/world';
import { defaultAvatar } from './world/render';
import type { Item, ItemType, Zone } from './world/types';

const PALETTE: ItemType[] = ['desk', 'computer', 'chair', 'plant', 'sofa', 'table', 'shelf', 'rug', 'whiteboard', 'lamp', 'coffee', 'bin'];

/** True when the page background is dark (works for both of the app's themes). */
function pageIsDark(): boolean {
  try {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!m) return true;
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  } catch {
    return true;
  }
}

export default function OfficePage() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { data: spaces } = useSpaces();
  const { data: myAvatar } = useMyAvatar(profile?.id);
  const actions = useOfficeMutations();

  const me = useMemo(() => {
    if (!profile) return null;
    return {
      id: profile.id,
      // first name plus last initial, so two people with the same first name can be told apart
      name: (() => {
        const parts = (profile.full_name || profile.email || 'Me').split(' ').filter(Boolean);
        return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : (parts[0] ?? 'Me');
      })(),
      avatar: myAvatar ?? defaultAvatar(profile.id),
    };
  }, [profile, myAvatar]);

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
  const myTeam = teamSpaces.find((s) => s.company_id && s.company_id === (profile as { department_id?: string | null } | null)?.department_id) ?? teamSpaces[0] ?? null;

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
  const map = useMemo(() => buildTemplate(template), [template]);
  const savedItems = useMemo(
    () => (space && Array.isArray(space.layout?.items) ? sanitizeItems(map, space.layout.items) : map.items),
    [space, map],
  );

  const { roster, connected, peers, update, announce, setRecording, setLocked, mine, sendRtc, setRtcHandler, sendDoor, setDoorHandler, sendPing, setPingHandler } = useOffice(me, space?.id ?? null);

  // ---- voice and video (who hears whom is decided in calls/rules.ts) ----
  const meetingIds = useMemo(() => new Set(map.zones.filter((z) => z.kind === 'meeting').map((z) => z.id)), [map]);
  const roomRef = useRef<string | null>(null);
  /** the meeting room I have locked, if any */
  const myLockRoom = useRef<string | null>(null);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const calls = useCalls({
    meId: me?.id ?? null,
    spaceId: space?.id ?? null,
    roster,
    lookup: (id) => {
      const pm = peers.current.get(id);
      const who = rosterRef.current.find((r) => r.id === id);
      if (!pm || !who) return null;
      const dt = Math.min(4, (Date.now() - pm.at) / 1000);
      return { x: pm.x + pm.vx * dt, y: pm.y + pm.vy * dt, room: who.zone && meetingIds.has(who.zone) ? who.zone : null };
    },
    self: () => ({ x: mine.current.m.x, y: mine.current.m.y, room: roomRef.current }),
    send: sendRtc,
    setHandler: setRtcHandler,
  });

  // ---- editing furniture ----
  const canEdit = !!space && (space.kind === 'personal' ? space.owner_id === profile?.id || isAdmin : isAdmin);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Item[]>([]);
  const [tool, setTool] = useState<EditTool>(null);
  const [rot, setRot] = useState<0 | 1 | 2 | 3>(0);
  const [saving, setSaving] = useState(false);
  const items = editing ? draft : savedItems;

  const startEdit = () => { setDraft(savedItems.map((i) => ({ ...i }))); setTool('desk'); setEditing(true); };
  const stopEdit = () => { setEditing(false); setTool(null); };
  useEffect(() => { stopEdit(); }, [spaceId]);

  const itemAt = (tile: { x: number; y: number }) => {
    const hits = draft.filter((i) => itemCells(i).some((c) => c.x === tile.x && c.y === tile.y));
    return hits.find((i) => i.t !== 'rug') ?? hits[0] ?? null;
  };
  const ghost = (tile: { x: number; y: number }) => {
    if (tool === 'erase') return { ok: !!itemAt(tile) };
    if (!tool) return { ok: false };
    return { ok: canPlace(map, draft, { id: 'g', t: tool, x: tile.x, y: tile.y, r: rot }).ok };
  };
  const onTile = (tile: { x: number; y: number }) => {
    if (!editing || !tool) return;
    if (tool === 'erase') {
      const hit = itemAt(tile);
      if (hit) setDraft((d) => d.filter((i) => i.id !== hit.id));
      return;
    }
    const item: Item = { id: newItemId(), t: tool, x: tile.x, y: tile.y, r: rot };
    const res = canPlace(map, draft, item);
    if (!res.ok) { toast({ title: 'reason' in res ? res.reason : 'Cannot place that here', variant: 'destructive' }); return; }
    setDraft((d) => [...d, item]);
  };
  const save = async () => {
    if (!space) return;
    setSaving(true);
    try {
      await actions.saveLayout(space, template, draft);
      toast({ title: 'Office saved' });
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
    roomRef.current = z && z.kind === 'meeting' ? z.id : null;
    // a lock only lasts while its holder stands in that room
    if (myLockRoom.current && roomRef.current !== myLockRoom.current) { setLocked(false); myLockRoom.current = null; }
    announce(z && z.kind !== 'portal' ? z.id : null);
  };
  const onPortal = (target: 'team' | 'mine') => {
    if (target === 'mine' && myPersonal) setSpaceId(myPersonal.id);
    if (target === 'team') setSpaceId(lastTeam.current ?? myTeam?.id ?? null);
  };

  // ---- recording (only designated people; the whole room is told) ----
  const canRecord = isAdmin; // only admins and super admins record (the database enforces it too)
  const meetingRoom = zone && zone.kind === 'meeting' ? { id: zone.id, name: zone.name } : null;
  const recorder = useRecorder({
    meId: me?.id ?? null,
    spaceId: space?.id ?? null,
    canRecord,
    joined: calls.joined,
    room: meetingRoom,
    getStreams: calls.audioStreams,
    getNames: () => [me?.name ?? 'Me', ...calls.tiles.map((t) => t.name)],
    announce: setRecording,
  });
  const recorders = meetingRoom ? roster.filter((r) => r.rec && r.spaceId === space?.id && r.zone === meetingRoom.id) : [];
  const recNotice = recorders.length
    ? recorders.some((r) => r.id === me?.id)
      ? 'You are recording this meeting. Everyone in the room can see this.'
      : `This room is being recorded by ${recorders.map((r) => r.name).join(', ')}.`
    : null;
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  // like Gather: on arrival, offer to turn the camera and microphone on (once per visit)
  const [joinPrompt, setJoinPrompt] = useState(() => { try { return !sessionStorage.getItem('kd:office:prompted'); } catch { return true; } });
  const closeJoinPrompt = () => { setJoinPrompt(false); try { sessionStorage.setItem('kd:office:prompted', '1'); } catch { /* fine */ } };
  const joinWith = async (camera: boolean) => {
    closeJoinPrompt();
    await calls.join();
    if (camera) await calls.toggleCam();
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
        if (meetingRoom?.id === room && shouldTakeOver(true, false, inside, me.id, explicit)) {
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
      else sendDoor({ k: 'unlock', f: me.id, r: room });
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
    sendDoor({ k: 'knock', f: me.id, n: me.name, r: z.id });
    toast({ title: `${z.name} is locked`, description: 'We knocked. Wait here until someone lets you in.' });
  };

  const handleDoor = (raw: unknown) => {
    const m = parseDoor(raw);
    if (!m || !me || m.f === me.id) return;
    const sender = rosterRef.current.find((r) => r.id === m.f);
    const senderInside = !!sender && sender.spaceId === space?.id && sender.zone === m.r;
    if (m.k === 'knock') {
      if (roomRef.current !== m.r || !lockedRef.current.has(m.r)) return;
      setKnocks((k) => (k.some((x) => x.id === m.f) ? k : [...k, { id: m.f, name: m.n || sender?.name || 'Someone', room: m.r }]));
      setTimeout(() => setKnocks((k) => k.filter((x) => x.id !== m.f)), 60_000);
    } else if (m.k === 'let') {
      if (m.t !== me.id || !senderInside) return;
      admitted.current.add(m.r);
      toast({ title: 'You can come in', description: 'Someone opened the door. Walk in.' });
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
  const teamMap = useMemo(() => buildTemplate('team'), []);
  const [query, setQuery] = useState('');
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
    if (!canSendTo(lastSent.current, r.id, Date.now(), 'ring')) { toast({ title: `You just rang ${r.name}`, description: 'Give them a moment.' }); return; }
    lastSent.current.set(`ring:${r.id}`, Date.now());
    sendPing({ k: 'ring', f: me.id, n: me.name, t: r.id, s: space?.id ?? null });
    toast({ title: `Rang ${r.name}` });
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
    sendPing({ k: 'dm', f: me.id, n: me.name, t: target.id, s: space?.id ?? null, text: clean || undefined, img });
    setInbox((l) => [...l.slice(-99), { id: crypto.randomUUID(), withId: target.id, mine: true, text: clean || undefined, imgUrl, at: Date.now() }]);
  };

  const handlePing = async (raw: unknown) => {
    const m = me ? parsePing(raw, me.id) : null;
    if (!m) return;
    if (m.k === 'knock') {
      // only the owner, standing in their own office, hears a knock
      if (!(space?.kind === 'personal' && space.owner_id === me?.id && m.s === space.id)) return;
      toast({
        title: `${m.n} is knocking`, description: 'At your office door.',
        action: <ToastAction altText="Let in" onClick={() => me && sendPing({ k: 'let', f: me.id, n: me.name, t: m.f, s: space.id })}>Let in</ToastAction>,
      });
      return;
    }
    if (m.k === 'let') {
      const door = spaces?.find((x) => x.id === m.s);
      if (!door || door.owner_id !== m.f) return;
      admittedOffices.current.add(door.id);
      setSpaceIdRaw(door.id);
      toast({ title: 'The door is open', description: `You are in ${door.name}.` });
      return;
    }
    if (m.k === 'ring') {
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        o.frequency.value = 880;
        o.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.25);
        setTimeout(() => void ctx.close(), 500);
      } catch { /* no sound is fine */ }
      toast({
        title: `${m.n} is ringing you`, description: 'They would like to talk.',
        action: <ToastAction altText="Go to them" onClick={() => goToPerson(m.f, m.s)}>Go to them</ToastAction>,
      });
      return;
    }
    let imgUrl: string | undefined;
    if (m.img) {
      const s = await supabase.storage.from('office-shared').createSignedUrl(m.img, 3600);
      imgUrl = s.data?.signedUrl;
    }
    setInbox((l) => [...l.slice(-99), { id: crypto.randomUUID(), withId: m.f, mine: false, text: m.text, imgUrl, at: Date.now() }]);
    if (chatWithRef.current?.id !== m.f) {
      toast({
        title: m.n, description: m.text || 'Sent a picture',
        action: <ToastAction altText="Reply" onClick={() => setChatWith({ id: m.f, name: m.n })}>Reply</ToastAction>,
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
    && rosterRef.current.some((r) => r.id === s.owner_id && r.locked && r.spaceId === s.id);

  enterGuard.current = (id) => {
    const target = spaces?.find((s) => s.id === id);
    if (me && target && lockedOffice(target)) {
      if (canSendTo(lastSent.current, `k${target.id}`, Date.now(), 'ring')) {
        lastSent.current.set(`ring:k${target.id}`, Date.now());
        sendPing({ k: 'knock', f: me.id, n: me.name, t: target.owner_id as string, s: target.id });
      }
      toast({ title: `${target.name} is locked`, description: 'We knocked. You will be taken in when they let you.' });
      return;
    }
    setSpaceIdRaw(id);
  };

  useEffect(() => {
    for (const id of [...admittedOffices.current]) {
      const s = spaces?.find((x) => x.id === id);
      if (!s || !roster.some((r) => r.id === s.owner_id && r.locked && r.spaceId === id)) admittedOffices.current.delete(id);
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
    sendDoor({ k: 'let', f: me.id, t: k.id, r: k.room });
    setKnocks((list) => list.filter((x) => x.id !== k.id));
  };

  const [zoom, setZoom] = useState(1);
  const dark = pageIsDark();

  const nameOfSpace = (id: string | null) => spaces?.find((s) => s.id === id)?.name ?? 'an office';
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
    <div className="flex h-[calc(100vh-7rem)] min-h-[480px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Building2 className="h-5 w-5" />Virtual Office</h1>
          <p className="text-sm text-muted-foreground">
            {space.name}{zone && zone.kind !== 'area' && zone.kind !== 'portal' ? ` · ${zone.name}` : ''} · {here.length} {here.length === 1 ? 'person' : 'people'} here
            {!connected && ' · connecting…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Zoom out"><Minus className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.2).toFixed(1)))} aria-label="Zoom in"><Plus className="h-4 w-4" /></Button>
          {isMyOffice && (
            <Button size="sm" variant={myOfficeLocked ? 'default' : 'outline'} onClick={toggleOfficeLock} title="Locked: visitors have to knock and you let them in">
              <Lock className="mr-1.5 h-4 w-4" />{myOfficeLocked ? 'Office locked' : 'Lock my office'}
            </Button>
          )}
          {canRecord && <Button size="sm" variant="outline" onClick={() => setRecordingsOpen(true)}><Circle className="mr-1.5 h-3.5 w-3.5 fill-red-500 text-red-500" />Recordings</Button>}
          <Button size="sm" variant="outline" onClick={() => setAvatarOpen(true)}><Palette className="mr-1.5 h-4 w-4" />Avatar</Button>
          {canEdit && !editing && <Button size="sm" onClick={startEdit}><Pencil className="mr-1.5 h-4 w-4" />Edit office</Button>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-3 md:flex">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person or room…" aria-label="Find a person or room"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm"
            />
          </div>
          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Go to</p>
            <div className="space-y-1">
              {teamSpaces.map((s) => (
                <button key={s.id} type="button" onClick={() => setSpaceId(s.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted ${s.id === space.id ? 'bg-muted font-medium' : ''}`}>
                  <Building2 className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{s.name}</span>
                </button>
              ))}
              {myPersonal && (
                <button type="button" onClick={() => setSpaceId(myPersonal.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted ${myPersonal.id === space.id ? 'bg-muted font-medium' : ''}`}>
                  <DoorOpen className="h-4 w-4 shrink-0 text-emerald-500" /><span className="truncate">My office</span>
                </button>
              )}
            </div>
          </section>

          {roomSpaceId && (
            <section>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rooms</p>
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
            </section>
          )}

          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" />Online ({roster.length})</p>
            <div className="space-y-1">
              {roster.filter((r) => matches(r.name, query)).map((r) => {
                const isMe = r.id === me.id;
                const act = 'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground';
                return (
                  <div key={r.id} className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <span className="min-w-0 flex-1"><span className="block truncate">{r.name}{isMe ? ' (you)' : ''}</span><span className="block truncate text-xs text-muted-foreground">{nameOfSpace(r.spaceId)}</span></span>
                    {!isMe && (
                      <span className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
                        <button type="button" className={act} title={`Go to ${r.name}`} aria-label={`Go to ${r.name}`} onClick={() => goToPerson(r.id, r.spaceId)}><LocateFixed className="h-3.5 w-3.5" /></button>
                        <button type="button" className={`${act} ${follow === r.id ? 'bg-primary/15 text-primary' : ''}`} title={follow === r.id ? 'Stop following' : `Follow ${r.name}`} aria-label={`Follow ${r.name}`} onClick={() => startFollow(r.id)}><Footprints className="h-3.5 w-3.5" /></button>
                        <button type="button" className={act} title={`Ring ${r.name}`} aria-label={`Ring ${r.name}`} onClick={() => ring(r)}><BellRing className="h-3.5 w-3.5" /></button>
                        <button type="button" className={act} title={`Message ${r.name}`} aria-label={`Message ${r.name}`} onClick={() => setChatWith({ id: r.id, name: r.name })}><MessageCircle className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </div>
                );
              })}
              {roster.length === 0 && <p className="px-2.5 text-xs text-muted-foreground">Nobody yet.</p>}
            </div>
          </section>

          {otherOffices.length > 0 && (
            <section>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colleagues' offices</p>
              <div className="space-y-0.5">
                {otherOffices.filter((s) => matches(s.name, query)).map((s) => (
                  <button key={s.id} type="button" onClick={() => setSpaceId(s.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted ${s.id === space.id ? 'bg-muted font-medium' : ''}`}>
                    <span className="truncate">{s.name.replace(/'s office$/, '')}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {roster.some((r) => r.id === s.owner_id && r.locked && r.spaceId === s.id) && <Lock className="h-3 w-3 text-amber-500" aria-label="Locked" />}
                      {roster.some((r) => r.spaceId === s.id) && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>

        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/30">
          <OfficeCanvas
            map={map} spaceId={space.id} items={items} me={me} roster={roster} peers={peers} update={update}
            onZone={onZone} onPortal={onPortal} canEnter={(id) => canEnterRoom(id, lockedRef.current, admitted.current)} onBlocked={onBlocked}
            jump={jump} follow={follow} followOnce={followOnce} onFollowEnd={() => setFollow(null)} dark={dark} zoom={zoom}
            editing={editing} tool={tool} ghost={ghost} onTile={onTile}
          />
          {follow && (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs shadow">
              <Footprints className="h-3.5 w-3.5 text-primary" />Following {roster.find((r) => r.id === follow)?.name ?? 'someone'}
              <button type="button" className="font-medium text-primary" onClick={() => setFollow(null)}>Stop</button>
            </div>
          )}
          {!editing && (
            <CallDock
              joined={calls.joined} busy={calls.busy} error={calls.error} micOn={calls.micOn} camOn={calls.camOn} selfCam={calls.selfCam} sharing={calls.sharing} onShare={() => void calls.toggleShare()} tiles={calls.tiles}
              roomName={zone && zone.kind === 'meeting' ? zone.name : null}
              onJoin={calls.join} onLeave={calls.leave} onMic={calls.toggleMic} onCam={() => void calls.toggleCam()} onMutePeer={calls.toggleMutePeer}
              canRecord={canRecord} recording={recorder.recording} recSeconds={recorder.seconds} recNotice={recNotice}
              roomLocked={roomLocked} knocks={knocks.filter((k) => k.room === meetingRoom?.id)} onToggleLock={toggleLock} onLetIn={letIn}
              onDismissKnock={(id) => setKnocks((l) => l.filter((x) => x.id !== id))}
              recError={recorder.error} unsent={recorder.unsent} onRecord={recorder.start} onStopRecord={recorder.stop} onDismissUnsent={recorder.dismissUnsent}
            />
          )}
          {!editing && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur">
              Walk with <kbd className="rounded border px-1">W</kbd><kbd className="ml-0.5 rounded border px-1">A</kbd><kbd className="ml-0.5 rounded border px-1">S</kbd><kbd className="ml-0.5 rounded border px-1">D</kbd> or the arrow keys. Walk through a door to change rooms.
            </div>
          )}

          {editing && (
            <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur">
              {PALETTE.map((t) => (
                <Button key={t} size="sm" variant={tool === t ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setTool(t)}>{ITEM_DEFS[t].label}</Button>
              ))}
              <Button size="sm" variant={tool === 'erase' ? 'destructive' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setTool('erase')}><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRot((r) => (((r + 1) % 4) as 0 | 1 | 2 | 3))}><RotateCw className="mr-1 h-3.5 w-3.5" />Turn</Button>
              <span className="mx-1 hidden text-xs text-muted-foreground sm:inline">Click the floor to place. Green is allowed.</span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDraft(map.items.map((i) => ({ ...i })))}>Reset</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={stopEdit}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
                <Button size="sm" className="h-7 px-2 text-xs" onClick={save} disabled={saving}><Save className="mr-1 h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={joinPrompt && !calls.joined} onOpenChange={(o) => { if (!o) closeJoinPrompt(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Turn on your camera and microphone?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            People near you will see and hear you, and you will see and hear them. Walk away and the sound fades. Inside a meeting room only the people in that room can hear you. You can mute or turn the camera off at any time.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => void joinWith(true)}><Video className="mr-2 h-4 w-4" />Join with camera and microphone</Button>
            <Button variant="outline" onClick={() => void joinWith(false)}><Mic className="mr-2 h-4 w-4" />Join with microphone only</Button>
            <Button variant="ghost" onClick={closeJoinPrompt}>Not now</Button>
          </div>
        </DialogContent>
      </Dialog>
      <MessageDialog person={chatWith} online={!!chatWith && roster.some((r) => r.id === chatWith.id)} messages={inbox} onClose={() => setChatWith(null)} onSend={sendMessage} />
      <RecordingsDialog open={recordingsOpen} onOpenChange={setRecordingsOpen} meId={me.id} isAdmin={isAdmin} />

      <AvatarDialog
        open={avatarOpen} onOpenChange={setAvatarOpen} value={me.avatar} name={me.name} saving={savingAvatar}
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
