// Gemeinsame Spielregeln für Client und Server
import type { Bid, BidValue, Game, Player } from './types.js';

export const MATCH_VALUE = 157;
export const MIN_PLAY_VALUE = 90;
export const ALLOWED_PLAYER_COUNTS = [4, 6];
export const MAX_PLAYERS = 6;
export const BID_VALUES: (number | 'Match')[] = [
  ...Array.from({ length: 15 }, (_, i) => (i + 1) * 10),
  'Match',
];

export function numericValue(value: BidValue): number {
  if (value === 'Match') return MATCH_VALUE;
  if (value === 'Pass') return -1;
  return value;
}

export function formatValue(value: BidValue): string {
  if (value === 'Pass') return 'Passe';
  return String(value);
}

// Höchstes Gebot (Pass ignoriert) und wer es abgegeben hat
export function highestBid(bids: Bid[]): Bid | null {
  let best: Bid | null = null;
  for (const bid of bids) {
    if (bid.value === 'Pass') continue;
    if (!best || numericValue(bid.value) > numericValue(best.value)) best = bid;
  }
  return best;
}

export function highestValue(bids: Bid[]): number {
  const best = highestBid(bids);
  return best ? numericValue(best.value) : 0;
}

// Werte, die aktuell noch geboten werden dürfen
export function allowedValues(bids: Bid[]): (number | 'Match')[] {
  const hi = highestValue(bids);
  return BID_VALUES.filter(v => numericValue(v) > hi);
}

// Zugregel: Geboten wird reihum in der Reihenfolge von players, beginnend bei
// startIndex. Jedes Gebot und jeder Pass ist ein Zug; wer passt, ist in der
// nächsten Runde um den Tisch wieder dran.
export function currentPlayer(game: Game): Player | null {
  const n = game.players.length;
  if (!game.started || n === 0 || isRoundOver(game)) return null;
  return game.players[(game.startIndex + game.bids.length) % n];
}

// Die Bietrunde ist entschieden, wenn Match geboten wurde oder nach dem
// Höchstgebot alle anderen gepasst haben (ohne Gebot: alle haben gepasst).
export function isRoundOver(game: Game): boolean {
  if (game.players.length === 0) return false;
  const best = highestBid(game.bids);
  if (best && best.value === 'Match') return true;
  const bestIndex = best ? game.bids.lastIndexOf(best) : -1;
  const passedSince = new Set(
    game.bids.slice(bestIndex + 1).filter(b => b.value === 'Pass').map(b => b.playerId),
  );
  return game.players.every(p => (best && best.playerId === p.id) || passedSince.has(p.id));
}

// Gespielt wird nur ab MIN_PLAY_VALUE
export function isPlayed(game: Game): boolean {
  return isRoundOver(game) && highestValue(game.bids) >= MIN_PLAY_VALUE;
}

export function mayAct(game: Game, playerId: string): boolean {
  return currentPlayer(game)?.id === playerId;
}

// Das eigene Gebot darf zurückgenommen werden, solange noch niemand nachgezogen hat
export function mayUndo(game: Game, playerId: string): boolean {
  const last = game.bids[game.bids.length - 1];
  return game.started && !!last && last.playerId === playerId;
}
