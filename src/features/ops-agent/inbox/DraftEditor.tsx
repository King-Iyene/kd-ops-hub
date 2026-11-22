import { useRef, useState, type KeyboardEvent } from 'react';
import { Check, Copy, Loader2, Mail, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { useAgentConnections } from '@/queries/useOpsAgent';
import { useSendFlagMessage } from '@/queries/useOpsAgentV4';
import { CONNECTION_KINDS } from '../agentDb';
import { PersonAvatar } from '../PersonAvatar';
import { supportsMentions } from '../connectionTemplate';
import type { DetailDraft, DetailPerson } from '../detailTypes';

type DraftTab = 'email' | 'channel';
const TABS: { id: DraftTab; label: string }[] = [{ id: 'email', label: 'Email' }, { id: 'channel', label: 'Channel message' }];

const firstName = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'them';

/**
 * The drafted message, fully editable. Nothing is ever sent by itself: Send email and Send to channel each ask first.
 * The request names the item and the channel only; the server decides the real recipient, so no address is sent from here.
 * A message that goes out marks the item handled, unless "Mark as handled after sending" is unticked (then the request says `close: false`).
 * There are two texts: the Email (the person's manager is copied) and the Channel message (the manager is tagged at the bottom). Each keeps its own edits.
 */
export function DraftEditor({ flagId, draft, recipientPhoto, aboutName = null, manager = null, onClosed }: {
  flagId: string; draft: DetailDraft; recipientPhoto: string | null;
  /** The person the item is about, and their manager (when they have one). Used for the "CC" choice on Cliq and Slack. */
  aboutName?: string | null; manager?: DetailPerson['manager'] | null; onClosed: () => void;
}) {
  const { toast } = useToast();
  const connections = useAgentConnections();
  const send = useSendFlagMessage();
  // What the person typed. null means "the suggestion", so a refreshed suggestion shows through until they edit it.
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [bodyEdit, setBodyEdit] = useState<string | null>(null);
  const [channelEdit, setChannelEdit] = useState<string | null>(null);
  const [tab, setTab] = useState<DraftTab>('email');
  const tabRefs = useRef<Partial<Record<DraftTab, HTMLButtonElement | null>>>({});
  // What the person chose for "CC the manager" on the email. Defaults to ticked.
  const [emailCc, setEmailCc] = useState(true);
  const [connectionId, setConnectionId] = useState('');
  const [closeAfter, setCloseAfter] = useState(true);
  // What the person chose for "CC the manager", remembered with the connection it was chosen for. Until they choose, the connection's own setting decides.
  const [ccChoice, setCcChoice] = useState<{ id: string; value: boolean } | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const subject = subjectEdit ?? draft.subject;
  const emailBody = bodyEdit ?? draft.body;
  const channelSuggested = draft.channel_body?.trim() ? draft.channel_body : draft.body;
  const channelBody = channelEdit ?? channelSuggested;
  const onEmail = tab === 'email';
  const body = onEmail ? emailBody : channelBody;
  const edited = onEmail ? subjectEdit !== null || bodyEdit !== null : channelEdit !== null;
  const who = draft.recipient_name ?? 'the recipient';
  const toLabel = draft.to === 'manager' ? 'to their manager' : 'to the person';
  const canSendEmail = subject.trim().length > 0 && emailBody.trim().length > 0 && !send.isPending;
  const canSendChannel = subject.trim().length > 0 && channelBody.trim().length > 0 && !send.isPending;
  const usable = (connections.data ?? []).filter((c) => c.status !== 'error');
  // The checkbox only makes sense for a Cliq or Slack connection, when the person has a manager and the message is not already for them.
  const picked = usable.find((c) => c.id === connectionId);
  const managerName = manager?.full_name?.trim() || null;
  // The manager as the draft names them wins; the person's manager is the fallback for the channel wording.
  const draftManager = draft.to !== 'manager' ? draft.manager ?? null : null;
  const draftManagerName = draftManager?.name?.trim() || managerName;
  // The email CC box needs a manager with an email address; the address itself is never sent, only the choice.
  const canEmailCc = !!draftManager?.email;
  const hasManager = draft.to !== 'manager' && (!!draftManager || !!manager);
  const canCc = !!picked && supportsMentions(picked.kind) && !!manager && draft.to !== 'manager' && draft.recipient_id !== manager.id;
  const cc = ccChoice?.id === connectionId ? ccChoice.value : picked?.config.cc_manager !== false;
  const tagsPerson = picked?.config.mention_people !== false;

  const reset = () => { if (onEmail) { setSubjectEdit(null); setBodyEdit(null); } else setChannelEdit(null); setProblem(null); };
  const changeText = (v: string) => (onEmail ? setBodyEdit(v) : setChannelEdit(v));
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast({ title: 'Could not copy', description: 'Select the text and copy it by hand.', variant: 'destructive' }); }
  };

  const run = async (channel: 'email' | 'connection') => {
    const conn = channel === 'connection' ? usable.find((c) => c.id === connectionId) : undefined;
    if (channel === 'connection' && !conn) return;
    const handledNote = closeAfter ? ' The item will be marked handled.' : '';
    const copying = channel === 'email' && canEmailCc && emailCc;
    const ok = await confirm(channel === 'email'
      ? { title: `Send this to ${firstName(draft.recipient_name)} by email${copying ? `, copying ${draftManagerName ?? 'their manager'}` : ''}?${handledNote}`, description: `The message is sent exactly as written here. It will not be sent until you confirm.`, confirmLabel: 'Send email' }
      : { title: `Send this to ${conn!.name}?${handledNote}`, description: `The message is posted to the saved connection "${conn!.name}" exactly as written here. The person is not emailed.`, confirmLabel: 'Send to channel' });
    if (!ok) return;
    setProblem(null);
    send.mutate(
      { flag_id: flagId, channel, ...(conn ? { connection_id: conn.id } : {}), ...(conn && canCc ? { cc_manager: cc } : {}), ...(channel === 'email' && canEmailCc ? { cc_manager: emailCc } : {}), subject: subject.trim(), text: (channel === 'email' ? emailBody : channelBody).trim(), ...(closeAfter ? {} : { close: false }) },
      {
        onSuccess: (r) => {
          if (r?.ok) {
            const to = channel === 'email' ? firstName(draft.recipient_name) : conn!.name;
            const note = !closeAfter ? 'Sent. Kept open.' : r.closed ? `Sent to ${to}. Marked handled.` : `Sent to ${to}. It could not be marked handled, so it is still open.`;
            setSentNote(note);
            toast({ title: note });
            if (closeAfter && r.closed) onClosed(); // the item is closed: the Sheet closes with it
          } else { setProblem(r?.error ?? 'The message was not sent.'); toast({ title: 'Message not sent', description: r?.error ?? 'The message was not sent.', variant: 'destructive' }); }
        },
        onError: (e) => { setProblem(`Sending is not available right now: ${e.message}`); toast({ title: 'Message not sent', description: e.message, variant: 'destructive' }); },
      },
    );
  };

  return (
    <section aria-label="Drafted message" className="space-y-3" data-testid="draft-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border bg-background/60 py-1 pl-1 pr-3 text-xs" data-testid="recipient-chip">
          <PersonAvatar name={draft.recipient_name} photoUrl={recipientPhoto} size="sm" />
          <span className="font-medium">{who}</span>
          <span className="text-muted-foreground">{toLabel}</span>
        </span>
        <p className="text-2xs text-muted-foreground">Edit anything. Nothing is sent until you press Send.</p>
      </div>

      {draft.warning && draft.warning.level !== 'none' && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" data-testid="draft-warning">
          {draft.warning.level === 'call'
            ? `This has come up again after a warning. This message tells them ${draft.warning.manager ?? 'their manager'} will have a call with them, and a "Call needed" item is raised for the manager.`
            : `This is a repeat. This message warns that ${draft.warning.manager ?? 'their manager'} will have a call with them if it happens again. Sending it is remembered, so the next time raises a "Call needed" item.`}
        </p>
      )}

      <div role="tablist" aria-label="Which message to edit" className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto" data-testid="draft-tabs">
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" id={`draft-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="draft-panel" tabIndex={tab === t.id ? 0 : -1}
            ref={(el) => { tabRefs.current[t.id] = el; }} onClick={() => setTab(t.id)} onKeyDown={onTabKey} data-testid={`draft-tab-${t.id}`}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >{t.label}</button>
        ))}
      </div>

      <div role="tabpanel" id="draft-panel" aria-labelledby={`draft-tab-${tab}`} className="space-y-3" data-testid={`draft-panel-${tab}`}>
        <div className="space-y-1.5">
          <Label htmlFor="draft-subject">{onEmail ? 'Subject' : 'Title (same as the email subject)'}</Label>
          <Input id="draft-subject" value={subject} maxLength={200} onChange={(e) => setSubjectEdit(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="draft-body">Message</Label>
          <Textarea id="draft-body" rows={11} value={body} onChange={(e) => changeText(e.target.value)} className="text-sm leading-relaxed" />
        </div>
        {onEmail && draft.to !== 'manager' && canEmailCc && (
          <div className="space-y-1" data-testid="email-cc-manager">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={emailCc} onCheckedChange={(c) => setEmailCc(c === true)} data-testid="email-cc-manager-box" /> CC {draftManagerName ?? 'their manager'} (their manager)
            </label>
            <p className="text-xs text-muted-foreground" data-testid="email-cc-note">{emailCc ? 'Their manager is copied on the email.' : 'Not copied.'}</p>
          </div>
        )}
        {!onEmail && hasManager && <p className="text-xs text-muted-foreground" data-testid="channel-tag-note">Their manager is tagged at the bottom to follow up.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={reset} disabled={!edited}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to suggested</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the message'}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-success" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" size="sm" className="ml-auto h-8" onClick={() => run('email')} disabled={!canSendEmail} data-testid="send-email">
          {send.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />} Send email
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
        <Select value={connectionId} onValueChange={(v) => { setConnectionId(v); if (v) setTab('channel'); }} disabled={usable.length === 0}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-xs sm:max-w-[16rem]" aria-label="Channel to send to" data-testid="channel-select">
            <SelectValue placeholder={usable.length === 0 ? 'No saved connections' : 'Pick a channel'} />
          </SelectTrigger>
          <SelectContent>
            {usable.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {CONNECTION_KINDS.find((k) => k.kind === c.kind)?.label ?? c.kind}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => run('connection')} disabled={!canSendChannel || !connectionId} data-testid="send-channel">
          <Send className="mr-1.5 h-3.5 w-3.5" /> Send to channel
        </Button>
        {usable.length === 0 && !connections.isLoading && <p className="w-full text-2xs text-muted-foreground">Add a Slack, Cliq, email, webhook or n8n connection in Connections to post there.</p>}
      </div>

      {canCc && (
        <div className="space-y-1" data-testid="cc-manager">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={cc} onCheckedChange={(c) => setCcChoice({ id: connectionId, value: c === true })} aria-label={`CC ${managerName ?? 'their manager'}`} data-testid="cc-manager-box" /> CC {managerName ?? 'their manager'}
          </label>
          <p className="text-xs text-muted-foreground" data-testid="cc-manager-note">{tagNote(tagsPerson, aboutName, cc, managerName)}</p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={closeAfter} onCheckedChange={(c) => setCloseAfter(c === true)} data-testid="close-after" /> Mark as handled after sending
      </label>
      <p className="text-xs text-muted-foreground">The message names the exact item and includes a link to it.</p>

      {problem && <p className="text-sm text-destructive" role="alert" data-testid="send-problem">{problem}</p>}
      {sentNote && <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-2.5 text-sm" role="status" data-testid="sent-note"><Check className="h-4 w-4 text-success" aria-hidden="true" />{sentNote}</p>}
    </section>
  );
}

/** Who will be tagged in the channel, in plain words and without pronouns. */
function tagNote(tagsPerson: boolean, aboutName: string | null, cc: boolean, managerName: string | null): string {
  const person = aboutName?.trim() ? firstName(aboutName) : 'the person';
  const manager = managerName ? `their manager ${firstName(managerName)}` : 'their manager';
  if (tagsPerson && cc) return `Tags ${person} and CCs ${manager} in the channel.`;
  if (tagsPerson) return `Tags ${person} in the channel. Their manager is not tagged.`;
  if (cc) return `CCs ${manager} in the channel.`;
  return 'Nobody is tagged in the channel.';
}
