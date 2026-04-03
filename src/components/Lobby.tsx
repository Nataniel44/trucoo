import React, { useState } from 'react';
import { motion } from 'motion/react';
import { createRoom, joinRoom, createCPURoom } from '../services/gameService';
import { Trophy, Play, Plus, LogIn, User, Cpu } from 'lucide-react';

interface LobbyProps {
  onJoin: (roomId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name) return setError('Please enter your name');
    setLoading(true);
    try {
      const id = await createRoom(name);
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
      const id = await createCPURoom(name);
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
        </div>
      </motion.div>
    </div>
  );
};
