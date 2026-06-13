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
import WaitingRoom from './pages/WaitingRoom';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [gamePhase, setGamePhase] = useState<GamePhase>('SETUP');

  // ==========================================
  // LÓGICA DE CONEXÃO COM O SERVIDOR
  // ==========================================
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

  // ==========================================
  // RENDERIZAÇÃO: TELA DE CARREGAMENTO (FUT PREMIUM)
  // ==========================================
  if (loading) {
    return (
      <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-yellow-400 font-black tracking-widest uppercase animate-pulse">
          Conectando ao Servidor...
        </p>
      </div>
    );
  }

  // ==========================================
  // LÓGICA DE REDIRECIONAMENTO MULTIPLAYER
  // ==========================================
  const RenderHome = () => {
    if (!user) return <Login />;
    
    // Switch case de direcionamento obrigatório baseado na fase do servidor
    switch (gamePhase) {
      case 'SETUP': return <WaitingRoom />;
      case 'PRE_SEASON': return <Navigate to="/draft" />;
      case 'TRANSFER_WINDOW': return <Navigate to="/draft" />;
      case 'FIRST_HALF': return <Navigate to="/dashboard" />;
      case 'SECOND_HALF': return <Navigate to="/dashboard" />;
      default: return <WaitingRoom />;
    }
  };

  // ==========================================
  // ROTEADOR PRINCIPAL
  // ==========================================
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RenderHome />} />
        
        {/* Proteções de Rota: O usuário só acessa o Draft se a fase for de Draft/Transferência */}
        <Route 
          path="/draft" 
          element={user && (gamePhase === 'PRE_SEASON' || gamePhase === 'TRANSFER_WINDOW') ? <Draft /> : <Navigate to="/" />} 
        />
        
        {/* Proteções de Rota: Só acessa a gestão do time se o campeonato estiver em andamento */}
        <Route 
          path="/dashboard" 
          element={user && (gamePhase === 'FIRST_HALF' || gamePhase === 'SECOND_HALF') ? <Dashboard /> : <Navigate to="/" />} 
        />
        <Route 
          path="/championship" 
          element={user && (gamePhase === 'FIRST_HALF' || gamePhase === 'SECOND_HALF') ? <Championship /> : <Navigate to="/" />} 
        />
        
        {/* Rota do Game Master (Admin) */}
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
