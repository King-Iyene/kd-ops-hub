import { describe, expect, it } from 'vitest';
import {
  dmChatsUrl, dmFailureText, formatChannelNotice, formatProposal, formatWelcome, fromOwner, parseCommand, parseDmChats, pickDmChat, planCommands,
  type IncomingMessage, type ProposalLine,
} from '../../../../supabase/functions/_shared/crew-cliq-core';
import { dmMessageUrl, validDmTarget } from '../../../../supabase/functions/_shared/agent-cliq-core';
import { buildRequest } from '../../../../supabase/functions/_shared/agent-deliver-core';
import { OWN_MARK, parseMessages } from '../../../../supabase/functions/_shared/agent-cliq-monitor-core';

const CONN = { kind: 'cliq' as const, name: 'Zoho Cliq Operations', config: { mode: 'api', dc: 'eu', channel: 'ops_alerts' } };
const SECRETS = { access: 'a-very-secret-access-token' };

describe('crew cliq dm: the address of a direct message', () => {
  it('builds the buddies address only on a fixed Zoho host and for a plain id or email', () => {
    expect(dmMessageUrl('com', '20012345678')).toBe('https://cliq.zoho.com/api/v2/buddies/20012345678/message');
    expect(dmMessageUrl('eu', 'king@kdsquares.com')).toBe('https://cliq.zoho.eu/api/v2/buddies/king%40kdsquares.com/message');
    expect(dmMessageUrl('evil.com' as never, '123456')).toBeNull();
    expect(dmMessageUrl('com', 'a/../b')).toBeNull();
    expect(dmMessageUrl('com', 'x y')).toBeNull();
    expect(dmMessageUrl('com', '')).toBeNull();
    expect(validDmTarget('king@kdsquares.com')).toBe(true);
    expect(validDmTarget('x')).toBe(false);
    expect(validDmTarget(undefined)).toBe(false);
  });

  it('builds the direct-message request with the sign-in, the owner mark and no channel', async () => {
    const b = await buildRequest(CONN, SECRETS, { title: 'Hale needs your decision', text: 'Wants to: change a record', cliq: { dm: '20012345678' } });
    if (b.type !== 'http') throw new Error('expected an http request');
    expect(b.url).toBe('https://cliq.zoho.eu/api/v2/buddies/20012345678/message');
    expect(b.init.method).toBe('POST');
    expect(b.init.headers.Authorization).toBe('Zoho-oauthtoken a-very-secret-access-token');
    const body = JSON.parse(b.init.body ?? '{}') as { text: string };
    expect(body.text).toBe(`*Hale needs your decision*\nWants to: change a record${OWN_MARK}`);   // our own mark is on every post
    expect(Object.keys(body)).toEqual(['text']);
    expect(b.url).not.toContain('channelsbyname');
  });

  it('refuses a bad target, a missing data center or a missing token, and leaves the channel path as it was', async () => {
    expect(await buildRequest(CONN, SECRETS, { text: 'x', cliq: { dm: 'a b' } })).toMatchObject({ type: 'error' });
    expect(await buildRequest({ ...CONN, config: { mode: 'api', dc: 'nope' } }, SECRETS, { text: 'x', cliq: { dm: '123456' } })).toMatchObject({ type: 'error' });
    expect(await buildRequest(CONN, {}, { text: 'x', cliq: { dm: '123456' } })).toMatchObject({ type: 'error' });
    const ch = await buildRequest(CONN, SECRETS, { text: 'x' });
    expect(ch).toMatchObject({ type: 'http', url: 'https://cliq.zoho.eu/api/v3/channelsbyname/ops_alerts/messages' });
  });
});

