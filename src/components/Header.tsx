import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [nomeTime, setNomeTime] = useState<string | null>(null);
  const [nomeTecnico, setNomeTecnico] = useState<string | null>(null);
  const [faseAtual, setFaseAtual] = useState<string>("Carregando...");
  
  // Estado para garantir que sabemos quem é o usuário antes de buscar no banco
  const [userUid, setUserUid] = useState<string | null>(null);
  const path = location.pathname;

  // 1. Ouve as mudanças de Login/Logout
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUserUid(user ? user.uid : null);
    });
    return () => unsubAuth();
  }, []);

  // 2. Busca os dados no banco apenas quando o UID for confirmado
  useEffect(() => {
    if (!userUid) return;

    const unsubUser = onSnapshot(doc(db, "usuarios", userUid), (docSnap) => {
      if (docSnap.exists()) {
        setNomeTime(docSnap.data().nomeTime);
        setNomeTecnico(docSnap.data().nomeTecnico);
      }
    });

    const unsubGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        const fases: Record<string, string> = {
          'SETUP': 'Sala de Espera',
          'PRE_SEASON': 'Pré-Temporada',
          'TRANSFER_WINDOW': 'Transferências',
          'FIRST_HALF': '1º Turno',
          'SECOND_HALF': '2º Turno',
          'CHAMPIONSHIP': 'Campeonato',
          'FINISHED': 'Fim de Temporada'
        };
        setFaseAtual(fases[docSnap.data().phase] || docSnap.data().phase);
      }
    });

    return () => { unsubUser(); unsubGame(); };
  }, [userUid]);

  const handleLogout = async () => {
    if (window.confirm("Deseja realmente sair da sua conta?")) {
      await signOut(auth);
      navigate('/');
    }
  };

  if (!userUid) {
    return (
      <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800 shadow-[0_4px_30px_rgba(0,0,0,0.5)] h-16 flex items-center justify-center">
        <span className="text-2xl font-black text-white uppercase tracking-tighter">
          Foot<span className="text-yellow-500">Draft26</span>
        </span>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
      <div className="w-full px-4 md:px-8 max-w-7xl mx-auto h-16 flex items-center justify-between">
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <span className="text-2xl font-black text-white uppercase tracking-tighter">
              Foot<span className="text-yellow-500">Draft26</span>
            </span>
            <span className="hidden md:inline-block text-[10px] bg-neutral-800 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              BETA
            </span>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-1 bg-neutral-900/50 p-1 rounded-full border border-neutral-800 shadow-inner">
          <button onClick={() => navigate('/dashboard')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all uppercase tracking-widest ${path === '/dashboard' ? 'bg-cyan-900/30 text-cyan-400 shadow-md border border-cyan-900/50' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'}`}>Vestiário</button>
          <button onClick={() => navigate('/championship')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all uppercase tracking-widest ${path === '/championship' ? 'bg-yellow-900/30 text-yellow-500 shadow-md border border-yellow-900/50' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'}`}>Campeonato</button>
          
          <div className="w-px h-4 bg-neutral-800 mx-2"></div>
          
          <div className="px-3 py-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{faseAtual}</span>
          </div>
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin')} className="hidden md:flex text-[10px] bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 px-3 py-2 rounded-lg font-black uppercase tracking-widest transition-colors">Game Master</button>

          <div className="flex items-center gap-3 pl-4 border-l border-neutral-800">
            <div className="flex items-center gap-2 bg-neutral-900/50 py-1 pl-1 pr-4 rounded-full border border-neutral-800 shadow-inner">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-xs font-black text-neutral-950 shadow-md shrink-0">
                {(nomeTime || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                {/* Nome do Técnico em Branco, Maior */}
                <p className="text-[11px] font-bold text-white leading-tight truncate max-w-25">
                  {nomeTecnico || 'Manager'}
                </p>
                {/* Nome do Time em Cyan, Menor */}
                <p className="text-[9px] text-cyan-400 uppercase font-black tracking-widest leading-tight truncate max-w-25">
                  {nomeTime || 'Sem Clube'}
                </p>
              </div>
            </div>
            
            <button onClick={handleLogout} className="p-2 bg-neutral-900 hover:bg-red-950/40 border border-neutral-800 hover:border-red-900/50 rounded-full text-neutral-400 hover:text-red-500 transition-all shadow-sm" title="Sair do Jogo">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
