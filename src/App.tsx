import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./services/firebase";

// Nossas Páginas
import Login from "./pages/Login";
import Lobby from "./pages/Lobby";
import Draft from "./pages/Draft";
import Dashboard from "./pages/Dashboard"; // <-- NOVA IMPORTAÇÃO

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuarioAtual) => {
      setUser(usuarioAtual);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-emerald-400 font-bold animate-pulse">A carregar FootDraft...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={!user ? <Login /> : <Navigate to="/lobby" />} />
        <Route path="/lobby" element={user ? <Lobby /> : <Navigate to="/" />} />
        <Route path="/draft/:salaId" element={user ? <Draft /> : <Navigate to="/" />} />
        
        {/* NOVA ROTA DO DASHBOARD */}
        {/* Passamos o ID da sala para sabermos de onde puxar o elenco */}
        <Route path="/dashboard/:salaId" element={user ? <Dashboard /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}