describe('crew cliq dm: finding the direct chat', () => {
  const body = {
    chats: [
      { chat_id: 'CT_1', chat_type: 'dm', name: 'Ryan West', participant_count: 2, last_modified_time: '2026-11-20T10:00:00+00:00', recipients_summary: [{ user_id: '111', name: 'Ryan' }, { user_id: '999', name: 'Me' }] },
      { chat_id: 'CT_2', chat_type: 'dm', name: 'King', participant_count: 2, last_modified_time: '2026-11-25T10:00:00+00:00', recipients_summary: [{ user_id: '20012345678', name: 'King' }] },
      { chat_id: 'CT_3', chat_type: 'dm', name: 'King (old)', participant_count: 2, last_modified_time: '2026-10-01T10:00:00+00:00', recipients_summary: [{ user_id: '20012345678', name: 'King' }] },
      { chat_id: 'CT_4', chat_type: 'group', name: 'Leadership', participant_count: 6, recipients_summary: [{ user_id: '20012345678' }] },
      { chat_id: 'CT_5', chat_type: 'dm', participant_count: 2, removed: true, recipients_summary: [{ user_id: '20012345678' }] },
      { chat_id: 'bad id!', chat_type: 'dm', recipients_summary: [{ user_id: '20012345678' }] },
      { chat_type: 'dm' },
    ],
    next_token: 'NEXT1',
  };

  it('reads only direct chats that are still there, defensively', () => {
    const p = parseDmChats(body);
    expect(p.chats.map((c) => c.chatId)).toEqual(['CT_1', 'CT_2', 'CT_3']);
    expect(p.next).toBe('NEXT1');
    expect(parseDmChats(null)).toEqual({ chats: [], next: null });
    expect(parseDmChats({ chats: 'x' }).chats).toEqual([]);
    expect(parseDmChats({ data: [{ chat_id: 'C9', chat_type: 'DM', recipients_summary: [{ id: '5' }] }] }).chats[0]).toMatchObject({ chatId: 'C9', userIds: ['5'] });
  });

  it('picks the newest direct chat that has the owner and nobody else', () => {
    const chats = parseDmChats(body).chats;
    expect(pickDmChat(chats, '20012345678')).toBe('CT_2');
    expect(pickDmChat(chats, ' 20012345678 ')).toBe('CT_2');
    expect(pickDmChat(chats, '111')).toBe('CT_1');
    expect(pickDmChat(chats, '424242')).toBeNull();
    expect(pickDmChat(chats, '')).toBeNull();
    expect(pickDmChat(chats, null)).toBeNull();
    // a chat with more than two people is never "his direct chat"
    expect(pickDmChat([{ chatId: 'G', userIds: ['5'], participants: 3, modified: 1 }], '5')).toBeNull();
  });

  it('asks Zoho for the chat list on a fixed host, with a safe page token', () => {
    expect(dmChatsUrl('com')).toBe('https://cliq.zoho.com/api/v2/chats?limit=100');
    expect(dmChatsUrl('eu', 'abc_DEF-1')).toBe('https://cliq.zoho.eu/api/v2/chats?limit=100&next_token=abc_DEF-1');
    expect(dmChatsUrl('eu', 'bad token&x=1')).toBe('https://cliq.zoho.eu/api/v2/chats?limit=100');
    expect(dmChatsUrl('evil.com' as never)).toBeNull();
  });
});

describe('crew cliq dm: a direct chat with oneself (everything arrives from the owner)', () => {
  const OWNER = '20012345678';
  const msg = (over: Partial<IncomingMessage>): IncomingMessage => ({ id: 'm', time: 5000, text: 'status', senderId: OWNER, senderEmail: null, ...over });

  it('never obeys its own posts, which all carry the owner\'s id in a chat with oneself', () => {
    const proposal = formatProposal({ code: 'a1b2c3', agent_name: 'Hale King', agent_title: 'CFO', action: 'record.update', summary: 'Fix rent', risk: 'medium' } as ProposalLine);
    // what the bot posted: the text with our mark appended, sent by the owner's own account
    const ours = `*${proposal.title}*\n${proposal.text}${OWN_MARK}`;
    expect(parseCommand(ours).kind).toBe('unknown');   // not a command by its shape either way
    const planned = planCommands([
      msg({ id: 'own1', time: 2000, text: ours }),
      msg({ id: 'own2', time: 2100, text: `approve a1b2c3${OWN_MARK}` }),                       // even an exact command, if it carries the mark
      msg({ id: 'own3', time: 2200, text: `*Approved*\nreply approve a1b2c3 confirm${OWN_MARK}` }),
      msg({ id: 'mine', time: 3000, text: 'approve a1b2c3' }),                                   // the owner typing it himself
    ], { ownerId: OWNER, cursorMs: 1000 });
    expect(planned.map((p) => p.message.id)).toEqual(['mine']);
    expect(planned[0].command).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: false });
  });

  it('drops the mark only for reading: a message that merely contains the mark is still ours', () => {
    expect(planCommands([msg({ text: `reject a1b2c3 no${OWN_MARK}` })], { ownerId: OWNER, cursorMs: 0 })).toEqual([]);
    expect(planCommands([msg({ text: `${OWN_MARK}approve a1b2c3` })], { ownerId: OWNER, cursorMs: 0 })).toEqual([]);
  });

  it('ignores a message in the chat from anybody else, and when no owner is set', () => {
    expect(planCommands([msg({ senderId: '777', text: 'approve a1b2c3' })], { ownerId: OWNER, cursorMs: 0 })).toEqual([]);
    expect(planCommands([msg({ text: 'approve a1b2c3' })], { ownerId: '', cursorMs: 0 })).toEqual([]);
  });

  it('reads the sender out of a Zoho message, so an id that is not the owner\'s is not obeyed', () => {
    const json = { data: [
      { id: 'z1', time: 6000, type: 'text', sender: { id: OWNER, name: 'King' }, content: { text: 'approve a1b2c3' } },
      { id: 'z2', time: 6100, type: 'text', sender: { id: '55', name: 'King', email_id: 'king@kdsquares.com' }, content: { text: 'approve a1b2c3' } },
    ] };
    const parsed = parseMessages(json).messages;
    expect(parsed.map((m) => m.senderId)).toEqual([OWNER, '55']);
    expect(parsed[1].senderEmail).toBe('king@kdsquares.com');
    const planned = planCommands(parsed.map((m) => ({ id: m.id, time: m.time, text: m.text, senderId: m.senderId, senderEmail: m.senderEmail })), { ownerId: OWNER, cursorMs: 0 });
    expect(planned.map((p) => p.message.id)).toEqual(['z1']);   // a display name of "King" is worthless: only the id counts
    expect(fromOwner({ senderId: '55', senderEmail: 'king@kdsquares.com' }, 'king@kdsquares.com')).toBe(true);
  });

  it('still refuses a payment approval or an unconfirmed high-risk one as plain text (the database refuses them again)', () => {
    expect(parseCommand('approve a1b2c3')).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: false });
    expect(parseCommand('approve a1b2c3 confirm')).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: true });
    const pay = formatProposal({ code: 'a1b2c3', agent_name: 'Hannah Brooks', agent_title: 'Treasury', action: 'draft.batch_payment', summary: 'Pay vendors', risk: 'high' });
    expect(pay.text).not.toMatch(/approve a1b2c3/);
  });
});

