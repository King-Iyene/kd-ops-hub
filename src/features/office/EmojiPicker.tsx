import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { EMOJI_GROUPS, searchEmoji, topUsed, toggleQuick } from './emoji';

/**
 * The full emoji picker: search, your most used, and every category. "Customize emote bar" lets you choose the four that
 * sit on your bar (click an emoji to put it there; it replaces the oldest one).
 */
export function EmojiPicker({ quick, freq, onPick, onQuick, onClose }: {
  quick: string[];
  freq: Record<string, number>;
  onPick: (e: string) => void;
  onQuick: (q: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('recent');
  const [customising, setCustomising] = useState(false);
  const used = useMemo(() => topUsed(freq), [freq]);
  const found = useMemo(() => (q.trim() ? searchEmoji(q).map((x) => x.e) : null), [q]);
  const shown = found ?? (group === 'recent' ? (used.length ? used : quick) : (EMOJI_GROUPS.find((g) => g.id === group)?.items.map((x) => x.e) ?? []));

  const pick = (e: string) => {
    if (customising) { onQuick(toggleQuick(quick, e)); return; }
    onPick(e);
    onClose();
  };

  return (
    <div className="pointer-events-auto w-[22rem] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-background/98 shadow-2xl backdrop-blur">
      <div className="flex gap-0.5 border-b border-border px-1.5 pt-1.5">
        {[{ id: 'recent', icon: '🕒', label: 'Frequently used' }, ...EMOJI_GROUPS].map((g) => (
          <button key={g.id} type="button" title={g.label} aria-label={g.label} onClick={() => { setGroup(g.id); setQ(''); }}
            className={`flex h-8 flex-1 items-center justify-center rounded-t-lg text-base ${group === g.id && !found ? 'border-b-2 border-primary bg-muted' : 'hover:bg-muted/60'}`}>{g.icon}</button>
        ))}
      </div>
      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, for example clap or party" aria-label="Search emoji"
            className="h-9 w-full rounded-lg border bg-muted/40 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <p className="mb-1 mt-2 text-xs font-semibold text-muted-foreground">
          {customising ? 'Pick the 4 that stay on your bar' : found ? `${found.length} found` : group === 'recent' ? (used.length ? 'Frequently used' : 'Your quick bar') : EMOJI_GROUPS.find((g) => g.id === group)?.label}
        </p>
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
          {shown.length === 0 && <p className="col-span-8 py-6 text-center text-sm text-muted-foreground">Nothing matches. Try another word.</p>}
          {shown.map((e, i) => (
            <button key={e + i} type="button" onClick={() => pick(e)} aria-label={e}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-125 hover:bg-muted ${customising && quick.includes(e) ? 'bg-primary/15 ring-1 ring-primary' : ''}`}>
              {e}
              {customising && quick.includes(e) && <Check className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary p-0.5 text-primary-foreground" />}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
        <div className="flex items-center gap-1" aria-label="Your quick bar">
          {quick.map((e) => <span key={e} className="text-lg">{e}</span>)}
        </div>
        <button type="button" onClick={() => setCustomising((c) => !c)} className="text-xs font-medium text-primary hover:underline">
          {customising ? 'Done' : 'Customize emote bar'}
        </button>
      </div>
    </div>
  );
}
