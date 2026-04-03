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

export const createRoom = async (playerName: string) => {
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

export const createCPURoom = async (playerName: string) => {
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

  const cpuPlayer: Player = {
    uid: 'CPU_PLAYER',
    name: 'CPU (Misionero)',
    team: 2,
    hand: [],
    ready: true,
    isDealer: false,
    isCPU: true
  };

  const room: Partial<Room> = {
    status: 'waiting',
    players: [initialPlayer, cpuPlayer],
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

  if (roomData.players.length >= 2) throw new Error('Room full');
  if (roomData.players.find(p => p.uid === user.uid)) return;

  const newPlayer: Player = {
    uid: user.uid,
    name: playerName,
    team: 2,
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
  const turn = roomData.players.find(p => p.uid !== dealer)?.uid || roomData.players[0].uid;
  console.log('startGame: Dealer:', dealer, 'Turn:', turn);

  const initialGameState: GameState = {
    turn,
    dealer,
    score: { 1: 0, 2: 0 },
    roundScore: { 1: 0, 2: 0 },
    currentHand: 1,
    playedCards: [],
    trucoLevel: 1,
    envidoLevel: 0
  };

  try {
    // Store hands in subcollection
    for (const player of playersWithCards) {
      console.log('startGame: Setting hand for player', player.uid);
      await setDoc(doc(db, 'rooms', roomId, 'hands', player.uid), {
        hand: player.hand,
        updatedAt: serverTimestamp()
      });
      console.log('startGame: Hand set for player', player.uid);
    }

    // Update room status and players (without hands)
    const playersWithoutHands = playersWithCards.map(p => ({ ...p, hand: [] }));
    console.log('startGame: Updating room status to playing');
    await updateDoc(roomRef, {
      status: 'playing',
      players: playersWithoutHands,
      gameState: initialGameState,
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

  // Get hand from subcollection
  const handRef = doc(db, 'rooms', roomId, 'hands', uid);
  const handSnap = await getDoc(handRef);
  const handData = handSnap.data() as { hand: Card[] };
  const newHand = handData.hand.map(c => c.id === card.id ? { ...c, played: true } : c);

  const newPlayedCards = [...gameState.playedCards, { uid, card, handIndex: gameState.currentHand }];
  
  let nextTurn = roomData.players.find(p => p.uid !== uid)!.uid;
  let nextGameState = { ...gameState, playedCards: newPlayedCards, turn: nextTurn };

  const currentHandCards = newPlayedCards.filter(p => p.handIndex === gameState.currentHand);

  if (currentHandCards.length === 2) {
    const card1 = currentHandCards[0];
    const card2 = currentHandCards[1];
    
    let winnerUid = '';
    if (card1.card.value > card2.card.value) winnerUid = card1.uid;
    else if (card2.card.value > card1.card.value) winnerUid = card2.uid;
    else winnerUid = gameState.dealer;

    const winnerPlayer = roomData.players.find(p => p.uid === winnerUid)!;
    const team = winnerPlayer.team;
    
    nextGameState.roundScore[team]++;
    nextGameState.turn = winnerUid;
    
    if (nextGameState.roundScore[1] === 2 || nextGameState.roundScore[2] === 2) {
      const points = nextGameState.trucoLevel;
      const roundWinnerTeam = nextGameState.roundScore[1] === 2 ? 1 : 2;
      nextGameState.score[roundWinnerTeam] += points;
      
      if (nextGameState.score[1] >= 15 || nextGameState.score[2] >= 15) {
        const gameWinner = nextGameState.score[1] >= 15 ? 1 : 2;
        await updateDoc(roomRef, {
          status: 'finished',
          'gameState.winner': gameWinner,
          'gameState.score': nextGameState.score,
          updatedAt: serverTimestamp()
        });
        return;
      }

      const freshPlayers = dealCards(roomData.players);
      
      // Store new hands
      for (const player of freshPlayers) {
        await setDoc(doc(db, 'rooms', roomId, 'hands', player.uid), {
          hand: player.hand,
          updatedAt: serverTimestamp()
        });
      }

      const newDealer = roomData.players.find(p => p.uid !== gameState.dealer)!.uid;
      const newTurn = roomData.players.find(p => p.uid !== newDealer)!.uid;
      
      nextGameState = {
        ...nextGameState,
        playedCards: [],
        roundScore: { 1: 0, 2: 0 },
        currentHand: 1,
        dealer: newDealer,
        turn: newTurn,
        trucoLevel: 1,
        envidoLevel: 0
      };
      
      try {
        await updateDoc(roomRef, {
          players: freshPlayers.map(p => ({ ...p, hand: [] })),
          gameState: nextGameState,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
      }
      return;
    } else {
      // Not the end of the round, just current hand finished.
      // We keep playedCards as is (it now contains history) and increment currentHand
      nextGameState.currentHand++;
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

  // Allow calling if it's your turn OR you're the one being challenged (for Re-truco)
  const isOpponentChallenged = gameState.trucoChallenger && gameState.trucoChallenger !== uid;
  if (!isOpponentChallenged && gameState.turn !== uid) return;
  if (gameState.trucoLevel >= 4) return;

  const nextLevel = gameState.trucoLevel === 1 ? 2 : gameState.trucoLevel + 1;
  const opponent = roomData.players.find(p => p.uid !== uid)!.uid;

  await updateDoc(roomRef, {
    'gameState.trucoLevel': nextLevel,
    'gameState.trucoChallenger': uid,
    'gameState.turn': opponent,
    // Only set originalTurn if it's the very first call in the chain
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
  
  const opponent = roomData.players.find(p => p.uid !== uid)!.uid;
  let nextLevel = gameState.envidoLevel;
  
  if (type === 'envido') nextLevel += 2;
  else if (type === 'real') nextLevel += 3;
  else if (type === 'falta') nextLevel = 30; // Max points for now

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

  if (quiero) {
    await updateDoc(roomRef, {
      'gameState.trucoChallenger': null,
      'gameState.turn': gameState.originalTurn || gameState.trucoChallenger,
      'gameState.originalTurn': null,
      updatedAt: serverTimestamp()
    });
  } else {
    // No quiero: challenger wins round with current points - 1 (min 1)
    const winnerTeam = roomData.players.find(p => p.uid === gameState.trucoChallenger)!.team;
    const points = Math.max(1, gameState.trucoLevel - 1);
    
    const nextGameState = { ...gameState };
    nextGameState.score[winnerTeam] += points;
    
    // Reset round
    const freshPlayers = dealCards(roomData.players);
    for (const player of freshPlayers) {
      await setDoc(doc(db, 'rooms', roomId, 'hands', player.uid), {
        hand: player.hand,
        updatedAt: serverTimestamp()
      });
    }

    const newDealer = roomData.players.find(p => p.uid !== gameState.dealer)!.uid;
    const newTurn = roomData.players.find(p => p.uid !== newDealer)!.uid;

    await updateDoc(roomRef, {
      players: freshPlayers.map(p => ({ ...p, hand: [] })),
      gameState: {
        ...nextGameState,
        playedCards: [],
        roundScore: { 1: 0, 2: 0 },
        currentHand: 1,
        dealer: newDealer,
        turn: newTurn,
        trucoLevel: 1,
        envidoLevel: 0,
        trucoChallenger: null,
        originalTurn: null
      },
      updatedAt: serverTimestamp()
    });
  }
};

export const respondEnvido = async (roomId: string, uid: string, quiero: boolean) => {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  const roomData = roomSnap.data() as Room;
  const gameState = roomData.gameState!;

  if (gameState.turn !== uid || !gameState.envidoChallenger) return;

  if (quiero) {
    const p1 = roomData.players[0];
    const p2 = roomData.players[1];
    const h1Snap = await getDoc(doc(db, 'rooms', roomId, 'hands', p1.uid));
    const h2Snap = await getDoc(doc(db, 'rooms', roomId, 'hands', p2.uid));
    const h1 = h1Snap.data() as { hand: Card[] };
    const h2 = h2Snap.data() as { hand: Card[] };

    const env1 = calculateEnvido(h1.hand);
    const env2 = calculateEnvido(h2.hand);
    
    let winnerTeam: 1 | 2;
    if (env1 > env2) winnerTeam = 1;
    else if (env2 > env1) winnerTeam = 2;
    else winnerTeam = roomData.players.find(p => p.uid !== gameState.dealer)!.team;

    const points = gameState.envidoLevel;
    const nextGameState = { ...gameState };
    nextGameState.score[winn