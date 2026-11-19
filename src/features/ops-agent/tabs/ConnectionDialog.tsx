import { useState } from 'react';
import { ArrowLeft, Check, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSaveConnection, useTestConnection } from '@/queries/useOpsAgent';
import type { AgentConnection, MinSeverity, SaveConnectionInput } from '../agentDb';
import { AUTO_EVENTS, DEFAULT_EVENTS, type ConnectionPreset, type PresetField } from '../connectionPresets';
import { Field } from '../settings/shared';
import { ApiOptions, headerProblem, type ApiForm } from './ApiOptions';
import { ToolIcon, presetForConnection } from './ToolIcon';
import { ToolPicker } from './ToolPicker';

const SEVERITIES: { value: MinSeverity; label: string }[] = [
  { value: 'low', label: 'Low and above' }, { value: 'medium', label: 'Medium and above' }, { value: 'high', label: 'High and above' }, { value: 'critical', label: 'Critical only' },
];
const ANY = 'any';

type Part = 'url' | 'token';
const savedSecret = (c: AgentConnection | null, part: Part) => !!c && c.vault_secret_names.some((n) => n.endsWith(`_${part}`));

function apiFormFor(preset: ConnectionPreset, c: AgentConnection | null): ApiForm {
  const d = preset.api;
  const cfg = c?.config ?? {};
  const extra = cfg.extra_headers ?? d?.extra_headers ?? {};
  return {
    method: (cfg.method as ApiForm['method']) ?? d?.method ?? 'POST',
    auth: cfg.auth_type ?? d?.auth ?? 'bearer',
    headerName: cfg.header_name ?? d?.header_name ?? 'Authorization',
    queryParam: cfg.query_param ?? d?.query_param ?? 'token',
    contentType: cfg.content_type ?? d?.content_type ?? 'json',
    headers: Object.entries(extra).map(([name, value]) => ({ name, value })),
    body: cfg.body_template ?? d?.body_template ?? '',
  };
}

/** The saved address is only shown back when it is not a secret (a Slack or Discord address works like a password). */
const initialValue = (f: PresetField, c: AgentConnection | null): string => {
  if (!c) return '';
  if (f.secret) return '';
  if (f.field === 'url') return c.config.url ?? '';
  if (f.field === 'to') return c.config.to ?? '';
  if (f.field === 'chat_id') return c.config.chat_id ?? '';
  return '';
};

/**
 * Add a connection in two steps: pick the tool, then follow its set-up guide and fill in only the fields it needs. Editing opens
 * the second step with the tool fixed. Secrets are write only: a saved one shows "saved" and blank means keep it.
 */
