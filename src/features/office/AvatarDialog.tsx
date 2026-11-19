import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Dices, Footprints, RotateCcw } from 'lucide-react';
import { BEARDS, BOTTOMS, COSTUMES, EXTRAS, GLASSES, HAIR_STYLES, HATS, JACKETS, OUTFITS, SHOES, TIES } from './world/avatarParts';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AvatarStyle } from './world/types';
import { HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES, TILE, defaultAvatar, drawPerson } from './world/render';

type NumKey = 'hairStyle' | 'outfit' | 'beard' | 'jacket' | 'shoes' | 'hat' | 'glasses' | 'tie' | 'extra' | 'bottom' | 'costume';
type ColorKey = 'skin' | 'hair' | 'shirt' | 'pants' | 'jacketColor' | 'inner' | 'shoeColor' | 'hatColor' | 'tieColor';
type Focus = 'head' | 'torso' | 'feet' | 'full';

const FOCUS: Record<Focus, { x: number; y: number; s: number }> = {
  head: { x: 0, y: -17, s: 3 },
  torso: { x: 0, y: -6, s: 2.4 },
  feet: { x: 0, y: 6, s: 3 },
  full: { x: 0, y: -8, s: 1.85 },
};

/** A friendly range of colours for clothes (you can also pick any colour you like). */
export const COLORS = ['#ef4444', '#fb923c', '#facc15', '#6b7a2e', '#16a34a', '#0f766e', '#38bdf8', '#2563eb', '#818cf8', '#a855f7', '#ec4899', '#f9a8d4', '#b8734a', '#e8cfa6', '#ffffff', '#9ca3af', '#374151', '#111827'];

interface Section {
  id: string;
  label: string;
  focus: Focus;
  /** the colour this section changes */
  color?: ColorKey;
  palette?: string[];
  /** the choices for this section */
  option?: NumKey;
  labels?: string[];
  /** a second colour row (the shirt worn under a jacket) */
  extraColor?: { key: ColorKey; label: string };
}

const TABS: { id: string; label: string; sections: Section[] }[] = [
  {
    id: 'base', label: 'Base', sections: [
      { id: 'skin', label: 'Skin', focus: 'head', color: 'skin', palette: SKIN_TONES },
      { id: 'hair', label: 'Hair', focus: 'head', color: 'hair', palette: HAIR_COLORS, option: 'hairStyle', labels: HAIR_STYLES },
      { id: 'beard', label: 'Facial hair', focus: 'head', option: 'beard', labels: BEARDS },
    ],
  },
  {
    id: 'clothing', label: 'Clothing', sections: [
      { id: 'top', label: 'Top', focus: 'torso', color: 'shirt', palette: [...SHIRT_COLORS, ...COLORS], option: 'outfit', labels: OUTFITS },
      { id: 'jacket', label: 'Jacket', focus: 'torso', color: 'jacketColor', palette: COLORS, option: 'jacket', labels: JACKETS, extraColor: { key: 'inner', label: 'Shirt underneath' } },
      { id: 'bottom', label: 'Bottom', focus: 'feet', color: 'pants', palette: [...PANTS_COLORS, ...COLORS], option: 'bottom', labels: BOTTOMS },
      { id: 'shoes', label: 'Shoes', focus: 'feet', color: 'shoeColor', palette: COLORS, option: 'shoes', labels: SHOES },
    ],
  },
  {
    id: 'characters', label: 'Characters', sections: [
      { id: 'costume', label: 'Costume', focus: 'full', option: 'costume', labels: COSTUMES },
    ],
  },
  {
    id: 'accessories', label: 'Accessories', sections: [
      { id: 'hat', label: 'Hat', focus: 'head', color: 'hatColor', palette: COLORS, option: 'hat', labels: HATS },
      { id: 'glasses', label: 'Glasses', focus: 'head', option: 'glasses', labels: GLASSES },
      { id: 'tie', label: 'Tie and scarf', focus: 'torso', color: 'tieColor', palette: COLORS, option: 'tie', labels: TIES },
      { id: 'extra', label: 'Extras', focus: 'head', option: 'extra', labels: EXTRAS },
    ],
  },
];

