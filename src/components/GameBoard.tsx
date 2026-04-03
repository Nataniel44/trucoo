import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onSnapshot, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Card as CardType, Player, Room, GameState } from '../types';
import { playCard, callTruco, callEnvido, respondTruco, respondEnvido, irAlMazo } from '../services/gameService';
import { calculateEnvido } from '../utils/truco';
import { Trophy, User, Share2, Settings, HelpCircle, Gavel, Gauge, Layers3 } from 'lucide-react';

interface GameBoardProps {
  room: Room;
  onLeave: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({ room, onLeave }) => {
  const user = auth.currentUser;
  const me = room.players.find(p => p.uid === user?.uid);
  const gameState = room.gameState!;
  const isFourPlayers = room.maxPlayers === 4;

  useEffect(() => {
    console.log('GameBoard mounted, room.isCPU:', room.isCPU, 'gameState.turn:', gameState.turn, 'cpuHand:', gameState.cpuHand);
  }, []);

  const [myHand, setMyHand] = useState<CardType[]>([]);
  const [cpuHands, setCpuHands] = useState<Record<string, CardType[]>>({});

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'rooms', room.id, 'hands', user.uid), (doc) => {
      if (doc.exists()) {
        setMyHand(doc.data().hand);
      }
    }, (error) => {
      console.error('Firestore Error in GameBoard (hands):', error);
    });
    return () => unsubscribe();
  }, [room.id, user?.uid]);

  useEffect(() => {
    if (room.isCPU && gameState.cpuHand) {
      setCpuHands(gameState.cpuHand);
    }
  }, [room.isCPU, gameState.cpuHand]);

  const cpuTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastCpuStateId = React.useRef<string | null>(null);

  useEffect(() => {
    if (!room.isCPU) {
      console.log('CPU Effect: not CPU room');
      return;
    }

    const currentTurn = gameState.turn;
    const currentHand = gameState.currentHand;
    const playedCount = gameState.playedCards.length;
    const currentCpuHand = gameState.cpuHand;
    const currentTrucoChallenger = gameState.trucoChallenger;
    const currentEnvidoChallenger = gameState.envidoChallenger;
    const currentEnvidoLevel = gameState.envidoLevel;
    const currentTrucoLevel = gameState.trucoLevel;
    const currentPlayedCards = gameState.playedCards;
    const roomStatus = room.status;
    const gameWinner = gameState.winner;

    console.log('CPU Effect triggered:', { currentTurn, currentCpuHand, roomStatus, gameWinner });

    const cpuPlayer = room.players.find(p => 
      p.isCPU && 
      p.uid === currentTurn && 
      roomStatus === 'playing' && 
      !gameWinner
    );

    console.log('CPU Effect: cpuPlayer found:', cpuPlayer?.uid);

    if (!cpuPlayer) {
      console.log('CPU Effect: no CPU to move');
      if (cpuTimeoutRef.current) {
        clearTimeout(cpuTimeoutRef.current);
        cpuTimeoutRef.current = null;
      }
      lastCpuStateId.current = null;
      return;
    }

    const stateId = `${currentTurn}-${currentHand}-${playedCount}-${currentCpuHand ? 'hasCpuHand' : 'noCpuHand'}`;
    
    if (cpuTimeoutRef.current) {
      console.log('CPU Effect: Clearing existing timeout');
      clearTimeout(cpuTimeoutRef.current);
      cpuTimeoutRef.current = null;
    }
    
    const capturedStateId = stateId;
    lastCpuStateId.current = stateId;

cpuTimeoutRef.current = setTimeout(async () => {
      console.log('CPU Timeout executing for:', cpuPlayer.uid, 'stateId:', capturedStateId);
      if (lastCpuStateId.current !== capturedStateId) {
        console.log('CPU Timeout: stateId mismatch, clearing');
        lastCpuStateId.current = null;
        cpuTimeoutRef.current = null;
        return;
      }
      if (!currentCpuHand) {
        console.log('CPU Timeout: no cpuHand');
        return;
      }
      if (!currentCpuHand) {
        console.log('CPU Timeout: no cpuHand');
        return;
      }

      try {
        const cpuHand = currentCpuHand[cpuPlayer.uid] || [];
        console.log('CPU Timeout: cpuHand:', cpuHand);
        const availableCards = cpuHand.filter((c: CardType) => !c.played);
        console.log('CPU Timeout: availableCards:', availableCards, 'length:', availableCards.length);
        if (availableCards.length === 0) {
          lastCpuStateId.current = null;
          return;
        }

        const cpuIsTrucoChallenged = !!currentTrucoChallenger && currentTrucoChallenger !== cpuPlayer.uid;
        const cpuIsEnvidoChallenged = !!currentEnvidoChallenger && currentEnvidoChallenger !== cpuPlayer.uid;

        if (cpuIsTrucoChallenged) {
          const hasGoodCard = availableCards.some((c: CardType) => c.value >= 12);
          const shouldAccept = hasGoodCard || Math.random() > 0.4;
          await respondTruco(room.id, cpuPlayer.uid, shouldAccept);
          return;
        }

        if (cpuIsEnvidoChallenged) {
          const envidoPoints = calculateEnvido(cpuHand);
          const shouldAccept = envidoPoints >= 25 || Math.random() > 0.7;
          await respondEnvido(room.id, cpuPlayer.uid, shouldAccept);
          return;
        }

        if (currentHand === 1 && currentEnvidoLevel === 0 && !currentEnvidoChallenger && Math.random() > 0.85) {
          const envidoPoints = calculateEnvido(cpuHand);
          if (envidoPoints >= 28) {
            await callEnvido(room.id, cpuPlayer.uid);
            return;
          }
        }

        if (currentTrucoLevel === 1 && !currentTrucoChallenger && Math.random() > 0.9) {
          const hasKillerCard = availableCards.some((c: CardType) => c.value >= 13);
          if (hasKillerCard) {
            await callTruco(room.id, cpuPlayer.uid);
            return;
          }
        }

        const handPlayedCards = currentPlayedCards.filter(p => p.handIndex === currentHand);
        const opponentCard = handPlayedCards.find(p => p.uid !== cpuPlayer.uid)?.card;

        let cardToPlay: CardType;
        if (opponentCard) {
          const winningCards = availableCards.filter((c: CardType) => c.value > opponentCard.value).sort((a: CardType, b: CardType) => a.value - b.value);
          cardToPlay = winningCards.length > 0 ? winningCards[0] : availableCards.sort((a: CardType, b: CardType) => a.value - b.value)[0];
        } else {
          cardToPlay = availableCards.sort((a: CardType, b: CardType) => a.value - b.value)[Math.floor(availableCards.length / 2)];
        }
        
        console.log('CPU Timeout: playing card:', cardToPlay);
        await playCard(room.id, cpuPlayer.uid, cardToPlay);
        console.log('CPU Timeout: card played successfully');
        lastCpuStateId.current = null;
        cpuTimeoutRef.current = null;
      } catch (err) {
        console.error("CPU Move Error:", err);
        lastCpuStateId.current = null;
        cpuTimeoutRef.current = null;
      }
    }, 1500);

    return () => {
      if (cpuTimeoutRef.current) clearTimeout(cpuTimeoutRef.current);
    };
  }, [gameState.turn, gameState.currentHand, gameState.playedCards.length, gameState.trucoChallenger, gameState.envidoChallenger, gameState.envidoLevel, gameState.trucoLevel, room.status, gameState.winner, gameState.cpuHand, room.isCPU, room.id]);

  useEffect(() => {
    return () => {
      if (cpuTimeoutRef.current) clearTimeout(cpuTimeoutRef.current);
    };
  }, []);

  const isMyTurn = gameState.turn === user?.uid;
  const isTrucoChallenged = gameState.trucoChallenger && gameState.trucoChallenger !== user?.uid;
  const isEnvidoChallenged = gameState.envidoChallenger && gameState.envidoChallenger !== user?.uid;

  const suitEmojis: Record<string, string> = {
    espada: '⚔️',
    basto: '♣️',
    oro: '💰',
    copa: '🍷'
  };

  const [message, setMessage] = useState('');
  const [showMazoConfirm, setShowMazoConfirm] = useState(false);

  useEffect(() => {
    if (gameState.playedCards.length === 0 && gameState.currentHand > 1) {
      setMessage(`Mano ${gameState.currentHand - 1} finalizada`);
      const timer = setTimeout(() => setMessage(''), 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentHand]);

  useEffect(() => {
    if (gameState.roundScore[1] === 2 || gameState.roundScore[2] === 2) {
      const winnerTeam = gameState.roundScore[1] === 2 ? 1 : 2;
      const winnerName = room.players.find(p => p.team === winnerTeam)?.name;
      setMessage(`Equipo ${winnerName} gano la ronda!`);
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.roundScore]);

  useEffect(() => {
    if (gameState.envidoWinner) {
      const winnerName = room.players.find(p => p.team === gameState.envidoWinner)?.name;
      setMessage(`Equipo ${winnerName} gano el Envido con ${gameState.envidoPoints} puntos!`);
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.envidoWinner]);

  useEffect(() => {
    if (gameState.actionMessage) {
      setMessage(gameState.actionMessage.text);
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.actionMessage?.id]);

  useEffect(() => {
    if (showMazoConfirm) {
      setShowMazoConfirm(false);
    }
  }, [gameState.turn]);

  const handlePlayCard = async (card: CardType) => {
    if (!isMyTurn || !!gameState.trucoChallenger || !!gameState.envidoChallenger) return;
    await playCard(room.id, user!.uid, card);
  };

  const handleTruco = async () => {
    const isOpponentChallenged = gameState.trucoChallenger && gameState.trucoChallenger !== user?.uid;
    if (!isMyTurn && !isOpponentChallenged) return;
    if (gameState.trucoLevel >= 4) return;
    await callTruco(room.id, user!.uid);
  };

  const handleEnvido = async (type: 'envido' | 'real' | 'falta' = 'envido') => {
    if (gameState.currentHand !== 1) return;
    await callEnvido(room.id, user!.uid, type);
  };

  const handleRespondTruco = async (quiero: boolean) => {
    await respondTruco(room.id, user!.uid, quiero);
  };

  const handleRespondEnvido = async (quiero: boolean) => {
    await respondEnvido(room.id, user!.uid, quiero);
  };

  const handleIrAlMazo = async () => {
    await irAlMazo(room.id, user!.uid);
  };

  const getPlayerPosition = (player: Player): number => {
    const turnIndex = gameState.turnOrder.indexOf(user?.uid || '');
    const playerIndex = gameState.turnOrder.indexOf(player.uid);
    return (playerIndex - turnIndex + gameState.turnOrder.length) % gameState.turnOrder.length;
  };

  const getCardValue = (card: CardType) => {
    return (
      <div className="w-full flex flex-col items-center">
        <span className={`text-2xl font-black font-headline leading-none ${['espada', 'basto'].includes(card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
          {card.number}
        </span>
        <span className="text-3xl filter drop-shadow-sm">{suitEmojis[card.suit]}</span>
      </div>
    );
  };

  const renderPlayerArea = (player: Player, position: number) => {
    const isMe = player.uid === user?.uid;
    const isMyTurnThis = gameState.turn === player.uid;
    const cpuHand = cpuHands[player.uid] || [];
    const playedCards = gameState.playedCards.filter(p => p.uid === player.uid);
    const teammate = room.players.find(p => p.team === player.team && p.uid !== player.uid);
    const isTeammate = teammate && teammate.uid === player.uid;

    return (
      <div 
        key={player.uid}
        className={`absolute flex flex-col items-center gap-2 transition-all ${
          position === 0 ? 'bottom-4 left-1/2 -translate-x-1/2' :
          position === 1 ? 'left-4 top-1/2 -translate-y-1/2' :
          position === 2 ? 'top-4 left-1/2 -translate-x-1/2' :
          'right-4 top-1/2 -translate-y-1/2'
        }`}
      >
        <div className={`relative flex flex-col items-center ${position === 0 || position === 2 ? '' : 'flex-row'}`}>
          <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-black text-lg ${
            isMyTurnThis ? 'border-yellow-400 bg-yellow-400/20 animate-pulse' : 'border-white/20 bg-white/10'
          } ${player.team === 1 ? 'text-emerald-400' : 'text-blue-400'}`}>
            {player.isCPU ? '🤖' : player.name[0].toUpperCase()}
          </div>
          <span className={`text-xs font-bold mt-1 ${player.team === 1 ? 'text-emerald-400' : 'text-blue-400'}`}>
            {player.name.length > 8 ? player.name.substring(0, 8) + '...' : player.name}
          </span>
          {isFourPlayers && teammate && (
            <span className="text-[10px] text-white/40">({isTeammate ? 'Companero' : 'Oponente'})</span>
          )}
        </div>
        
        {isMe ? (
          <div className="flex gap-2">
            {myHand.map((card) => (
              <motion.button
                key={card.id}
                whileHover={!card.played ? { y: -15, scale: 1.05 } : {}}
                whileTap={!card.played ? { scale: 0.95 } : {}}
                onClick={() => handlePlayCard(card)}
                disabled={!isMyTurn || !!card.played}
                className={`w-20 h-32 bg-white rounded-xl shadow-xl flex flex-col items-center justify-center p-2 border-2 transition-all ${
                  isMyTurn && !card.played ? 'border-yellow-400 cursor-pointer' : 'border-transparent opacity-50 grayscale cursor-not-allowed'
                }`}
              >
                {getCardValue(card)}
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="flex gap-1">
            {playedCards.map((played) => (
              <div key={played.card.id} className="w-12 h-16 bg-white rounded-lg shadow-lg flex items-center justify-center">
                <span className={`text-sm font-black ${['espada', 'basto'].includes(played.card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                  {played.card.number}
                </span>
              </div>
            ))}
            {!player.wentToMazo && cpuHand.filter(c => !c.played).length > 0 && (
              <div className="flex gap-1">
                {cpuHand.filter(c => !c.played).slice(0, 3 - playedCards.length).map((card, i) => (
                  <div key={`hidden-${i}`} className="w-12 h-16 bg-emerald-800 rounded-lg shadow flex items-center justify-center">
                    <span className="text-white/50 text-xs font-bold">?</span>
                  </div>
                ))}
              </div>
            )}
            {player.wentToMazo && (
              <div className="w-12 h-16 bg-red-900/50 rounded-lg shadow flex items-center justify-center">
                <span className="text-red-400 text-xs font-bold">MAZO</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (room.status === 'finished') {
    const winner = room.players.find(p => p.team === gameState.winner);
    return (
      <div className="min-h-screen bg-emerald-950 flex flex-col items-center justify-center p-4 text-white">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md bg-white/10 backdrop-blur-xl p-12 rounded-3xl border border-white/10 text-center shadow-2xl"
        >
          <div className="w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-yellow-400/20">
            <Trophy size={48} className="text-emerald-900" />
          </div>
          <h1 className="text-5xl font-black mb-2 tracking-tighter">GAME OVER</h1>
          <p className="text-emerald-400 font-bold uppercase tracking-widest mb-8">
            Equipo {winner?.name} Gano!
          </p>
          <div className="bg-black/20 p-6 rounded-2xl mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-emerald-400 font-bold">Equipo 1</span>
              <span className="text-3xl font-black">{gameState.score[1]}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-blue-400 font-bold">Equipo 2</span>
              <span className="text-3xl font-black">{gameState.score[2]}</span>
            </div>
          </div>
          <button
            onClick={onLeave}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-xl"
          >
            Back to Lobby
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jungle-table text-on-background overflow-hidden relative">
      <header className="fixed top-0 w-full z-50 bg-stone-900/60 backdrop-blur-xl shadow-2xl shadow-black/20 flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-orange-200 font-headline uppercase tracking-tighter">Truco</span>
        </div>
        <div className="flex items-center gap-6 bg-surface-container-high/40 px-6 py-2 rounded-full border border-outline-variant/20 backdrop-blur-md">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest leading-none">Equipo 1</span>
            <span className="text-2xl font-black font-headline text-emerald-400">{gameState.score[1]}</span>
          </div>
          <div className="h-8 w-px bg-outline-variant/30"></div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest leading-none">Equipo 2</span>
            <span className="text-2xl font-black font-headline text-blue-400">{gameState.score[2]}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={copyRoomId} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-orange-200">
            <Share2 size={20} />
          </button>
        </div>
      </header>

      <main className="w-full h-screen pt-20 pb-8 flex items-center justify-center relative">
        {message && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-1/3 bg-white/90 text-emerald-900 px-6 py-2 rounded-full font-black shadow-2xl z-30"
          >
            {message}
          </motion.div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-48 h-48 rounded-full border-4 border-dashed border-white/10 flex items-center justify-center">
            <div className="text-center">
              <div className="text-white/30 text-4xl font-black">{gameState.roundScore[1]}</div>
              <div className="text-white/20 text-2xl">-</div>
              <div className="text-white/30 text-4xl font-black">{gameState.roundScore[2]}</div>
              <div className="text-white/40 text-xs mt-2">Mano {gameState.currentHand}</div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {gameState.playedCards.filter(p => p.handIndex === gameState.currentHand).map((played, idx) => (
            <motion.div
              key={`${played.card.id}-${played.handIndex}-${idx}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute w-20 h-28 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-center border-2 border-stone-200"
            >
              <span className={`text-xl font-black ${['espada', 'basto'].includes(played.card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                {played.card.number}
              </span>
              <span className="text-2xl">{suitEmojis[played.card.suit]}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {room.players.map((player) => {
          const position = isFourPlayers ? getPlayerPosition(player) : (player.uid === user?.uid ? 0 : 2);
          return renderPlayerArea(player, position);
        })}
      </main>

      <div className="fixed right-8 bottom-32 flex flex-col gap-3 z-40">
        <button
          onClick={handleTruco}
          disabled={!isMyTurn || !!gameState.trucoChallenger || gameState.trucoLevel >= 4 || !!gameState.envidoChallenger}
          className="w-20 h-20 rounded-full bg-stone-900 border-2 border-orange-200/20 text-orange-200 shadow-xl flex flex-col items-center justify-center font-black font-headline text-[10px] uppercase transition-all hover:scale-110 active:scale-95 disabled:opacity-30 disabled:grayscale"
        >
          <Gavel size={24} className="mb-1" />
          {gameState.trucoLevel === 1 ? 'Truco' : gameState.trucoLevel === 2 ? 'Re-Truco' : 'Vale 4'}
        </button>
        <button
          onClick={() => handleEnvido('envido')}
          disabled={!isMyTurn || !!gameState.envidoChallenger || gameState.currentHand !== 1 || !!gameState.trucoChallenger || gameState.envidoLevel > 0}
          className="w-20 h-20 rounded-full bg-stone-900 border-2 border-orange-200/20 text-orange-200 shadow-xl flex flex-col items-center justify-center font-black font-headline text-[10px] uppercase transition-all hover:scale-110 active:scale-95 disabled:opacity-30 disabled:grayscale"
        >
          <Gauge size={24} className="mb-1" />
          Envido
        </button>
        <button
          onClick={() => setShowMazoConfirm(true)}
          disabled={!isMyTurn || !!gameState.trucoChallenger || !!gameState.envidoChallenger}
          className="w-20 h-20 rounded-full bg-stone-900 border-2 border-red-500/20 text-red-400 shadow-xl flex flex-col items-center justify-center font-black font-headline text-[10px] uppercase transition-all hover:scale-110 active:scale-95 disabled:opacity-30 disabled:grayscale"
        >
          <Layers3 size={24} className="mb-1" />
          Mazo
        </button>
      </div>

      {renderChallenges()}
      {renderMazoModal()}
    </div>
  );

  function renderChallenges() {
    if (!isMyTurn) return null;

    if (isTrucoChallenged) {
      const trucoStakes: Record<number, string> = { 2: 'Truco', 3: 'Re-Truco', 4: 'Vale Cuatro' };
      const currentLabel = trucoStakes[gameState.trucoLevel] || 'Truco';
      const nextLabel = trucoStakes[gameState.trucoLevel + 1];

      return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-stone-900 border-2 border-orange-200/20 p-8 rounded-3xl text-center shadow-2xl max-w-sm w-full"
          >
            <Gavel className="mx-auto mb-4 text-orange-200" size={48} />
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Te cantaron {currentLabel}!</h2>
            <p className="text-orange-200/60 text-sm mb-8 font-bold tracking-widest uppercase">Que vas a hacer?</p>
            
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => handleRespondTruco(true)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest transition-all"
              >
                Quiero
              </button>
              
              {nextLabel && (
                <button 
                  onClick={handleTruco}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest transition-all"
                >
                  {nextLabel}
                </button>
              )}
              
              <button 
                onClick={() => handleRespondTruco(false)}
                className="w-full py-4 bg-stone-800 hover:bg-stone-700 text-white/70 font-black rounded-2xl uppercase tracking-widest transition-all"
              >
                No Quiero
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    if (isEnvidoChallenged) {
      return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-stone-900 border-2 border-orange-200/20 p-8 rounded-3xl text-center shadow-2xl max-w-sm w-full"
          >
            <Gauge className="mx-auto mb-4 text-orange-200" size={48} />
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Te cantaron Envido!</h2>
            <p className="text-orange-200/60 text-sm mb-8 font-bold tracking-widest uppercase">Tus puntos: {calculateEnvido(myHand)}</p>
            
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => handleRespondEnvido(true)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest transition-all"
              >
                Quiero
              </button>
              
              <button 
                onClick={() => handleEnvido('envido')}
                className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest transition-all"
              >
                Envido
              </button>

              <button 
                onClick={() => handleEnvido('real')}
                className="w-full py-4 bg-orange-700 hover:bg-orange-600 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest transition-all"
              >
                Real Envido
              </button>

              <button 
                onClick={() => handleEnvido('falta')}
                className="w-full py-4 bg-red-700 hover:bg-red-600 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest transition-all"
              >
                Falta Envido
              </button>
              
              <button 
                onClick={() => handleRespondEnvido(false)}
                className="w-full py-4 bg-stone-800 hover:bg-stone-700 text-white/70 font-black rounded-2xl uppercase tracking-widest transition-all"
              >
                No Quiero
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return null;
  }

  function renderMazoModal() {
    return (
      <AnimatePresence>
        {showMazoConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-stone-900 border-2 border-red-500/20 p-8 rounded-3xl text-center shadow-2xl max-w-sm w-full"
            >
              <Layers3 className="mx-auto mb-4 text-red-400" size={48} />
              <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Irse al mazo?</h2>
              <p className="text-red-200/60 text-sm mb-8 font-bold tracking-widest uppercase">Perderas esta mano</p>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={handleIrAlMazo}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest transition-all"
                >
                  Irse al Mazo
                </button>
                <button 
                  onClick={() => setShowMazoConfirm(false)}
                  className="w-full py-4 bg-stone-800 hover:bg-stone-700 text-white/70 font-black rounded-2xl uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  function copyRoomId() {
    navigator.clipboard.writeText(room.id);
    alert('Room ID copied!');
  }
};