export function ConnectionDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; editing: AgentConnection | null; onSaved: (id: string, wasNew: boolean) => void;
}) {
  const [picked, setPicked] = useState<ConnectionPreset | null>(null);
  const preset = editing ? presetForConnection(editing) : picked;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPicked(null); onOpenChange(o); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="connection-dialog">
        {preset ? (
          <Setup key={`${editing?.id ?? 'new'}-${preset.id}`} preset={preset} editing={editing} onBack={editing ? undefined : () => setPicked(null)} onClose={() => { onOpenChange(false); setPicked(null); }} onSaved={onSaved} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a connection</DialogTitle>
              <DialogDescription>Which tool should the agent send things to? You only send data to it. Nothing is read back.</DialogDescription>
            </DialogHeader>
            <ToolPicker onPick={setPicked} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Setup({ preset, editing, onBack, onClose, onSaved }: {
  preset: ConnectionPreset; editing: AgentConnection | null; onBack?: () => void; onClose: () => void; onSaved: (id: string, wasNew: boolean) => void;
}) {
  const save = useSaveConnection();
  const test = useTestConnection();
  const isApi = preset.kind === 'api';
  const fields = preset.fields.filter((f) => !['method', 'header_name', 'query_param', 'body_template'].includes(f.field));
  const bodyField = preset.fields.find((f) => f.field === 'body_template');
  const [name, setName] = useState(editing?.name ?? '');
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(preset.fields.map((f) => [f.field, initialValue(f, editing)])));
  const [api, setApi] = useState<ApiForm>(() => apiFormFor(preset, editing));
  const [events, setEvents] = useState<string[]>(editing?.config.events ?? [...DEFAULT_EVENTS]);
  const [minSeverity, setMinSeverity] = useState<MinSeverity | typeof ANY>(editing?.config.min_severity ?? ANY);
  const [clearToken, setClearToken] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(editing?.id ?? null);
  const [justSaved, setJustSaved] = useState<Set<Part>>(new Set());
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasSaved = (part: Part) => justSaved.has(part) || savedSecret(editing, part);
  const tokenUsed = !isApi || api.auth !== 'none';
  const flagEvents = events.includes('flag_high') || events.includes('flag_all');
  const missing = preset.fields.some((f) => {
    if (!f.required) return false;
    if (f.field === 'body_template') return false;
    if (f.field === 'token' && !tokenUsed) return false;
    const filled = (values[f.field] ?? '').trim().length > 0;
    return !(filled || (f.secret && (f.field === 'url' || f.field === 'token') && hasSaved(f.field)));
  });
  const apiBad = isApi && (headerProblem(api.headers) !== null || (api.auth === 'header' && !api.headerName.trim()) || (api.auth === 'query' && !api.queryParam.trim()) || (api.method !== 'GET' && !api.body.trim()));
  const ready = name.trim().length > 0 && !missing && !apiBad;

  const body = (): SaveConnectionInput => {
    const v = (k: string) => (values[k] ?? '').trim() || undefined;
    const input: SaveConnectionInput = {
      id: savedId ?? undefined, kind: preset.kind, preset: preset.id, name: name.trim(),
      url: v('url'), token: tokenUsed ? v('token') : undefined, clear_token: clearToken || undefined, to: v('to'), chat_id: v('chat_id'),
      events, min_severity: flagEvents && minSeverity !== ANY ? minSeverity : undefined,
    };
    if (isApi) {
      input.method = api.method;
      input.auth_type = api.auth;
      if (api.auth === 'header') input.header_name = api.headerName.trim();
      if (api.auth === 'query') input.query_param = api.queryParam.trim();
      if (api.method !== 'GET') { input.content_type = api.contentType; input.body_template = api.body; }
      const extra = Object.fromEntries(api.headers.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.value]));
      if (Object.keys(extra).length > 0) input.extra_headers = extra;
    }
    return input;
  };

  const submit = () => {
    setError(null); setNote(null);
    const sent = body();
    save.mutate(sent, {
      onSuccess: (r) => {
        if (r.ok && (r.id ?? savedId)) {
          const id = (r.id ?? savedId) as string;
          const wasNew = !savedId;
          setSavedId(id);
          // Secrets are write only: whatever was typed is dropped and the field says "saved".
          setJustSaved((s) => { const n = new Set(s); if (sent.url && preset.fields.find((f) => f.field === 'url')?.secret) n.add('url'); if (sent.token) n.add('token'); return n; });
          setValues((p) => ({ ...p, token: '', ...(preset.fields.find((f) => f.field === 'url')?.secret ? { url: '' } : {}) }));
          setClearToken(false);
          setNote({ tone: 'good', text: 'Saved. Press Send test to check it works.' });
          onSaved(id, wasNew);
        } else setError(r.error ?? 'Could not save the connection.');
      },
      onError: (e) => setError(e.message),
    });
  };

  const sendTest = () => {
    if (!savedId) return;
    setNote(null);
    test.mutate(savedId, {
      onSuccess: (r) => setNote(r.ok ? { tone: 'good', text: 'Test message delivered.' } : { tone: 'bad', text: r.error ?? 'The test failed.' }),
      onError: (e) => setNote({ tone: 'bad', text: e.message }),
    });
  };

  const toggleEvent = (key: string, on: boolean) => setEvents((e) => (on ? [...new Set([...e, key])] : e.filter((x) => x !== key)));

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <ToolIcon preset={preset} />
          <div className="min-w-0">
            <DialogTitle>{editing ? `Edit ${editing.name}` : `Connect ${preset.name}`}</DialogTitle>
            <DialogDescription>{preset.tagline}. Addresses and tokens are stored encrypted and are never shown again.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-5">
        <section aria-label={`How to connect ${preset.name}`} className="rounded-xl border bg-muted/30 p-3.5" data-testid="setup-steps">
          <h3 className="mb-2 text-sm font-semibold">How to connect {preset.name}</h3>
          <ol className="space-y-2 text-sm">
            {preset.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary" aria-hidden="true">{i + 1}</span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <Field label="Name" htmlFor="conn-name" hint="How you will recognise it, for example Ops channel.">
          <Input id="conn-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>

        {fields.map((f) => {
          const part = f.field === 'url' || f.field === 'token' ? (f.field as Part) : null;
          const saved = !!f.secret && part !== null && hasSaved(part);
          const id = `conn-${f.field}`;
          const hint = saved ? 'Saved. Leave blank to keep it, or paste a new one.' : f.hint ?? (f.secret ? 'It works like a password, so it is kept encrypted.' : undefined);
          if (f.field === 'token' && !tokenUsed) return null;
          return (
            <Field key={f.field} label={isApi && f.field === 'token' ? tokenLabel(api, f.label) : f.label} htmlFor={id} hint={hint}>
              <Input
                id={id} type={f.secret ? 'password' : 'text'} autoComplete="off" value={values[f.field] ?? ''} required={f.required}
                onChange={(e) => setValues((p) => ({ ...p, [f.field]: e.target.value }))}
                placeholder={saved ? '•••••••• saved' : f.placeholder}
              />
              {f.field === 'token' && hasSaved('token') && (
                <label className="mt-1.5 flex items-center gap-2 text-sm"><Checkbox checked={clearToken} onCheckedChange={(c) => setClearToken(c === true)} /> Remove the saved {isApi ? 'token' : 'secret'}</label>
              )}
            </Field>
          );
        })}

        {isApi && <ApiOptions value={api} onChange={(patch) => setApi((a) => ({ ...a, ...patch }))} bodyHint={bodyField?.hint} />}

        {!isApi && preset.sample && (
          <div className="space-y-1" data-testid="sample">
            <p className="text-xs font-medium">What it receives</p>
            <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-2.5 font-mono text-xs">{preset.sample}</pre>
          </div>
        )}

        <section aria-label="What should it send automatically?" className="space-y-2.5 rounded-xl border p-3.5" data-testid="auto-events">
          <h3 className="text-sm font-semibold">What should it send automatically?</h3>
          <ul className="space-y-2">
            {AUTO_EVENTS.map((e) => (
              <li key={e.key}>
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={events.includes(e.key)} onCheckedChange={(c) => toggleEvent(e.key, c === true)} aria-label={e.label} />
                  <span><span className="font-medium">{e.label}</span><span className="block text-xs text-muted-foreground">{e.help}</span></span>
                </label>
              </li>
            ))}
          </ul>
          {flagEvents && (
            <Field label="Lowest severity to send" htmlFor="conn-min-sev" hint="Only for items. Summaries are always sent.">
              <Select value={minSeverity} onValueChange={(v) => setMinSeverity(v as MinSeverity | typeof ANY)}>
                <SelectTrigger id="conn-min-sev" className="sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>Any severity</SelectItem>{SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
        </section>

        {error && <p className="text-sm text-destructive" role="alert" data-testid="connection-error">{error}</p>}
        {note && <p className={note.tone === 'good' ? 'flex items-center gap-1.5 text-sm text-success' : 'text-sm text-destructive'} role={note.tone === 'good' ? 'status' : 'alert'} data-testid="connection-note">{note.tone === 'good' && <Check className="h-4 w-4" aria-hidden="true" />}{note.text}</p>}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        {onBack && !savedId && <Button variant="ghost" className="sm:mr-auto" onClick={onBack} data-testid="connection-back"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Choose another tool</Button>}
        <Button variant="ghost" onClick={onClose}>{savedId ? 'Done' : 'Cancel'}</Button>
        <Button variant="outline" onClick={sendTest} disabled={!savedId || test.isPending} title={savedId ? 'Sends a test message using the saved settings' : 'Save first, then send a test'} data-testid="connection-send-test">
          {test.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send test
        </Button>
        <Button onClick={submit} disabled={!ready || save.isPending} data-testid="connection-save">
          {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} {savedId ? 'Save changes' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}

function tokenLabel(api: ApiForm, fallback: string): string {
  return api.auth === 'basic' ? 'Username:password' : api.auth === 'query' ? 'Token (added to the address)' : fallback;
}
