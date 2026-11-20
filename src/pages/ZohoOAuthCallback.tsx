import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAgentToast } from '@/features/ops-agent/settings/useAgentToast';
import { useZohoOAuthFinish, useZohoOAuthUrls } from '@/queries/useOpsAgent';

const BACK = '/agent/connections';
const NO_CODE = 'This page is where Zoho sends you after you allow access, and nothing came back with it. Go back to Connections and press "Connect to Zoho" again.';
const DENIED = 'You did not allow access in Zoho, so nothing was connected. Go back to Connections and press "Connect to Zoho" to try again.';

/**
 * Where Zoho sends the person after the consent screen (/agent/oauth/zoho). It hands the one-time code to the server exactly once,
 * then returns to Connections. The code and the state are never shown, and an error is always written in plain words.
 */
export default function ZohoOAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useAgentToast();
  const finish = useZohoOAuthFinish();
  const urls = useZohoOAuthUrls();
  // Read once: the code works one time only, so what was in the address when the page opened is what gets used.
  const [first] = useState(() => ({
    code: params.get('code') ?? '', state: params.get('state') ?? '', zohoError: params.get('error') ?? '', server: params.get('accounts-server') ?? '',
  }));
  const used = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const refused = first.zohoError !== '';
  const incomplete = !refused && (first.code === '' || first.state === '');
  const problem = refused ? (first.zohoError === 'access_denied' ? DENIED : 'Zoho did not finish the sign-in. Go back to Connections and press "Connect to Zoho" to try again.') : incomplete ? NO_CODE : error;

  useEffect(() => {
    if (refused || incomplete || !urls.ready || used.current) return;
    used.current = true; // set before the call, so a second render or React strict mode can never send the code again
    finish.mutateAsync({ code: first.code, state: first.state, redirect_uri: urls.redirectUri, ...(first.server ? { accounts_server: first.server } : {}) })
      .then((r) => {
        if (r.ok) { toast.saved('Zoho Cliq is connected. Send a test to check it.'); navigate(BACK, { replace: true }); }
        else setError(r.error ?? 'Could not finish connecting to Zoho. Go back to Connections and try again.');
      })
      .catch((e: unknown) => setError(e instanceof Error && e.message ? e.message : 'Could not finish connecting to Zoho. Go back to Connections and try again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the site address is known
  }, [urls.ready]);

  return (
    <div className="mx-auto flex max-w-lg justify-center pt-10" data-testid="zoho-callback">
      <Card className="w-full space-y-4 p-6 text-center">
        {problem ? (
          <>
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
            <h1 className="text-base font-semibold">Zoho was not connected</h1>
            <p className="text-sm text-muted-foreground" role="alert" data-testid="zoho-callback-error">{problem}</p>
            <Button onClick={() => navigate(BACK, { replace: true })} data-testid="zoho-callback-back">Back to Connections</Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <h1 className="text-base font-semibold" role="status">Connecting to Zoho…</h1>
            <p className="text-sm text-muted-foreground">This takes a few seconds. Please do not close this page.</p>
          </>
        )}
      </Card>
    </div>
  );
}
