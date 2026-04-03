import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Room, Player, GameState, Card } from '../types';
import { dealCards, createDeck, shuffle, calculateEnvido } from '../utils/truco';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const getNextTurn = (currentUid: string, turnOrder: string[]): string => {
  const idx = turnOrder.indexOf(currentUid);
  return turnOrder[(idx + 1) % turnOrder.length];
};

const evaluateHand = (currentHandCards: { uid: string; card: Card }[], players: Player[], gameState: GameState): {
  winnerTeam: 1 | 2 | null;
  winnerUid: string | null;
  isDraw: boolean;
} => {
  const maxPlayers = gameState.turnOrder.length;
  
  const team1Cards = currentHandCards.filter(c => {
    const player = players.find(p => p.uid === c.uid);
    return player?.team === 1;
  });
  const team2Cards = currentHandCards.filter(c => {
    const player = players.find(p => p.uid === c.uid);
    return player?.team === 2;
  });

  if (maxPlayers === 2) {
    if (currentHandCards.length < 2) return { winnerTeam: null, winnerUid: null, isDraw: false };
    
    const card1 = currentHandCards[0];
    const card2 = currentHandCards[1];
    
    if (card1.card.value > card2.card.value) {
      const winner = players.find(p => p.uid === card1.uid);
      return { winnerTeam: winner?.team || null, winnerUid: card1.uid, isDraw: false };
    } else if (card2.card.value > card1.card.value) {
      const winner = players.find(p => p.uid === card2.uid);
      return { winnerTeam: winner?.team || null, winnerUid: card2.uid, isDraw: false };
    } else {
      const dealer = players.find(p => p.uid === gameState.dealer);
      return { winnerTeam: dealer?.team || null, winnerUid: gameState.dealer, isDraw: true };
    }
  }

  if (team1Cards.length === 0 || team2Cards.length === 0) {
    const winningTeam = team1Cards.length > 0 ? 1 : 2;
    const winnerCard = winningTeam === 1 ? team1Cards[0] : team2Cards[0];
    return { winnerTeam: winningTeam, winnerUid: winnerCard.uid, isDraw: false };
  }

  const best1 = Math.max(...team1Cards.map(c => c.card.value));
  const best2 = Math.max(...team2Cards.map(c => c.card.value));

  if (best1 > best2) {
    const winnerCard = team1Cards.find(c => c.card.value === best1)!;
    return { winnerTeam: 1, winnerUid: winnerCard.uid, isDraw: false };
  } else if (best2 > best1) {
    const winnerCard = team2Cards.find(c => c.card.value === best2)!;
    return { winnerTeam: 2, winnerUid: winnerCard.uid, isDraw: false };
  } else {
    const dealer = players.find(p => p.isDealer);
    return { winnerTeam: dealer?.team || null, winnerUid: gameState.dealer, isDraw: true };
  }
};

const isHandComplete = (currentHandCards: { uid: string; card: Card; handIndex: number }[], maxPlayers: number): boolean => {
  const uniquePlayersInHand = new Set(currentHandCards.map(c => c.uid));
  return uniquePlayersInHand.size === maxPlayers;
};

export const createRoom = async (playerName: string, maxPlayers: 2 | 4 = 2) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const roomRef = doc(db, 'rooms', roomId);

  const initialPlayer: Player = {
    uid: user.uid,
    name: playerName,
    team: 1,
    hand: [],
    ready: false,
    isDealer: true
  };

  const room: Partial<Room> = {
    status: 'waiting',
    players: [initialPlayer],
    maxPlayers,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(roomRef, room);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }
  return roomId;
};

