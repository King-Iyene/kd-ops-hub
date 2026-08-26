import { supabase } from '@/lib/supabase';
import { reverseGeocode as googleReverseGeocode } from '@/lib/maps';
import { toCsv, downloadCsv } from '@/lib/csv';

export interface FieldStaff {
  id: string;
  full_name: string;
  email: string;
}

export interface VehicleSummary {
  id: string;
  name: string;
  plate_number: string;
  weekly_budget_ngn: number;
  carry_forward_ngn: number;
  assigned_driver_id: string | null;
  insurance_expiry: string | null;
  road_worthiness_expiry: string | null;
  hackney_permit_expiry: string | null;
  vehicle_license_expiry: string | null;
  next_service_date: string | null;
  tank_capacity_litres: number;
  current_fuel_litres: number;
  last_refuel_at: string | null;
  avg_km_per_litre: number;
  fuel_consumption_rate_lkm: number;
  home_base_lat: number | null;
  home_base_lng: number | null;
  out_of_service_until: string | null;
}

export interface Geofence {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  color: string;
  description: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface FuelRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  station_name: string;
  amount_ngn: number;
  litres_est: number | null;
  odometer: number | null;
  reason: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  request_doc_url: string | null;
  receipt_url: string | null;
  payment_sent_at: string | null;
  fuel_station_name: string | null;
  litres_filled: number | null;
  receipt_amount_ngn: number | null;
  receipt_date: string | null;
  receipt_sha256: string | null;
  receipt_original_sha256: string | null;
  receipt_has_exif: boolean | null;
  budget_exception: boolean;
  budget_exception_by: string | null;
  budget_exception_at: string | null;
  is_anomaly: boolean;
  anomaly_type: string | null;
  anomaly_reviewed_by: string | null;
  anomaly_reviewed_at: string | null;
  anomaly_review_note: string | null;
  rejection_reason: string | null;
  batch_id?: string | null;
  paystack_fee_ngn?: number | null;
  paystack_raw?: any;
  logged_externally?: boolean | null;
}

// Rows logged via "Log External Purchase" are always paid AND receipted
// at insert time, but a DB CHECK constraint
// (fuel_requests_logged_externally_never_pending) forces their `status`
// column to stay 'payment_sent' so the batch-creation path never sees
// them. Anywhere the raw status would be shown or used to decide
// whether a receipt is still owed, use this instead of `.status`.
export function displayFuelStatus(r: Pick<FuelRequest, 'status' | 'logged_externally' | 'receipt_url'>): string {
  if (r.logged_externally && r.receipt_url) return 'completed';
  return r.status;
}

export interface TripLog {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  start_location: string;
  end_location: string;
  odometer_start: number | null;
  odometer_end: number | null;
  km_driven: number | null;
  vehicle_id: string | null;
  fuel_amount_ngn: number | null;
  litres: number | null;
  issues: string | null;
  created_at: string;
  trip_start_time: string | null;
  trip_end_time: string | null;
  duration_minutes: number | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  is_anomaly: boolean;
  anomaly_reason: string | null;
  is_out_of_area: boolean;
  anomaly_reviewed_by: string | null;
  anomaly_reviewed_at: string | null;
  anomaly_review_note: string | null;
  status: string;
}

export interface BreadcrumbRow {
  id: string;
  trip_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed_kmh: number | null;
  heading: number | null;
  is_speeding: boolean;
  recorded_at: string;
}

export interface TripEvent {
  id: string;
  trip_id: string;
  event_type: 'speeding' | 'hard_braking' | 'extended_stop';
  lat: number | null;
  lng: number | null;
  speed_kmh: number | null;
  details: string | null;
  recorded_at: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  make_model: string | null;
  year: number | null;
  color: string | null;
  vin: string | null;
  assigned_driver_id: string | null;
  weekly_budget_ngn: number;
  tank_capacity_litres: number;
  current_fuel_litres: number;
  last_refuel_at: string | null;
  avg_km_per_litre: number;
  fuel_consumption_rate_lkm: number;
  home_base_lat: number | null;
  home_base_lng: number | null;
  insurance_expiry: string | null;
  road_worthiness_expiry: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  notes: string | null;
  status: string;
  total_mileage_km: number | null;
  out_of_service_until: string | null;
  created_at: string;
}

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  service_type: string;
  due_date: string | null;
  due_mileage_km: number | null;
  recurrence: string;
  last_done_date: string | null;
  last_done_mileage_km: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  expense_id: string | null;
  receipt_url: string | null;
}

export type GeoCoords = { lat: number; lng: number; accuracy: number };
export type GeoState = 'idle' | 'acquiring' | 'ok' | 'denied' | 'unavailable' | 'timeout' | 'https-required';

export const isGeoError = (s: GeoState): s is Exclude<GeoState, 'idle' | 'acquiring' | 'ok'> =>
  s === 'denied' || s === 'unavailable' || s === 'timeout' || s === 'https-required';

export const GEO_ERROR_MSG: Record<Exclude<GeoState, 'idle' | 'acquiring' | 'ok'>, string> = {
  denied:          'Location permission denied — click the lock icon in your address bar, allow location, then retry.',
  unavailable:     'GPS signal unavailable — your browser could not determine location.',
  timeout:         'GPS timed out — your browser took too long to respond. Tap Retry to try again.',
  'https-required':'This page must be loaded over HTTPS for GPS to work.',
};

