import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, IdCard, Paintbrush, RotateCw, Save, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CATEGORIES } from './catalog';
import { ITEM_COLORS, TILE, drawItems } from './world/render';
import { ITEM_DEFS, itemSize } from './world/world';
import type { ItemType } from './world/types';

export type EditTool = ItemType | 'erase' | 'paint' | 'plate' | null;

/** A little picture of an object, drawn with the same code as the office. */
function Thumb({ type, color }: { type: ItemType; color?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 64 * dpr;
    c.height = 56 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 64, 56);
    const { w, h } = itemSize({ t: type, r: 0 });
    const k = Math.min(56 / (w * TILE), 48 / (h * TILE), 1.3);
    ctx.save();
    ctx.translate((64 - w * TILE * k) / 2, (56 - h * TILE * k) / 2);
    ctx.scale(k, k);
    try { drawItems(ctx, [{ id: 'thumb-' + type, t: type, x: 0, y: 0, r: 0, c: color }], { dark: false }, 0); } catch { /* a picture that cannot be drawn stays blank */ }
    ctx.restore();
  }, [type, color]);
  return <canvas ref={ref} style={{ width: 64, height: 56 }} />;
}

/** The editing panel: pick an object, pick a colour, click the floor. */
export function EditorPanel({ tool, onTool, color, onColor, onTurn, onReset, onCancel, onSave, saving }: {
  tool: EditTool;
  onTool: (t: EditTool) => void;
  color: number | undefined;
  onColor: (c: number | undefined) => void;
  onTurn: () => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [q, setQ] = useState('');
  const list = useMemo<ItemType[]>(() => {
    const needle = q.trim().toLowerCase();
    if (needle) return CATEGORIES.flatMap((c) => c.types).filter((t) => ITEM_DEFS[t].label.toLowerCase().includes(needle));
    return CATEGORIES.find((c) => c.id === cat)?.types ?? [];
  }, [cat, q]);
  return (
    <div className="absolute bottom-3 left-3 top-3 z-10 flex w-72 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-border p-2">
        <span className="pl-1 text-sm font-semibold">Edit office</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onCancel}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={onSave} disabled={saving}><Save className="mr-1 h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      <div className="relative p-2 pb-1">
        <Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search objects…" aria-label="Search objects" className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm" />
      </div>
      {!q && (
        <div className="flex gap-1 overflow-x-auto px-2 pb-1.5">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${cat === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{c.label}</button>
          ))}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-1.5 overflow-y-auto p-2">
        {list.map((t) => (
          <button key={t} type="button" onClick={() => onTool(t)} title={ITEM_DEFS[t].label}
            className={`flex flex-col items-center rounded-lg border p-1 text-center transition-colors ${tool === t ? 'border-primary bg-primary/10' : 'border-transparent bg-muted/50 hover:bg-muted'}`}>
            <Thumb type={t} color={color} />
            <span className="mt-0.5 w-full truncate text-[10px] leading-tight">{ITEM_DEFS[t].label}</span>
          </button>
        ))}
        {list.length === 0 && <p className="col-span-3 p-2 text-xs text-muted-foreground">Nothing matches.</p>}
      </div>
      <div className="space-y-2 border-t border-border p-2">
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Colour</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => onColor(undefined)} aria-label="Original colour" title="Original colour" className={`flex h-6 items-center rounded-full border px-2 text-[10px] ${color === undefined ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>Original</button>
            {ITEM_COLORS.map((c, i) => (
              <button key={c} type="button" onClick={() => onColor(i)} aria-label={`Colour ${i + 1}`} className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${color === i ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={tool === 'paint' ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => onTool('paint')} title="Click an object to give it the chosen colour"><Paintbrush className="mr-1 h-3.5 w-3.5" />Paint</Button>
          <Button size="sm" variant={tool === 'plate' ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => onTool('plate')} title="Click a private office or meeting room to set who sits there or rename it"><IdCard className="mr-1 h-3.5 w-3.5" />Name plates</Button>
          <Button size="sm" variant={tool === 'erase' ? 'destructive' : 'outline'} className="h-7 px-2 text-xs" onClick={() => onTool('erase')}><Eraser className="mr-1 h-3.5 w-3.5" />Remove</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onTurn}><RotateCw className="mr-1 h-3.5 w-3.5" />Turn</Button>
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onReset}>Reset</Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Pick an object, then click the floor. Green means it fits.</p>
      </div>
    </div>
  );
}
