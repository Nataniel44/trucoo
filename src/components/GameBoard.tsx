import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Card as CardType, Player, Room, GameState } from '../types';
import { playCard, callTruco, callEnvido, respondTruco, respondEnvido } from '../services/gameService';
import { calculateEnvido } from '../utils/truco';
import { Trophy, User, Share2, Settings, HelpCircle, Gavel, Gauge, Layers3 } from 'lucide-react';

interface GameBoardProps {
  room: Room;
  onLeave: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({ room, onLeave }) => {
  const user = auth.currentUser;
  const me = room.players.find(p => p.uid === user?.uid);
  const opponent = room.players.find(p => p.uid !== user?.uid);
  const gameState = room.gameState!;

  const [myHand, setMyHand] = useState<CardType[]>([]);
  const [cpuHand, setCpuHand] = useState<CardType[]>([]);

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

  // Load CPU hand if in CPU mode
  useEffect(() => {
    if (room.isCPU && gameState.cpuHand) {
      setCpuHand(gameState.cpuHand);
    }
  }, [room.isCPU, gameState.cpuHand]);

  // Track the move timeout and the state ID it's for
  const cpuTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastCpuStateId = React.useRef<string | null>(null);

  // CPU Move Logic (Ultra-Robust)
  useEffect(() => {
    const canCpuMove = room.isCPU && 
                      gameState.turn === 'CPU_PLAYER' && 
                      room.status === 'playing' && 
                      !gameState.winner;
    
    if (!canCpuMove) {
      if (cpuTimeoutRef.current) {
        clearTimeout(cpuTimeoutRef.current);
        cpuTimeoutRef.current = null;
      }
      lastCpuStateId.current = null;
      return;
    }

    // Unique ID for this turn state
    const stateId = `${gameState.turn}-${gameState.currentHand}-${gameState.playedCards.length}-${gameState.trucoChallenger || 'none'}-${gameState.envidoChallenger || 'none'}-${gameState.trucoLevel}-${gameState.envidoLevel}-${cpuHand.filter(c => !c.played).length}`;

    // If we're already "thinking" about this EXACT same state, don't reset the timer!
    // This prevents the CPU from being "reset" by rapid Firestore updates that don't change the turn/game state.
    if (lastCpuStateId.current === stateId) return;

    // A truly new state! Clear any old timer and start fresh.
    if (cpuTimeoutRef.current) clearTimeout(cpuTimeoutRef.current);
    lastCpuStateId.current = stateId;

    cpuTimeoutRef.current = setTimeout(async () => {
      // Final sanity check before calling Firestore
      if (lastCpuStateId.current !== stateId || gameState.turn !== 'CPU_PLAYER') return;

      try {
        const cpuIsTrucoChallenged = !!gameState.trucoChallenger && gameState.trucoChallenger !== 'CPU_PLAYER';
        const cpuIsEnvidoChallenged = !!gameState.envidoChallenger && gameState.envidoChallenger !== 'CPU_PLAYER';

        if (cpuIsTrucoChallenged) {
          const availableCards = cpuHand.filter(c => !c.played);
          const hasGoodCard = availableCards.some(c => c.value >= 12);
          const shouldAccept = hasGoodCard || Math.random() > 0.4;
          await respondTruco(room.id, 'CPU_PLAYER', shouldAccept);
          return;
        }

        if (cpuIsEnvidoChallenged) {
          const envidoPoints = calculateEnvido(cpuHand);
          const shouldAccept = envidoPoints >= 25 || Math.random() > 0.7;
          await respondEnvido(room.id, 'CPU_PLAYER', shouldAccept);
          return;
        }

        const availableCards = cpuHand.filter(c => !c.played);
        if (availableCards.length === 0) return;

        // Decide if calling before playing
        if (gameState.currentHand === 1 && gameState.envidoLevel === 0 && !gameState.envidoChallenger) {
          const envidoPoints = calculateEnvido(cpuHand);
          if (envidoPoints >= 28 && Math.random() > 0.4) {
            await callEnvido(room.id, 'CPU_PLAYER');
            return;
          }
        }

        if (gameState.trucoLevel === 1 && !gameState.trucoChallenger && Math.random() > 0.8) {
          const hasKillerCard = availableCards.some(c => c.value >= 13);
          if (hasKillerCard) {
            await callTruco(room.id, 'CPU_PLAYER');
            return;
          }
        }

        const currentHandCards = gameState.playedCards.filter(p => p.handIndex === gameState.currentHand);
        const opponentCard = currentHandCards.find(p => p.uid !== 'CPU_PLAYER')?.card;

        let cardToPlay: CardType;
        if (opponentCard) {
          const winningCards = availableCards.filter(c => c.value > opponentCard.value).sort((a, b) => a.value - b.value);
          cardToPlay = winningCards.length > 0 ? winningCards[0] : availableCards.sort((a, b) => a.value - b.value)[0];
        } else {
          if (gameState.currentHand === 1) {
             cardToPlay = availableCards.sort((a, b) => a.value - b.value)[Math.floor(availableCards.length / 2)];
          } else {
             cardToPlay = availableCards.sort((a, b) => b.value - a.value)[0];
          }
        }
        
        await playCard(room.id, 'CPU_PLAYER', cardToPlay);
      } catch (err) {
        console.error("CPU Move Error:", err);
        lastCpuStateId.current = null; // Re-allow on next pass
      }
    }, 1500);

    return () => {
      // Memory safety: the specific logic at the start of the effect 
      // handles clearing old timers when the state actually changes.
    };
  }, [gameState.turn, gameState.currentHand, gameState.playedCards.length, gameState.trucoChallenger, gameState.envidoChallenger, gameState.trucoLevel, gameState.envidoLevel, room.status, gameState.winner, cpuHand]);

  // Handle unmount specifically
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
      setMessage(`¡${winnerName} ganó la ronda!`);
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.roundScore]);


  useEffect(() => {
    if (gameState.envidoWinner) {
      const winnerName = room.players.find(p => p.team === gameState.envidoWinner)?.name;
      setMessage(`¡${winnerName} ganó el Envido con ${gameState.envidoPoints} puntos!`);
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

  const handlePlayCard = async (card: CardType) => {
    if (!isMyTurn || !!gameState.trucoChallenger || !!gameState.envidoChallenger) return;
    await playCard(room.id, user!.uid, card);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(room.id);
    alert('ID de sala copiado!');
  };

  const handleTruco = async () => {
    // Can call if it's my turn OR I'm being challenged (Re-truco)
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

  // Render challenge modals
  const renderChallenges = () => {
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
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">¡Te cantaron {currentLabel}!</h2>
            <p className="text-orange-200/60 text-sm mb-8 font-bold tracking-widest uppercase">¿Qué vas a hacer?</p>
            
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => handleRespondTruco(true)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-lg shadow-emerald-900/20 uppercase tracking-widest transition-all"
              >
                Quiero
              </button>
              
              {nextLabel && (
                <button 
                  onClick={handleTruco}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl shadow-lg shadow-orange-900/20 uppercase tracking-widest transition-all"
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
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">¡Te cantaron Envido!</h2>
            <p className="text-orange-200/60 text-sm mb-8 font-bold tracking-widest uppercase">Tus puntos: {calculateEnvido(myHand)}</p>
            
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => handleRespondEnvido(true)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-lg shadow-emerald-900/20 uppercase tracking-widest transition-all"
              >
                Quiero
              </button>
              
              <button 
                onClick={() => handleEnvido('envido')}
                className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl shadow-lg shadow-orange-900/20 uppercase tracking-widest transition-all"
              >
                Envido
              </button>

              <button 
                onClick={() => handleEnvido('real')}
                className="w-full py-4 bg-orange-700 hover:bg-orange-600 text-white font-black rounded-2xl shadow-lg shadow-orange-950/20 uppercase tracking-widest transition-all"
              >
                Real Envido
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
            {winner?.uid === user?.uid ? 'You Won!' : `${winner?.name} Won!`}
          </p>
          <div className="bg-black/20 p-6 rounded-2xl mb-8">
            <p className="text-xs uppercase opacity-60 mb-2">Final Score</p>
            <p className="text-4xl font-black text-white">{gameState.score[1]} - {gameState.score[2]}</p>
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
    <div className="min-h-screen bg-jungle-table text-on-background p-4 flex flex-col items-center justify-between overflow-hidden relative">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-stone-900/60 backdrop-blur-xl shadow-2xl shadow-black/20 flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-orange-200 font-headline uppercase tracking-tighter">Misiones Truco</span>
        </div>
        <div className="flex items-center gap-6 bg-surface-container-high/40 px-6 py-2 rounded-full border border-outline-variant/20 backdrop-blur-md">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest leading-none">Nosotros</span>
            <span className="text-2xl font-black font-headline text-tertiary">{gameState.score[1]}</span>
          </div>
          <div className="h-8 w-px bg-outline-variant/30"></div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest leading-none">Ellos</span>
            <span className="text-2xl font-black font-headline text-on-surface-variant">{gameState.score[2]}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 duration-150 text-orange-200">
            <Settings size={20} />
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 duration-150 text-orange-200">
            <HelpCircle size={20} />
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 w-full pt-24 pb-32 flex flex-col items-center justify-between relative">
        {/* Opponent Area */}
        <div className="flex flex-col items-center gap-4 mt-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-primary-container bg-surface-container overflow-hidden shadow-lg">
              <img className="w-full h-full object-cover grayscale brightness-75" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPh2crW_Xf5eSZ02Q3jjJ51Bn7CrYzFT7wKZvQBEaL84twJBh-FoqVjKdQ2b-X8elGJ185BXZWS4iPlBfG879iS9LNa6jajpPreeovwh54fVPDFvkE9TJWj1xFyh-eAMLC0drXYVhEVXjSnso5d4Kx_s6RSoR91ZuAlr96T5tZ58jESTL8L4vhPp90mGFym5nH8GchV0OGmuXNehLfUKcD0Nj7qF7dvi2lKcFGUnz0bcCVWca0LR-pTOIgZiNolMN9mohxsogsQjx6" alt="Opponent" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-tertiary text-on-tertiary text-[10px] font-black px-2 py-0.5 rounded-full uppercase">CPU</div>
          </div>
        </div>

        {/* Central Arena */}
        <div className="flex-1 w-full flex items-center justify-center relative">
          {message && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-1/4 bg-white/90 text-emerald-900 px-6 py-2 rounded-full font-black shadow-2xl z-20"
            >
              {message}
            </motion.div>
          )}

          {/* Played Cards */}
          <div className="w-full flex items-center justify-center gap-24">
            <div className="relative w-32 h-44">
              <h3 className="absolute -top-10 w-full text-center text-[10px] font-black uppercase text-orange-200/60 tracking-widest">Tiradas Mías</h3>
              <AnimatePresence>
                {gameState.playedCards.filter(p => p.uid === user?.uid).map((played, idx) => (


                  < motion.div
                    key={`${played.card.id}-${played.handIndex}`}
                    initial={{ y: 200, scale: 0.5, opacity: 0, rotate: 20 }}
                    animate={{
                      y: 0,
                      x: idx * 40, 
                      scale: 1,
                      opacity: 1,
                      rotate: idx * 5 - 5,
                      zIndex: played.handIndex
                    }}
                    className="absolute w-28 h-40 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-between p-3 border-2 border-stone-200 card-shadow overflow-hidden"
                    style={{ left: idx * 5 }} 
                  >
                    <div className="w-full flex justify-start">
                      <span className={`text-xl font-black font-headline leading-none ${['espada', 'basto'].includes(played.card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                        {played.card.number}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center justify-center -my-2">
                      <span className="text-4xl filter drop-shadow-sm">{suitEmojis[played.card.suit]}</span>
                    </div>
                    <div className="w-full flex justify-end rotate-180">
                      <span className={`text-xl font-black font-headline leading-none ${['espada', 'basto'].includes(played.card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                        {played.card.number}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="relative w-32 h-44">
              <h3 className="absolute -top-10 w-full text-center text-[10px] font-black uppercase text-orange-200/60 tracking-widest">Tiradas CPU</h3>
              <AnimatePresence>
                {gameState.playedCards.filter(p => p.uid !== user?.uid).map((played, idx) => (
                  <motion.div
                    key={`${played.card.id}-${played.handIndex}`}
                    initial={{ y: -200, scale: 0.5, opacity: 0, rotate: -20 }}
                    animate={{
                      y: 0,
                      x: idx * 40,
                      scale: 1,
                      opacity: 1,
                      rotate: idx * -5 + 5,
                      zIndex: played.handIndex
                    }}
                    className="absolute w-28 h-40 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-between p-3 border-2 border-stone-200 card-shadow overflow-hidden"
                    style={{ left: idx * 5 }}
                  >
                    <div className="w-full flex justify-start">
                      <span className={`text-xl font-black font-headline leading-none ${['espada', 'basto'].includes(played.card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                        {played.card.number}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center justify-center -my-2">
                      <span className="text-4xl filter drop-shadow-sm">{suitEmojis[played.card.suit]}</span>
                    </div>
                    <div className="w-full flex justify-end rotate-180">
                      <span className={`text-xl font-black font-headline leading-none ${['espada', 'basto'].includes(played.card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                        {played.card.number}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* My Area */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-6 pb-8">
          <div className="flex gap-4">
            {myHand.map((card) => (
              <motion.button
                key={card.id}
                whileHover={!card.played ? { y: -20, scale: 1.05 } : {}}
                whileTap={!card.played ? { scale: 0.95 } : {}}
                onClick={() => handlePlayCard(card)}
                disabled={!isMyTurn || !!card.played}
                className={`w-28 h-44 bg-white rounded-xl shadow-xl flex flex-col items-center justify-between p-4 border-2 transition-all card-shadow
                  ${isMyTurn && !card.played ? 'border-yellow-400 cursor-pointer' : 'border-transparent opacity-50 grayscale cursor-not-allowed'}
                `}
              >
                <div className="w-full flex justify-start">
                  <span className={`text-2xl font-black font-headline ${['espada', 'basto'].includes(card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                    {card.number}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 border-dashed
                    ${['espada', 'basto'].includes(card.suit) ? 'border-gray-200 text-gray-300' : 'border-red-100 text-red-200'}
                  `}>
                    <span className="text-2xl">{suitEmojis[card.suit] || card.suit[0].toUpperCase()}</span>
                  </div>
                </div>
                <div className="w-full flex justify-end rotate-180">
                  <span className={`text-2xl font-black font-headline ${['espada', 'basto'].includes(card.suit) ? 'text-gray-900' : 'text-red-700'}`}>
                    {card.number}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </main >

      {/* Challenge Modals */}
      {renderChallenges()}

      {/* Action Buttons */}
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
      </div>
    </div>
  );
};
