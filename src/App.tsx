// src/App.tsx
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore"; 
import { auth, db } from "./services/firebase";
import { type GamePhase } from "./types";

import Login from "./pages/Login";
import Draft from "./pages/Draft";
import Dashboard from "./pages/Dashboard";
import Championship from "./pages/Championship";
import Admin from './pages/Admin';

const WaitingRoom = () => <div className="h-screen bg-slate-900 text-emerald-400 font-bold flex flex-col items-center justify-center text-center"><h1 className="text-3xl mb-2">Sala de Espera 🕒</h1><p className="text-slate-400">Aguarde o Game Master iniciar o evento.</p></div>;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [gamePhase, setGamePhase] = useState<GamePhase>('SETUP');

  useEffect(() => {
    // 1. Escuta quem é o usuário logado
    const unsubscribeAuth = onAuthStateChanged(auth, (usuarioAtual) => {
      setUser(usuarioAtual);
      setLoading(false);
    });

    // 2. Escuta a fase atual do servidor Multiplayer
    const unsubscribeGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        setGamePhase(docSnap.data().phase as GamePhase);
      }
    });

    return () => { unsubscribeAuth(); unsubscribeGame(); };
  }, []);

  if (loading) return <div className="h-screen bg-slate-900 flex items-center justify-center text-emerald-400 font-bold">Conectando ao Servidor...</div>;

  // Lógica inteligente de Redirecionamento
  const RenderHome = () => {
    if (!user) return <Login />;
    
    // Switch case de direcionamento obrigatório baseado no servidor!
    switch (gamePhase) {
      case 'SETUP': return <WaitingRoom />;
      case 'PRE_SEASON': return <Navigate to="/draft" />;
      case 'TRANSFER_WINDOW': return <Navigate to="/draft" />;
      case 'FIRST_HALF': return <Navigate to="/dashboard" />;
      case 'SECOND_HALF': return <Navigate to="/dashboard" />;
      default: return <WaitingRoom />;
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RenderHome />} />
        
        {/* Proteções de Rota: O usuário só acessa o Draft se a fase for de Draft */}
        <Route path="/draft" element={user && (gamePhase === 'PRE_SEASON' || gamePhase === 'TRANSFER_WINDOW') ? <Draft /> : <Navigate to="/" />} />
        
        {/* Proteções de Rota: Só acessa o time se o campeonato estiver rolando */}
        <Route path="/dashboard" element={user && (gamePhase === 'FIRST_HALF' || gamePhase === 'SECOND_HALF') ? <Dashboard /> : <Navigate to="/" />} />
        <Route path="/championship" element={user && (gamePhase === 'FIRST_HALF' || gamePhase === 'SECOND_HALF') ? <Championship /> : <Navigate to="/" />} />
        
        {/* Admin fica sempre liberado para testes */}
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
