import { useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GAMES, type OfficeGame } from './games';

/** Pick a game, then play it right here. The room link inside each game is how friends join the same round. */
export function GamesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [game, setGame] = useState<OfficeGame | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setGame(null); onClose(); } }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex h-[88vh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {game && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setGame(null)} aria-label="Back to all games"><ArrowLeft className="h-4 w-4" /></Button>}
            {game ? `${game.emoji} ${game.name}` : '🎮 Game room'}
          </DialogTitle>
        </DialogHeader>
        {!game ? (
          <div className="grid gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((g) => (
              <button key={g.id} type="button" onClick={() => setGame(g)} className="rounded-2xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
                <div className="text-3xl">{g.emoji}</div>
                <p className="mt-2 font-semibold">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.blurb}</p>
                <p className="mt-2 text-[11px] font-medium text-primary">{g.players}</p>
              </button>
            ))}
            <p className="col-span-full text-xs text-muted-foreground">These are free games from other websites, shown inside the office. To play together, one person starts a room and shares its link or code in the chat.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <iframe key={game.id} title={game.name} src={game.url} className="min-h-0 flex-1 rounded-xl border border-border bg-background" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" allow="fullscreen" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>If the game does not load, open it in its own tab.</span>
              <Button size="sm" variant="outline" asChild><a href={game.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Open in a new tab</a></Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
