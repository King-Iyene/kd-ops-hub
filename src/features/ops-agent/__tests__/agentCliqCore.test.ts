import { describe, expect, it, vi } from 'vitest';
import {
  accountsUrl, messagesUrl, packAccess, parseTokenResponse, readCachedAccess, tokenForm, validChannel, validClientId, validDc, validZohoValue,
} from '../../../../supabase/functions/_shared/agent-cliq-core';
import { buildRequest } from '../../../../supabase/functions/_shared/agent-deliver-core';
import { deliver } from '../../../../supabase/functions/_shared/agent-deliver';
import { exchangeGrantCode } from '../../../../supabase/functions/_shared/agent-cliq';

const cfg = { mode: 'api', dc: 'com', client_id: '1000.ABCDEFGH12345678', channel: 'ops_alerts', cc_manager: true };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const resolveDns = async () => ['203.0.113.10'];

describe('Cliq API pieces', () => {
  it('only knows real Zoho data centers and plain channel names', () => {
    expect(validDc('eu')).toBe(true);
    expect(validDc('evil.com/x')).toBe(false);
    expect(validChannel('ops_alerts')).toBe(true);
    expect(validChannel('Ops Alerts')).toBe(false);
    expect(validChannel('../x')).toBe(false);
    expect(validClientId('1000.ABCDEFGH12345678')).toBe(true);
    expect(validZohoValue('abc def')).toBe(false);
  });
  it('builds the message address and token address on fixed Zoho hosts', () => {
    expect(messagesUrl('com', 'ops_alerts')).toBe('https://cliq.zoho.com/api/v3/channelsbyname/ops_alerts/messages');
    expect(messagesUrl('eu', 'x')).toBe('https://cliq.zoho.eu/api/v3/channelsbyname/x/messages');
    expect(accountsUrl('in')).toBe('https://accounts.zoho.in/oauth/v2/token');
  });
  it('swaps a code or a refresh token with the right form', () => {
    const code = new URLSearchParams(tokenForm({ clientId: 'cid', clientSecret: 'sec', code: 'c1' }));
    expect(code.get('grant_type')).toBe('authorization_code'); expect(code.get('code')).toBe('c1');
    const ref = new URLSearchParams(tokenForm({ clientId: 'cid', clientSecret: 'sec', refreshToken: 'r1' }));
    expect(ref.get('grant_type')).toBe('refresh_token'); expect(ref.get('refresh_token')).toBe('r1');
  });
  it('reads Zoho answers, including the errors it returns with HTTP 200', () => {
    expect(parseTokenResponse({ access_token: '1000.aaaaaaaaaaaa', refresh_token: '1000.bbbbbbbbbbbb', expires_in: 3600 }, 'code')).toMatchObject({ ok: true, refresh: '1000.bbbbbbbbbbbb' });
    expect(parseTokenResponse({ access_token: '1000.aaaaaaaaaaaa', expires_in: 3600 }, 'code')).toMatchObject({ ok: false });
    expect(parseTokenResponse({ access_token: '1000.aaaaaaaaaaaa', expires_in: 3600 }, 'refresh')).toMatchObject({ ok: true, refresh: null });
    expect(parseTokenResponse({ error: 'invalid_code' }, 'code')).toMatchObject({ ok: false, error: expect.stringContaining('grant code') });
    expect(parseTokenResponse({ error: 'invalid_client' }, 'refresh')).toMatchObject({ ok: false, error: expect.stringContaining('Client ID') });
    expect(parseTokenResponse({ error: '<script>' }, 'code')).toMatchObject({ ok: false, error: expect.not.stringContaining('<script>') });
  });
  it('reuses a saved access token until it is about to expire', () => {
    const now = 1_000_000;
    expect(readCachedAccess(packAccess('1000.tokentokentoken', 3600, now), now + 60_000)).toBe('1000.tokentokentoken');
    expect(readCachedAccess(packAccess('1000.tokentokentoken', 3600, now), now + 3600_000 - 60_000)).toBeNull();
    expect(readCachedAccess('garbage', now)).toBeNull();
    expect(readCachedAccess(null, now)).toBeNull();
  });
});

