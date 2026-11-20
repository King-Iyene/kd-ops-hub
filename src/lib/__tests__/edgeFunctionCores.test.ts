import { describe, expect, it } from 'vitest';
import { precheckCampaignStatus } from '../../../supabase/functions/_shared/campaign-send-core';
import { SEND_RATE_LIMIT_MAX, decideSendRateLimit, rateWindowStart } from '../../../supabase/functions/_shared/rate-limit-core';
import { chunk, clampLimit, isSafeScreenshotPath, planCleanup } from '../../../supabase/functions/_shared/screenshot-cleanup-core';
import { verifyInflowSignature } from '../../../supabase/functions/_shared/webhook-inflow-core';
import { signWebhookPayload } from '../../../supabase/functions/_shared/webhook-signing';

describe('precheckCampaignStatus (S3: scheduled campaigns must be sendable, once)', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  it('lets a draft through', () => {
    expect(precheckCampaignStatus('draft', null, now)).toEqual({ ok: true });
  });
  it('lets a scheduled campaign through once it is due', () => {
    expect(precheckCampaignStatus('scheduled', '2026-11-20T11:59:00Z', now)).toEqual({ ok: true });
    expect(precheckCampaignStatus('scheduled', '2026-11-20T12:00:00Z', now)).toEqual({ ok: true });
  });
  it('refuses a scheduled campaign that is not due yet, or has no time', () => {
    expect(precheckCampaignStatus('scheduled', '2026-11-20T12:00:01Z', now).ok).toBe(false);
    expect(precheckCampaignStatus('scheduled', null, now).ok).toBe(false);
    expect(precheckCampaignStatus('scheduled', 'not a date', now).ok).toBe(false);
  });
  it.each(['sending', 'sent', 'partially_sent', 'failed', 'cancelled'])('refuses %s (already claimed or finished)', (status) => {
    const r = precheckCampaignStatus(status, '2026-11-20T11:00:00Z', now);
    expect(r).toEqual({ ok: false, error: `Campaign already ${status}` });
  });
});

describe('decideSendRateLimit (S7a: a failed count must not mean "no limit")', () => {
  it('allows below the cap and limits at it', () => {
    expect(decideSendRateLimit(0, null)).toBe('allow');
    expect(decideSendRateLimit(SEND_RATE_LIMIT_MAX - 1, null)).toBe('allow');
    expect(decideSendRateLimit(SEND_RATE_LIMIT_MAX, null)).toBe('limited');
    expect(decideSendRateLimit(50, null)).toBe('limited');
  });
  it('fails closed when the query errored or returned no count (the old behaviour read this as 0)', () => {
    expect(decideSendRateLimit(null, { message: 'column "action" does not exist' })).toBe('unavailable');
    expect(decideSendRateLimit(null, null)).toBe('unavailable');
    expect(decideSendRateLimit(undefined, null)).toBe('unavailable');
    expect(decideSendRateLimit(0, { message: 'boom' })).toBe('unavailable');
  });
  it('windows on the last 60 seconds', () => {
    expect(rateWindowStart(Date.parse('2026-11-20T12:01:00Z'))).toBe('2026-11-20T12:00:00.000Z');
  });
});

describe('screenshot cleanup (S6)', () => {
  const emp = '0b1c6d52-3f0e-4a7b-9d3e-1a2b3c4d5e6f';
  const ok = `${emp}/1763640000000.jpg`;

  it('accepts only the agent upload shape', () => {
    expect(isSafeScreenshotPath(ok)).toBe(true);
    for (const bad of ['', 'a.jpg', `${emp}/`, `${emp}/../x.jpg`, `../${emp}/1.jpg`, `/${emp}/1.jpg`, `${emp}/a/b.jpg`, `not-a-uuid/1.jpg`, null, undefined, 42]) {
      expect(isSafeScreenshotPath(bad as never)).toBe(false);
    }
  });

  it('removes a queued file whose row is gone, keeps one a row still points at, drops unsafe and duplicate entries', () => {
    const still = `${emp}/1763640000001.jpg`;
    const plan = planCleanup(
      [
        { id: 1, path: ok },
        { id: 2, path: still },
        { id: 3, path: '../etc/passwd' },
        { id: 4, path: ok },
      ],
      new Set([still]),
    );
    expect(plan.remove.map((q) => q.id)).toEqual([1]);
    expect(plan.drop.map((q) => q.id).sort()).toEqual([2, 3, 4]);
  });

  it('caps a run and batches storage calls', () => {
    expect(clampLimit(undefined)).toBe(1000);
    expect(clampLimit('abc')).toBe(1000);
    expect(clampLimit(-5)).toBe(1000);
    expect(clampLimit(250)).toBe(250);
    expect(clampLimit(10_000_000)).toBe(5000);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});

describe('verifyInflowSignature (S7b: webhook-inflow fails closed)', () => {
  const body = JSON.stringify({ order: 7 });

  it('accepts a correct X-KDOps-Signature', async () => {
    const sig = await signWebhookPayload('s3cret', body);
    expect(await verifyInflowSignature('s3cret', body, sig)).toEqual({ ok: true });
    expect(await verifyInflowSignature('s3cret', body, sig.toUpperCase().replace('SHA256=', 'sha256='))).toEqual({ ok: true });
  });

  it('refuses when no secret is configured, whatever the caller sends', async () => {
    const sig = await signWebhookPayload('s3cret', body);
    for (const secret of [undefined, null, '', '   ', 123]) {
      expect(await verifyInflowSignature(secret, body, sig)).toMatchObject({ ok: false, status: 403 });
    }
  });

  it('refuses a missing, wrong or tampered signature', async () => {
    const sig = await signWebhookPayload('s3cret', body);
    expect(await verifyInflowSignature('s3cret', body, null)).toMatchObject({ ok: false, status: 401 });
    expect(await verifyInflowSignature('s3cret', body, 'sha256=deadbeef')).toMatchObject({ ok: false, status: 401 });
    expect(await verifyInflowSignature('s3cret', body + ' ', sig)).toMatchObject({ ok: false, status: 401 });
    expect(await verifyInflowSignature('other', body, sig)).toMatchObject({ ok: false, status: 401 });
  });
});
