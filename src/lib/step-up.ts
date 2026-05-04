// Step-up authentication helpers.
//
// Every approval action (batch/expense approve/reject, QuickPay) must be
// preceded by a fresh step-up session:
//   1. Client calls verifyMfa(factorId, totpCode) → Supabase Auth → AAL2.
//   2. Client calls createStepUpSession() → RPC checks password + AAL2 → token.
//   3. Client passes token to the approval RPC.

import { supabase } from '@/lib/supabase';

export type StepUpPurpose =
  | 'approve_batch'
  | 'approve_expense'
  | 'reject_batch'
  | 'reject_expense'
  | 'cap_change'
  | 'quick_pay';

export class StepUpLockedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'StepUpLockedError';
  }
}

export class StepUpNoTotpError extends Error {
  constructor() {
    super('Two-factor authentication is required for approvals. Set up TOTP in Security Settings first.');
    this.name = 'StepUpNoTotpError';
  }
}

/** Create a step-up session token.
 *  The caller must have already called verifyMfa() so the JWT is at AAL2.
 *  Returns the session UUID (step-up token) to pass to the approval RPC. */
export async function createStepUpSession(params: {
  password: string;
  totpCode: string;
  purpose: StepUpPurpose;
  resourceId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_step_up_session', {
    p_password:    params.password,
    p_totp_code:   params.totpCode,
    p_purpose:     params.purpose,
    p_resource_id: params.resourceId ?? null,
    p_user_agent:  typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });

  if (error) {
    if (error.message?.toLowerCase().includes('locked')) {
      throw new StepUpLockedError(error.message);
    }
    if (error.message?.toLowerCase().includes('two-factor') ||
        error.message?.toLowerCase().includes('totp')) {
      throw new StepUpNoTotpError();
    }
    throw error;
  }

  if (!data) throw new Error('No token returned from step-up session');
  return data as string;
}

/** Consume a step-up token from the client side (used by QuickPay, which
 *  doesn't route through an approval RPC).
 *  Returns true if the token was valid and was consumed. */
export async function consumeStepUpToken(params: {
  token: string;
  purpose: StepUpPurpose;
  resourceId?: string | null;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('consume_step_up_token', {
    p_token:       params.token,
    p_purpose:     params.purpose,
    p_resource_id: params.resourceId ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}
