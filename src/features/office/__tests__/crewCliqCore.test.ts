import { describe, expect, it } from 'vitest';
import {
  actionLabel, approvedInAppOnly, formatDecision, formatError, formatHelp, formatProposal, formatSaid, formatStatus, formatWelcome, fromOwner, ignoreAsOurOwn,
  needsConfirm, parseCommand, parseUserId, planCommands, plain, resolveAgent, userUrl, type IncomingMessage, type ProposalLine,
} from '../../../../supabase/functions/_shared/crew-cliq-core';
import { OWN_MARK } from '../../../../supabase/functions/_shared/agent-cliq-monitor-core';

const P: ProposalLine = { code: 'a1b2c3', agent_name: 'Hale King', agent_title: 'Chief Financial Officer', action: 'record.update', summary: 'Correct the March rent amount', risk: 'medium' };

describe('crew cliq: parseCommand', () => {
  it('reads approve and reject with a 6 to 8 character code, any case', () => {
    expect(parseCommand('approve a1b2c3')).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: false });
    expect(parseCommand('  APPROVE A1B2C3D4  ')).toEqual({ kind: 'approve', code: 'a1b2c3d4', confirm: false });
    expect(parseCommand('reject a1b2c3')).toEqual({ kind: 'reject', code: 'a1b2c3', reason: '' });
    expect(parseCommand('Reject a1b2c3 the amount is wrong\nsee the invoice')).toEqual({ kind: 'reject', code: 'a1b2c3', reason: 'the amount is wrong\nsee the invoice' });
  });

  it('needs the word confirm, exactly, for the confirmed form of approve', () => {
    expect(parseCommand('approve a1b2c3 confirm')).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: true });
    expect(parseCommand('Approve a1b2c3 CONFIRM')).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: true });
    expect(parseCommand('approve a1b2c3 confirmed')).toEqual({ kind: 'unknown' });
    expect(parseCommand('approve a1b2c3 maybe')).toEqual({ kind: 'unknown' });
  });

  it('refuses a code that is too short, too long or not hex, and never guesses', () => {
    for (const t of ['approve a1b2c', 'approve a1b2c3d4e', 'approve zzzzzz', 'approve', 'approve all', 'approve everything now', 'reject', 'reject 12345', 'yes', 'ok approve it', 'please approve a1b2c3']) {
      expect(parseCommand(t)).toEqual({ kind: 'unknown' });
    }
  });

  it('writes to an executive with "name: message" or "@name message"', () => {
    expect(parseCommand('Hale: check the tax deadline')).toEqual({ kind: 'say', agent: 'hale', message: 'check the tax deadline' });
    expect(parseCommand('cfo : how is cash this week?')).toEqual({ kind: 'say', agent: 'cfo', message: 'how is cash this week?' });
    expect(parseCommand('@Hale check the tax deadline')).toEqual({ kind: 'say', agent: 'hale', message: 'check the tax deadline' });
    expect(parseCommand('@Hale, what is the cash position\nand the runway')).toEqual({ kind: 'say', agent: 'hale', message: 'what is the cash position\nand the runway' });
    expect(parseCommand('finance_head: send me the March close')).toMatchObject({ kind: 'say', agent: 'finance_head' });
  });

  it('does not read a command word as a name, and an empty message is nothing', () => {
    expect(parseCommand('approve: a1b2c3')).toEqual({ kind: 'unknown' });
    expect(parseCommand('status: all good')).toEqual({ kind: 'unknown' });
    expect(parseCommand('hale:')).toEqual({ kind: 'unknown' });
    expect(parseCommand('@hale')).toEqual({ kind: 'unknown' });
    expect(parseCommand('x: hi')).toEqual({ kind: 'unknown' });   // a name is at least two characters
  });

  it('reads status and help, and ignores everything else', () => {
    expect(parseCommand('status')).toEqual({ kind: 'status' });
    expect(parseCommand('Status?')).toEqual({ kind: 'status' });
    expect(parseCommand('HELP')).toEqual({ kind: 'help' });
    for (const t of ['', '   ', 'what is the status of the audit', 'helpful tip', 'see you at 3', 'lunch?', 12, null, undefined, {}]) expect(parseCommand(t)).toEqual({ kind: 'unknown' });
  });

  it('drops invisible characters (our own mark, zero-width spaces) before reading', () => {
    expect(parseCommand(`approve a1b2c3${OWN_MARK}`)).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: false });
    expect(parseCommand('approve​ a1b2c3')).toEqual({ kind: 'approve', code: 'a1b2c3', confirm: false });
  });

  it('keeps a message to an executive within a sane size', () => {
    expect(parseCommand(`hale: ${'x'.repeat(4001)}`)).toEqual({ kind: 'unknown' });
    expect(parseCommand(`hale: ${'x'.repeat(4000)}`)).toMatchObject({ kind: 'say' });
    const r = parseCommand(`reject a1b2c3 ${'y'.repeat(900)}`);
    expect(r.kind === 'reject' && r.reason.length).toBe(500);
  });
});

