export type CardSuit = 'espada' | 'basto' | 'oro' | 'copa';

export interface Card {
  id: string;
  number: number;
  suit: CardSuit;
  value: number; // Truco value (higher is better)
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
}

export interface GameState {
  turn: string; // uid
  dealer: string; // uid
  score: { 1: number; 2: number };
  roundScore: { 1: number; 2: number };
  currentHand: number; // 1, 2, 3
  playedCards: { uid: string; card: Card; handIndex: number }[];
  trucoLevel: number; // 1 (none), 2 (truco), 3 (retruco), 4 (vale cuatro)
  trucoChallenger?: string;
  envidoLevel: number; // 0 (none), 2 (envido), 4 (real envido), etc.
  envidoChallenger?: string;
  envidoWinner?: 1 | 2;
  envidoPoints?: number;
  originalTurn?: string; // To know where to return after a challenge chain
  lastAction?: string;
  winner?: 1 | 2;
  cpuHand?: Card[];
  actionMessage?: { text: string; id: number };
}

export interface Room {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  players: Player[];
  gameState?: GameState;
  isCPU?: boolean;
  createdAt: any;
  updatedAt: any;
}
