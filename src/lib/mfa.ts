// MFA helpers — wraps Supabase Auth's native TOTP API + our trusted_devices
// + backup codes layer.
//
// Glossary:
//   factor           — Supabase Auth concept; one TOTP enrolment per user.
//                      Supabase tracks status "unverified" → "verified".
//   AAL              — Authenticator Assurance Level. aal1 = password only,
//                      aal2 = password + verified MFA challenge.
//   trusted device   — opt-in localStorage device_id that lets the user skip
//                      the MFA challenge for 30 days from this browser.
//
// Design choices:
//   - MFA is always opt-in. No role is forced.
//   - Trusted devices are entirely separate from Supabase Auth — they do
//     NOT upgrade the AAL level. They only gate whether we PROMPT for the
//     challenge in the UI on next login. The app gates by role anyway.
//   - Backup codes are server-stored as bcrypt hashes; plaintext is shown
//     once at generation time.

import { supabase } from '@/lib/supabase';

const DEVICE_ID_KEY = 'kdops_trusted_device_id';

// ───────────────────────────────────────────────────────────────────────────
// Trusted device helpers (browser-side)
// ───────────────────────────────────────────────────────────────────────────

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / blocked storage — fall back to a per-tab UUID. Means
    // the user will be prompted every reload, which is the right tradeoff.
    return crypto.randomUUID();
  }
}

export function clearLocalDeviceId(): void {
  try { localStorage.removeItem(DEVICE_ID_KEY); } catch { /* ignore */ }
}

export async function isDeviceTrusted(): Promise<boolean> {
  try {
    const id = getOrCreateDeviceId();
    const { data, error } = await supabase.rpc('is_device_trusted', { p_device_id: id });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function registerTrustedDevice(args: {
  label?: string;
  days?: number;
}): Promise<void> {
  const id = getOrCreateDeviceId();
  const label = args.label ?? guessDeviceLabel();
  // Hash the IP client-side is fragile (we don't know our public IP). Skip;
  // the RPC accepts null for ip_hash. We pass UA for traceability.
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') ?? '';
  await supabase.rpc('register_trusted_device', {
    p_device_id: id,
    p_label: label,
    p_ip_hash: null,
    p_user_agent: ua,
    p_days: args.days ?? 30,
  });
}

export async function listTrustedDevices(): Promise<Array<{
  id: string;
  device_id: string;
  label: string | null;
  user_agent: string | null;
  trusted_until: string;
  last_seen_at: string;
  created_at: string;
}>> {
  const { data } = await supabase
    .from('trusted_devices')
    .select('id, device_id, label, user_agent, trusted_until, last_seen_at, created_at')
    .order('last_seen_at', { ascending: false });
  return (data ?? []) as any;
}

export async function revokeTrustedDevice(id: string): Promise<void> {
  const { error } = await supabase.from('trusted_devices').delete().eq('id', id);
  if (error) throw error;
}

function guessDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';
  let os = 'Device';
  if (/mac/i.test(ua)) os = 'Mac';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  return `${browser} on ${os}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Supabase Auth TOTP wrappers
// ───────────────────────────────────────────────────────────────────────────

export async function listMfaFactors(): Promise<{
  totpEnrolled: boolean;
  factorId: string | null;
  status: 'verified' | 'unverified' | null;
}> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { totpEnrolled: false, factorId: null, status: null };
  const totp = (data.totp ?? [])[0];
  if (!totp) return { totpEnrolled: false, factorId: null, status: null };
  return {
    totpEnrolled: totp.status === 'verified',
    factorId: totp.id,
    status: totp.status as 'verified' | 'unverified',
  };
}

export async function enrollMfa(): Promise<{
  factorId: string;
  qrCodeSvg: string;
  secret: string;
  uri: string;
}> {
  // Supabase issues a fresh enrolment each call — clean up any unverified
  // factor first so re-running the wizard doesn't pile up dead rows.
  const existing = await supabase.auth.mfa.listFactors();
  for (const f of existing.data?.totp ?? []) {
    if (f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error || !data) throw new Error(error?.message ?? 'Could not start MFA enrolment');
  return {
    factorId: data.id,
    qrCodeSvg: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/** Verify the 6-digit code emitted by the authenticator app. Both during
 *  enrolment ("activate this factor") and during sign-in ("challenge"). */
export async function verifyMfa(factorId: string, code: string): Promise<void> {
  const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chalErr || !chal) throw new Error(chalErr?.message ?? 'Could not request MFA challenge');
  const { error: verErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: chal.id,
    code: code.replace(/\s/g, ''),
  });
  if (verErr) throw new Error(verErr.message);
}

export async function disableMfa(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  // Also wipe trusted devices + backup codes for this user, since they're
  // now meaningless without an active factor.
  await supabase.from('trusted_devices').delete().eq('user_id', (await supabase.auth.getUser()).data.user?.id);
  await supabase.from('mfa_backup_codes').delete().eq('user_id', (await supabase.auth.getUser()).data.user?.id);
  clearLocalDeviceId();
}

// ───────────────────────────────────────────────────────────────────────────
// Backup codes
// ───────────────────────────────────────────────────────────────────────────

export async function generateBackupCodes(): Promise<string[]> {
  const { data, error } = await supabase.rpc('generate_mfa_backup_codes');
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function consumeBackupCode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('consume_mfa_backup_code', { p_code: code.trim() });
  if (error) return false;
  return Boolean(data);
}

export async function countUnusedBackupCodes(): Promise<number> {
  const { count } = await supabase
    .from('mfa_backup_codes')
    .select('id', { count: 'exact', head: true })
    .is('used_at', null);
  return count ?? 0;
}
