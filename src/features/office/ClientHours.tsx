import { useEffect, useState } from 'react';
import { Globe2, Handshake } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { REGIONS, clientHours, sharedWindow, spell, type HoursState } from './world/clientHours';
import { to12h } from './world/clock';

const DOT: Record<HoursState, string> = { open: '#34d399', closing: '#D6AC50', opening: '#D6AC50', closed: '#64748b', weekend: '#64748b' };

/** Re-reads the clock once a minute (clients' hours change slowly). */
export function useMinute(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** A thin strip for the sidebar: one dot per client region, green while their office is open. Click it for the details. */
export function ClientHoursStrip({ onOpen }: { onOpen: () => void }) {
  const now = useMinute();
  return (
    <button type="button" onClick={onOpen} title="Which of our clients are at work right now" aria-label="Client hours"
      className="flex w-full items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.05] px-2.5 py-1.5 text-left transition hover:bg-primary/[0.1]">
      <Globe2 className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold">
        {REGIONS.filter((r) => ['na-e', 'eu-w', 'au-e'].includes(r.id)).map((r) => {
          const h = clientHours(r.zone, now);
          return <span key={r.id} className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[h.state] }} />{r.short}</span>;
        })}
      </span>
    </button>
  );
}

function when(t: number, now: number) {
  const same = new Date(t).toDateString() === new Date(now).toDateString();
  const time = new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${same ? 'Today' : 'Tomorrow'} ${time}`;
}

export function ClientHoursDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const now = useMinute(open);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[88vh] overflow-y-auto md:max-w-xl">
        <DialogHeader className="space-y-1.5 pr-6">
          <p className="inline-flex w-fit items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D6AC50]"><Handshake className="h-3 w-3" />Our clients</p>
          <DialogTitle className="text-2xl font-extrabold tracking-tight">Client hours</DialogTitle>
          <DialogDescription>Who is at work right now (9 AM to 5 PM, Monday to Friday, where they are) and when their day meets ours.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {REGIONS.map((r, i) => {
            const h = clientHours(r.zone, now);
            const t12 = to12h(h.h);
            const w = sharedWindow(r.zone, now);
            const label = h.state === 'open' ? `Open · closes in ${spell(h.minutes ?? 0)}` : h.state === 'closing' ? `Closing in ${spell(h.minutes ?? 0)}` : h.state === 'opening' ? `Opens in ${spell(h.minutes ?? 0)}` : h.state === 'weekend' ? 'Weekend' : 'Closed';
            return (
              <div key={r.id} style={{ '--i': i } as React.CSSProperties} className="kd-rise rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{t12.h12}:{String(h.m).padStart(2, '0')} {t12.pm ? 'PM' : 'AM'} there</p>
                  </div>
                  <span className="kd-chip shrink-0"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[h.state] }} />{label}</span>
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {w ? <>Both of us at work: <span className="font-semibold text-foreground">{when(w.start, now)}</span> to {new Date(w.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} <span className="opacity-70">(your time)</span></> : 'Our working days do not overlap in the next two days. Plan an early or late call, or work asynchronously.'}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Our team: 8 AM to 6 PM in Lagos. Times follow daylight saving where it applies.</p>
      </DialogContent>
    </Dialog>
  );
}
