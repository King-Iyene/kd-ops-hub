import { useEffect } from 'react';

/** The reactions on the wheel, clockwise from the top. Keys 1 to 8 pick one too. */
export const WHEEL = ['👍', '👏', '❤️', '😂', '🎉', '🔥', '🙌', '👋'];

/** Press E for a ring of reactions around the middle of the screen; click one (or press its number) and it floats over your head. */
export function ReactionWheel({ open, onPick, onClose }: { open: boolean; onPick: (emoji: string) => void; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'e') { e.preventDefault(); onClose(); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= WHEEL.length) { e.preventDefault(); onPick(WHEEL[n - 1]); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onPick, onClose]);
  if (!open) return null;
  const R = 92;
  return (
    <div className="fixed inset-0 z-40" onClick={onClose} role="presentation">
      <div className="absolute left-1/2 top-1/2" style={{ transform: 'translate(-50%, -50%)' }}>
        <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70 backdrop-blur-md ring-1 ring-border" style={{ width: R * 2 + 70, height: R * 2 + 70, animation: 'kd-wheel-in 160ms ease-out' }} />
        <p className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold text-muted-foreground">React · press 1 to 8</p>
        {WHEEL.map((e, i) => {
          const a = (i / WHEEL.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={e}
              type="button"
              onClick={(ev) => { ev.stopPropagation(); onPick(e); }}
              aria-label={`React ${e}`}
              className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-2xl shadow-lg ring-1 ring-border transition hover:scale-125 hover:ring-primary"
              style={{ left: Math.cos(a) * R, top: Math.sin(a) * R, animation: `kd-wheel-pop 220ms ${i * 18}ms ease-out both` }}
            >
              {e}
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">{i + 1}</span>
            </button>
          );
        })}
      </div>
      <style>{'@keyframes kd-wheel-in{from{opacity:0;transform:translate(-50%,-50%) scale(.6)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes kd-wheel-pop{from{opacity:0;transform:translate(-50%,-50%) scale(.3)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}'}</style>
    </div>
  );
}
