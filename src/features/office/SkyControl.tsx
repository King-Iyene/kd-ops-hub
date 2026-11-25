import { useState } from 'react';
import { seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import { phaseOf, seasonBadge } from './SkyPanel';
import { inDesktopApp } from './desktopApp';

/** The small sky pill on the map: the hour and the Nigerian season, the same for everyone. Admins can click it to change the sky. */
export function SkyControl({ timeMode, seasonMode, canEdit, onOpen }: {
  timeMode: TimeMode;
  seasonMode: SeasonMode;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const now = Date.now();
  const ph = phaseOf(skyState(timeMode, now).hour);
  const sb = seasonBadge(seasonFor(seasonMode, now));
  const manual = timeMode !== 'auto' || seasonMode !== 'auto';
  // small by default (just the two icons, so it does not pull the eye); the words appear when you point at it or tap it
  const inner = (
    <>
      {ph.icon}{open && <span>{ph.label}</span>}
      {open && <span className="h-3 w-px bg-white/15" />}
      {sb.icon}{open && <span>{sb.label}</span>}
      {manual && (open
        ? <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">Set by admin</span>
        : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />)}
    </>
  );
  const cls = (inDesktopApp() ? 'ko absolute right-[4.5rem] top-3 z-10' : 'ko absolute right-3 top-3 z-10')
    + ' flex h-8 max-w-[calc(100%-1.5rem)] items-center gap-2 overflow-hidden whitespace-nowrap rounded-full border border-white/[0.08] bg-background/55 px-2.5 text-xs font-semibold opacity-75 shadow-md backdrop-blur-md transition-all duration-150 hover:opacity-100 focus-visible:opacity-100'
    + (open ? ' px-3 opacity-100' : '');
  const hover = { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) };
  return canEdit
    ? <button type="button" {...hover} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={onOpen} title="Change the sky for everyone" aria-label={`Sky: ${ph.label}, ${sb.label}. Change for everyone`} className={cls + ' hover:bg-background'}>{inner}</button>
    : <div {...hover} onClick={() => setOpen((o) => !o)} className={cls} title={`${ph.label}, ${sb.label}. The sky is set for the whole office`} role="status" aria-label={`Sky: ${ph.label}, ${sb.label}`}>{inner}</div>;
}
