// Campaign sending, pure parts (no Deno APIs, so it can be unit tested).
//
// A campaign may be handed to a sender (bulk-email-sender / message-campaign-sender) when it is a
// 'draft' (the composer's "send now") or a 'scheduled' campaign whose time has come (the
// campaign-scheduler). The authoritative claim is the SQL RPC claim_campaign_for_sending /
// claim_message_campaign_for_sending (one UPDATE ... WHERE ... RETURNING); this is only the cheap pre-check
// that gives the caller a clear message before any work is done. 'sending' is deliberately NOT accepted
// here: a campaign becomes 'sending' only by being claimed, so a second caller can never start a second send.

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'partially_sent' | 'failed' | 'cancelled' | string;

export type Precheck = { ok: true } | { ok: false; error: string };

export function precheckCampaignStatus(status: CampaignStatus, scheduledFor: string | null | undefined, now: Date = new Date()): Precheck {
  if (status === 'draft') return { ok: true };
  if (status === 'scheduled') {
    const due = scheduledFor ? new Date(scheduledFor).getTime() : NaN;
    if (!Number.isFinite(due) || due > now.getTime()) return { ok: false, error: 'Campaign is scheduled for later' };
    return { ok: true };
  }
  return { ok: false, error: `Campaign already ${status}` };
}
