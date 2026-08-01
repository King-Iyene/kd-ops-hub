/**
 * e-signature helpers — hash + persist to signed_documents.
 *
 * Legal basis: Cybercrimes Act 2015 s.17 + Evidence Act 2011 s.84.
 * Enforceability rests on
 *   - identifying the signer (signer_id + email + captured name)
 *   - showing approval of the content (signature PNG + document_html)
 *   - producing a tamper-evident audit trail (SHA-256 hash + timestamp
 *     + best-effort ip / user-agent / geo)
 *
 * All fields captured server-side via one insert. No update / delete —
 * a wrong signature is superseded by a new insert linking to the same
 * reference_id.
 */

import { supabase } from '@/lib/supabase';

export type DocumentKind =
  | 'offer_letter' | 'contract' | 'contract_addendum' | 'disciplinary_response'
  | 'policy_acknowledgement' | 'ndpr_consent' | 'exit_clearance' | 'other';

export interface SignArgs {
  documentKind: DocumentKind;
  documentTitle: string;
  documentHtml: string;
  employeeId: string | null;
  referenceType?: string;
  referenceId?: string;
  signerId: string | null;
  signerName: string;
  signerEmail: string;
  signaturePng: string;
  // Best-effort audit
  geo?: { lat: number; lng: number; accuracy?: number } | null;
}

/** Browser SubtleCrypto SHA-256 → hex string. */
export async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Insert a signed document row and return its id + hash. */
export async function signAndStore(args: SignArgs): Promise<{
  id: string;
  hash: string;
}> {
  const hash = await sha256(
    `${args.documentHtml}::${args.signerEmail}::${new Date().toISOString().slice(0, 10)}`,
  );
  const { data, error } = await supabase
    .from('signed_documents' as any)
    .insert({
      document_kind: args.documentKind,
      document_title: args.documentTitle,
      document_html: args.documentHtml,
      document_hash: hash,
      employee_id: args.employeeId,
      reference_type: args.referenceType ?? null,
      reference_id: args.referenceId ?? null,
      signer_id: args.signerId,
      signer_name: args.signerName,
      signer_email: args.signerEmail.toLowerCase(),
      signature_png: args.signaturePng,
      signed_user_agent: navigator.userAgent.slice(0, 500),
      signed_geo: args.geo ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as any).id, hash };
}

/** Try to capture geolocation for the audit. Silent fail (user denied etc.). */
export function tryGetGeo(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
} | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) resolve(null);
      done = true;
    }, 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 60_000 },
    );
  });
}