export const createCPURoom = async (playerName: string, maxPlayers: 2 | 4 = 2) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const roomId = `CPU-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const roomRef = doc(db, 'rooms', roomId);

  const initialPlayer: Player = {
    uid: user.uid,
    name: playerName,
    team: 1,
    hand: [],
    ready: false,
    isDealer: true
  };

  const players: Player[] = [initialPlayer];

  if (maxPlayers === 4) {
    players.push({
      uid: 'CPU_PLAYER_1',
      name: 'CPU Compañero',
      team: 1,
      hand: [],
      ready: true,
      isDealer: false,
      isCPU: true
    });
    players.push({
      uid: 'CPU_PLAYER_2',
      name: 'CPU Oponente 1',
      team: 2,
      hand: [],
      ready: true,
      isDealer: false,
      isCPU: true
    });
  }

  players.push({
    uid: maxPlayers === 4 ? 'CPU_PLAYER_3' : 'CPU_PLAYER',
    name: maxPlayers === 4 ? 'CPU Oponente 2' : 'CPU (Misionero)',
    team: 2,
    hand: [],
    ready: true,
    isDealer: false,
    isCPU: true
  });

  const room: Partial<Room> = {
    status: 'waiting',
    players,
    maxPlayers,
    isCPU: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(roomRef, room);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }
  return roomId;
};

export const joinRoom = async (roomId: string, playerName: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const roomRef = doc(db, 'rooms', roomId);
  let roomSnap;
  try {
    roomSnap = await getDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
  }

  if (!roomSnap?.exists()) throw new Error('Room not found');
  const roomData = roomSnap.data() as Room;

  if (roomData.players.length >= roomData.maxPlayers) throw new Error('Room full');
  if (roomData.players.find(p => p.uid === user.uid)) return;

  const team = roomData.players.length < 2 ? 1 : 2;
  const newPlayer: Player = {
    uid: user.uid,
    name: playerName,
    team,
    hand: [],
    ready: false,
    isDealer: false
  };

  try {
    await updateDoc(roomRef, {
      players: arrayUnion(newPlayer),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
  }
};

export const startGame = async (roomId: string) => {
  console.log('startGame: Starting game for room', roomId);
  const roomRef = doc(db, 'rooms', roomId);
  let roomSnap;
  try {
    roomSnap = await getDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
  }
  const roomData = roomSnap?.data() as Room;
  console.log('startGame: Room data:', roomData);

  const playersWithCards = dealCards(roomData.players);
  console.log('startGame: Players with cards:', playersWithCards);

  const dealer = roomData.players.find(p => p.isDealer)?.uid || roomData.players[0].uid;
  
  const playersInOrder = [...roomData.players];
  if (dealer !== playersInOrder[0].uid) {
    const dealerIndex = playersInOrder.findIndex(p => p.uid === dealer);
    playersInOrder.splice(0, 0, playersInOrder.splice(dealerIndex, 1)[0]);
  }
  const turnOrder = playersInOrder.map(p => p.uid);
  
  const firstPlayer = getNextTurn(dealer, turnOrder);
  console.log('startGame: Dealer:', dealer, 'Turn:', firstPlayer, 'Order:', turnOrder);

  const initialGameState: GameState = {
    turn: firstPlayer,
    turnOrder,
    dealer,
    score: { 1: 0, 2: 0 },
    roundScore: { 1: 0, 2: 0 },
    currentHand: 1,
    playedCards: [],
    trucoLevel: 1,
    envidoLevel: 0
  };

  try {
    for (const player of playersWithCards) {
      await setDoc(doc(db, 'rooms', roomId, 'hands', player.uid), {
        hand: player.hand,
        updatedAt: serverTimestamp()
      });
    }

    const playersWithoutHands = playersWithCards.map(p => ({ ...p, hand: [] }));
    
    const cpuHands: Record<string, Card[]> = {};
    if (roomData.isCPU) {
      playersWithCards.forEach(p => {
        if (p.isCPU && p.hand.length > 0) {
          cpuHands[p.uid] = p.hand;
        }
      });
    }

    await updateDoc(roomRef, {
      status: 'playing',
      players: playersWithoutHands,
      gameState: {
        ...initialGameState,
        cpuHand: cpuHands
      },
      updatedAt: serverTimestamp()
    });
    console.log('startGame: Room updated successfully');
  } catch (error) {
    console.error('startGame: Error updating room:', error);
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
  }
};

export const playCard = async (roomId: string, uid: string, card: Card) => {
  const roomRef = doc(db, 'rooms', roomId);
  let roomSnap;
  try {
    roomSnap = await getDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
  }
  const roomData = roomSnap?.data() as Room;
  const gameState = roomData.gameState!;

  if (gameState.turn !== uid || gameState.trucoChallenger || gameState.envidoChallenger) return;

  const player = roomData.players.find(p => p.uid === uid);
  if (player?.wentToMazo) return;

  const handRef = doc(db, 'rooms', roomId, 'hands', uid);
  const handSnap = await getDoc(handRef);
  const handData = handSnap.data() as { hand: Card[] };
  const newHand = handData.hand.map(c => c.id === card.id ? { ...c, played: true } : c);

  const newPlayedCards = [...gameState.playedCards, { uid, card, handIndex: gameState.currentHand }];
  
  const nextTurn = getNextTurn(uid, gameState.turnOrder);
  let nextGameState: any = { ...gameState, playedCards: newPlayedCards, turn: nextTurn };

  const currentHandCards = newPlayedCards.filter(p => p.handIndex === gameState.currentHand);
  const maxPlayers = gameState.turnOrder.length;

  if (isHandComplete(currentHandCards, maxPlayers)) {
    const evaluation = evaluateHand(currentHandCards, roomData.players, gameState);
    
    if (evaluation.winnerTeam) {
      nextGameState.roundScore[evaluation.winnerTeam]++;
    }
    
    nextGameState.turn = evaluation.winnerUid || nextTurn;
    
    if (nextGameState.roundScore[1] === 2 || nextGameState.roundScore[2] === 2) {
      const points = nextGameState.trucoLevel;
      const roundWinnerTeam = nextGameState.roundScore[1] === 2 ? 1 : 2;
      nextGameState.score = { ...gameState.score };
      nextGameState.score[roundWinnerTeam] += points;
      
      if (nextGameState.score[1] >= 15 || nextGameState.score[2] >= 15) {
        const gameWinner = nextGameState.score[1] >= 15 ? 1 : 2;
        await updateDoc(roomRef, {
          status: 'finished',
          'gameState.winner': gameWinner,
          'gameState.score': nextGameState.score,
          'gameState.roundScore': nextGameState.roundScore,
          updatedAt: serverTimestamp()
        });
        return;
      }

      const freshPlayers = dealCards(roomData.players);
      
      for (const p of freshPlayers) {
        await setDoc(doc(db, 'rooms', roomId, 'hands', p.uid), {
          hand: p.hand,
          updatedAt: serverTimestamp()
        });
      }

      const newDealer = roomData.players.find(p => p.uid !== gameState.dealer)?.uid || roomData.players[0].uid;
      let newTurnOrder = [...gameState.turnOrder];
      const dealerIdx = newTurnOrder.indexOf(gameState.dealer);
      newTurnOrder.splice(0, 0, newTurnOrder.splice(dealerIdx, 1)[0]);
      
      const newDealerIdx = newTurnOrder.indexOf(newDealer);
      newTurnOrder.splice(0, 0, newTurnOrder.splice(newDealerIdx, 1)[0]);

      const newFirstPlayer = getNextTurn(newDealer, newTurnOrder);

      const cpuHands: Record<string, Card[]> = {};
      if (roomData.isCPU) {
        freshPlayers.forEach(p => {
          if (p.isCPU && p.hand.length > 0) {
            cpuHands[p.uid] = p.hand;
          }
        });
      }

      await updateDoc(roomRef, {
        players: freshPlayers.map(p => ({ ...p, hand: [] })),
        gameState: {
          ...nextGameState,
          playedCards: [],
          roundScore: { 1: 0, 2: 0 },
          currentHand: 1,
          dealer: newDealer,
          turn: newFirstPlayer,
          turnOrder: newTurnOrder,
          trucoLevel: 1,
          envidoLevel: 0,
          cpuHand: cpuHands
        },
        updatedAt: serverTimestamp()
      });
      return;
    } else {
      nextGameState.currentHand = gameState.currentHand + 1;
    }
  }
  
  if (roomData.isCPU) {
    const cpuHands: Record<string, Card[]> = {};
    roomData.players.forEach(p => {
      if (p.isCPU && gameState.cpuHand && gameState.cpuHand[p.uid]) {
        cpuHands[p.uid] = gameState.cpuHand[p.uid];
      }
    });
    
    const player = roomData.players.find(p => p.uid === uid);
    if (player?.isCPU) {
      cpuHands[uid] = newHand;
    }
    
    if (Object.keys(cpuHands).length > 0) {
      nextGameState.cpuHand = cpuHands;
    }
  }

  try {
    await updateDoc(handRef, { hand: newHand, updatedAt: serverTimestamp() });
    await updateDoc(roomRef, {
      gameState: nextGameState,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
  }
};

export const callTruco = async (roomId: string, uid: string) => {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  const roomData = roomSnap.data() as Room;
  const gameState = roomData.gameState!;

  const isOpponentChallenged = gameState.trucoChallenger && gameState.trucoChallenger !== uid;
  if (!isOpponentChallenged && gameState.turn !== uid) return;
  if (gameState.trucoLevel >= 4) return;

  const nextLevel = gameState.trucoLevel === 1 ? 2 : gameState.trucoLevel + 1;
  
  const currentTurnIdx = gameState.turnOrder.indexOf(uid);
  let opponentIdx = (currentTurnIdx + 1) % gameState.turnOrder.length;
  while (gameState.turnOrder[opponentIdx] === uid || roomData.players.find(p => p.uid === gameState.turnOrder[opponentIdx])?.wentToMazo) {
    opponentIdx = (opponentIdx + 1) % gameState.turnOrder.length;
    if (opponentIdx === currentTurnIdx) break;
  }
  const opponent = gameState.turnOrder[opponentIdx];

  await updateDoc(roomRef, {
    'gameState.trucoLevel': nextLevel,
    'gameState.trucoChallenger': uid,
    'gameState.turn': opponent,
    'gameState.originalTurn': gameState.trucoLevel === 1 ? gameState.turn : (gameState.originalTurn || gameState.turn),
    updatedAt: serverTimestamp()
  });
};

export const callEnvido = async (roomId: string, uid: string, type: 'envido' | 'real' | 'falta' = 'envido') => {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  const roomData = roomSnap.data() as Room;
  const gameState = roomData.gameState!;

  if (gameState.currentHand !== 1) return;
  
  const currentTurnIdx = gameState.turnOrder.indexOf(uid);
  let opponentIdx = (currentTurnIdx + 1) % gameState.turnOrder.length;
  while (gameState.turnOrder[opponentIdx] === uid || roomData.players.find(p => p.uid === gameState.turnOrder[opponentIdx])?.wentToMazo) {
    opponentIdx = (opponentIdx + 1) % gameState.turnOrder.length;
    if (opponentIdx === currentTurnIdx) break;
  }
  const opponent = gameState.turnOrder[opponentIdx];

  let nextLevel = gameState.envidoLevel;
  
  if (type === 'envido') nextLevel += 2;
  else if (type === 'real') nextLevel += 3;
  else if (type === 'falta') nextLevel = 30;

  await updateDoc(roomRef, {
    'gameState.envidoLevel': nextLevel,
    'gameState.envidoChallenger': uid,
    'gameState.turn': opponent,
    'gameState.originalTurn': gameState.envidoLevel === 0 ? gameState.turn : (gameState.originalTurn || gameState.turn),
    updatedAt: serverTimestamp()
  });
};

export const respondTruco = async (roomId: string, uid: string, quiero: boolean) => {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  const roomData = roomSnap.data() as Room;
  const gameState = roomData.gameState!;

  if (gameState.turn !== uid || !gameState.trucoChallenger) return;
  const playerName = roomData.players.find(p => p.uid === uid)!.name;

  if (quiero) {
    await updateDoc(roomRef, {
      'gameState.trucoChallenger': null,
      'gameState.turn': gameState.originalTurn || gameState.trucoChallenger,
      'gameState.originalTurn': null,
      'gameState.actionMessage': { text: `${playerName} quiso el Truco!`, id: Date.now() },
      updatedAt: serverTimestamp()
    });
  } else {
    const winnerTeam = roomData.players.find(p => p.uid === gameState.trucoChallenger)!.team;
    const points = Math.max(1, gameState.trucoLevel - 1);
    
    const nextGameState: any = { ...gameState };
    nextGameState.score = { ...gameState.score };
    nextGameState.score[winnerTeam] += points;
    nextGameState.actionMessage = { text: `${playerName} no quiso!`, id: Date.now() };
    
    await updateRoundEnd(roomId, roomData, nextGameState);
  }
};

const updateRoundEnd = async (roomId: string, roomData: Room, nextGameState: any) => {
  const roomRef = doc(db, 'rooms', roomId);
  
  if (nextGameState.score[1] >= 15 || nextGameState.score[2] >= 15) {
    const gameWinner = nextGameState.score[1] >= 15 ? 1 : 2;
    await updateDoc(roomRef, {
      status: 'finished',
      'gameState.winner': gameWinner,
      'gameState.score': nextGameState.score,
      'gameState.roundScore': nextGameState.roundScore,
      updatedAt: serverTimestamp()
    });
    return;
  }

  const freshPlayers = dealCards(roomData.players);
  for (const p of freshPlayers) {
    await setDoc(doc(db, 'rooms', roomId, 'hands', p.uid), {
      hand: p.hand,
      updatedAt: serverTimestamp()
    });
  }

  const newDealer = roomData.players.find(p => p.uid !== gameState?.dealer)?.uid || roomData.players[0].uid;
  let newTurnOrder = [...(gameState?.turnOrder || roomData.players.map(p => p.uid))];
  const dealerIdx = newTurnOrder.indexOf(gameState?.dealer || roomData.players[0].uid);
  if (dealerIdx > 0) {
    newTurnOrder.splice(0, 0, newTurnOrder.splice(dealerIdx, 1)[0]);
  }
  
  const newDealerIdx = newTurnOrder.indexOf(newDealer);
  if (newDealerIdx > 0) {
    newTurnOrder.splice(0, 0, newTurnOrder.splice(newDealerIdx, 1)[0]);
  }

  const newFirstPlayer = getNextTurn(newDealer, newTurnOrder);

  const cpuHands: Record<string, Card[]> = {};
  if (roomData.isCPU) {
    freshPlayers.forEach(p => {
      if (p.isCPU && p.hand.length > 0) {
        cpuHands[p.uid] = p.hand;
      }
    });
  }

  await updateDoc(roomRef, {
    players: freshPlayers.map(p => ({ ...p, hand: [] })),
    gameState: {
      ...nextGameState,
      playedCards: [],
      roundScore: { 1: 0, 2: 0 },
      currentHand: 1,
      dealer: newDealer,
      turn: newFirstPlayer,
      turnOrder: newTurnOrder,
      trucoLevel: 1,
      envidoLevel: 0,
      trucoChallenger: null,
      envidoChallenger: null,
      originalTurn: null,
      cpuHand: cpuHands
    },
    updatedAt: serverTimestamp()
  });
};

export const respondEnvido = async (roomId: string, uid: string, quiero: boolean) => {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  const roomData = roomSnap.data() as Room;
  const gameState = roomData.gameState!;

  if (gameState.turn !== uid || !gameState.envidoChallenger) return;

  if (quiero) {
    const env1 = calculateEnvido(roomData.players.filter(p => p.team === 1).flatMap(p => {
      return (roomData.gameState?.cpuHand?.[p.uid] || []);
    }));
    const env2 = calculateEnvido(roomData.players.filter(p => p.team === 2).flatMap(p => {
      return (roomData.gameState?.cpuHand?.[p.uid] || []);
    }));

    const team1Players = roomData.players.filter(p => p.team === 1);
    const team2Players = roomData.players.filter(p => p.team === 2);
    
    let team1Envido = 0;
    let team2Envido = 0;

    for (const p of team1Players) {
      const handSnap = await getDoc(doc(db, 'rooms', roomId, 'hands', p.uid));
      const handData = handSnap.data() as { hand: Card[] };
      const env = calculateEnvido(handData.hand);
      if (env > team1Envido) team1Envido = env;
    }

    for (const p of team2Players) {
      const handSnap = await getDoc(doc(db, 'rooms', roomId, 'hands', p.uid));
      const handData = handSnap.data() as { hand: Card[] };
      const env = calculateEnvido(handData.hand);
      if (env > team2Envido) team2Envido = env;
    }
    
    let winnerTeam: 1 | 2;
    if (team1Envido > team2Envido) winnerTeam = 1;
    else if (team2Envido > team1Envido) winnerTeam = 2;
    else winnerTeam = roomData.players.find(p => p.uid !== gameState.dealer)?.team as 1 | 2;

    const points = gameState.envidoLevel;
    const nextGameState = { ...gameState };
    nextGameState.score = { ...gameState.score };
    nextGameState.score[winnerTeam] += points;
    nextGameState.envidoWinner = winnerTeam;
    nextGameState.envidoPoints = Math.max(team1Envido, team2Envido);
    nextGameState.envidoChallenger = null;
    nextGameState.turn = gameState.originalTurn || gameState.envidoChallenger;
    nextGameState.originalTurn = null;

    await updateDoc(roomRef, {
      gameState: nextGameState,
      updatedAt: serverTimestamp()
    });
  } else {
    const winnerTeam = roomData.players.find(p => p.uid === gameState.envidoChallenger)!.team;
    const nextGameState = { ...gameState };
    nextGameState.score = { ...gameState.score };
    nextGameState.score[winnerTeam] += 1;
    nextGameState.envidoChallenger = null;
    nextGameState.turn = gameState.originalTurn || gameState.envidoChallenger;
    nextGameState.originalTurn = null;

    await updateDoc(roomRef, {
      gameState: nextGameState,
      updatedAt: serverTimestamp()
    });
  }
};

export const irAlMazo = async (roomId: string, uid: string) => {
  const roomRef = doc(db, 'rooms', roomId);
  let roomSnap;
  try {
    roomSnap = await getDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
  }
  const roomData = roomSnap?.data() as Room;
  const gameState = roomData.gameState!;

  if (gameState.turn !== uid) return;

  const player = roomData.players.find(p => p.uid === uid)!;
  const opponentTeam = player.team === 1 ? 2 : 1;
  const winnerTeam = opponentTeam;

  const nextGameState: any = {
    ...gameState,
    turn: getNextTurn(uid, gameState.turnOrder),
    actionMessage: { text: `${player.name} se fue al mazo`, id: Date.now() }
  };

  const currentHandCards = gameState.playedCards.filter(p => p.handIndex === gameState.currentHand);

  if (isHandComplete(currentHandCards, gameState.turnOrder.length)) {
    nextGameState.roundScore = { ...gameState.roundScore };
    nextGameState.roundScore[winnerTeam]++;
  } else {
    nextGameState.roundScore = { ...gameState.roundScore, [winnerTeam]: gameState.roundScore[winnerTeam] + 1 };
  }

  if (nextGameState.roundScore[1] === 2 || nextGameState.roundScore[2] === 2) {
    const points = nextGameState.trucoLevel;
    const roundWinnerTeam = nextGameState.roundScore[1] === 2 ? 1 : 2;
    nextGameState.score = { ...gameState.score };
    nextGameState.score[roundWinnerTeam] += points;
    
    await updateRoundEnd(roomId, roomData, nextGameState);
    return;
  }

  nextGameState.currentHand = gameState.currentHand + 1;

  try {
    await updateDoc(roomRef, {
      gameState: nextGameState,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
  }
};
