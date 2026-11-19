import { describe, expect, it } from 'vitest';
import { pickMentionId, renderMention, validMentionTemplate } from '../../../../supabase/functions/_shared/agent-mention-core';
import { buildRequest } from '../../../../supabase/functions/_shared/agent-deliver-core';

describe('who to tag', () => {
  it('prefers a saved Cliq id, then the mapped email, then the profile email', () => {
    expect(pickMentionId('cliq', { cliq_user_id: '12345678', email: 'x@y.co' }, 'p@q.co')).toBe('12345678');
    expect(pickMentionId('cliq', { email: 'x@y.co' }, 'p@q.co')).toBe('x@y.co');
    expect(pickMentionId('cliq', null, 'p@q.co')).toBe('p@q.co');
    expect(pickMentionId('cliq', null, null)).toBeNull();
  });
  it('tags in Slack by user id only, never by email', () => {
    expect(pickMentionId('slack', { slack_user_id: 'U012AB3CD' }, 'p@q.co')).toBe('U012AB3CD');
    expect(pickMentionId('slack', null, 'p@q.co')).toBeNull();
  });
  it('refuses an id that could carry markup', () => {
    expect(pickMentionId('cliq', { cliq_user_id: '<b>x</b>' }, null)).toBeNull();
    expect(pickMentionId('cliq', { cliq_user_id: 'a b' }, null)).toBeNull();
  });
});

describe('tag format', () => {
  it('fills the id into the template and falls back to the default for a bad one', () => {
    expect(renderMention('cliq', '{@%s}', 'cara@x.co')).toBe('{@cara@x.co}');
    expect(renderMention('cliq', '@[%s]', '1234')).toBe('@[1234]');
    expect(renderMention('cliq', 'no placeholder', '1234')).toBe('{@1234}');
    expect(renderMention('slack', undefined, 'U1')).toBe('<@U1>');
    expect(validMentionTemplate('{@%s}')).toBe(true);
    expect(validMentionTemplate('x'.repeat(41) + '%s')).toBe(false);
    expect(validMentionTemplate('{@%s}\n')).toBe(false);
  });
});

describe('a Cliq message that tags the person', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const secrets = { url: 'https://cliq.zoho.com/api/v2/channelsbyname/ops/message?zapikey=abc' };
  it('puts the tag under the title, once', async () => {
    const r = await buildRequest({ kind: 'cliq', name: 'Ops', config: {} }, secrets, { title: '[HIGH] Overdue: Prepare the vendor table', text: 'Due Dec 4.', mention: { name: 'Cara Staff', id: 'cara@x.co' } }, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(r.init.body)).text).toBe('*[HIGH] Overdue: Prepare the vendor table*\nFor Cara Staff: {@cara@x.co}\nDue Dec 4.');
  });
  it('honours a custom format and the switch', async () => {
    const custom = await buildRequest({ kind: 'cliq', name: 'Ops', config: { mention_template: '@[%s]' } }, secrets, { title: 'T', text: 'b', mention: { name: 'Cara', id: '99' } }, now);
    if (custom.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(custom.init.body)).text).toContain('For Cara: @[99]');
    const off = await buildRequest({ kind: 'cliq', name: 'Ops', config: { mention_people: false } }, secrets, { title: 'T', text: 'b', mention: { name: 'Cara', id: '99' } }, now);
    if (off.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(off.init.body)).text).toBe('*T*\nb');
  });
  it('a message about nobody tags nobody', async () => {
    const r = await buildRequest({ kind: 'cliq', name: 'Ops', config: {} }, secrets, { title: 'T', text: 'b' }, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(r.init.body)).text).toBe('*T*\nb');
  });
  it('Slack tags with its own format', async () => {
    const r = await buildRequest({ kind: 'slack', name: 'S', config: {} }, { url: 'https://hooks.slack.com/services/T/B/X' }, { title: 'T', text: 'b', mention: { name: 'Cara', id: 'U012AB3CD' } }, now);
    if (r.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(String(r.init.body)).text).toContain('<@U012AB3CD>');
  });
});
