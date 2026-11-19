import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSaveConnection } from '@/queries/useOpsAgent';
import { CONNECTION_KINDS, type AgentConnection, type ConnectionKind } from '../agentDb';
import { Field } from '../settings/shared';

const secretNames = (c: AgentConnection | null, part: 'url' | 'token') =>
  !!c && c.vault_secret_names.some((n) => n.endsWith(`_${part}`));

/** Add a connection, or edit one. Secrets are write only: a saved one is shown as "saved", and blank means keep it. */
export function ConnectionDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; editing: AgentConnection | null; onSaved: (id: string, wasNew: boolean) => void;
}) {
  const save = useSaveConnection();
  const [kind, setKind] = useState<ConnectionKind>('slack');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('POST');
  const [headerName, setHeaderName] = useState('Authorization');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setToken(''); setClearToken(false);
    if (editing && editing.kind !== 'whatsapp') {
      setKind(editing.kind); setName(editing.name); setUrl(editing.kind === 'slack' || editing.kind === 'cliq' ? '' : editing.config.url ?? '');
      setTo(editing.config.to ?? ''); setMethod(editing.config.method ?? 'POST'); setHeaderName(editing.config.header_name ?? 'Authorization');
    } else {
      setKind('slack'); setName(''); setUrl(''); setTo(''); setMethod('POST'); setHeaderName('Authorization');
    }
  }, [open, editing]);

  const meta = CONNECTION_KINDS.find((k) => k.kind === kind)!;
  const secretUrl = kind === 'slack' || kind === 'cliq';
  const hasSavedUrl = secretNames(editing, 'url');
  const hasSavedToken = secretNames(editing, 'token');
  const ready = name.trim().length > 0 && (kind === 'email' ? to.trim().length > 0 : secretUrl ? (url.trim().length > 0 || hasSavedUrl) : url.trim().length > 0);

  const submit = () => {
    setError(null);
    save.mutate(
      { id: editing?.id, kind, name: name.trim(), url: url.trim() || undefined, token: token.trim() || undefined, clear_token: clearToken || undefined, to: to.trim() || undefined, method, header_name: headerName.trim() || undefined },
      { onSuccess: (r) => { if (r.ok && r.id) { onOpenChange(false); onSaved(r.id, !editing); } else setError(r.error ?? 'Could not save the connection.'); }, onError: (e) => setError(e.message) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="connection-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a connection'}</DialogTitle>
          <DialogDescription>{meta.help} Addresses and tokens are stored encrypted and are never shown again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!editing && (
            <Field label="Kind" htmlFor="conn-kind">
              <Select value={kind} onValueChange={(v) => setKind(v as ConnectionKind)}>
                <SelectTrigger id="conn-kind"><SelectValue /></SelectTrigger>
                <SelectContent>{CONNECTION_KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Name" htmlFor="conn-name" hint="How you will recognise it, for example Ops channel.">
            <Input id="conn-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>

          {secretUrl && (
            <Field label={kind === 'slack' ? 'Slack incoming webhook address' : 'Zoho Cliq webhook address'} htmlFor="conn-url"
              hint={hasSavedUrl ? 'An address is saved. Leave blank to keep it, or paste a new one.' : 'Starts with https://. It works like a password, so it is kept encrypted.'}>
              <Input id="conn-url" type="password" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={hasSavedUrl ? '•••••••• saved' : 'https://…'} />
            </Field>
          )}

          {kind === 'email' && (
            <Field label="Send to" htmlFor="conn-to" hint="One to five addresses, separated by commas.">
              <Input id="conn-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="ops@example.com, hr@example.com" />
            </Field>
          )}

          {(kind === 'webhook' || kind === 'n8n' || kind === 'api') && (
            <>
              <Field label="Address" htmlFor="conn-url2" hint="Must start with https://. Internal addresses are refused.">
                <Input id="conn-url2" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/…" />
              </Field>
              {kind === 'api' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Method" htmlFor="conn-method">
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger id="conn-method"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="POST">POST (send a message)</SelectItem><SelectItem value="GET">GET (check it is up)</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <Field label="Token header" htmlFor="conn-header" hint="Authorization sends “Bearer …”.">
                    <Input id="conn-header" value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
                  </Field>
                </div>
              )}
              <Field label={kind === 'api' ? 'Token' : 'Secret (optional)'} htmlFor="conn-token"
                hint={kind === 'api' ? undefined : 'With a secret, every call carries a signature (X-KDOps-Signature, HMAC-SHA256) so the receiver can check it came from KD Ops.'}>
                <Input id="conn-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={hasSavedToken ? '•••••••• saved' : ''} />
              </Field>
              {hasSavedToken && (
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={clearToken} onCheckedChange={(c) => setClearToken(c === true)} /> Remove the saved {kind === 'api' ? 'token' : 'secret'}</label>
              )}
            </>
          )}
          {error && <p className="text-sm text-destructive" role="alert" data-testid="connection-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!ready || save.isPending} data-testid="connection-save">
            {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} {editing ? 'Save changes' : 'Add connection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
