export enum Suit {
  ROSEN = 'Rosen',
  EICHELN = 'Eicheln',
  SCHELLEN = 'Schellen',
  SCHILTEN = 'Schilten',
}

export enum SpecialGameType {
  OBE_ABE = 'Obeabe',
  UNE_UFE = 'Uneufe',
}

export type GameType = Suit | SpecialGameType;

export type BidValue = number | 'Match' | 'Pass';

export interface Bid {
  playerId: string;
  playerName: string;
  gameType: GameType;
  value: BidValue;
}

export interface Player {
  id: string;
  name: string;
}

export interface Game {
  gameCode: string;
  players: Player[];
  bids: Bid[];
  creatorId: string;
  started: boolean;
}
