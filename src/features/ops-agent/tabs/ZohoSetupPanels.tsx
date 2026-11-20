import { useEffect, useId, useRef, useState } from 'react';
import { Check, Circle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copyText } from '../zohoOAuth';

/** One read-only value with a Copy button. If the browser refuses to copy, the text is selected so Ctrl+C or Cmd+C works. */
function CopyRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const id = useId(); // the same row can be on the page twice (the Connections tab and the dialog), so ids cannot be fixed
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const input = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyText(value);
    if (!ok) input.current?.select();
    setState(ok ? 'copied' : 'manual');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 3000);
  };
  return (
    <div className="space-y-1" data-testid={testId}>
      <label htmlFor={id} className="text-xs font-medium">{label}</label>
      <div className="flex items-center gap-2">
        {/* A read-only text area wraps a long address onto more lines instead of scrolling sideways. */}
        <textarea
          ref={input} id={id} readOnly value={value} rows={Math.max(1, Math.ceil(value.length / 44))} spellCheck={false}
          className="min-h-9 min-w-0 flex-1 resize-none break-all rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={copy} aria-label={`Copy ${label}`} data-testid={`${testId}-copy`}>
          {state === 'copied' ? <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
          {state === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {state === 'manual' && <p className="text-xs text-muted-foreground" role="status">Your browser did not allow copying. The text is selected: press Ctrl+C (Cmd+C on a Mac).</p>}
    </div>
  );
}

/** The two addresses Zoho asks for when the client is created. Pasted exactly as shown. */
export function PasteIntoZoho({ homepageUrl, redirectUri, loading, title = 'Paste these into Zoho', description = 'Zoho asks for both when you create the client. Copy each one exactly as it is.', testId = 'zoho-paste-block' }: {
  homepageUrl: string; redirectUri: string; loading?: boolean; title?: string; description?: string; testId?: string;
}) {
  return (
    <section aria-label={title} className="min-w-0 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5" data-testid={testId}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Getting your site address…</p>
      ) : (
        <>
          <CopyRow label="Homepage URL" value={homepageUrl} testId="zoho-homepage" />
          <CopyRow label="Authorized Redirect URI (the callback)" value={redirectUri} testId="zoho-redirect" />
        </>
      )}
    </section>
  );
}

export interface ZohoStatus { clientSaved: boolean; authorized: boolean; channelSet: boolean; tested: boolean | null }

/** A short checklist so it is always clear what is done and what is left. `tested` null means it is not known, so the line is left out. */
export function ZohoChecklist({ status }: { status: ZohoStatus }) {
  const items: { key: string; label: string; done: boolean }[] = [
    { key: 'client', label: 'Client ID and secret saved', done: status.clientSaved },
    { key: 'authorized', label: 'Connected to Zoho (authorized)', done: status.authorized },
    { key: 'channel', label: 'Channel name set', done: status.channelSet },
    ...(status.tested === null ? [] : [{ key: 'tested', label: 'Test message sent', done: status.tested }]),
  ];
  return (
    <section aria-label="Connection status" className="rounded-xl border p-3.5" data-testid="zoho-status">
      <h3 className="mb-2 text-sm font-semibold">Where you are</h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2" data-testid={`zoho-status-${i.key}`} data-done={i.done}>
            {i.done ? <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
            <span className={cn(!i.done && 'text-muted-foreground')}>{i.label}</span>
            <span className="sr-only">{i.done ? '(done)' : '(not done yet)'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The main action for the Zoho way. Needs a saved connection with no unsaved edits, because Zoho sends the person away and back. */
export function ConnectToZoho({ saved, dirty, authorized, busy, onConnect }: { saved: boolean; dirty: boolean; authorized: boolean; busy: boolean; onConnect: () => void }) {
  const blocked = !saved || dirty;
  const label = blocked ? 'Save first' : authorized ? 'Reconnect to Zoho' : 'Connect to Zoho';
  return (
    <div className="space-y-1.5" data-testid="zoho-connect-block">
      <Button type="button" size="lg" onClick={onConnect} disabled={blocked || busy} data-testid="zoho-connect">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />} {label}
      </Button>
      <p className="text-xs text-muted-foreground">
        {blocked
          ? (saved ? 'You changed something. Press Save changes, then connect.' : 'Fill in the fields above and press Save. Then this button works.')
          : 'Zoho asks you to allow access, then brings you back here.'}
      </p>
    </div>
  );
}
