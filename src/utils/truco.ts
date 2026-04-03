import { Card, CardSuit, Player } from '../types';

export const CARD_VALUES: Record<string, number> = {
  '1-espada': 14,
  '1-basto': 13,
  '7-espada': 12,
  '7-oro': 11,
  '3-espada': 10, '3-basto': 10, '3-oro': 10, '3-copa': 10,
  '2-espada': 9, '2-basto': 9, '2-oro': 9, '2-copa': 9,
  '1-oro': 8, '1-copa': 8,
  '12-espada': 7, '12-basto': 7, '12-oro': 7, '12-copa': 7,
  '11-espada': 6, '11-basto': 6, '11-oro': 6, '11-copa': 6,
  '10-espada': 5, '10-basto': 5, '10-oro': 5, '10-copa': 5,
  '7-basto': 4, '7-copa': 4,
  '6-espada': 3, '6-basto': 3, '6-oro': 3, '6-copa': 3,
  '5-espada': 2, '5-basto': 2, '5-oro': 2, '5-copa': 2,
  '4-espada': 1, '4-basto': 1, '4-oro': 1, '4-copa': 1,
};

export const createDeck = (): Card[] => {
  const suits: CardSuit[] = ['espada', 'basto', 'oro', 'copa'];
  const numbers = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  const deck: Card[] = [];

  suits.forEach(suit => {
    numbers.forEach(num => {
      const id = `${num}-${suit}`;
      deck.push({
        id,
        number: num,
        suit,
        value: CARD_VALUES[id] || 0,
      });
    });
  });

  return deck;
};

export const shuffle = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const calculateEnvido = (hand: Card[]): number => {
  const suits = hand.reduce((acc, card) => {
    acc[card.suit] = (acc[card.suit] || []).concat(card);
    return acc;
  }, {} as Record<CardSuit, Card[]>);

  let maxPoints = 0;

  Object.values(suits).forEach(suitCards => {
    if (suitCards.length >= 2) {
      // Sort by points (1-7 are face value, 10-12 are 0)
      const points = suitCards.map(c => (c.number < 10 ? c.number : 0)).sort((a, b) => b - a);
      const envido = 20 + points[0] + points[1];
      if (envido > maxPoints) maxPoints = envido;
    } else {
      const points = suitCards[0].number < 10 ? suitCards[0].number : 0;
      if (points > maxPoints) maxPoints = points;
    }
  });

  return maxPoints;
};

export const dealCards = (players: Player[]): Player[] => {
  const deck = shuffle(createDeck());
  return players.map((player, index) => ({
    ...player,
    hand: deck.slice(index * 3, (index + 1) * 3),
  }));
};
