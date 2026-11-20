// The page Zoho sends the person back to (/agent/oauth/zoho): it must hand the one-time code to the server exactly once, go back to
// Connections on success, explain a failure in plain words, and never show the code or state.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  calls: [] as { fn: string; body: Record<string, unknown> }[],
  finish: { ok: true, id: 'c1' } as Record<string, unknown>,
  settings: { id: true, app_url: 'https://ops.example.com' } as Record<string, unknown>,
  toasts: [] as { title?: string; description?: string }[],
}));

vi.mock('@/lib/supabase', () => {
  const builder = () => {
    const b: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve({ data: h.settings, error: null }).then(res);
        return () => b;
      },
    });
    return b;
  };
  return {
    supabase: {
      from: () => builder(),
      functions: {
        invoke: (fn: string, opts: { body: Record<string, unknown> }) => {
          h.calls.push({ fn, body: opts.body });
          return Promise.resolve({ data: h.finish, error: null });
        },
      },
    },
  };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (t: { title?: string; description?: string }) => { h.toasts.push(t); } }) }));

import ZohoOAuthCallback from '@/pages/ZohoOAuthCallback';
import { zohoOAuthUrls } from '../zohoOAuth';

function Where() { const l = useLocation(); return <span data-testid="loc">{l.pathname}</span>; }

const CODE = 'ONE-TIME-CODE-VALUE';
const STATE = 'STATE-VALUE-123';

function renderCallback(query: string, strict = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const ui = (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/agent/oauth/zoho${query}`]}>
        <Routes>
          <Route path="/agent/oauth/zoho" element={<ZohoOAuthCallback />} />
          <Route path="/agent/connections" element={<span data-testid="connections-page">Connections</span>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}
const finishCalls = () => h.calls.filter((c) => c.body.action === 'oauth_finish');

beforeEach(() => {
  h.calls.length = 0;
  h.toasts.length = 0;
  h.finish = { ok: true, id: 'c1' };
  h.settings = { id: true, app_url: 'https://ops.example.com' };
});

describe('zohoOAuthUrls', () => {
  it('builds both addresses from the site address, without a trailing slash', () => {
    expect(zohoOAuthUrls('https://ops.example.com/')).toEqual({ homepageUrl: 'https://ops.example.com', redirectUri: 'https://ops.example.com/agent/oauth/zoho' });
    expect(zohoOAuthUrls(undefined).redirectUri).toBe(`${window.location.origin}/agent/oauth/zoho`);
  });
});

describe('Zoho callback page', () => {
  it('shows "Connecting to Zoho…", calls oauth_finish once with the code, state and accounts server, then goes to Connections with a toast', async () => {
    renderCallback(`?code=${CODE}&state=${STATE}&accounts-server=${encodeURIComponent('https://accounts.zoho.eu')}`);
    expect(screen.getByText('Connecting to Zoho…')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(CODE);
    expect(document.body.textContent).not.toContain(STATE);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/agent/connections'));
    expect(finishCalls()).toHaveLength(1);
    expect(finishCalls()[0]).toEqual({ fn: 'agent-connections', body: { action: 'oauth_finish', code: CODE, state: STATE, redirect_uri: 'https://ops.example.com/agent/oauth/zoho', accounts_server: 'https://accounts.zoho.eu' } });
    expect(h.toasts.map((t) => t.title)).toContain('Zoho Cliq is connected. Send a test to check it.');
  });

  it('omits accounts_server when Zoho did not send one', async () => {
    renderCallback(`?code=${CODE}&state=${STATE}`);
    await waitFor(() => expect(finishCalls()).toHaveLength(1));
    expect('accounts_server' in finishCalls()[0].body).toBe(false);
  });

  it('uses the one-time code only once even when React runs the effect twice (strict mode)', async () => {
    renderCallback(`?code=${CODE}&state=${STATE}`, true);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/agent/connections'));
    expect(finishCalls()).toHaveLength(1);
  });

  it('shows the server message on failure, with a button back to Connections, and never shows the code', async () => {
    h.finish = { ok: false, error: 'Zoho did not accept the sign-in. Please try again.' };
    renderCallback(`?code=${CODE}&state=${STATE}`);
    expect(await screen.findByTestId('zoho-callback-error')).toHaveTextContent('Zoho did not accept the sign-in. Please try again.');
    expect(finishCalls()).toHaveLength(1);
    expect(document.body.textContent).not.toContain(CODE);
    expect(document.body.textContent).not.toContain(STATE);
    expect(h.toasts).toHaveLength(0);
    screen.getByTestId('zoho-callback-back').click();
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/agent/connections'));
  });

  it('explains access_denied in plain words and does not call the server', async () => {
    renderCallback('?error=access_denied&state=abc');
    expect(await screen.findByTestId('zoho-callback-error')).toHaveTextContent('You did not allow access in Zoho');
    expect(screen.getByTestId('zoho-callback-back')).toBeInTheDocument();
    expect(finishCalls()).toHaveLength(0);
  });

  it('never calls the server without a code or without a state', async () => {
    const { unmount } = renderCallback('');
    expect(await screen.findByTestId('zoho-callback-error')).toHaveTextContent('nothing came back');
    unmount();
    renderCallback(`?code=${CODE}`);
    expect(await screen.findByTestId('zoho-callback-error')).toBeInTheDocument();
    expect(finishCalls()).toHaveLength(0);
  });

  it('falls back to the browser address for the redirect when no site address is saved', async () => {
    h.settings = { id: true };
    renderCallback(`?code=${CODE}&state=${STATE}`);
    await waitFor(() => expect(finishCalls()).toHaveLength(1));
    expect(finishCalls()[0].body.redirect_uri).toBe(`${window.location.origin}/agent/oauth/zoho`);
  });
});
