// src/App.tsx
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore"; 
import { auth, db } from "./services/firebase";
import { type GamePhase } from "./types";

// Importações das páginas
import Login from "./pages/Login";
import Draft from "./pages/Draft";
import TransferWindow from "./pages/TransferWindow"; // 👈 NOVA IMPORTAÇÃO AQUI!
import Dashboard from "./pages/Dashboard";
import Championship from "./pages/Championship";
import Admin from './pages/Admin';
import WaitingRoom from './pages/WaitingRoom';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [gamePhase, setGamePhase] = useState<GamePhase | string>('SETUP');

  // ==========================================
  // LÓGICA DE CONEXÃO COM O SERVIDOR
  // ==========================================
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (usuarioAtual) => {
      setUser(usuarioAtual);
      setLoading(false);
    });

    const unsubscribeGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        setGamePhase(docSnap.data().phase);
      }
    });

    return () => { unsubscribeAuth(); unsubscribeGame(); };
  }, []);

  // ==========================================
  // RENDERIZAÇÃO: TELA DE CARREGAMENTO
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
  // Separamos o Draft da Janela de Transferências para evitar conflitos
  const isDraftPhase = gamePhase === 'PRE_SEASON';
  const isTransferPhase = gamePhase === 'TRANSFER_WINDOW';
  const isPlayingPhase = ['FIRST_HALF', 'SECOND_HALF', 'CHAMPIONSHIP'].includes(gamePhase);

  const RenderHome = () => {
    if (!user) return <Login />;
    
    // Direcionamento Inteligente
    if (isDraftPhase) return <Navigate to="/draft" />;
    if (isTransferPhase) return <Navigate to="/transfer" />; // 👈 Vai para a rota nova!
    if (isPlayingPhase) return <Navigate to="/dashboard" />;
    
    // Fallback para 'SETUP' ou qualquer fase desconhecida
    return <WaitingRoom />; 
  };

  // ==========================================
  // ROTEADOR PRINCIPAL
  // ==========================================
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RenderHome />} />
        
        {/* ROTA 1: Pré-Temporada */}
        <Route 
          path="/draft" 
          element={user && isDraftPhase ? <Draft /> : <Navigate to="/" />} 
        />

        {/* ROTA 2: Janela de Transferências (Agora injetando o UID!) */}
        <Route 
          path="/transfer" 
          element={user && isTransferPhase ? <TransferWindow uid={user.uid} /> : <Navigate to="/" />} 
        />
        
        {/* ROTA 3: Painel de Jogo */}
        <Route 
          path="/dashboard" 
          element={user && isPlayingPhase ? <Dashboard /> : <Navigate to="/" />} 
        />
        <Route 
          path="/championship" 
          element={user && isPlayingPhase ? <Championship /> : <Navigate to="/" />} 
        />
        
        {/* Rota do Game Master (Admin) */}
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
