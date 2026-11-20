import { useState } from 'react';
import { ArrowLeft, AtSign, Check, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgentConnections, useSaveConnection, useTestConnection, useZohoOAuthStart, useZohoOAuthUrls } from '@/queries/useOpsAgent';
import type { AgentConnection, MinSeverity, SaveConnectionInput } from '../agentDb';
import { AUTO_EVENTS, CLIQ_ADVANCED_FIELDS, CLIQ_CHANNEL_PATTERN, DEFAULT_CLIQ_DC, DEFAULT_EVENTS, type ConnectionPreset, type PresetField } from '../connectionPresets';
import { MENTION_DEFAULTS, MENTION_MAX, mentionTemplateProblem, supportsMentions } from '../connectionTemplate';
import { goToZoho, isZohoAuthorized } from '../zohoOAuth';
import { Field } from '../settings/shared';
import { useAgentToast } from '../settings/useAgentToast';
import { ApiOptions, headerProblem, type ApiForm } from './ApiOptions';
import { ToolIcon, presetForConnection } from './ToolIcon';
import { ToolPicker } from './ToolPicker';
import { ConnectToZoho, PasteIntoZoho, ZohoChecklist } from './ZohoSetupPanels';

const SEVERITIES: { value: MinSeverity; label: string }[] = [
  { value: 'low', label: 'Low and above' }, { value: 'medium', label: 'Medium and above' }, { value: 'high', label: 'High and above' }, { value: 'critical', label: 'Critical only' },
];
const ANY = 'any';