describe('Cliq API message', () => {
  const secrets = { access: '1000.accesstoken123' };
  it('posts to the channel with the person tagged and their manager as a CC', async () => {
    const b = await buildRequest({ kind: 'cliq', name: 'Cliq', config: cfg }, secrets, {
      title: 'Report missing', text: 'No report yet.',
      mention: { name: 'Cara', id: '111' }, cc: { name: 'Dan', id: '222' },
    });
    expect(b.type).toBe('http');
    if (b.type !== 'http') return;
    expect(b.url).toBe('https://cliq.zoho.com/api/v3/channelsbyname/ops_alerts/messages');
    expect(b.init.headers.Authorization).toBe('Zoho-oauthtoken 1000.accesstoken123');
    expect(b.retryAuthorization).toBe('Bearer 1000.accesstoken123');
    const text = JSON.parse(b.init.body!).text as string;
    expect(text).toContain('For Cara: {@111}');
    expect(text).toContain('CC Dan (manager): {@222}');
    expect(text).toContain('No report yet.');
  });
  it('does not tag anyone when tagging is off', async () => {
    const b = await buildRequest({ kind: 'cliq', name: 'Cliq', config: { ...cfg, mention_people: false } }, secrets, { text: 'Hi', mention: { name: 'Cara', id: '111' }, cc: { name: 'Dan', id: '222' } });
    if (b.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(b.init.body!).text).toBe('Hi');
  });
  it('still names the person and the manager when there is no Cliq id to tag with', async () => {
    const b = await buildRequest({ kind: 'cliq', name: 'Cliq', config: cfg }, secrets, { text: 'No tracking', mention: { name: 'Pat', id: '' }, cc: { name: 'Dan', id: '' } });
    if (b.type !== 'http') throw new Error('expected http');
    const text = JSON.parse(b.init.body!).text as string;
    expect(text).toContain('For Pat\n');
    expect(text).toContain('CC Dan (manager)\n');
    expect(text).not.toContain('{@');
  });
  it('CCs the manager even when the person themselves cannot be tagged', async () => {
    const b = await buildRequest({ kind: 'cliq', name: 'Cliq', config: cfg }, secrets, { text: 'x', cc: { name: 'Dan', id: '222' } });
    if (b.type !== 'http') throw new Error('expected http');
    expect(JSON.parse(b.init.body!).text).toBe('CC Dan (manager): {@222}\nx');
  });
  it('refuses a bad data center or channel name', async () => {
    expect((await buildRequest({ kind: 'cliq', name: 'c', config: { ...cfg, dc: 'x.evil' } }, secrets, { text: 'Hi' })).type).toBe('error');
    expect((await buildRequest({ kind: 'cliq', name: 'c', config: { ...cfg, channel: '../x' } }, secrets, { text: 'Hi' })).type).toBe('error');
  });
  it('keeps the webhook way working exactly as before', async () => {
    const b = await buildRequest({ kind: 'cliq', name: 'c', config: {} }, { url: 'https://cliq.zoho.com/api/v2/channelsbyname/x/message?zapikey=k' }, { text: 'Hi', mention: { name: 'Cara', id: '111' } });
    if (b.type !== 'http') throw new Error('expected http');
    expect(b.url).toContain('zapikey=k');
    expect(JSON.parse(b.init.body!).text).toContain('For Cara: {@111}');
  });
});