describe('crew cliq: whose message counts', () => {
  const msg = (over: Partial<IncomingMessage>): IncomingMessage => ({ id: 'm1', time: 2000, text: 'approve a1b2c3', senderId: '111', senderEmail: null, ...over });

  it('accepts only the typed Cliq user id or email, ignoring case and spaces', () => {
    expect(fromOwner({ senderId: '111' }, '111')).toBe(true);
    expect(fromOwner({ senderId: '222' }, '111')).toBe(false);
    expect(fromOwner({ senderId: '999', senderEmail: 'King@KDSquares.com' }, ' king@kdsquares.com ')).toBe(true);
    expect(fromOwner({ senderId: '999', senderEmail: 'someone@else.com' }, 'king@kdsquares.com')).toBe(false);
    expect(fromOwner({ senderId: '111' }, '111 ')).toBe(true);
  });

  it('matches a typed email through the id Zoho gave for it, and never on empty values', () => {
    expect(fromOwner({ senderId: '777' }, 'king@kdsquares.com', '777')).toBe(true);
    expect(fromOwner({ senderId: '778' }, 'king@kdsquares.com', '777')).toBe(false);
    expect(fromOwner({ senderId: '' }, '', '')).toBe(false);
    expect(fromOwner({ senderId: '' }, 'x@y.com', '')).toBe(false);
    expect(fromOwner({ senderId: '111' }, null)).toBe(false);
    expect(fromOwner({ senderId: '111' }, undefined)).toBe(false);
    expect(fromOwner({ senderId: '111' }, 'king@kdsquares.com', '')).toBe(false);
  });

  it('plans only the owner\'s newer messages, oldest first, and drops everybody else and our own posts', () => {
    const list: IncomingMessage[] = [
      msg({ id: 'old', time: 900 }),
      msg({ id: 'b', time: 3000, text: 'reject a1b2c3 no' }),
      msg({ id: 'stranger', time: 2500, senderId: '555', text: 'approve a1b2c3' }),
      msg({ id: 'a', time: 2000 }),
      msg({ id: 'ours', time: 2600, text: `*Hale needs your decision*\napprove a1b2c3${OWN_MARK}` }),
      msg({ id: 'chat', time: 2700, text: 'see you all at 3' }),
    ];
    const plan = planCommands(list, { ownerId: '111', cursorMs: 1000 });
    expect(plan.map((p) => p.message.id)).toEqual(['a', 'chat', 'b']);
    expect(plan.map((p) => p.command.kind)).toEqual(['approve', 'unknown', 'reject']);
  });

  it('plans nothing at all when no owner is set', () => {
    expect(planCommands([msg({})], { ownerId: '', cursorMs: 0 })).toEqual([]);
    expect(planCommands([msg({})], { ownerId: null, cursorMs: 0 })).toEqual([]);
  });

  it('spots our own posts by the invisible mark', () => {
    expect(ignoreAsOurOwn(`hello${OWN_MARK}`)).toBe(true);
    expect(ignoreAsOurOwn('hello')).toBe(false);
  });
});

