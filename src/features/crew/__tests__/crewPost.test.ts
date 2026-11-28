import { describe, expect, it } from 'vitest';
import { GatewayError, OPS, plan } from '../../../../supabase/functions/_shared/crew-gateway-core';
import { POST_FOOTER, cleanTeamText, formatTeamPost, readReserve, viaName } from '../../../../supabase/functions/_shared/crew-post-core';

const AGENT = '11111111-1111-4111-8111-111111111111';
const lookup = async () => null;
const run = (a: Record<string, unknown>) => plan('cliq_post', { op: 'cliq_post', ...a }, AGENT, lookup);

describe('gateway op cliq_post', () => {
  it('is one of the operations, and is only a request: the database decides', async () => {
    expect(OPS).toContain('cliq_post');
    const p = await run({ kind: 'tracking_followup', text: '@Sam Doe please start your timer', tag: ['Sam Doe'] });
    expect(p).toEqual({ fn: 'crew_cliq_post_reserve', args: { p_agent: AGENT, p_kind: 'tracking_followup', p_text: '@Sam Doe please start your timer', p_tag: ['Sam Doe'] } });
  });

  it('always acts as the authenticated agent and defaults to nobody tagged', async () => {
    const p = await run({ kind: 'announcement', text: 'Team meeting at 3', p_agent: 'someone-else', agent_id: 'x' });
    expect(p).toMatchObject({ args: { p_agent: AGENT, p_tag: [] } });
  });

  it('refuses a bad shape with a clear error (the content rules are applied, and logged, by the database)', async () => {
    await expect(run({ kind: 'payment', text: 'x' })).rejects.toThrow('kind must be one of');
    await expect(run({ kind: 'announcement' })).rejects.toThrow('text is required');
    await expect(run({ kind: 'announcement', text: 'x'.repeat(4001) })).rejects.toThrow('too long');
    await expect(run({ kind: 'announcement', text: 'x', tag: 'Sam Doe' })).rejects.toThrow('tag must be a list');
    await expect(run({ kind: 'announcement', text: 'x', tag: Array.from({ length: 9 }, (_, i) => `Person ${i}`) })).rejects.toThrow('at most 8');
    await expect(run({ kind: 'announcement', text: 'x', tag: [''] })).rejects.toBeInstanceOf(GatewayError);
    await expect(run({ kind: 'announcement', text: 'x', tag: [42] })).rejects.toBeInstanceOf(GatewayError);
  });

  it('adds no way to pay, delete or write a record', () => {
    for (const op of OPS) expect(op).not.toMatch(/delete|execute|pay|deploy|write|decide|issue_token|^approve/);
  });
});

describe('how a team post looks in Cliq', () => {
  it('has a headline with an emoji, a "sent by" line naming the AI and the channel, the words, and a quiet footer', () => {
    const m = formatTeamPost({ kind: 'tracking_followup', text: '@Sam Doe good morning, please start your timer when you can.', agentName: 'Henry Ashford', via: 'Zoho Cliq Operations' });
    expect(m.title).toBe('📋 Operations follow-up');
    expect(m.text.split('\n')).toEqual(['Sent by Henry (AI) via Operations', '@Sam Doe good morning, please start your timer when you can.', '', POST_FOOTER]);
    const a = formatTeamPost({ kind: 'announcement', text: 'Team meeting at 3 today.', agentName: 'Henry Ashford', via: 'Operations' });
    expect(a.title).toBe('📢 Announcement');
    expect(a.text.split('\n')[0]).toBe('Sent by Henry (AI) via Operations');
  });

  it('never lets the words carry a tag, an invisible mark or stray formatting', () => {
    expect(cleanTeamText('Hi {@123} and *all* ~of~ `you` _now_ crew_settings')).toBe('Hi and ∗all∗ ∼of∼ \'you\' now crew_settings');
    expect(cleanTeamText(`a${String.fromCharCode(0x2063)}b${String.fromCharCode(0x200b)}c`)).toBe('abc');
    expect(cleanTeamText(undefined)).toBe('');
    expect(cleanTeamText('x'.repeat(900))).toHaveLength(700);
    const m = formatTeamPost({ kind: 'announcement', text: 'Ping {@999} everyone', agentName: 'A B', via: 'X' });
    expect(m.text).not.toContain('{@');
  });

  it('names the channel plainly in the "via" line', () => {
    expect(viaName('Zoho Cliq Operations')).toBe('Operations');
    expect(viaName('zoho cliq   Report-Task-Track')).toBe('Report-Task-Track');
    expect(viaName('Operations')).toBe('Operations');
    expect(viaName('')).toBe('Cliq');
  });
});

describe('what the database answers', () => {
  const ok = { allowed: true, post_id: 'p1', connection_id: 'c1', kind: 'announcement', text: 'Hello', mentions: [{ name: 'Sam Doe', id: '4400' }, { name: 'Ann Lee', id: '' }], agent_name: 'Henry Ashford', agent_title: 'Head of Operations', via: 'Zoho Cliq Operations' };

  it('posts only on a clear yes', () => {
    const r = readReserve(ok);
    expect(r).toMatchObject({ allowed: true, post_id: 'p1', connection_id: 'c1' });
    expect(r.allowed && r.mentions).toEqual([{ name: 'Sam Doe', id: '4400' }, { name: 'Ann Lee', id: '' }]);
  });

  it('treats a refusal, a missing field or anything unexpected as "do not post"', () => {
    expect(readReserve({ allowed: false, error: 'you have used today\'s limit of 6 posts' })).toEqual({ allowed: false, error: 'you have used today\'s limit of 6 posts' });
    expect(readReserve({ allowed: false })).toEqual({ allowed: false, error: 'the post was not allowed' });
    expect(readReserve({ allowed: 'true', post_id: 'p1' })).toMatchObject({ allowed: false });
    expect(readReserve({ ...ok, post_id: '' })).toMatchObject({ allowed: false });
    expect(readReserve({ ...ok, connection_id: undefined })).toMatchObject({ allowed: false });
    expect(readReserve(null)).toMatchObject({ allowed: false });
    expect(readReserve('yes')).toMatchObject({ allowed: false });
    expect(readReserve([ok])).toMatchObject({ allowed: false });
  });

  it('drops names that are empty and keeps a missing mention list safe', () => {
    const r = readReserve({ ...ok, mentions: [{ name: '', id: 'x' }, 7, null, { name: 'Sam Doe', id: 5 }] });
    expect(r.allowed && r.mentions).toEqual([{ name: 'Sam Doe', id: '' }]);
    const none = readReserve({ ...ok, mentions: 'nope' });
    expect(none.allowed && none.mentions).toEqual([]);
  });
});
