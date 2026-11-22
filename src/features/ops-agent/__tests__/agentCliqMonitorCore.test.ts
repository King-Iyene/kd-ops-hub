import { describe, expect, it } from 'vitest';
import {
  OWN_MARK, channelsUrl, chatMessagesUrl, classify, describeCliqStatus, findAnswers, isOwnMessage, parseChannels, parseMessages, readableText, trackNew,
  type CliqChannel, type CliqMessage,
} from '../../../../supabase/functions/_shared/agent-cliq-monitor-core';
import { buildRequest } from '../../../../supabase/functions/_shared/agent-deliver-core';

const ch: CliqChannel = { channelId: 'C1', name: 'Ops', unique: 'ops', chatId: 'CT_1' };
const msg = (o: Partial<CliqMessage> & { id: string }): CliqMessage => ({ time: 1_700_000_000_000, senderId: '1003', senderName: 'Alice', text: '', mentionIds: [], mentionNames: {}, threadChatId: null, ...o });

describe('Cliq watch: addresses', () => {
  it('only builds addresses on the Zoho Cliq host for a known data center', () => {
    expect(channelsUrl('com')).toBe('https://cliq.zoho.com/api/v2/channels?limit=100');
    expect(channelsUrl('eu', 'abc')).toContain('next_token=abc');
    expect(chatMessagesUrl('com', 'CT_1', 1234.9)).toBe('https://cliq.zoho.com/api/v2/chats/CT_1/messages?limit=100&from_time=1234');
    expect(chatMessagesUrl('com', '../etc', 1)).toBeNull();
    expect(chatMessagesUrl('x.evil' as never, 'CT_1', 1)).toBeNull();
  });
});

describe('Cliq watch: reading what Zoho returns', () => {
  it('keeps channels with their unique name and chat, and leaves out archived and external ones', () => {
    const r = parseChannels({ channels: [
      { channel_id: 'C1', name: 'Ops', unique_name: 'ops', chat_id: 'CT_1', level: 'organization' },
      { channel_id: 'C2', name: 'Old', unique_name: 'old', chat_id: 'CT_2', archived: true },
      { channel_id: 'C3', name: 'Partners', unique_name: 'partners', chat_id: 'CT_3', level: 'external' },
      { channel_id: 'C4', name: 'No chat', unique_name: 'nochat' },
    ], next_token: 'n1' });
    expect(r.channels.map((c) => c.unique)).toEqual(['ops']);
    expect(r.next).toBe('n1');
    expect(parseChannels(null).channels).toEqual([]);
  });
  it('reads messages, tags in the text and in the mentions list, the sender, the thread and the time in milliseconds', () => {
    const r = parseMessages({ data: [
      { id: 'M1', time: 1_700_000_000_000, type: 'text', sender: { id: '1003', name: 'Alice' }, content: { text: 'Hi {@1001}, can you send it?' }, thread_chat_id: 'TH_1' },
      { id: 'M2', time: 1_700_000_100, type: 'text', sender: { id: '1001', name: 'Bob' }, content: { text: 'on it' }, mentions: [{ id: '1003', name: 'Alice' }] },
      { id: 'M3', time: 1_700_000_000_000, type: 'system', content: { text: 'Bob joined' }, sender: { id: '1001' } },
      { id: 'M4', time: 1_700_000_000_000, content: { text: 'hello {@all}' }, sender: { id: '1003' } },
      { time: 1 },
    ] });
    expect(r.messages.map((m) => m.id)).toEqual(['M1', 'M2', 'M4']);
    expect(r.messages[0]).toMatchObject({ senderId: '1003', mentionIds: ['1001'], threadChatId: 'TH_1' });
    expect(r.messages[1].time).toBe(1_700_000_100_000);
    expect(r.messages[1].mentionIds).toEqual(['1003']);
    expect(r.messages[1].mentionNames['1003']).toBe('Alice');
    expect(r.messages[2].mentionIds).toEqual([]);
  });
});

describe('Cliq watch: what needs an answer', () => {
  it('treats questions and requests as needing an answer', () => {
    for (const t of ['{@1} can you send the report?', '{@1} please confirm the numbers', '{@1} update on the vendor table', '{@1} when will this be ready', '{@1} Let me know']) expect(classify(t)).toBe('request');
  });
  it('treats thanks, FYI, emoji and greetings as nothing to answer', () => {
    for (const t of ['{@1} thanks!', '{@1} Thank you', '{@1} FYI the meeting moved', '{@1} 👍', '{@1}', 'Good morning {@1}', '{@1} noted', '{@1} well done']) expect(classify(t)).toBe('ack');
  });
  it('keeps a plain statement as a message that still wants a reply', () => {
    expect(classify('{@1} the vendor table is on your desk')).toBe('message');
  });
});

