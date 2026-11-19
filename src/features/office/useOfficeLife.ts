import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Events (office hours, all-hands, workshops) and notes or gifts left on an office. Every change goes through a database function. */
export interface EventRow { id: string; space_id: string; title: string; details: string | null; starts_at: string; ends_at: string; zone: string | null; created_by: string | null }
export interface NoteRow { id: string; space_id: string; desk: string; from_id: string | null; body: string; gift: string | null; created_at: string }

// the new tables and functions are not in the generated database types yet

const sb = supabase as any;

/** Events that have not finished yet, soonest first. */
export function upcoming(events: EventRow[], now = Date.now()): EventRow[] {
  return events.filter((e) => Date.parse(e.ends_at) > now).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** Is this event on right now? */
export function isLive(e: EventRow, now = Date.now()): boolean {
  return Date.parse(e.starts_at) <= now && Date.parse(e.ends_at) > now;
}

/** A short human time such as "Today 14:30", "Tomorrow 09:00" or "Fri 12 Dec, 16:00". */
export function whenText(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / 86400000);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export function useOfficeLife(spaceId: string | null, enabled: boolean) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);

  const load = useCallback(async () => {
    if (!spaceId) { setEvents([]); setNotes([]); return; }
    const since = new Date(Date.now() - 86400000).toISOString();
    const [e, n] = await Promise.all([
      sb.from('office_events').select('*').eq('space_id', spaceId).gte('ends_at', since).order('starts_at', { ascending: true }).limit(200),
      sb.from('office_desk_notes').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(300),
    ]);
    if (!e.error) setEvents((e.data ?? []) as EventRow[]);
    if (!n.error) setNotes((n.data ?? []) as NoteRow[]);
  }, [spaceId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    if (!spaceId) return;
    const ch = supabase.channel(`office-life:${spaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_events', filter: `space_id=eq.${spaceId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_desk_notes', filter: `space_id=eq.${spaceId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [spaceId, enabled, load]);

  const createEvent = useCallback(async (title: string, details: string, startsAt: Date, minutes: number, zone: string | null): Promise<string | null> => {
    if (!spaceId) return 'No office open';
    const { error } = await sb.rpc('office_event_create', { p_space: spaceId, p_title: title.trim(), p_details: details.trim(), p_starts: startsAt.toISOString(), p_ends: new Date(startsAt.getTime() + minutes * 60000).toISOString(), p_zone: zone });
    if (error) return String(error.message ?? 'Could not add the event');
    void load();
    return null;
  }, [spaceId, load]);

  const deleteEvent = useCallback(async (id: string) => {
    setEvents((l) => l.filter((x) => x.id !== id));
    await sb.rpc('office_event_delete', { p_event: id });
    void load();
  }, [load]);

  const leaveNote = useCallback(async (desk: string, body: string, gift: string | null): Promise<string | null> => {
    if (!spaceId) return 'No office open';
    const { error } = await sb.rpc('office_note_leave', { p_space: spaceId, p_desk: desk, p_body: body.trim(), p_gift: gift });
    if (error) return String(error.message ?? 'Could not leave the note');
    void load();
    return null;
  }, [spaceId, load]);

  const deleteNote = useCallback(async (id: string) => {
    setNotes((l) => l.filter((x) => x.id !== id));
    await sb.rpc('office_note_delete', { p_note: id });
    void load();
  }, [load]);

  return useMemo(() => ({ events, notes, createEvent, deleteEvent, leaveNote, deleteNote }), [events, notes, createEvent, deleteEvent, leaveNote, deleteNote]);
}