describe('crew cliq dm: the connected account is not the owner (the usual setup)', () => {
  const KING = '20012345678';
  const CONNECTED = '30099887766';   // the team member whose Zoho sign-in the connection uses
  const m = (over: Partial<IncomingMessage>): IncomingMessage => ({ id: 'm', time: 5000, text: 'approve a1b2c3', senderId: KING, senderEmail: null, ...over });

  it('never reads what the connected account wrote as a command from the owner', () => {
    const planned = planCommands([
      m({ id: 'conn1', time: 2000, senderId: CONNECTED, text: 'approve a1b2c3' }),
      m({ id: 'conn2', time: 2100, senderId: CONNECTED, text: 'approve a1b2c3 confirm' }),
      m({ id: 'king', time: 3000, senderId: KING, text: 'approve a1b2c3' }),
    ], { ownerId: KING, cursorMs: 1000 });
    expect(planned.map((p) => p.message.id)).toEqual(['king']);
  });

  it('only ever picks the chat that has exactly the owner in it, never the connected account\'s other chats', () => {
    const chats = [
      { chatId: 'WITH_BOSS', userIds: [KING], participants: 2, modified: 10 },
      { chatId: 'WITH_SOMEONE', userIds: ['555'], participants: 2, modified: 99 },
      { chatId: 'GROUP', userIds: [KING, '555', '777'], participants: 4, modified: 100 },
    ];
    expect(pickDmChat(chats, KING)).toBe('WITH_BOSS');
    expect(pickDmChat(chats, '555')).toBe('WITH_SOMEONE');
  });

  it('is told so on the settings card text constants: nothing the connected account writes is obeyed', () => {
    expect(fromOwner({ senderId: CONNECTED }, KING)).toBe(false);
    expect(fromOwner({ senderId: KING }, KING)).toBe(true);
  });
});

describe('crew cliq dm: when Zoho refuses', () => {
  it('tells the owner in plain words that Zoho needs one more permission, with the connection name', () => {
    for (const s of [401, 403]) {
      const t = dmFailureText(s, 'Zoho Cliq Operations');
      expect(t).toBe('Zoho needs one more permission for direct messages: open Agent > Connections > Zoho Cliq Operations and press Reconnect to Zoho.');
    }
    expect(dmFailureText(403, '')).toContain('your Cliq connection');
    expect(dmFailureText(403, 'A {@123} name')).not.toContain('{@');
  });

  it('explains the other failures without blaming the permission', () => {
    expect(dmFailureText(404, 'x')).toContain('could not find that person');
    expect(dmFailureText(400, 'x')).toContain('same Zoho organisation');
    expect(dmFailureText(429, 'x')).toContain('slow down');
    expect(dmFailureText(500, 'x')).toContain('tried again');
    expect(dmFailureText(undefined, 'x')).toContain('tried again');
    expect(dmFailureText(500, 'x')).not.toContain('Reconnect');
  });

  it('puts nothing private in the one line that may go to a shared channel', () => {
    const n = formatChannelNotice();
    expect(`${n.title} ${n.text}`).not.toMatch(/approve|reject|[0-9]{3}|Hale|payment|\$/i);
    expect(n.text).toContain('Nothing private is posted in this channel');
  });

  it('welcomes the owner in a way that works as a direct message too', () => {
    expect(formatWelcome(2).text).toContain('Only your own Cliq account is obeyed');
  });
});
