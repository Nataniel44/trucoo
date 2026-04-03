import React, { useState, useEffect } from 'react';
import { onSnapshot, doc, getDocFromServer } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';
import { Room } from './types';
import { startGame } from './services/gameService';
import { Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('App: Initializing...');
    // Test Firestore connection
    const testConnection = async () => {
      try {
        console.log('App: Testing Firestore connection...');
        // We use getDocFromServer to force a network check. 
        // It's okay if this fails with "permission-denied" as long as it's not "offline".
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log('App: Firestore connection test completed.');
      } catch (err: any) {
        console.log('App: Firestore test result (expected if not configured):', err.code || err.message);
        if (err.message?.includes('the client is offline') || err.code === 'unavailable') {
          setError("Firebase configuration error: The client is offline or the database is unavailable. Please check your Firebase settings.");
        }
        // We ignore "permission-denied" here because we haven't signed in yet or the rules are strict.
      }
    };
    testConnection();

    const authTimeout = setTimeout(() => {
      if (loading) {
        console.warn('App: Auth timeout reached, still loading...');
        // We don't necessarily want to set loading to false here if we really need auth,
        // but we can show a message.
      }
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log('App: Auth state changed:', u ? 'User present' : 'No user');
      if (u) {
        setUser(u);
        setLoading(false);
        clearTimeout(authTimeout);
      } else {
        console.log('App: Attempting anonymous sign-in...');
        signInAnonymously(auth).then(() => {
          console.log('App: Anonymous sign-in successful');
        }).catch(err => {
          console.error('App: Auth Error:', err);
          let msg = `Authentication failed: ${err.message}`;
          if (err.code === 'auth/configuration-not-found' || err.code === 'auth/admin-restricted-operation') {
            msg = "Firebase Auth Error: Anonymous Authentication is not enabled in your Firebase Console. Please go to Authentication > Sign-in method and enable 'Anonymous'.";
          }
          setError(msg);
          setLoading(false);
          clearTimeout(authTimeout);
        });
      }
    }, (err) => {
      console.error('App: Auth State Error:', err);
      setError(`Auth state error: ${err.message}`);
      setLoading(false);
      clearTimeout(authTimeout);
    });
    return () => {
      unsubscribe();
      clearTimeout(authTimeout);
    };
  }, []);

  useEffect(() => {
    if (!currentRoomId) {
      setRoom(null);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'rooms', currentRoomId), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Room;
        setRoom({ ...data, id: doc.id });

        if (data.status === 'waiting' && data.players.length === 2) {
          console.log('App: Room is full, checking dealer status...');
          const me = data.players.find(p => p.uid === auth.currentUser?.uid);
          console.log('App: Current user is dealer:', me?.isDealer);
          if (me?.isDealer) {
            console.log('App: Starting game...');
            startGame(doc.id).catch(err => {
              console.error('App: Failed to start game:', err);
            });
          }
        }
      } else {
        setCurrentRoomId(null);
      }
    }, (error) => {
      console.error('Firestore Error in App:', error);
    });

    return () => unsubscribe();
  }, [currentRoomId]);

  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowRetry(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (error) {
    const isAuthDisabled = error.includes("Anonymous Authentication is not enabled");
    return (
      <div className="min-h-screen bg-emerald-950 flex items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-red-500/20 border border-red-500/50 p-8 rounded-3xl text-center shadow-2xl backdrop-blur-md">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={64} />
          <h2 className="text-3xl font-black mb-4 tracking-tighter">
            {isAuthDisabled ? "ACTION REQUIRED" : "CONNECTION ERROR"}
          </h2>
          <div className="bg-black/40 p-6 rounded-2xl mb-6 text-left border border-white/5">
            <p className="text-sm leading-relaxed opacity-90">
              {error}
            </p>
            {isAuthDisabled && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs font-bold uppercase text-emerald-400 mb-2">Steps to fix:</p>
                <ol className="text-xs space-y-2 list-decimal ml-4 opacity-70">
                  <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" className="underline hover:text-white">Firebase Console</a></li>
                  <li>Select project: <strong>trucomisionero</strong></li>
                  <li>Go to <strong>Authentication</strong> &gt; <strong>Sign-in method</strong></li>
                  <li>Click <strong>Add new provider</strong> and select <strong>Anonymous</strong></li>
                  <li>Click <strong>Enable</strong> and <strong>Save</strong></li>
                </ol>
              </div>
            )}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-white text-emerald-950 font-black rounded-2xl hover:bg-emerald-100 transition-all shadow-xl active:scale-95"
          >
            I've enabled it, try again
          </button>
          
          <p className="mt-6 text-[10px] opacity-30 uppercase tracking-widest">
            Project: trucomisionero
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-emerald-950 flex flex-col items-center justify-center gap-6">
        <Loader2 className="text-emerald-500 animate-spin" size={48} />
        {showRetry && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <p className="text-white/40 text-sm">Taking longer than usual...</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm"
            >
              Reload App
            </button>
          </motion.div>
        )}
      </div>
    );
  }

  if (room && room.status !== 'waiting') {
    return <GameBoard room={room} onLeave={() => setCurrentRoomId(null)} />;
  }

  if (currentRoomId && room?.status === 'waiting') {
    return (
      <div className="min-h-screen bg-emerald-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/10 text-center">
          <h2 className="text-2xl font-bold mb-4">Waiting for Opponent</h2>
          <div className="bg-black/20 p-4 rounded-2xl mb-6">
            <p className="text-xs uppercase opacity-60 mb-1">Share this Room ID</p>
            <p className="text-4xl font-mono font-black tracking-widest text-emerald-400">{currentRoomId}</p>
          </div>
          <div className="flex flex-col gap-3">
            {room.players.map(p => (
              <div key={p.uid} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold">
                  {p.name[0]}
                </div>
                <span className="font-medium">{p.name} {p.uid === user.uid && '(You)'}</span>
              </div>
            ))}
            {room.players.length < 2 && (
              <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl opacity-40 border-2 border-dashed border-white/10">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">?</div>
                <span className="italic">Waiting for player 2...</span>
              </div>
            )}
          </div>
          <button 
            onClick={() => setCurrentRoomId(null)}
            className="mt-8 text-white/40 hover:text-white text-sm transition-colors"
          >
            Cancel and Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  return <Lobby onJoin={(id) => setCurrentRoomId(id)} />;
}
