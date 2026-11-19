import { useState } from 'react';
import { ArrowLeft, ExternalLink, Gamepad2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GAMES, type OfficeGame } from './games';
import { inDesktopApp } from './desktopApp';

/**
 * Pick a game, then go in. Most game websites refuse to be shown inside another page, so the game opens as a page of its
 * own: in this tab (the browser's Back button, or the link on the game's tab, brings you straight back to the office),
 * or in a new tab. The room link inside each game is how friends join the same round.
 */
export function GamesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [game, setGame] = useState<OfficeGame | null>(null);
  const desktop = inDesktopApp();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setGame(null); onClose(); } }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex max-w-3xl flex-col gap-3">
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
            <p className="col-span-full text-xs text-muted-foreground">These are free games from other websites. To play together, one person starts a room in the game and shares its link or code in the chat.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-muted/50 p-5 text-center">
              <div className="text-5xl">{game.emoji}</div>
              <p className="mt-2 text-lg font-semibold">{game.name}</p>
              <p className="text-sm text-muted-foreground">{game.blurb}</p>
              <p className="mt-1 text-xs font-medium text-primary">{game.players}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {!desktop && (
                <Button className="flex-1" onClick={() => { window.location.assign(game.url); }}><Gamepad2 className="mr-2 h-4 w-4" />Go into the game</Button>
              )}
              <Button className="flex-1" variant={desktop ? 'default' : 'outline'} asChild>
                <a href={game.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{desktop ? 'Play in your browser' : 'Open in a new tab'}</a>
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {desktop ? 'The game opens in your browser; this window stays in the office.' : 'Going into the game uses this tab. Press the browser’s Back button to come back to the office (your place is kept), or choose a new tab to keep both.'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
