import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createRoom, joinRoom, createCPURoom } from '../services/gameService';
import { Trophy, Plus, LogIn, User, Cpu, BookOpen, X, Users } from 'lucide-react';

interface LobbyProps {
  onJoin: (roomId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<2 | 4>(2);

  const handleCreate = async () => {
    if (!name) return setError('Please enter your name');
    setLoading(true);
    try {
      const id = await createRoom(name, selectedPlayers);
      onJoin(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCPU = async () => {
    if (!name) return setError('Please enter your name');
    setLoading(true);
    try {
      const id = await createCPURoom(name, selectedPlayers);
      onJoin(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!name) return setError('Please enter your name');
    if (!roomId) return setError('Please enter a Room ID');
    setLoading(true);
    try {
      await joinRoom(roomId, name);
      onJoin(roomId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-emerald-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden opacity-10 pointer-events-none">
        <div className="grid grid-cols-8 gap-8 rotate-12 scale-150">
          {Array.from({ length: 64 }).map((_, i) => (
            <div key={i} className="w-20 h-32 border-2 border-white rounded-lg" />
          ))}
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20 rotate-3">
            <Trophy size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter">TRUCO</h1>
          <p className="text-emerald-400 font-medium uppercase tracking-widest text-xs mt-1">Multiplayer Online</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-xl text-sm mb-6">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-white/60 uppercase ml-1">Your Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-white/60 uppercase ml-1">Players</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedPlayers(2)}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all ${
                  selectedPlayers === 2 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                <Users size={24} />
                <span className="font-bold text-sm">2 Players</span>
              </button>
              <button
                onClick={() => setSelectedPlayers(4)}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all ${
                  selectedPlayers === 4 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                <Users size={24} />
                <span className="font-bold text-sm">4 Players</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex flex-col items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white p-6 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 group"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                <Plus size={24} />
              </div>
              <span className="font-bold">Create Room</span>
            </button>

            <button
              onClick={handleCreateCPU}
              disabled={loading}
              className="flex flex-col items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white p-6 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 group"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                <Cpu size={24} />
              </div>
              <span className="font-bold">Play vs CPU</span>
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-white/60 uppercase ml-1">Join Room</label>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="ROOM ID"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-center font-mono font-bold text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
              <button
                onClick={handleJoin}
                disabled={loading}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl py-3 transition-all flex items-center justify-center gap-2"
              >
                <LogIn size={18} /> Join
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <p className="text-white/40 text-xs">
            Invite a friend by sharing the Room ID once you're inside.
          </p>
          <button
            onClick={() => setShowRules(true)}
            className="mt-4 inline-flex items-center gap-2 text-emerald-400/60 hover:text-emerald-400 text-sm transition-colors"
          >
            <BookOpen size={16} />
            Ver reglas del Truco
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-stone-900 border border-orange-200/20 p-6 rounded-3xl shadow-2xl max-w-lg w-full my-8"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Reglas del Truco</h2>
                <button
                  onClick={() => setShowRules(false)}
                  className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6 text-sm text-white/80 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <h3 className="text-orange-200 font-bold uppercase text-xs mb-2">Objetivo</h3>
                  <p>Llegar a 15 puntos antes que tu oponente. Cada ronda ganada suma puntos segun el nivel de Truco cantado.</p>
                </div>

                <div>
                  <h3 className="text-orange-200 font-bold uppercase text-xs mb-2">Valor de las Cartas</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">1</span> espada → 14</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">1</span> basto → 13</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">7</span> espada → 12</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">7</span> oro → 11</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">3</span> cualquier palo → 10</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">2</span> cualquier palo → 9</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">1</span> oro/copa → 8</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">12</span> → 7</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">11</span> → 6</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">10</span> → 5</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">7</span> basto/copa → 4</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">6</span> → 3</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">5</span> → 2</div>
                    <div className="flex items-center gap-2"><span className="bg-emerald-600 px-2 py-1 rounded">4</span> → 1</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-orange-200 font-bold uppercase text-xs mb-2">Ronda (Mano)</h3>
                  <p>Se juegan 3 rondas. Gana quien obtenga 2 de las 3. Si hay empate en valor, gana el repartidor.</p>
                </div>

                <div>
                  <h3 className="text-orange-200 font-bold uppercase text-xs mb-2">Puntos por Ronda</h3>
                  <ul className="space-y-1 text-xs">
                    <li>• Sin Truco cantado: <strong>1 punto</strong></li>
                    <li>• Truco aceptado: <strong>2 puntos</strong></li>
                    <li>• Re-Truco aceptado: <strong>3 puntos</strong></li>
                    <li>• Vale Cuatro aceptado: <strong>4 puntos</strong></li>
                    <li>• No quiero (rechazado): <strong>1 punto</strong> para quien canto</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-orange-200 font-bold uppercase text-xs mb-2">Envido</h3>
                  <p className="text-xs">Se canta en la primera mano. Puntos segun combinacion de palos:</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>• 2 o 3 cartas del mismo palo: <strong>20 + valor mas alto + segundo mas alto</strong></li>
                    <li>• Solo una carta: <strong>su valor</strong> (1-7 valen su numero, 10-12 valen 0)</li>
                    <li>• Envido: <strong>2 pts</strong> | Real Envido: <strong>3 pts</strong></li>
                    <li>• Falta Envido: <strong>Puntos necesarios para ganar</strong></li>
                    <li>• Si rechazado: <strong>1 punto</strong> para quien canto</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-orange-200 font-bold uppercase text-xs mb-2">Irse al Mazo</h3>
                  <p className="text-xs">Puedes rendirte en cualquier momento. Pierdes la mano actual y el equipo oponente gana el punto.</p>
                </div>

                <div>
                  <h3 className="text-orange-200 font-bold uppercase text-xs mb-2">4 Jugadores</h3>
                  <p className="text-xs">Equipos de 2 vs 2. El companero se sienta frente a vos. Las reglas de Truco y Envido son las mismas.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