describe('Cliq watch: which messages are tracked', () => {
  it('tracks each tagged person once, skips the sender, tag-everyone, the agent\'s own posts and anything before the watch started', () => {
    const messages = [
      msg({ id: 'M1', text: 'Hi {@1001} and {@1002}, can you send the report?', mentionIds: ['1001', '1002'], mentionNames: { '1001': 'Bob' } }),
      msg({ id: 'M2', text: 'note {@1003}', mentionIds: ['1003'] }),
      msg({ id: 'M3', text: `*Daily summary*\nsee ops.kdsquares.com {@1001}`, mentionIds: ['1001'] }),
      msg({ id: 'M4', text: `Reply {@1001}${OWN_MARK}`, mentionIds: ['1001'] }),
      msg({ id: 'M5', text: 'old {@1001}?', mentionIds: ['1001'], time: 1_000 }),
      msg({ id: 'M6', text: 'no tags at all?', mentionIds: [] }),
      msg({ id: 'M7', text: 'thanks {@1001}', mentionIds: ['1001'] }),
    ];
    const rows = trackNew(messages, ch, { appHost: 'ops.kdsquares.com', sinceMs: 1_699_999_000_000 });
    expect(rows.map((r) => `${r.message_id}:${r.tagged_cliq_id}:${r.classification}`)).toEqual(['M1:1001:request', 'M1:1002:request', 'M7:1001:ack']);
    expect(rows[0]).toMatchObject({ channel_name: 'Ops', channel_unique: 'ops', chat_id: 'CT_1', sender_cliq_id: '1003', tagged_name: 'Bob' });
    expect(rows[0].text).toBe('Hi @Bob and @someone, can you send the report?');
  });
  it('recognises the agent\'s own posts', () => {
    expect(isOwnMessage(`anything${OWN_MARK}`, 'ops.kdsquares.com')).toBe(true);
    expect(isOwnMessage('*Title*\nSee https://ops.kdsquares.com/agent', 'ops.kdsquares.com')).toBe(true);
    expect(isOwnMessage('Look at https://ops.kdsquares.com/task please {@1}', 'ops.kdsquares.com')).toBe(false);
  });
  it('shows tags as names and never leaves the invisible mark in stored text', () => {
    expect(readableText(msg({ id: 'M', text: `Hi {@1}${OWN_MARK}`, mentionNames: { '1': 'Bob' } }))).toBe('Hi @Bob');
  });
});

describe('Cliq watch: answers', () => {
  const open = [{ id: 'R1', message_id: 'M1', tagged_cliq_id: '1001', posted_at: new Date(1_700_000_000_000).toISOString(), thread_chat_id: 'TH_1' }];
  it('a later message from the tagged person in the channel answers it', () => {
    const a = findAnswers(open, [msg({ id: 'M2', senderId: '1001', time: 1_700_000_500_000 })]);
    expect(a).toEqual([{ id: 'R1', at: new Date(1_700_000_500_000).toISOString(), in: 'channel' }]);
  });
  it('a reply in the thread answers it too', () => {
    const a = findAnswers(open, [], { TH_1: [msg({ id: 'T1', senderId: '1001', time: 1_700_000_300_000 })] });
    expect(a[0]).toMatchObject({ id: 'R1', in: 'thread' });
  });
  it('takes the earliest reply, and ignores other people, earlier messages and the tagged message itself', () => {
    const a = findAnswers(open, [
      msg({ id: 'X', senderId: '1002', time: 1_700_000_100_000 }),
      msg({ id: 'Y', senderId: '1001', time: 1_699_999_000_000 }),
      msg({ id: 'M1', senderId: '1001', time: 1_700_000_000_000 }),
      msg({ id: 'Z2', senderId: '1001', time: 1_700_000_900_000 }),
      msg({ id: 'Z1', senderId: '1001', time: 1_700_000_400_000 }),
    ]);
    expect(a).toEqual([{ id: 'R1', at: new Date(1_700_000_400_000).toISOString(), in: 'channel' }]);
  });
  it('nothing from the tagged person leaves it open', () => {
    expect(findAnswers(open, [msg({ id: 'X', senderId: '1002', time: 1_700_000_100_000 })])).toEqual([]);
  });
});

describe('Cliq watch: the follow-up posted in the thread', () => {
  const conn = { kind: 'cliq' as const, name: 'Cliq', config: { mode: 'api', dc: 'com', channel: 'ops_alerts' } };
  it('goes to the channel the message was in, as a reply, with the invisible mark', async () => {
    const b = await buildRequest(conn, { access: '1000.accesstoken123' }, { text: 'Hi Bob', mention: { name: 'Bob', id: '1001' }, cliq: { channel: 'ops', replyTo: 'M1_abc' } });
    if (b.type !== 'http') throw new Error('expected http');
    expect(b.url).toBe('https://cliq.zoho.com/api/v3/channelsbyname/ops/messages');
    const body = JSON.parse(b.init.body as string);
    expect(body.reply_to).toBe('M1_abc');
    expect(body.text.endsWith(OWN_MARK)).toBe(true);
  });
  it('refuses a channel or message id that is not plain, and leaves the connection\'s channel alone otherwise', async () => {
    expect((await buildRequest(conn, { access: '1000.accesstoken123' }, { text: 'x', cliq: { channel: '../x' } })).type).toBe('error');
    const b = await buildRequest(conn, { access: '1000.accesstoken123' }, { text: 'x', cliq: { replyTo: 'a b;c' } });
    if (b.type !== 'http') throw new Error('expected http');
    expect(b.url).toContain('/channelsbyname/ops_alerts/messages');
    expect(JSON.parse(b.init.body as string).reply_to).toBeUndefined();
  });
});

describe('Cliq watch: messages for a person', () => {
  it('explains the common Zoho problems in a sentence', () => {
    expect(describeCliqStatus(403)).toContain('Reconnect to Zoho');
    expect(describeCliqStatus(401)).toContain('Reconnect to Zoho');
    expect(describeCliqStatus(429)).toContain('slow down');
    expect(describeCliqStatus(500)).toContain('HTTP 500');
  });
});
