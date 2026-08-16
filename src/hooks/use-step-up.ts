import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listMfaFactors, verifyMfa } from '@/lib/mfa';

export type StepUpPurpose =
  | 'approve_batch' | 'approve_expense'
  | 'reject_batch'  | 'reject_expense'
  | 'cap_change'    | 'quick_pay';

interface StepUpRequest {
  purpose: StepUpPurpose;
  resourceId?: string | null;
  resolve: (token: string | null) => void;
  reject: (err: Error) => void;
}

const listeners: Array<(req: StepUpRequest | null) => void> = [];
let current: StepUpRequest | null = null;

function dispatch(req: StepUpRequest | null) {
  current = req;
  listeners.forEach((l) => l(current));
}

/**
 * Request a step-up token for a sensitive action. Resolves to `null`
 * immediately (no dialog shown) when the company hasn't turned on
 * `approval_step_up_required` — matching current behaviour exactly.
 * Otherwise opens the re-auth dialog and resolves the token once the user
 * completes password + TOTP, or rejects if they cancel.
 */
export async function requestStepUp(
  purpose: StepUpPurpose,
  resourceId?: string | null,
): Promise<string | null> {
  const { data } = await supabase
    .from('company_settings')
    .select('approval_step_up_required')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();
  if (!(data as any)?.approval_step_up_required) return null;

  return new Promise((resolve, reject) => {
    dispatch({ purpose, resourceId, resolve, reject });
  });
}

/** Subscribes the host dialog to the current pending step-up request. */
export function useStepUpRequest() {
  const [req, setReq] = useState<StepUpRequest | null>(current);
  useEffect(() => {
    listeners.push(setReq);
    return () => {
      const i = listeners.indexOf(setReq);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);
  return req;
}

export function cancelStepUp() {
  if (current) {
    current.reject(new Error('STEP_UP_CANCELLED'));
    dispatch(null);
  }
}

/**
 * Submits the password + TOTP code. On success, resolves the pending
 * request's promise with the minted token and closes the dialog. On
 * failure (wrong password/code), throws so the dialog can show an inline
 * error and let the user retry — it does NOT reject/close the pending
 * request, since a typo shouldn't abort the whole approval. Cancelling
 * explicitly (cancelStepUp) is the only path that rejects it.
 */
export async function submitStepUp(password: string, totpCode: string): Promise<void> {
  if (!current) return;
  const { purpose, resourceId, resolve } = current;

  const factors = await listMfaFactors();
  if (!factors.totpEnrolled || !factors.factorId) {
    throw new Error('Two-factor authentication is required for approvals. Set up TOTP in Security Settings first.');
  }
  // Elevates the session to AAL2 — create_step_up_session checks this.
  await verifyMfa(factors.factorId, totpCode);

  const { data, error } = await supabase.rpc('create_step_up_session', {
    p_password: password,
    p_totp_code: totpCode,
    p_purpose: purpose,
    p_resource_id: resourceId ?? null,
  });
  if (error) throw new Error(error.message);

  dispatch(null);
  resolve(data as string);
}