describe('crew cliq: the team and the owner look-up', () => {
  const team = [{ slug: 'cfo', name: 'Hale King' }, { slug: 'finance_head', name: 'Charles Bennett' }, { slug: 'treasury', name: 'Hannah Brooks' }, { slug: 'ops', name: 'Hannah Lee' }];

  it('finds an executive by slug or first name, and says when it is none or many', () => {
    expect(resolveAgent('cfo', team)).toEqual({ ok: true, slug: 'cfo' });
    expect(resolveAgent('Hale', team)).toEqual({ ok: true, slug: 'cfo' });
    expect(resolveAgent('charles', team)).toEqual({ ok: true, slug: 'finance_head' });
    expect(resolveAgent('hannah', team)).toEqual({ ok: false, why: 'many' });
    expect(resolveAgent('treasury', team)).toEqual({ ok: true, slug: 'treasury' });
    expect(resolveAgent('sarah', team)).toEqual({ ok: false, why: 'none' });
    expect(resolveAgent('king', team)).toEqual({ ok: false, why: 'none' });   // a last name is not enough: never guess
    expect(resolveAgent('', team)).toEqual({ ok: false, why: 'none' });
  });

  it('builds the user look-up address only on a fixed Zoho host and reads the id defensively', () => {
    expect(userUrl('eu', 'king@kdsquares.com')).toBe('https://cliq.zoho.eu/api/v2/users/king%40kdsquares.com');
    expect(userUrl('evil.com' as never, 'x@y.com')).toBeNull();
    expect(userUrl('com', 'a b')).toBeNull();
    expect(userUrl('com', '../../x')).toBeNull();
    expect(parseUserId({ id: '123456' })).toBe('123456');
    expect(parseUserId({ data: { id: 98765 } })).toBe('98765');
    expect(parseUserId({ user: { id: 'u.1' } })).toBe('u.1');
    expect(parseUserId({ id: 'bad id!' })).toBeNull();
    expect(parseUserId(null)).toBeNull();
    expect(parseUserId('x')).toBeNull();
  });
});

describe('crew cliq: formatProposal', () => {
  it('shows who, what, the summary, the risk and the exact reply lines', () => {
    const m = formatProposal(P);
    expect(m.title).toBe('Hale (Chief Financial Officer) needs your decision');
    expect(m.text).toContain('Wants to: change a record');
    expect(m.text).toContain('Correct the March rent amount');
    expect(m.text).toContain('Risk: medium');
    expect(m.text).toContain('approve a1b2c3\n');
    expect(m.text).toContain('reject a1b2c3 your reason');
    expect(m.text).not.toContain('confirm');
  });

  it('asks for the word confirm on a high-risk proposal and on hiring or letting someone go', () => {
    const high = formatProposal({ ...P, risk: 'high' });
    expect(high.text).toContain('approve a1b2c3 confirm');
    expect(high.text).toContain('Risk: high');
    const staff = formatProposal({ ...P, action: 'agent.retire', risk: 'low' });
    expect(staff.text).toContain('approve a1b2c3 confirm');
    expect(staff.text).toContain('let a team member go');
    expect(needsConfirm({ risk: 'medium', action: 'advice.finance' })).toBe(false);
    expect(needsConfirm({ risk: 'high', action: 'advice.finance' })).toBe(true);
    expect(needsConfirm({ risk: 'low', action: 'agent.hire' })).toBe(true);
  });

  it('never offers to approve a payment or a payroll run from Cliq', () => {
    for (const action of ['draft.batch_payment', 'draft.payroll_run']) {
      const m = formatProposal({ ...P, action, risk: 'high' });
      expect(m.text).not.toMatch(/approve a1b2c3/);
      expect(m.text).toContain('approved in the app');
      expect(m.text).toContain('reject a1b2c3 your reason');
      expect(approvedInAppOnly(action)).toBe(true);
    }
    expect(approvedInAppOnly('draft.invoice')).toBe(false);
  });

  it('keeps agent-written text plain: no tags, no invisible marks, bounded length', () => {
    const m = formatProposal({ ...P, summary: `Ping {@999999} and {@all}${OWN_MARK} now\n\n\n\n${'z'.repeat(900)}` });
    expect(m.text).not.toContain('{@');
    expect(m.text).not.toContain(OWN_MARK);
    expect(m.text.length).toBeLessThan(800);
    expect(plain(undefined, 10)).toBe('');
  });

  it('puts a readable label on every action the database allows, and a safe fallback', () => {
    for (const a of ['record.create', 'record.update', 'record.soft_delete', 'draft.invoice', 'draft.filing', 'advice.knowledge', 'agent.hire', 'agent.retire', 'drive.create', 'drive.update', 'drive.trash', 'external.github', 'external.vercel', 'external.supabase', 'external.other']) {
      expect(actionLabel(a)).not.toBe('do something');
    }
    expect(actionLabel('advice.cash_flow')).toBe('give advice (cash flow)');
    expect(actionLabel('something.new')).toBe('do something');
  });
});

