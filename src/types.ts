export type CardSuit = 'espada' | 'basto' | 'oro' | 'copa';

export interface Card {
  id: string;
  number: number;
  suit: CardSuit;
  value: number;
  played?: boolean;
}

export interface Player {
  uid: string;
  name: string;
  team: 1 | 2;
  hand: Card[];
  ready: boolean;
  isDealer?: boolean;
  isCPU?: boolean;
  wentToMazo?: boolean;
}

export interface GameState {
  turn: string;
  turnOrder: string[];
  dealer: string;
  score: { 1: number; 2: number };
  roundScore: { 1: number; 2: number };
  currentHand: number;
  playedCards: { uid: string; card: Card; handIndex: number }[];
  trucoLevel: number;
  trucoChallenger?: string;
  envidoLevel: number;
  envidoChallenger?: string;
  envidoWinner?: 1 | 2;
  envidoPoints?: number;
  originalTurn?: string;
  lastAction?: string;
  winner?: 1 | 2;
  cpuHand?: Record<string, Card[]>;
  actionMessage?: { text: string; id: number };
}

export interface Room {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  players: Player[];
  maxPlayers: 2 | 4;
  gameState?: GameState;
  isCPU?: boolean;
  createdAt: any;
  updatedAt: any;
}