const CLEAR: Partial<AvatarStyle> = { costume: 0, bottom: 0, jacket: 0, tie: 0, hat: 0, glasses: 0, extra: 0, beard: 0 };

/** Ready-made looks: one tap puts a whole outfit together. Every piece in them can also be picked by hand in the other tabs. */
export const LOOKS: { id: string; label: string; apply: (a: AvatarStyle) => Partial<AvatarStyle> }[] = [
  { id: 'boardroom', label: 'Boardroom', apply: () => ({ ...CLEAR, outfit: 0, shirt: '#ffffff', jacket: 1, jacketColor: '#1f2a44', inner: '#ffffff', tie: 1, tieColor: '#b91c1c', pants: '#1f2a44', shoes: 1, shoeColor: '#111827' }) },
  { id: 'casual', label: 'Casual', apply: () => ({ ...CLEAR, outfit: 0, shirt: '#ef4444', jacket: 2, jacketColor: '#4f79a8', inner: '#ef4444', pants: '#374151', shoes: 0, shoeColor: '#ffffff' }) },
  { id: 'weekend', label: 'Weekend', apply: () => ({ ...CLEAR, outfit: 1, shirt: '#16a34a', pants: '#111827', shoes: 0, shoeColor: '#fb923c', hat: 1, hatColor: '#111827', glasses: 2 }) },
  { id: 'smart', label: 'Smart', apply: () => ({ ...CLEAR, outfit: 0, shirt: '#38bdf8', jacket: 4, jacketColor: '#374151', inner: '#38bdf8', tie: 2, tieColor: '#a855f7', pants: '#374151', shoes: 1, shoeColor: '#111827', glasses: 1 }) },
  { id: 'cool', label: 'Cool', apply: () => ({ ...CLEAR, outfit: 0, shirt: '#111827', jacket: 3, jacketColor: '#16a34a', inner: '#111827', pants: '#2563eb', shoes: 2, shoeColor: '#374151', hat: 2, hatColor: '#facc15', glasses: 2 }) },
  { id: 'creative', label: 'Creative', apply: () => ({ ...CLEAR, outfit: 1, shirt: '#ec4899', tie: 3, tieColor: '#facc15', pants: '#0b3a6b', shoes: 0, shoeColor: '#ffffff', hat: 4, hatColor: '#a855f7', glasses: 1, extra: 1 }) },
  { id: 'ankara', label: 'Ankara', apply: () => ({ ...CLEAR, outfit: 6, shirt: '#0f766e', pants: '#111827', shoes: 3, shoeColor: '#d6ac50', hat: 3, hatColor: '#d6ac50', extra: 2 }) },
  { id: 'kaftan', label: 'Kaftan', apply: () => ({ ...CLEAR, outfit: 5, shirt: '#e8cfa6', pants: '#e8cfa6', shoes: 1, shoeColor: '#6b4423', hat: 1, hatColor: '#e8cfa6' }) },
  { id: 'agbada', label: 'Agbada', apply: () => ({ ...CLEAR, outfit: 7, shirt: '#1e3a8a', inner: '#f8fafc', pants: '#f8fafc', shoes: 1, shoeColor: '#6b4423', hat: 6, hatColor: '#1e3a8a' }) },
  { id: 'gele', label: 'Gele and iro', apply: () => ({ ...CLEAR, outfit: 9, shirt: '#f59e0b', pants: '#7c3aed', shoes: 4, shoeColor: '#d6ac50', hat: 7, hatColor: '#ec4899', extra: 6, hairStyle: 3 }) },
  { id: 'chief', label: 'Igbo chief', apply: () => ({ ...CLEAR, outfit: 8, shirt: '#7f1d1d', pants: '#111827', shoes: 1, shoeColor: '#111827', hat: 15, beard: 3, hair: '#d1d5db' }) },
  { id: 'hausa', label: 'Hausa babariga', apply: () => ({ ...CLEAR, outfit: 7, shirt: '#f8fafc', inner: '#e8cfa6', pants: '#f8fafc', shoes: 3, shoeColor: '#6b4423', hat: 16, hatColor: '#f8fafc', beard: 3 }) },
  { id: 'hijab', label: 'Hijab', apply: () => ({ ...CLEAR, outfit: 13, shirt: '#0f766e', shoes: 3, shoeColor: '#d6ac50', hat: 8, hatColor: '#f9a8d4' }) },
  { id: 'dashiki', label: 'Dashiki', apply: () => ({ ...CLEAR, outfit: 14, shirt: '#16a34a', pants: '#111827', shoes: 3, shoeColor: '#6b4423', hat: 16, hatColor: '#facc15' }) },
  { id: 'kente', label: 'Kente', apply: () => ({ ...CLEAR, outfit: 15, shirt: '#facc15', pants: '#16a34a', shoes: 3, shoeColor: '#6b4423', extra: 6 }) },
  { id: 'cowboy', label: 'Cowboy', apply: () => ({ ...CLEAR, outfit: 0, shirt: '#dc2626', jacket: 2, jacketColor: '#4f79a8', inner: '#dc2626', pants: '#2563eb', shoes: 2, shoeColor: '#6b4423', hat: 5, hatColor: '#8b5a2b', beard: 2 }) },
  { id: 'graduate', label: 'Graduate', apply: () => ({ ...CLEAR, outfit: 12, shirt: '#111827', tieColor: '#facc15', shoes: 1, shoeColor: '#111827', hat: 14, hatColor: '#111827' }) },
  { id: 'ballgown', label: 'Ball gown', apply: () => ({ ...CLEAR, outfit: 10, shirt: '#7c3aed', shoes: 4, shoeColor: '#facc15', hairStyle: 2, extra: 6 }) },
  { id: 'bride', label: 'Wedding', apply: () => ({ ...CLEAR, outfit: 11, shirt: '#ffffff', shoes: 4, shoeColor: '#f8fafc', hairStyle: 2 }) },
  { id: 'lab', label: 'Lab coat', apply: () => ({ ...CLEAR, outfit: 17, shirt: '#38bdf8', pants: '#374151', shoes: 0, shoeColor: '#ffffff', glasses: 3 }) },
  { id: 'chef', label: 'Chef', apply: () => ({ ...CLEAR, outfit: 0, shirt: '#ffffff', pants: '#374151', shoes: 1, shoeColor: '#111827', hat: 11, hatColor: '#ffffff', beard: 5 }) },
  { id: 'sporty', label: 'Sporty', apply: () => ({ ...CLEAR, outfit: 18, shirt: '#ef4444', bottom: 1, pants: '#111827', shoes: 0, shoeColor: '#ffffff', hat: 1, hatColor: '#ef4444', glasses: 2 }) },
  { id: 'beach', label: 'Beach day', apply: () => ({ ...CLEAR, outfit: 18, shirt: '#fb923c', bottom: 1, pants: '#38bdf8', shoes: 6, glasses: 2, hat: 9, hatColor: '#facc15' }) },
  { id: 'robot', label: 'Robot', apply: () => ({ ...CLEAR, costume: 1 }) },
  { id: 'zombie', label: 'Zombie', apply: () => ({ ...CLEAR, costume: 2 }) },
  { id: 'ghost', label: 'Ghost', apply: () => ({ ...CLEAR, costume: 3 }) },
  { id: 'pirate', label: 'Pirate', apply: () => ({ ...CLEAR, costume: 4 }) },
  { id: 'rat', label: 'Rat', apply: () => ({ ...CLEAR, costume: 5 }) },
  { id: 'alien', label: 'Alien', apply: () => ({ ...CLEAR, costume: 6 }) },
  { id: 'clown', label: 'Clown', apply: () => ({ ...CLEAR, costume: 7 }) },
  { id: 'skeleton', label: 'Skeleton', apply: () => ({ ...CLEAR, costume: 8 }) },
];