describe('crew cliq: replies', () => {
  it('says what happened after a decision', () => {
    expect(formatDecision('reject', { status: 'rejected', agent: 'Hale King' }).text).toMatch(/^Rejected\. Hale has been told/);
    expect(formatDecision('approve', { status: 'executed', summary: 'Fix rent' }).title).toBe('Approved and done');
    expect(formatDecision('approve', { status: 'approved' }).text).toContain('carry it out in the app');
    expect(formatDecision('approve', { status: 'failed', error: 'the table no longer exists' }).text).toContain('the table no longer exists');
    expect(formatDecision('approve', { status: 'failed' }).text).toContain('no reason given');
  });

  it('says who the message went to', () => {
    expect(formatSaid('Hale King')).toEqual({ title: 'Sent to Hale', text: expect.stringContaining('Sent to Hale.') });
  });

  it('passes the database sentence through as plain text and falls back when there is none', () => {
    expect(formatError('that one is already approved').text).toBe('that one is already approved');
    expect(formatError('P0001: no proposal starts with abc123').text).toBe('no proposal starts with abc123');
    expect(formatError(`bad {@123} thing${OWN_MARK}`).text).toBe('bad thing');
    expect(formatError(undefined).text).toContain('Try again');
    expect(formatError('x'.repeat(900)).text.length).toBe(300);
  });

  it('lists what is waiting, or says nothing is', () => {
    expect(formatStatus([]).text).toBe('Nothing is waiting for you.');
    const s = formatStatus([P, { ...P, code: 'ffeedd', agent_name: 'Hannah Brooks', summary: 'Pay the vendor', risk: 'high' }]);
    expect(s.title).toBe('Crew status: 2 waiting');
    expect(s.text).toContain('a1b2c3  Hale: Correct the March rent amount (medium)');
    expect(s.text).toContain('ffeedd  Hannah: Pay the vendor (high)');
  });

  it('has a help text that names every command and the safety rules', () => {
    const h = formatHelp().text;
    for (const w of ['approve a1b2c3', 'confirm', 'reject a1b2c3', 'status', 'Payments are approved in the app', 'Only your own Cliq account']) expect(h).toContain(w);
    expect(formatWelcome(0).text).toContain('Nothing is waiting');
    expect(formatWelcome(1).text).toContain('1 proposal is already waiting');
    expect(formatWelcome(4).text).toContain('4 proposals are already waiting');
  });
});
