/** The games you can play from an arcade machine or a game table. Each is a free web game whose site allows being shown inside another page. */
export interface OfficeGame { id: string; name: string; blurb: string; url: string; emoji: string; players: string }

export const GAMES: OfficeGame[] = [
  { id: 'codenames', name: 'Codenames', blurb: 'Two teams, one-word clues, find your agents.', url: 'https://codenames.game/', emoji: '🕵️', players: '4 or more' },
  { id: 'skribbl', name: 'skribbl.io', blurb: 'Draw and guess the word before time runs out.', url: 'https://skribbl.io/', emoji: '🎨', players: '3 to 12' },
  { id: 'jklm', name: 'JKLM word games', blurb: 'Bomb Party and Pop Sauce: quick word and picture rounds.', url: 'https://jklm.fun/', emoji: '💣', players: '2 or more' },
  { id: 'cards', name: 'Playing Cards', blurb: 'A table of cards: poker, rummy, whatever you like.', url: 'https://playingcards.io/', emoji: '🃏', players: '2 to 8' },
  { id: 'drawasaurus', name: 'Drawasaurus', blurb: 'A calmer drawing and guessing game.', url: 'https://www.drawasaurus.org/', emoji: '🦖', players: '3 or more' },
  { id: '2048', name: '2048', blurb: 'Solo brain-break: slide the tiles and reach 2048.', url: 'https://2048game.com/', emoji: '🔢', players: 'Just you' },
];

/** Games are on unless an admin turned them off in the office settings. */
export function gamesOn(settings: { games?: boolean } | undefined | null): boolean {
  return settings?.games !== false;
}
