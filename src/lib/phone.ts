/**
 * Nigerian phone-number normalisation for SMS / WhatsApp delivery.
 *
 * Why bother: profiles.phone is free-text and users enter every variation:
 *   "0801 234 5678", "+234 801 234 5678", "234-801-234-5678",
 *   "08012345678", "8012345678", "+2348012345678".
 *
 * Termii (and most NG providers) only accept international form WITHOUT a
 * plus sign — e.g. `2348012345678`. NIBSS NIP narration is also length-
 * sensitive, so we normalise once at send-time and cache the canonical form.
 *
 * The ranges we support are the live MNCs in 2026 (MTN/Glo/Airtel/9mobile +
 * Smile/ntel + a few mobile-network MVNOs). Landline numbers are rejected
 * because Termii cannot deliver SMS to them.
 */

/** Nigerian mobile numbers always start with 0 followed by 7, 8, or 9 (NCC range). */
const NG_MOBILE_LEAD = /^0[789]\d{9}$/;

export interface PhoneParseResult {
  ok: boolean;
  /** Canonical E.164 form with leading + (e.g. "+2348012345678"). */
  e164?: string;
  /** Form Termii expects: digits only, country code prefix, no leading + (e.g. "2348012345678"). */
  termii?: string;
  /** Local form, '0' + 10 digits. */
  local?: string;
  reason?: string;
}

/**
 * Parse and normalise a Nigerian phone number.
 *
 * Accepts any of:
 *   - "08012345678"
 *   - "8012345678"           (assumed NG, prepend 0)
 *   - "+2348012345678"
 *   - "2348012345678"
 *   - any of the above with spaces, dashes, parens, dots
 *
 * Rejects: numbers whose 4-digit prefix isn't a recognised NG mobile MNC,
 * landlines, blanks, and inputs shorter than 10 digits.
 */
export function parseNigerianPhone(raw: string | null | undefined): PhoneParseResult {
  if (!raw) return { ok: false, reason: 'No phone number on file' };
  // Strip every non-digit except the leading + (we don't need + after this).
  const digits = String(raw).replace(/[^\d]/g, '');
  if (digits.length < 10) {
    return { ok: false, reason: 'Phone number is too short' };
  }

  let local: string;
  if (digits.startsWith('234')) {
    // 234 followed by 10 mobile digits = full international.
    if (digits.length !== 13) {
      return { ok: false, reason: 'International NG numbers must be 13 digits (234 + 10)' };
    }
    local = '0' + digits.slice(3);
  } else if (digits.startsWith('0')) {
    if (digits.length !== 11) {
      return { ok: false, reason: 'Local NG numbers must be 11 digits (0 + 10)' };
    }
    local = digits;
  } else {
    // Bare 10 digits — assume NG and add the leading 0.
    if (digits.length !== 10) {
      return { ok: false, reason: 'Could not interpret phone format' };
    }
    local = '0' + digits;
  }

  if (!NG_MOBILE_LEAD.test(local)) {
    return {
      ok: false,
      reason: 'Not a Nigerian mobile number (must start with 070, 080, or 090)',
    };
  }

  const e164 = '+234' + local.slice(1);
  const termii = '234' + local.slice(1);
  return { ok: true, e164, termii, local };
}

/**
 * Convenience wrapper: returns the Termii form or null. Use this at the
 * call site where SMS / WhatsApp is dispatched and you want to silently
 * skip users without a valid phone.
 */
export function toTermiiNumber(raw: string | null | undefined): string | null {
  const r = parseNigerianPhone(raw);
  return r.ok ? r.termii! : null;
}

/** Format for display: "0801 234 5678" — the form Nigerians instinctively read. */
export function formatNigerianPhone(raw: string | null | undefined): string {
  const r = parseNigerianPhone(raw);
  if (!r.ok) return raw ?? '';
  // 0XXX XXX XXXX
  return r.local!.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
}
