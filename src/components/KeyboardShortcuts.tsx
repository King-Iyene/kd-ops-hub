import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Keyboard } from 'lucide-react';

type Shortcut = { keys: string[]; label: string; group: string };

const SHORTCUTS: Shortcut[] = [
  { group: 'General',    keys: ['⌘', 'K'],  label: 'Open command palette' },
  { group: 'General',    keys: ['?'],         label: 'Show keyboard shortcuts' },
  { group: 'General',    keys: ['Esc'],       label: 'Close dialog / exit impersonation' },

  { group: 'Navigate',   keys: ['G', 'D'],  label: 'Go to Dashboard' },
  { group: 'Navigate',   keys: ['G', 'A'],  label: 'Go to Approvals' },
  { group: 'Navigate',   keys: ['G', 'P'],  label: 'Go to Payments' },
  { group: 'Navigate',   keys: ['G', 'R'],  label: 'Go to Payroll' },
  { group: 'Navigate',   keys: ['G', 'E'],  label: 'Go to Expenses' },
  { group: 'Navigate',   keys: ['G', 'F'],  label: 'Go to Fleet' },
  { group: 'Navigate',   keys: ['G', 'L'],  label: 'Go to Leave' },

  { group: 'Create',     keys: ['N', 'B'],  label: 'New payment batch' },
];

const GROUPS = ['General', 'Navigate', 'Create'];

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const [chord, setChord] = useState<string | null>(null);

  useEffect(() => {
    let chordTimer: number | null = null;

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      // ? opens this overlay
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
        return;
      }

      // Two-key chords: G→… and N→…
      const k = e.key.toLowerCase();
      if (!chord && (k === 'g' || k === 'n')) {
        setChord(k);
        if (chordTimer) window.clearTimeout(chordTimer);
        chordTimer = window.setTimeout(() => setChord(null), 1200);
        return;
      }
      if (chord) {
        const target = `${chord}${k}`;
        const map: Record<string, string> = {
          gd: '/',
          ga: '/approvals',
          gp: '/payments',
          gr: '/payroll',
          ge: '/expenses',
          gf: '/fleet',
          gl: '/leave',
          nb: '/payments/new',
        };
        const path = map[target];
        if (path) {
          e.preventDefault();
          window.location.assign(path);
        }
        setChord(null);
        if (chordTimer) window.clearTimeout(chordTimer);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (chordTimer) window.clearTimeout(chordTimer);
    };
  }, [chord]);

  return (
    <>
      {/* Chord indicator — floating pill bottom-right */}
      {chord && (
        <div className="fixed bottom-6 right-6 z-50 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium shadow-2xl kd-animate-fade-in">
          <span className="opacity-60">Pressed </span>
          <kbd className="font-mono font-bold">{chord.toUpperCase()}</kbd>
          <span className="opacity-60"> — waiting…</span>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              Keyboard Shortcuts
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)] pr-2">
            {GROUPS.map((g) => (
              <div key={g}>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  {g}
                </h4>
                <div className="space-y-1.5">
                  {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                    <div key={s.label} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50 kd-transition">
                      <span className="text-sm text-foreground">{s.label}</span>
                      <span className="flex items-center gap-1">
                        {s.keys.map((k, i) => (
                          <kbd
                            key={i}
                            className="inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-md border border-border bg-card text-[11px] font-mono font-semibold text-foreground shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-3 border-t border-border/50">
              Two-key shortcuts (G then D, N then B…) – press the first key, then the second within a second.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
