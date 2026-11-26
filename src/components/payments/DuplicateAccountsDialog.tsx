import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatNaira } from '@/lib/format';

export interface DuplicateLine { full_name: string; bank_name: string; account_number: string; amount_ngn: number }

/**
 * Shown when the batch has two or more lines for the same bank account (a bank account can only be paid once per batch).
 * It names every line and offers two plain choices: remove the repeats, or (after typing DUPLICATE) add the amounts into one line.
 */
export function DuplicateAccountsDialog({ open, groups, onRemove, onMerge, onCancel }: {
  open: boolean;
  groups: { account: string; lines: DuplicateLine[] }[];
  onRemove: () => void;
  onMerge: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);
  const total = groups.reduce((n, g) => n + g.lines.length - 1, 0);
  const sure = typed.trim().toLowerCase() === 'duplicate';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Same bank account used more than once</DialogTitle>
          <DialogDescription>
            A bank account can only be paid once in a batch. {total === 1 ? 'One line' : `${total} lines`} would pay an account that is already in the list. Nothing has been saved yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.account} className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Account {g.account} appears {g.lines.length} times</p>
              <ul className="space-y-1">
                {g.lines.map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate"><span className="font-medium">{l.full_name}</span><span className="text-muted-foreground"> · {l.bank_name}</span>{i === 0 && <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">stays</span>}</span>
                    <span className="shrink-0 tabular-nums">{formatNaira(Number(l.amount_ngn))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border p-3">
            <p className="text-sm font-semibold">Option 1: it is a mistake, remove the repeats</p>
            <p className="mt-0.5 text-xs text-muted-foreground">The first line of each account stays. The others are taken out of the list. Then check the total and save again.</p>
            <Button className="mt-2" onClick={onRemove}>Remove the repeats</Button>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-sm font-semibold">Option 2: it is on purpose, pay it together</p>
            <p className="mt-0.5 text-xs text-muted-foreground">The amounts are added into one line, so the account gets one payment of the total. To confirm this is intentional, type <strong>DUPLICATE</strong>.</p>
            <div className="mt-2 flex gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type DUPLICATE" aria-label="Type DUPLICATE to confirm" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
              <Button variant="outline" disabled={!sure} onClick={onMerge}>Add amounts together</Button>
            </div>
          </div>
        </div>

        <DialogFooter><Button variant="ghost" onClick={onCancel}>Go back and fix it myself</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
