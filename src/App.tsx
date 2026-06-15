import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore"; 
import { auth, db } from "./services/firebase";
import { type GamePhase } from "./types";
import { Toaster } from 'react-hot-toast';

import Login from "./pages/Login";
import Draft from "./pages/Draft";
import TransferWindow from "./pages/TransferWindow";
import Dashboard from "./pages/Dashboard";
import Championship from "./pages/Championship";
import Admin from './pages/Admin';
import WaitingRoom from './pages/WaitingRoom';
import Matches from './pages/Matches';
import Header from "./components/Header";
import Footer from "./components/Footer";

const AdminProtegido = () => {
  const [autenticado, setAutenticado] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  if (autenticado) return <Admin />;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (senha === "2525") {
      setAutenticado(true);
    } else {
      setErro("Senha incorreta. Acesso negado.");
      setSenha("");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center font-fifa p-4">
      <div className="bg-neutral-900 p-8 rounded-xl border border-neutral-800 shadow-[0_0_30px_rgba(42,57,141,0.15)] w-full max-w-sm">
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 text-center">Acesso Restrito</h2>
        <p className="text-xs text-fifa-blue uppercase font-bold tracking-widest mb-8 text-center">Painel da CBF</p>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input 
            type="password" 
            value={senha} 
            onChange={(e) => setSenha(e.target.value)} 
            placeholder="Digite a Senha" 
            className="w-full bg-neutral-950 border border-neutral-800 p-4 rounded-xl text-fifa-blue font-black text-center tracking-[0.5em] focus:outline-none focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue transition-colors" 
            autoFocus 
          />
          {erro && <p className="text-fifa-red text-xs font-bold uppercase tracking-widest text-center mt-1">{erro}</p>}
          <button 
            type="submit" 
            className="w-full bg-fifa-blue hover:bg-opacity-80 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-colors shadow-lg mt-2 shadow-fifa-blue/30"
          >
            Destravar Painel
          </button>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [gamePhase, setGamePhase] = useState<GamePhase | string>('SETUP');

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

  if (loading) {
    return (
      <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-fifa">
        <div className="w-12 h-12 border-4 border-fifa-green border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-fifa-green font-black tracking-widest uppercase animate-pulse">
          Conectando ao Servidor...
        </p>
      </div>
    );
  }

  const isDraftPhase = gamePhase === 'PRE_SEASON';
  const isTransferPhase = gamePhase === 'TRANSFER_WINDOW';
  const isPlayingPhase = ['CHAMPIONSHIP', 'FIRST_HALF', 'SECOND_HALF', 'FINISHED'].includes(gamePhase);

  const RenderHome = () => {
    if (!user) return <Login />;
    if (isDraftPhase) return <Navigate to="/draft" />;
    if (isTransferPhase) return <Navigate to="/transfer" />; 
    if (isPlayingPhase) return <Navigate to="/dashboard" />;
    return <WaitingRoom />; 
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-neutral-950">
        
        {/* COMPONENTE TOASTER ADICIONADO AQUI: Controla o visual global das notificações */}
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1a1a1a', 
              color: '#fff',         
              border: '1px solid #333',
            },
            success: {
              iconTheme: { primary: '#3CAC3B', secondary: '#fff' }, 
            },
            error: {
              iconTheme: { primary: '#FF3333', secondary: '#fff' }, 
            },
          }}
        />

        <Header />

        <div className="flex-1">
          <Routes>
            <Route path="/" element={<RenderHome />} />
            <Route path="/draft" element={user && isDraftPhase ? <Draft /> : <Navigate to="/" />} />
            <Route path="/transfer" element={user && isTransferPhase ? <TransferWindow uid={user.uid} /> : <Navigate to="/" />} />
            <Route path="/dashboard" element={user && isPlayingPhase ? <Dashboard /> : <Navigate to="/" />} />
            <Route path="/championship" element={user && isPlayingPhase ? <Championship /> : <Navigate to="/" />} />
            <Route path="/live" element={user && isPlayingPhase ? <Matches /> : <Navigate to="/" />} />
            <Route path="/admin" element={<AdminProtegido />} />
          </Routes>
        </div>

        <Footer />
      </div> 
    </BrowserRouter>
  );
}