/** The secrets a connection can hold, and how the server names them in vault_secret_names. */
type Part = 'url' | 'token' | 'client_secret' | 'refresh_token';
const PART_SUFFIX: Record<Part, string> = { url: '_url', token: '_token', client_secret: '_secret', refresh_token: '_refresh' };
const isPart = (f: string): f is Part => f in PART_SUFFIX;
const savedSecret = (c: AgentConnection | null, part: Part) => !!c && c.vault_secret_names.some((n) => n.endsWith(PART_SUFFIX[part]));

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
  if (f.field === 'dc' && !c) return DEFAULT_CLIQ_DC;
  if (!c) return '';
  if (f.secret) return '';
  if (f.field === 'dc') return c.config.dc ?? DEFAULT_CLIQ_DC;
  if (f.field === 'client_id') return c.config.client_id ?? '';
  if (f.field === 'channel') return c.config.channel ?? '';
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
      <DialogContent
        // The base dialog caps its width at md:max-w-lg, so the wider size has to be given at the same breakpoint. Children may shrink
        // (min-w-0) so a long address or help line wraps instead of pushing the form off the right edge.
        className={cn('max-h-[92vh] overflow-y-auto overflow-x-hidden md:w-[min(92vw,56rem)] [&>*]:min-w-0', preset ? 'md:max-w-4xl' : 'md:max-w-3xl')}
        data-testid="connection-dialog"
      >
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
  const oauthStart = useZohoOAuthStart();
  const zoho = useZohoOAuthUrls();
  const connections = useAgentConnections(!!editing || preset.mode === 'api');
  const toast = useAgentToast();
  const tags = supportsMentions(preset.kind);
  const defaultFormat = MENTION_DEFAULTS[preset.kind] ?? '';
  const savedFormat = editing?.config.mention_template ?? '';
  const isCliqApi = preset.mode === 'api';
  const [mentionPeople, setMentionPeople] = useState(editing?.config.mention_people ?? true);
  // Cliq can also tag the manager of the person an item is about. On unless it was turned off.
  const savedCc = editing?.config.cc_manager;
  const [ccManager, setCcManager] = useState(savedCc ?? true);
  const [format, setFormat] = useState(savedFormat || defaultFormat);
  const isApi = preset.kind === 'api';
  const fields = preset.fields.filter((f) => !['method', 'header_name', 'query_param', 'body_template'].includes(f.field));
  const bodyField = preset.fields.find((f) => f.field === 'body_template');
  // A new Zoho Cliq API connection starts with a sensible name so the four Zoho fields are all that is needed.
  const [name, setName] = useState(editing?.name ?? (isCliqApi ? 'Zoho Cliq' : ''));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(preset.fields.map((f) => [f.field, initialValue(f, editing)])));
  const [api, setApi] = useState<ApiForm>(() => apiFormFor(preset, editing));
  const [events, setEvents] = useState<string[]>(editing?.config.events ?? [...DEFAULT_EVENTS]);
  const [minSeverity, setMinSeverity] = useState<MinSeverity | typeof ANY>(editing?.config.min_severity ?? ANY);
  const [clearToken, setClearToken] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(editing?.id ?? null);
  const [justSaved, setJustSaved] = useState<Set<Part>>(new Set());
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testedOk, setTestedOk] = useState(false);

  // The connection as the server last reported it, so the status lines follow a save or a return from Zoho.
  const current = (savedId ? connections.data?.find((c) => c.id === savedId) : null) ?? editing;
  const hasSaved = (part: Part) => justSaved.has(part) || savedSecret(current, part);
  const tokenUsed = !isApi || api.auth !== 'none';
  const flagEvents = events.includes('flag_high') || events.includes('flag_all');
  const missing = preset.fields.some((f) => {
    if (!f.required) return false;
    if (f.field === 'body_template') return false;
    if (f.field === 'token' && !tokenUsed) return false;
    const filled = (values[f.field] ?? '').trim().length > 0;
    return !(filled || (f.secret && isPart(f.field) && hasSaved(f.field)));
  });
  // Cliq API: the channel name must be the lowercase unique name, and there must be some way to get a refresh token (a grant code or a
  // refresh token pasted now, or one already saved).
  const channelText = (values.channel ?? '').trim();
  const channelBad = isCliqApi && channelText !== '' && !CLIQ_CHANNEL_PATTERN.test(channelText);
  const formatBad = tags ? mentionTemplateProblem(format) : null;
  const apiBad = !!formatBad || channelBad || (isApi && (headerProblem(api.headers) !== null || (api.auth === 'header' && !api.headerName.trim()) || (api.auth === 'query' && !api.queryParam.trim()) || (api.method !== 'GET' && !api.body.trim())));
  const ready = name.trim().length > 0 && !missing && !apiBad;

  // Unsaved edits: the form compared with what was last saved. Typed secrets count as an edit too (`typed`), and are cleared on save.
  const signature = (typed: boolean, clear = clearToken) => JSON.stringify({
    name, typed, clearToken: clear, events, minSeverity, mentionPeople, ccManager, format, api,
    plain: preset.fields.filter((f) => !f.secret).map((f) => values[f.field] ?? ''),
  });
  const typedSecret = preset.fields.some((f) => f.secret && (values[f.field] ?? '').trim() !== '');
  const [savedSignature, setSavedSignature] = useState(() => signature(false));
  const dirty = signature(typedSecret) !== savedSignature;

  const body = (): SaveConnectionInput => {
    const v = (k: string) => (values[k] ?? '').trim() || undefined;
    const input: SaveConnectionInput = {
      id: savedId ?? undefined, kind: preset.kind, preset: preset.id, name: name.trim(),
      url: v('url'), token: tokenUsed ? v('token') : undefined, clear_token: clearToken || undefined, to: v('to'), chat_id: v('chat_id'),
      events, min_severity: flagEvents && minSeverity !== ANY ? minSeverity : undefined,
    };
    if (tags) {
      input.mention_people = mentionPeople;
      // A format equal to the default (or empty) is left out so the server keeps using its default. If a custom one was saved before,
      // an empty string tells the server to drop it.
      const f = format.trim();
      if (f !== '' && f !== defaultFormat) input.mention_template = f;
      else if (savedFormat) input.mention_template = '';
    }
    if (isCliqApi) {
      input.mode = 'api';
      input.dc = (values.dc ?? '').trim() || DEFAULT_CLIQ_DC;
      input.client_id = v('client_id');
      input.channel = channelText;
      // Secrets go out on the save call only, and only when something was typed: blank means "keep what is saved".
      input.client_secret = v('client_secret');
      // Left out entirely (not just undefined) unless typed under "Other ways to connect": the normal way is Connect to Zoho.
      if (v('grant_code')) input.grant_code = v('grant_code');
      if (v('refresh_token')) input.refresh_token = v('refresh_token');
      input.cc_manager = ccManager;
    } else if (preset.kind === 'cliq' && ccManager !== (savedCc ?? true)) input.cc_manager = ccManager;
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
    const savedAs = signature(false, false); // what the form will hold once the typed secrets are cleared
    save.mutate(sent, {
      onSuccess: (r) => {
        if (r.ok && (r.id ?? savedId)) {
          const id = (r.id ?? savedId) as string;
          const wasNew = !savedId;
          setSavedId(id);
          // Secrets are write only: whatever was typed is dropped and the field says "saved".
          setJustSaved((s) => {
            const n = new Set(s);
            if (sent.url && preset.fields.find((f) => f.field === 'url')?.secret) n.add('url');
            if (sent.token) n.add('token');
            if (sent.client_secret) n.add('client_secret');
            if (sent.refresh_token || sent.grant_code) n.add('refresh_token'); // a grant code is swapped for a refresh token on the server
            return n;
          });
          setValues((p) => ({ ...p, token: '', ...Object.fromEntries(preset.fields.filter((f) => f.secret).map((f) => [f.field, ''])) }));
          setClearToken(false);
          setSavedSignature(savedAs);
          const signedIn = isZohoAuthorized(current) || !!sent.refresh_token || !!sent.grant_code;
          setNote({ tone: 'good', text: isCliqApi && !signedIn ? 'Saved. Now press Connect to Zoho.' : 'Saved. Press Send test to check it works.' });
          onSaved(id, wasNew);
        } else setError(r.error ?? 'Could not save the connection.');
      },
      onError: (e) => setError(e.message),
    });
  };

  const sendTest = (tagMe = false) => {
    if (!savedId) return;
    setNote(null);
    const okText = tagMe ? 'Test sent. If your name is highlighted in the channel, tagging works.' : 'Test message delivered.';
    test.mutate(tagMe ? { id: savedId, tag_me: true } : savedId, {
      onSuccess: (r) => { if (r.ok) { setTestedOk(true); setNote({ tone: 'good', text: okText }); if (tagMe) toast.saved(okText); } else setNote({ tone: 'bad', text: r.error ?? 'The test failed.' }); },
      onError: (e) => setNote({ tone: 'bad', text: e.message }),
    });
  };

  const connectToZoho = () => {
    if (!savedId) return;
    setError(null); setNote(null);
    oauthStart.mutate({ id: savedId, redirect_uri: zoho.redirectUri }, {
      onSuccess: (r) => { if (r.ok && r.url) goToZoho(r.url); else setError(r.error ?? 'Could not start the Zoho sign-in. Check the Client ID and try again.'); },
      onError: (e) => setError(e.message),
    });
  };
  const authorized = isCliqApi && (isZohoAuthorized(current) || justSaved.has('refresh_token'));
  const zohoStatus = {
    clientSaved: hasSaved('client_secret') && ((values.client_id ?? '').trim() !== '' || !!current?.config.client_id),
    authorized,
    channelSet: channelText !== '' && !channelBad,
    tested: current ? (testedOk || (current.status === 'connected' && !!current.last_tested_at)) : testedOk,
  };

  const toggleEvent = (key: string, on: boolean) => setEvents((e) => (on ? [...new Set([...e, key])] : e.filter((x) => x !== key)));

  const renderField = (f: PresetField) => {
    const part = isPart(f.field) ? f.field : null;
    const saved = !!f.secret && part !== null && hasSaved(part);
    const id = `conn-${f.field}`;
    let hint = saved ? 'Saved. Leave blank to keep it, or paste a new one.' : f.hint ?? (f.secret ? 'It works like a password, so it is kept encrypted.' : undefined);
    if (f.field === 'grant_code' && hasSaved('refresh_token')) hint = 'Not needed now. Only paste a new code here to connect again, for example if the connection stops working.';
    if (f.field === 'token' && !tokenUsed) return null;
    if (f.options) {
      return (
        <Field key={f.field} label={f.label} htmlFor={id} hint={hint}>
          <Select value={values[f.field] || f.options[0].value} onValueChange={(v) => setValues((p) => ({ ...p, [f.field]: v }))}>
            <SelectTrigger id={id} className="sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>{f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      );
    }
    return (
      <Field key={f.field} label={isApi && f.field === 'token' ? tokenLabel(api, f.label) : f.label} htmlFor={id} hint={hint}>
        <Input
          id={id} type={f.secret ? 'password' : 'text'} autoComplete="off" value={values[f.field] ?? ''} required={f.required}
          aria-invalid={f.field === 'channel' && channelBad ? true : undefined}
          onChange={(e) => setValues((p) => ({ ...p, [f.field]: e.target.value }))}
          placeholder={saved ? '•••••••• saved' : f.placeholder}
        />
        {f.field === 'channel' && channelBad && <p className="mt-1 text-xs text-destructive" role="alert" data-testid="channel-error">Use the channel's unique name: lowercase letters, numbers and underscores only, no spaces.</p>}
        {f.field === 'token' && hasSaved('token') && (
          <label className="mt-1.5 flex items-center gap-2 text-sm"><Checkbox checked={clearToken} onCheckedChange={(c) => setClearToken(c === true)} /> Remove the saved {isApi ? 'token' : 'secret'}</label>
        )}
      </Field>
    );
  };

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
        {isCliqApi && <PasteIntoZoho homepageUrl={zoho.homepageUrl} redirectUri={zoho.redirectUri} loading={!zoho.ready} />}

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

        {fields.filter((f) => !(isCliqApi && CLIQ_ADVANCED_FIELDS.includes(f.field))).map(renderField)}

        {isCliqApi && (
          <>
            {savedId && <ZohoChecklist status={zohoStatus} />}
            <ConnectToZoho saved={!!savedId} dirty={dirty} authorized={authorized} busy={oauthStart.isPending || !zoho.ready} onConnect={connectToZoho} />
            <details className="rounded-xl border p-3.5 text-sm" data-testid="cliq-advanced">
              <summary className="cursor-pointer text-sm font-medium">Other ways to connect (advanced)</summary>
              <div className="mt-3 space-y-4">
                <p className="text-xs text-muted-foreground">Not needed if you use Connect to Zoho. Use these only if you set up a Self Client in Zoho, or already have a refresh token.</p>
                {fields.filter((f) => CLIQ_ADVANCED_FIELDS.includes(f.field)).map(renderField)}
              </div>
            </details>
          </>
        )}

        {isApi && <ApiOptions value={api} onChange={(patch) => setApi((a) => ({ ...a, ...patch }))} bodyHint={bodyField?.hint} />}

        {!isApi && preset.sample && (
          <div className="space-y-1" data-testid="sample">
            <p className="text-xs font-medium">What it receives</p>
            <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-2.5 font-mono text-xs">{preset.sample}</pre>
          </div>
        )}

        {tags && (
          <section aria-label="Tagging" className="space-y-2.5 rounded-xl border p-3.5" data-testid="tag-people">
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox className="mt-0.5" checked={mentionPeople} onCheckedChange={(c) => setMentionPeople(c === true)} aria-label="Tag the person in each message" />
              <span><span className="font-medium">Tag the person in each message</span><span className="block text-xs text-muted-foreground">So they get notified in {preset.name}. People are matched in Settings, People.</span></span>
            </label>
            {preset.kind === 'cliq' && (
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox className="mt-0.5" checked={ccManager} onCheckedChange={(c) => setCcManager(c === true)} aria-label="CC the person's manager" />
                <span><span className="font-medium">CC the person's manager</span><span className="block text-xs text-muted-foreground">Also tags the person's manager in the same message, so the right people see it.</span></span>
              </label>
            )}
            <details className="text-sm" data-testid="tag-advanced">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Advanced</summary>
              <div className="mt-2">
                <Field label="Tag format" htmlFor="conn-tag-format" hint="%s is replaced by the person's Cliq user id, or their email if no id is saved. If tags show up as plain text in Cliq, change this and send a test.">
                  <Input id="conn-tag-format" value={format} maxLength={MENTION_MAX + 20} aria-invalid={!!formatBad} className="font-mono text-xs sm:w-64" onChange={(e) => setFormat(e.target.value)} />
                </Field>
                {formatBad && <p className="mt-1 text-xs text-destructive" role="alert" data-testid="tag-format-error">{formatBad}</p>}
              </div>
            </details>
          </section>
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

      <DialogFooter className="flex-wrap gap-2 sm:gap-2">
        {onBack && !savedId && <Button variant="ghost" className="sm:mr-auto" onClick={onBack} data-testid="connection-back"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Choose another tool</Button>}
        <Button variant="ghost" onClick={onClose}>{savedId ? 'Done' : 'Cancel'}</Button>
        <Button variant="outline" onClick={() => sendTest(false)} disabled={!savedId || test.isPending} title={savedId ? 'Sends a test message using the saved settings' : 'Save first, then send a test'} data-testid="connection-send-test">
          {test.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send test
        </Button>
        {tags && (
          <Button variant="outline" onClick={() => sendTest(true)} disabled={!savedId || test.isPending} title={savedId ? 'Sends a test message that tags you' : 'Save first, then send a test'} data-testid="connection-send-test-tag">
            <AtSign className="mr-1.5 h-3.5 w-3.5" /> Send test and tag me
          </Button>
        )}
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