const pickOf = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const upTo = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Everything chosen at random from what you can pick by hand, and never a clash that looks silly (a gown under a blazer, say). */
export function surprise(a: AvatarStyle, characters = false): AvatarStyle {
  const outfit = pickOf(upTo(OUTFITS.length));
  const dressy = outfit === 3 || outfit === 4 || (outfit >= 7 && outfit <= 17 && outfit !== 8 && outfit !== 14 && outfit !== 16);
  const costume = characters && Math.random() < 0.35 ? pickOf(upTo(COSTUMES.length).slice(1)) : 0;
  return {
    ...a,
    skin: pickOf(SKIN_TONES), hair: pickOf(HAIR_COLORS), hairStyle: pickOf(upTo(HAIR_STYLES.length)), beard: pickOf([0, 0, 0, ...upTo(BEARDS.length)]),
    outfit, shirt: pickOf([...SHIRT_COLORS, ...COLORS]), pants: pickOf([...PANTS_COLORS, ...COLORS]), bottom: pickOf(upTo(BOTTOMS.length)), inner: pickOf(COLORS),
    jacket: dressy ? 0 : pickOf([0, 0, ...upTo(JACKETS.length)]), jacketColor: pickOf(COLORS),
    tie: dressy ? 0 : pickOf([0, 0, ...upTo(TIES.length)]), tieColor: pickOf(COLORS), shoes: pickOf(upTo(SHOES.length)), shoeColor: pickOf(COLORS),
    hat: pickOf([0, 0, ...upTo(HATS.length)]), hatColor: pickOf(COLORS), glasses: pickOf([0, 0, ...upTo(GLASSES.length)]), extra: pickOf([0, 0, ...upTo(EXTRAS.length)]),
    costume,
  };
}

