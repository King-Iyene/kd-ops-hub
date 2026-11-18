import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AvatarStyle } from './world/types';
import { HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES, drawPerson } from './world/render';

const HAIR_STYLES: { id: AvatarStyle['hairStyle']; label: string }[] = [
  { id: 0, label: 'Short' },
  { id: 1, label: 'Long' },
  { id: 2, label: 'Bun' },
  { id: 3, label: 'None' },
  { id: 4, label: 'Curly' },
  { id: 5, label: 'Quiff' },
];
const OUTFITS: { id: AvatarStyle['outfit']; label: string }[] = [{ id: 0, label: 'T-shirt' }, { id: 1, label: 'Hoodie' }, { id: 2, label: 'Blazer' }];
const ACCESSORIES: { id: AvatarStyle['accessory']; label: string }[] = [{ id: 0, label: 'None' }, { id: 1, label: 'Glasses' }, { id: 2, label: 'Headset' }, { id: 3, label: 'Cap' }];

function Choice<T extends number>({ label, items, value, onPick }: { label: string; items: { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((h) => (
          <Button key={h.id} type="button" size="sm" variant={value === h.id ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => onPick(h.id)}>{h.label}</Button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c} type="button" onClick={() => onPick(c)} aria-label={`${label} ${c}`} aria-pressed={value === c}
            className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${value === c ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

/** Pick skin, hair and shirt. The preview is drawn with the same code as the world, so what you see is what others see. */
export function AvatarDialog({ open, onOpenChange, value, name, saving, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: AvatarStyle;
  name: string;
  saving: boolean;
  onSave: (a: AvatarStyle) => void;
}) {
  const [draft, setDraft] = useState(value);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { if (open) setDraft(value); }, [open, value]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const draw = (t: number) => {
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.save();
        ctx.scale(3.2, 3.2);
        drawPerson(ctx, { x: 0.69, y: 1.3, dir: 0, moving: false, name: '', avatar: draft, isMe: false }, t, { dark: false });
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, draft, name]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Customise your avatar</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
          <canvas ref={canvasRef} width={170} height={230} style={{ width: 170, height: 230 }} className="mx-auto shrink-0 rounded-lg bg-muted/40 sm:mx-0" />
          <div className="min-w-0 flex-1 space-y-3">
            <Swatches label="Skin" colors={SKIN_TONES} value={draft.skin} onPick={(c) => setDraft({ ...draft, skin: c })} />
            <Swatches label="Hair colour" colors={HAIR_COLORS} value={draft.hair} onPick={(c) => setDraft({ ...draft, hair: c })} />
            <Swatches label="Shirt" colors={SHIRT_COLORS} value={draft.shirt} onPick={(c) => setDraft({ ...draft, shirt: c })} />
            <Swatches label="Trousers" colors={PANTS_COLORS} value={draft.pants} onPick={(c) => setDraft({ ...draft, pants: c })} />
            <Choice label="Hair style" items={HAIR_STYLES} value={draft.hairStyle} onPick={(id) => setDraft({ ...draft, hairStyle: id })} />
            <Choice label="Outfit" items={OUTFITS} value={draft.outfit} onPick={(id) => setDraft({ ...draft, outfit: id })} />
            <Choice label="Accessory" items={ACCESSORIES} value={draft.accessory} onPick={(id) => setDraft({ ...draft, accessory: id })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(draft)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
