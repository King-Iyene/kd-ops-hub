import { Building2, Users2, CalendarClock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Company } from '@/queries';

export interface CompanyRunStats {
  /** Active, payable employees in this company's pay groups. */
  employees: number;
  /** Human label for the most recent run, e.g. "Nov 2026". Null if none. */
  lastRunLabel: string | null;
}

/**
 * "Which company is this payroll for?"
 *
 * Shown when someone starts a payroll run while the page is filtered to
 * "All companies" — at that point there is no single company to draft
 * against, and silently picking one would be how a KD Squares run
 * accidentally gets NDI's employees in it.
 *
 * Deliberately big cards rather than a dropdown: a company is the single
 * most consequential choice in the whole flow, and a dropdown hides the
 * two facts that tell you whether you picked right — how many people are
 * in it, and when it last ran.
 */
export function CompanyChoiceDialog({
  open,
  companies,
  stats,
  onPick,
  onClose,
}: {
  open: boolean;
  companies: Company[];
  stats: Record<string, CompanyRunStats>;
  onPick: (companyId: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who are you paying?</DialogTitle>
          <DialogDescription>
            You're viewing all companies. Pick the one this payroll run is for — each
            company's payroll is run separately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {companies.map((c) => {
            const s = stats[c.id];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.id)}
                className="group flex min-h-[112px] flex-col items-start gap-2 rounded-xl border-2 border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus-visible:border-primary focus-visible:outline-none"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${c.color}1a`, color: c.color }}
                  >
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="font-semibold leading-tight">{c.name}</span>
                </span>

                <span className="mt-auto space-y-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users2 className="h-3 w-3" />
                    {s ? `${s.employees} ${s.employees === 1 ? 'employee' : 'employees'}` : '—'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="h-3 w-3" />
                    {s?.lastRunLabel ? `Last run: ${s.lastRunLabel}` : 'No runs yet'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-2xs text-muted-foreground">
          You can run payroll for one pay group at a time. To pay everyone, create a
          separate run for each group.
        </p>
      </DialogContent>
    </Dialog>
  );
}