/** Random for just one part (its choice and its colour), from exactly what that part offers. */
function surprisePart(a: AvatarStyle, section: Section): AvatarStyle {
  const next = { ...a } as AvatarStyle & Record<string, unknown>;
  if (section.option && section.labels) next[section.option] = pickOf(upTo(section.labels.length));
  if (section.color && section.palette) next[section.color] = pickOf(section.palette);
  return next;
}

/** A small picture of an avatar, zoomed to the part that matters (drawn once, with the same code as the world). */
const Thumb = memo(function Thumb({ avatar, focus, size = 68 }: { avatar: AvatarStyle; focus: Focus; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(avatar) + focus;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    const f = FOCUS[focus];
    ctx.translate(size / 2, size / 2);
    ctx.scale(f.s, f.s);
    ctx.translate(-f.x, -f.y);
    drawPerson(ctx, { x: 0, y: 0, dir: 0, moving: false, name: '', avatar, isMe: false, id: 'thumb' }, 0, { dark: false });
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-lg" />;
});

function ColorRow({ label, palette, value, onPick }: { label: string; palette: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {palette.map((c) => (
          <button
            key={c} type="button" onClick={() => onPick(c)} aria-label={`${label} ${c}`} aria-pressed={value.toLowerCase() === c.toLowerCase()}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${value.toLowerCase() === c.toLowerCase() ? 'border-primary ring-2 ring-primary/40' : 'border-white/20'}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/40 text-[10px] font-bold text-white/70 hover:border-white" title="Any colour">
          +
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#888888'} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Pick any colour for ${label}`} />
        </label>
      </div>
    </div>
  );
}

/** Make your avatar. The picture is drawn with the same code as the office, so what you see is what others see. */
export function AvatarDialog({ open, onOpenChange, value, name, saving, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: AvatarStyle;
  name: string;
  saving: boolean;
  onSave: (a: AvatarStyle) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState<string>('looks');
  const [sectionId, setSectionId] = useState<string>('hair');
  const [dir, setDir] = useState<0 | 1 | 2 | 3>(0);
  const [walk, setWalk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { if (open) { setDraft(value); setTab('looks'); } }, [open, value]);

  const sections = TABS.find((t) => t.id === tab)?.sections ?? [];
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const set = (patch: Partial<AvatarStyle>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const draw = (t: number) => {
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.save();
        const walked = walk ? (t / 1000) * 1.7 : 0;
        ctx.scale(5, 5);
        ctx.translate(100 / 5 - 0.5 * TILE, 0);
        // the avatar stays in the middle while the legs and arms swing as if it were walking
        const sx = 0.5 + (walk ? walked % 4 : 0);
        ctx.translate(-(sx - 0.5) * TILE, 0);
        drawPerson(ctx, { x: sx, y: 1.05, dir, moving: walk, name: '', avatar: draft, isMe: false, id: 'preview' }, t, { dark: false });
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, draft, dir, walk]);

  const turn = (d: number) => setDir((cur) => ([0, 2, 3, 1] as const)[(([0, 2, 3, 1] as const).indexOf(cur) + d + 4) % 4]);

  const optionGrid = useMemo(() => {
    if (!section?.option || !section.labels) return null;
    const key = section.option;
    return section.labels.map((label, id) => ({ id, label, avatar: { ...draft, [key]: id } as AvatarStyle }));
  }, [section, draft]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto md:max-w-3xl">
        <DialogHeader><DialogTitle>Make your avatar</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4 md:flex-row md:gap-5">
          <div className="mx-auto flex w-[200px] shrink-0 flex-col items-center gap-2 md:mx-0">
            <canvas ref={canvasRef} width={200} height={270} style={{ width: 200, height: 270 }} className="rounded-2xl bg-gradient-to-b from-sky-100/60 to-amber-100/40 ring-1 ring-black/5 dark:from-slate-700/50 dark:to-slate-800/50" />
            <div className="flex items-center gap-1.5">
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Turn left" onClick={() => turn(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button type="button" size="sm" variant={walk ? 'default' : 'outline'} className="h-8 gap-1.5 text-xs" onClick={() => setWalk((w) => !w)}><Footprints className="h-3.5 w-3.5" />Walk</Button>
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Turn right" onClick={() => turn(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setDraft((d) => surprise(d))}><Dices className="h-3.5 w-3.5" />Surprise me</Button>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setDraft((d) => surprise(d, true))} title="Might even make you a robot, a ghost or a pirate">Wild</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => setDraft(defaultAvatar(name || 'x'))} title="Back to the starting look"><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex gap-1 rounded-xl bg-muted/60 p-1" role="tablist">
              {[{ id: 'looks', label: 'Looks' }, ...TABS.map((t) => ({ id: t.id, label: t.label }))].map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`h-8 flex-1 rounded-lg px-2 text-xs font-semibold transition-colors ${tab === t.id ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
              ))}
            </div>

            {tab === 'looks' && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Pick a look to start from (traditional, formal, fun or a full character), then change anything you like in the other tabs. Every piece can be picked by hand too.</p>
                <div className="grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                  {LOOKS.map((l) => (
                    <button key={l.id} type="button" onClick={() => set(l.apply(draft))} className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 p-1.5 ring-1 ring-transparent transition hover:bg-muted hover:ring-primary/40">
                      <Thumb avatar={{ ...draft, ...l.apply(draft) }} focus="full" size={84} />
                      <span className="text-[11px] font-semibold">{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab !== 'looks' && section && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {sections.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSectionId(s.id)} className={`h-7 rounded-full px-3 text-xs font-semibold ring-1 transition ${section.id === s.id ? 'bg-primary text-primary-foreground ring-primary' : 'bg-muted/50 ring-transparent hover:bg-muted'}`}>{s.label}</button>
                  ))}
                </div>
                <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setDraft((d) => surprisePart(d, section))}><Dices className="h-3.5 w-3.5" />Random {section.label.toLowerCase()}</Button></div>
                {section.color && section.palette && (
                  <ColorRow label={`${section.label} colour`} palette={section.palette} value={draft[section.color]} onPick={(c) => set({ [section.color!]: c } as Partial<AvatarStyle>)} />
                )}
                {section.extraColor && (
                  <ColorRow label={section.extraColor.label} palette={COLORS} value={draft[section.extraColor.key]} onPick={(c) => set({ [section.extraColor!.key]: c } as Partial<AvatarStyle>)} />
                )}
                {optionGrid && (
                  <div className="grid max-h-[17rem] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
                    {optionGrid.map((o) => {
                      const on = draft[section.option!] === o.id;
                      return (
                        <button key={o.id} type="button" title={o.label} aria-pressed={on} onClick={() => set({ [section.option!]: o.id } as Partial<AvatarStyle>)}
                          className={`flex flex-col items-center gap-0.5 rounded-xl p-1 ring-2 transition ${on ? 'bg-primary/10 ring-primary' : 'bg-muted/50 ring-transparent hover:bg-muted'}`}>
                          <Thumb avatar={o.avatar} focus={section.focus} />
                          <span className="max-w-full truncate text-[10.5px] font-medium">{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!optionGrid && <p className="text-xs text-muted-foreground">Pick a colour above. The shape of your {section.label.toLowerCase()} comes from your top.</p>}
              </div>
            )}
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
