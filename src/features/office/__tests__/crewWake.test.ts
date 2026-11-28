import { describe, expect, it } from 'vitest';
import { plan } from '../../../../supabase/functions/_shared/crew-gateway-core';
import { classifyFire, fireUrl, wakeText } from '../../../../supabase/functions/_shared/crew-wake-core';

const AGENT = '11111111-1111-4111-8111-111111111111';
const known: Record<string, string> = { compliance_head: '44444444-4444-4444-8444-444444444444' };
const lookup = async (slug: string) => known[slug] ?? null;
const run = (op: string, a: Record<string, unknown> = {}) => plan(op, { op, ...a }, AGENT, lookup);

describe('waking an executive: the gateway op', () => {
  it('turns a wake request into one database call as the authenticated agent, with a bounded reason and depth', async () => {
    expect(await run('wake', { agent: 'compliance_head', reason: 'Check the VAT filing today', depth: 1 })).toMatchObject({ fn: 'crew_wake', args: { p_agent: AGENT, p_target: known.compliance_head, p_depth: 1 } });
    expect(await run('wake', { agent: 'compliance_head', reason: 'x' })).toMatchObject({ args: { p_depth: 0 } });
    expect(await run('wake', { agent: 'compliance_head', reason: 'x', depth: 99 })).toMatchObject({ args: { p_depth: 5 } });
  });

  it('refuses an unknown person, a bad slug and a missing reason', async () => {
    await expect(run('wake', { agent: 'nobody', reason: 'x' })).rejects.toThrow('no agent called');
    await expect(run('wake', { agent: 'cfo; drop table', reason: 'x' })).rejects.toThrow('slug');
    await expect(run('wake', { agent: 'compliance_head' })).rejects.toThrow('reason is required');
  });

  it('lets an executive ask the owner a question', async () => {
    expect(await run('message', { kind: 'question', body: 'Which table holds the live income?' })).toMatchObject({ fn: 'crew_post_message', args: { p_kind: 'question' } });
  });
});

describe('waking an executive: what the runner receives and how Anthropic answers', () => {
  it('names the agent, the depth, the source and the reason, and strips control characters', () => {
    const t = wakeText({ id: 'w', slug: 'cfo', reason: 'The owner wrote to you\u0007\u0000: answer him', depth: 1, source: 'owner' });
    expect(t).toBe('AGENT=cfo\nDEPTH=1\nSOURCE=owner\nREASON=The owner wrote to you  : answer him');
    expect(wakeText({ id: 'w', slug: 'cfo', reason: 'x'.repeat(5000), depth: 0, source: 'event' }).length).toBeLessThan(1600);
  });

  it('builds the fire address from the routine id', () => {
    expect(fireUrl('trig_01ABC')).toBe('https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire');
    expect(fireUrl('a/b')).not.toContain('a/b');
  });

  it('started on 2xx (keeping the session link), tries again on 429 and 5xx, and gives up on a refused token', () => {
    expect(classifyFire(200, { type: 'routine_fire', claude_code_session_url: 'https://claude.ai/code/session_1' })).toEqual({ kind: 'fired', sessionUrl: 'https://claude.ai/code/session_1' });
    expect(classifyFire(201, null)).toEqual({ kind: 'fired', sessionUrl: null });
    expect(classifyFire(429, null).kind).toBe('retry');
    expect(classifyFire(503, null).kind).toBe('retry');
    expect(classifyFire(401, null)).toMatchObject({ kind: 'failed', why: expect.stringContaining('token') });
    expect(classifyFire(404, null).kind).toBe('failed');
  });
});
