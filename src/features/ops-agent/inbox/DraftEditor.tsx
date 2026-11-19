import { useState } from 'react';
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
import type { DetailDraft } from '../detailTypes';

const firstName = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'them';

/**
 * The drafted message, fully editable. Nothing is ever sent by itself: Send email and Send to channel each ask first.
 * The request names the item and the channel only; the server decides the real recipient, so no address is sent from here.
 * A message that goes out marks the item handled, unless "Mark as handled after sending" is unticked (then the request says `close: false`).
 */
export function DraftEditor({ flagId, draft, recipientPhoto, onClosed }: {
  flagId: string; draft: DetailDraft; recipientPhoto: string | null; onClosed: () => void;
}) {
  const { toast } = useToast();
  const connections = useAgentConnections();
  const send = useSendFlagMessage();
  // What the person typed. null means "the suggestion", so a refreshed suggestion shows through until they edit it.
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [bodyEdit, setBodyEdit] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState('');
  const [closeAfter, setCloseAfter] = useState(true);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const subject = subjectEdit ?? draft.subject;
  const body = bodyEdit ?? draft.body;
  const edited = subjectEdit !== null || bodyEdit !== null;
  const who = draft.recipient_name ?? 'the recipient';
  const toLabel = draft.to === 'manager' ? 'to their manager' : 'to the person';
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !send.isPending;
  const usable = (connections.data ?? []).filter((c) => c.status !== 'error');

  const reset = () => { setSubjectEdit(null); setBodyEdit(null); setProblem(null); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast({ title: 'Could not copy', description: 'Select the text and copy it by hand.', variant: 'destructive' }); }
  };

  const run = async (channel: 'email' | 'connection') => {
    const conn = channel === 'connection' ? usable.find((c) => c.id === connectionId) : undefined;
    if (channel === 'connection' && !conn) return;
    const handledNote = closeAfter ? ' The item will be marked handled.' : '';
    const ok = await confirm(channel === 'email'
      ? { title: `Send this to ${firstName(draft.recipient_name)} by email?${handledNote}`, description: `The message is sent exactly as written here. It will not be sent until you confirm.`, confirmLabel: 'Send email' }
      : { title: `Send this to ${conn!.name}?${handledNote}`, description: `The message is posted to the saved connection "${conn!.name}" exactly as written here. The person is not emailed.`, confirmLabel: 'Send to channel' });
    if (!ok) return;
    setProblem(null);
    send.mutate(
      { flag_id: flagId, channel, ...(conn ? { connection_id: conn.id } : {}), subject: subject.trim(), text: body.trim(), ...(closeAfter ? {} : { close: false }) },
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

      <div className="space-y-1.5">
        <Label htmlFor="draft-subject">Subject</Label>
        <Input id="draft-subject" value={subject} maxLength={200} onChange={(e) => setSubjectEdit(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="draft-body">Message</Label>
        <Textarea id="draft-body" rows={11} value={body} onChange={(e) => setBodyEdit(e.target.value)} className="text-sm leading-relaxed" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={reset} disabled={!edited}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to suggested</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the message'}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-success" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" size="sm" className="ml-auto h-8" onClick={() => run('email')} disabled={!canSend} data-testid="send-email">
          {send.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />} Send email
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
        <Select value={connectionId} onValueChange={setConnectionId} disabled={usable.length === 0}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-xs sm:max-w-[16rem]" aria-label="Channel to send to" data-testid="channel-select">
            <SelectValue placeholder={usable.length === 0 ? 'No saved connections' : 'Pick a channel'} />
          </SelectTrigger>
          <SelectContent>
            {usable.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {CONNECTION_KINDS.find((k) => k.kind === c.kind)?.label ?? c.kind}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => run('connection')} disabled={!canSend || !connectionId} data-testid="send-channel">
          <Send className="mr-1.5 h-3.5 w-3.5" /> Send to channel
        </Button>
        {usable.length === 0 && !connections.isLoading && <p className="w-full text-2xs text-muted-foreground">Add a Slack, Cliq, email, webhook or n8n connection in Connections to post there.</p>}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={closeAfter} onCheckedChange={(c) => setCloseAfter(c === true)} data-testid="close-after" /> Mark as handled after sending
      </label>
      <p className="text-xs text-muted-foreground">The message names the exact item and includes a link to it.</p>

      {problem && <p className="text-sm text-destructive" role="alert" data-testid="send-problem">{problem}</p>}
      {sentNote && <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-2.5 text-sm" role="status" data-testid="sent-note"><Check className="h-4 w-4 text-success" aria-hidden="true" />{sentNote}</p>}
    </section>
  );
}
