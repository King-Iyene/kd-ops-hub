import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MAX_IMAGE_BYTES, MAX_MESSAGE, splitLinks } from './social';

export interface Msg { id: string; withId: string; mine: boolean; text?: string; imgUrl?: string; at: number }

/** A small chat with one colleague: text, clickable links and pictures. Messages live for this visit only. */
export function MessageDialog({ person, online, messages, onClose, onSend }: {
  person: { id: string; name: string } | null;
  online: boolean;
  messages: Msg[];
  onClose: () => void;
  onSend: (text: string, file: File | null) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const thread = messages.filter((m) => m.withId === person?.id);

  useEffect(() => { setText(''); setFile(null); setErr(null); }, [person?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length, person?.id]);

  const pick = (f: File | null) => {
    setErr(null);
    if (f && (!/^image\/(png|jpe?g|gif|webp)$/.test(f.type) || f.size > MAX_IMAGE_BYTES)) { setErr('Pictures must be PNG, JPG, GIF or WebP, up to 5 MB.'); return; }
    setFile(f);
  };
  const send = async () => {
    if (busy || (!text.trim() && !file)) return;
    setBusy(true);
    setErr(null);
    try {
      await onSend(text, file);
      setText('');
      setFile(null);
    } catch (e) {
      setErr((e as Error)?.message || 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!person} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{person?.name}{!online && <span className="ml-2 text-xs font-normal text-muted-foreground">offline, will not receive</span>}</DialogTitle></DialogHeader>
        <div className="h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
          {thread.length === 0 && <p className="p-2 text-xs text-muted-foreground">No messages yet. Only people who are online can receive them.</p>}
          {thread.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] space-y-1 rounded-lg px-2.5 py-1.5 text-sm ${m.mine ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
                {m.imgUrl && <a href={m.imgUrl} target="_blank" rel="noopener noreferrer"><img src={m.imgUrl} alt="Shared" className="max-h-40 rounded" /></a>}
                {m.text && (
                  <p className="whitespace-pre-wrap break-words">
                    {splitLinks(m.text).map((p, i) => p.href
                      ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="underline">{p.text}</a>
                      : <span key={i}>{p.text}</span>)}
                  </p>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {file && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ImagePlus className="h-4 w-4" /><span className="truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove picture"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE))} rows={2} placeholder="Write a message or paste a link…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            className="min-h-[3rem] flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <label className="cursor-pointer rounded-md border border-input p-2 hover:bg-muted" title="Attach a picture">
            <ImagePlus className="h-4 w-4" />
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </label>
          <Button size="sm" onClick={() => void send()} disabled={busy || !online || (!text.trim() && !file)} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