describe('Cliq API delivery', () => {
  it('signs in with the refresh token once, saves the access token, and posts', async () => {
    const calls: { url: string; body: string; auth?: string }[] = [];
    const saved: string[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: (init.headers as Record<string, string>)?.Authorization });
      if (url.startsWith('https://accounts.zoho.com')) return json({ access_token: '1000.freshaccesstoken', expires_in: 3600 });
      return new Response(null, { status: 204 });
    });
    const r = await deliver({ kind: 'cliq', name: 'c', config: cfg }, { secret: 'sekret12345', refresh: '1000.refreshrefresh' }, { text: 'Hi' },
      { fetch: fetchMock as unknown as typeof fetch, resolveDns, saveAccess: async (p) => { saved.push(p); } });
    expect(r).toEqual({ ok: true, status: 204 });
    expect(calls[0].url).toBe('https://accounts.zoho.com/oauth/v2/token');
    expect(calls[1].auth).toBe('Zoho-oauthtoken 1000.freshaccesstoken');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^\d+:1000\.freshaccesstoken$/);
  });
  it('reuses a saved access token without calling Zoho sign-in again', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const access = packAccess('1000.savedaccesstok', 3600, Date.now());
    const r = await deliver({ kind: 'cliq', name: 'c', config: cfg }, { secret: 'sekret12345', refresh: '1000.refreshrefresh', access }, { text: 'Hi' }, { fetch: fetchMock as unknown as typeof fetch, resolveDns });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('tries the other spelling of the sign-in header once when the first is refused', async () => {
    const auths: string[] = [];
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      const a = (init.headers as Record<string, string>).Authorization; auths.push(a);
      return new Response(null, { status: a.startsWith('Zoho-oauthtoken') ? 401 : 204 });
    });
    const access = packAccess('1000.savedaccesstok', 3600, Date.now());
    const r = await deliver({ kind: 'cliq', name: 'c', config: cfg }, { access }, { text: 'Hi' }, { fetch: fetchMock as unknown as typeof fetch, resolveDns });
    expect(r.ok).toBe(true);
    expect(auths).toEqual(['Zoho-oauthtoken 1000.savedaccesstok', 'Bearer 1000.savedaccesstok']);
  });
  it('says plainly when Zoho no longer accepts the refresh token, without echoing a secret', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'invalid_token' }));
    const r = await deliver({ kind: 'cliq', name: 'c', config: cfg }, { secret: 'sekret12345', refresh: '1000.refreshrefresh' }, { text: 'Hi' }, { fetch: fetchMock as unknown as typeof fetch, resolveDns });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toContain('new grant code'); expect(r.error).not.toContain('sekret12345'); expect(r.error).not.toContain('refreshrefresh'); }
  });
  it('swaps a grant code for a refresh token', async () => {
    const fetchMock = vi.fn(async () => json({ access_token: '1000.aaaaaaaaaaaa', refresh_token: '1000.bbbbbbbbbbbb', expires_in: 3600 }));
    const r = await exchangeGrantCode('eu', '1000.ABCDEFGH12345678', 'sekret12345', '1000.codecodecode', fetchMock as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, refresh: '1000.bbbbbbbbbbbb' });
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://accounts.zoho.eu/oauth/v2/token');
  });
});

import { consentUrl, dcFromAccountsServer, validRedirectUri } from '../../../../supabase/functions/_shared/agent-cliq-core';

describe('Zoho sign-in page (server-based app)', () => {
  const site = 'https://ops.kdsquares.com';
  it('only returns to our own page on a known address', () => {
    expect(validRedirectUri('https://ops.kdsquares.com/agent/oauth/zoho', [site])).toBe('https://ops.kdsquares.com/agent/oauth/zoho');
    expect(validRedirectUri('https://evil.example/agent/oauth/zoho', [site])).toBeNull();
    expect(validRedirectUri('https://ops.kdsquares.com/other', [site])).toBeNull();
    expect(validRedirectUri('https://ops.kdsquares.com/agent/oauth/zoho?x=1', [site])).toBeNull();
    expect(validRedirectUri('http://ops.kdsquares.com/agent/oauth/zoho', [site])).toBeNull();
    expect(validRedirectUri('https://u:p@ops.kdsquares.com/agent/oauth/zoho', [site])).toBeNull();
    expect(validRedirectUri('https://app.example.org/agent/oauth/zoho', [site, 'https://app.example.org'])).toBe('https://app.example.org/agent/oauth/zoho');
    expect(validRedirectUri(undefined, [site])).toBeNull();
  });
  it('reads the data center Zoho says the person signed in on, from fixed hosts only', () => {
    expect(dcFromAccountsServer('https://accounts.zoho.eu')).toBe('eu');
    expect(dcFromAccountsServer('https://accounts.zoho.com.au/')).toBe('com.au');
    expect(dcFromAccountsServer('https://accounts.zoho.evil.com')).toBeNull();
    expect(dcFromAccountsServer('https://evil.com')).toBeNull();
    expect(dcFromAccountsServer(undefined)).toBeNull();
  });
  it('builds the consent address with offline access so a refresh token comes back', () => {
    const u = new URL(consentUrl({ dc: 'com', clientId: '1000.ABCDEFGH12345678', redirectUri: 'https://ops.kdsquares.com/agent/oauth/zoho', state: 'a'.repeat(64) }));
    expect(u.origin + u.pathname).toBe('https://accounts.zoho.com/oauth/v2/auth');
    expect(u.searchParams.get('scope')).toBe('ZohoCliq.Webhooks.CREATE');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('redirect_uri')).toBe('https://ops.kdsquares.com/agent/oauth/zoho');
    expect(u.searchParams.get('state')).toBe('a'.repeat(64));
  });
  it('sends the same return address when it swaps the code', () => {
    const f = new URLSearchParams(tokenForm({ clientId: 'cid', clientSecret: 'sec', code: 'c1', redirectUri: 'https://ops.kdsquares.com/agent/oauth/zoho' }));
    expect(f.get('redirect_uri')).toBe('https://ops.kdsquares.com/agent/oauth/zoho');
  });
});
