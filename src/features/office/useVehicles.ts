import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** A go-kart or bike that stays where its last rider left it. Only the database functions change these rows. */
export interface VehicleRow { space_id: string; item_id: string; x: number; y: number; dir: number; holder_id: string | null; lease_expires_at: string | null; version: number }

// the new table and functions are not in the generated database types yet
 
const sb = supabase as any;

/** Is this vehicle being ridden by somebody right now (their hold has not run out)? */
export function isHeld(v: VehicleRow, now = Date.now()): boolean {
  return !!v.holder_id && !!v.lease_expires_at && Date.parse(v.lease_expires_at) > now;
}

export function useVehicles(spaceId: string | null) {
  const [rows, setRows] = useState<Record<string, VehicleRow>>({});

  const load = useCallback(async () => {
    if (!spaceId) { setRows({}); return; }
    const { data, error } = await sb.from('office_vehicles').select('*').eq('space_id', spaceId);
    if (error) return; // the table may not exist yet; bikes then simply stay where the layout puts them
    const m: Record<string, VehicleRow> = {};
    for (const r of (data ?? []) as VehicleRow[]) m[r.item_id] = { ...r, x: Number(r.x), y: Number(r.y) };
    setRows(m);
  }, [spaceId]);

  useEffect(() => {
    void load();
    if (!spaceId) return;
    const ch = supabase.channel(`office-vehicles:${spaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_vehicles', filter: `space_id=eq.${spaceId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [spaceId, load]);

  /** Try to take a vehicle. 'taken' means somebody else got there first; 'offline' means we could not ask (ride anyway). */
  const take = useCallback(async (item: string, x: number, y: number): Promise<'ok' | 'taken' | 'offline'> => {
    if (!spaceId) return 'offline';
    try {
      const { data, error } = await sb.rpc('office_vehicle_take', { p_space: spaceId, p_item: item, p_x: x, p_y: y });
      if (error) return 'offline';
      return data && data.holder_id ? 'ok' : 'taken';
    } catch { return 'offline'; }
  }, [spaceId]);

  /** Keep hold of the vehicle while riding. */
  const keep = useCallback(async (item: string) => {
    if (!spaceId) return;
    try { await sb.rpc('office_vehicle_keep', { p_space: spaceId, p_item: item }); } catch { /* the next beat will try again */ }
  }, [spaceId]);

  /** Get off: the vehicle stays exactly here. */
  const drop = useCallback(async (item: string, x: number, y: number, dir: number) => {
    if (!spaceId) return;
    // show it where it was left straight away, before the database answers
    setRows((r) => ({ ...r, [item]: { space_id: spaceId, item_id: item, x, y, dir, holder_id: null, lease_expires_at: null, version: (r[item]?.version ?? 0) + 1 } }));
    try { await sb.rpc('office_vehicle_drop', { p_space: spaceId, p_item: item, p_x: x, p_y: y, p_dir: dir }); } catch { /* it comes back on the next refresh */ }
  }, [spaceId]);

  return { rows, take, keep, drop, reload: load };
}