export function getGeolocation(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject('unavailable'); return; }

    if (typeof window !== 'undefined'
        && window.location.protocol !== 'https:'
        && window.location.hostname !== 'localhost'
        && window.location.hostname !== '127.0.0.1') {
      reject('https-required');
      return;
    }

    let settled = false;
    /* eslint-disable @typescript-eslint/no-use-before-define */
    const settle = (coords: GeoCoords) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      resolve(coords);
    };
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      reject(code);
    };
    /* eslint-enable @typescript-eslint/no-use-before-define */

    const hardTimer = setTimeout(() => fail('timeout'), 7_000);

    navigator.geolocation.getCurrentPosition(
      (p) => settle({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: false, timeout: 1_000, maximumAge: 60_000 },
    );
    navigator.geolocation.getCurrentPosition(
      (p) => settle({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: false, timeout: 5_000, maximumAge: 30_000 },
    );
    navigator.geolocation.getCurrentPosition(
      (p) => settle({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => fail(e.code === 1 ? 'denied' : e.code === 2 ? 'unavailable' : 'timeout'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

export function paystackFeeForAmount(amountNgn: number): number {
  if (amountNgn <= 0) return 0;
  if (amountNgn <= 5_000) return 10;
  if (amountNgn <= 50_000) return 25;
  return 50;
}

export function getFuelFee(req: { paystack_fee_ngn?: number | null; paystack_raw?: any; status: string; amount_ngn: number }): number {
  const direct = Number(req.paystack_fee_ngn || 0);
  if (direct > 0) return direct;
  const rawKobo = Number(req.paystack_raw?.fee || 0);
  if (rawKobo > 0) return rawKobo / 100;
  if (req.status === 'completed' || req.status === 'payment_sent' || req.status === 'receipt_uploaded') {
    return paystackFeeForAmount(Number(req.amount_ngn || 0));
  }
  return 0;
}

export function formatCoords(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? 'E' : 'W'}`;
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function detectAnomalies(distanceKm: number | null, durationMin: number): { isAnomaly: boolean; reason: string | null } {
  const flags: string[] = [];
  if (distanceKm !== null && distanceKm < 0)              flags.push('Odometer went backwards');
  if (distanceKm !== null && distanceKm > 500)            flags.push('Distance exceeds 500 km');
  if (durationMin > 720)                                  flags.push('Trip exceeded 12 hours');
  if (durationMin < 2 && distanceKm !== null && distanceKm > 1) flags.push('Implausibly short duration for distance covered');
  if (durationMin > 5 && distanceKm === 0)                flags.push('No distance recorded despite 5+ minutes elapsed');
  if (distanceKm !== null && durationMin > 0) {
    const avgKmH = (distanceKm / durationMin) * 60;
    if (avgKmH > 150) flags.push(`Average speed ${avgKmH.toFixed(0)} km/h exceeds 150 km/h`);
  }
  return flags.length > 0 ? { isAnomaly: true, reason: flags.join('; ') } : { isAnomaly: false, reason: null };
}


export interface ReceiptDebt {
  fuelCount: number;
  fuelOldestDays: number | null;
  repairCount: number;
  repairOldestDays: number | null;
}

export function daysSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

export async function getReceiptDebt(employeeId: string): Promise<ReceiptDebt> {
  const [{ data: fuelPending }, { data: repairPending }] = await Promise.all([
    supabase
      .from('fuel_requests')
      .select('payment_sent_at')
      .eq('driver_id', employeeId)
      .eq('status', 'payment_sent')
      // Rows logged via "Log External Purchase" are always inserted with
      // status='payment_sent' (a DB CHECK constraint requires it) even
      // though the receipt is already attached — they don't actually owe
      // a receipt, so they must not count toward this debt.
      .is('receipt_url', null)
      .is('deleted_at', null)
      .order('payment_sent_at', { ascending: true }),
    supabase
      .from('expenses')
      .select('created_at')
      .eq('submitted_by', employeeId)
      .eq('category', 'repair')
      .eq('status', 'approved')
      // Reimbursement repairs over ₦10,000 already require a receipt at
      // submission (see submitRepairRequest in FuelTab.tsx) — by the time
      // one is approved, the receipt is already attached, so it can never
      // legitimately land here. Company charge is the only path where the
      // receipt is optional up front, so it's the only one that can be
      // "approved but no receipt yet" — that's the real gap this debt
      // check exists to close.
      .eq('is_reimbursement', false)
      .is('receipt_url', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ]);
  return {
    fuelCount: fuelPending?.length ?? 0,
    fuelOldestDays: daysSinceIso(fuelPending?.[0]?.payment_sent_at),
    repairCount: repairPending?.length ?? 0,
    repairOldestDays: daysSinceIso(repairPending?.[0]?.created_at),
  };
}

export function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const data = rows.map((r) => headers.map((h) => r[h]));
  downloadCsv(filename, toCsv(headers, data));
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  return await googleReverseGeocode(lat, lng);
}

export function computeIdleMinutes(breadcrumbs: BreadcrumbRow[]): number {
  if (breadcrumbs.length < 2) return 0;
  const MIN_STOP_MS = 5 * 60_000;
  let stopStartMs: number | null = null;
  let idleMs = 0;
  for (let i = 0; i < breadcrumbs.length; i++) {
    const b = breadcrumbs[i];
    const speed = b.speed_kmh;
    const t = Date.parse(b.recorded_at);
    if (speed !== null && speed < 3) {
      if (stopStartMs === null) stopStartMs = t;
    } else {
      if (stopStartMs !== null) {
        const dur = t - stopStartMs;
        if (dur >= MIN_STOP_MS) idleMs += dur;
        stopStartMs = null;
      }
    }
  }
  if (stopStartMs !== null) {
    const last = breadcrumbs[breadcrumbs.length - 1];
    const dur = Date.parse(last.recorded_at) - stopStartMs;
    if (dur >= MIN_STOP_MS) idleMs += dur;
  }
  return Math.round(idleMs / 60000);
}
