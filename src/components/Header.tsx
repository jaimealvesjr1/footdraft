import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import toast from 'react-hot-toast';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [nomeTime, setNomeTime] = useState<string | null>(null);
  const [nomeTecnico, setNomeTecnico] = useState<string | null>(null);
  const [faseAtual, setFaseAtual] = useState<string>("Carregando...");
  const [rawPhase, setRawPhase] = useState<string>("");
  const [historico, setHistorico] = useState<any[]>([]);
  
  const [userUid, setUserUid] = useState<string | null>(null);
  const path = location.pathname;

  // ESTADOS DO MODAL DE PERFIL/HISTÓRICO
  const [modalAberto, setModalAberto] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'HISTORICO' | 'EDITAR'>('HISTORICO');
  const [editNomeTime, setEditNomeTime] = useState("");
  const [editNomeTecnico, setEditNomeTecnico] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUserUid(user ? user.uid : null);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!userUid) return;

    const unsubUser = onSnapshot(doc(db, "usuarios", userUid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setNomeTime(data.nomeTime);
        setNomeTecnico(data.nomeTecnico);
        setHistorico(data.historicoCampanhas || []);
      }
    });

    const unsubGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRawPhase(data.phase);
        const fases: Record<string, string> = {
          'SETUP': 'Sala de Espera',
          'PRE_SEASON': 'Pré-Temporada',
          'TRANSFER_WINDOW': 'Transferências',
          'FIRST_HALF': '1º Turno',
          'SECOND_HALF': '2º Turno',
          'CHAMPIONSHIP': 'Campeonato',
          'FINISHED': 'Fim de Temporada'
        };
        setFaseAtual(fases[data.phase] || data.phase);
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

  const abrirModal = () => {
    setEditNomeTime(nomeTime || "");
    setEditNomeTecnico(nomeTecnico || "");
    setAbaAtiva('HISTORICO');
    setModalAberto(true);
  };

  const salvarPerfil = async () => {
    if (!userUid) return;
    
    if (rawPhase !== 'SETUP' && rawPhase !== 'PRE_SEASON' && rawPhase !== 'FINISHED') {
        toast.error("O campeonato está em andamento! Trocas proibidas.");
        return;
    }

    if (editNomeTime.length < 3 || editNomeTecnico.length < 3) {
        toast.error("Nomes muito curtos!");
        return;
    }

    setSalvando(true);
    try {
        await updateDoc(doc(db, "usuarios", userUid), {
            nomeTime: editNomeTime,
            nomeTecnico: editNomeTecnico
        });
        toast.success("Identidade do clube atualizada!");
        setModalAberto(false);
    } catch (error) {
        toast.error("Erro ao salvar.");
    } finally {
        setSalvando(false);
    }
  };

  const titulos = historico.filter((h: any) => h.campeao).length;

  const RenderLogo = () => (
    <div className="flex items-center gap-2">
      <img 
        src="/header.png" 
        alt="FootDraft Logo" 
        className="h-13 w-auto object-contain rounded-md" // Ajuste o h-10 (altura) conforme preferir (h-8, h-12)
      />
    </div>
  );

  if (!userUid) {
    return (
      <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 shadow-[0_4px_30px_rgba(0,0,0,0.5)] h-23 flex items-center justify-center font-fifa">
        <RenderLogo />
      </header>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 shadow-[0_4px_30px_rgba(0,0,0,0.5)] font-fifa">
        <div className="w-full px-4 md:px-8 max-w-7xl mx-auto h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <RenderLogo />
              <span className="hidden md:inline-block text-[10px] bg-neutral-900 border border-fifa-gray-dark text-fifa-gray-light px-2 py-0.5 rounded font-bold tracking-wider ml-2">
                v1.2 B2X
              </span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-1 bg-neutral-900/80 p-1 rounded-full border border-neutral-800 shadow-inner">
            <button onClick={() => navigate('/dashboard')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all uppercase tracking-widest ${path === '/dashboard' ? 'bg-fifa-blue text-white shadow-[0_0_10px_rgba(42,57,141,0.5)] border border-transparent' : 'text-fifa-gray-light hover:text-white hover:bg-neutral-800'}`}>Centro de Treinamento</button>
            <button onClick={() => navigate('/championship')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all uppercase tracking-widest ${path === '/championship' ? 'bg-fifa-green text-white shadow-[0_0_10px_rgba(60,172,59,0.5)] border border-transparent' : 'text-fifa-gray-light hover:text-white hover:bg-neutral-800'}`}>Campeonato</button>
            
            <div className="w-px h-4 bg-neutral-700 mx-2"></div>
            
            <div className="px-3 py-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-fifa-red animate-pulse shadow-[0_0_8px_rgba(230,29,37,0.8)]"></span>
              <span className="text-[10px] font-black text-fifa-gray-light uppercase tracking-widest">{faseAtual}</span>
            </div>
          </nav>

          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin')} className="hidden md:flex text-[12px] bg-neutral-900 border border-neutral-800 hover:border-fifa-gray-dark text-fifa-gray-light px-3 py-2 rounded-lg font-black uppercase tracking-widest transition-colors">CBF</button>

            <div className="flex items-center gap-3 pl-4 border-l border-neutral-800">
              
              {/* O SEU AVATAR AGORA É UM BOTÃO CLICÁVEL QUE ABRE A HISTÓRIA DO TIME */}
              <button 
                onClick={abrirModal}
                title="Ver Sala de Troféus e Perfil"
                className="flex items-center gap-2 bg-neutral-900/50 hover:bg-neutral-800 py-1 pl-1 pr-4 rounded-full border border-neutral-800 shadow-inner transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-linear-to-br from-fifa-blue to-fifa-red flex items-center justify-center text-xs font-black text-white shadow-md shrink-0">
                  {(nomeTime || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-[11px] font-bold text-white leading-tight truncate max-w-25">
                    {nomeTecnico || 'Manager'}
                  </p>
                  <p className="text-[9px] text-fifa-green uppercase font-black tracking-widest leading-tight truncate max-w-25">
                    {nomeTime || 'Sem Clube'}
                  </p>
                </div>
              </button>
              
              <button onClick={handleLogout} className="p-2 bg-neutral-900 hover:bg-fifa-red/20 border border-neutral-800 hover:border-fifa-red/50 rounded-full text-fifa-gray-light hover:text-fifa-red transition-all shadow-sm" title="Sair do Jogo">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MODAL DE HISTÓRICO / EDIÇÃO DE PERFIL */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm font-fifa">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4 border-b border-neutral-800 w-full pb-2">
                    <button 
                        onClick={() => setAbaAtiva('HISTORICO')} 
                        className={`uppercase font-black text-xs sm:text-sm tracking-widest transition-colors pb-2 -mb-2.25 border-b-2 ${abaAtiva === 'HISTORICO' ? 'text-yellow-500 border-yellow-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                    >
                        Sala de Troféus
                    </button>
                    <button 
                        onClick={() => setAbaAtiva('EDITAR')} 
                        className={`uppercase font-black text-xs sm:text-sm tracking-widest transition-colors pb-2 -mb-2.25 border-b-2 ${abaAtiva === 'EDITAR' ? 'text-fifa-blue border-fifa-blue' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                    >
                        Editar Carreira
                    </button>
                </div>
                <button onClick={() => setModalAberto(false)} className="text-neutral-500 hover:text-white font-black text-lg ml-4 mb-2">X</button>
            </div>

            {/* ABA DE HISTÓRICO */}
            {abaAtiva === 'HISTORICO' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-4">
                    
                    <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex justify-around text-center mb-2 shadow-inner">
                        <div>
                            <p className="text-3xl font-black text-yellow-500">{titulos}</p>
                            <p className="text-[8px] uppercase tracking-widest text-neutral-400 font-bold mt-1">Troféus</p>
                        </div>
                        <div>
                            <p className="text-3xl font-black text-white">{historico.length}</p>
                            <p className="text-[8px] uppercase tracking-widest text-neutral-400 font-bold mt-1">Temporadas</p>
                        </div>
                    </div>

                    {historico.length === 0 ? (
                        <p className="text-center text-neutral-500 text-xs uppercase font-bold tracking-widest py-8">Você ainda não concluiu nenhuma temporada.</p>
                    ) : (
                        historico.map((campanha, idx) => (
                            <div key={idx} className={`p-4 rounded-xl border flex flex-col gap-3 ${campanha.campeao ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-neutral-950 border-neutral-800'}`}>
                                <div className="flex justify-between items-center border-b border-neutral-800/50 pb-2">
                                    <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">{campanha.temporada}</span>
                                    {campanha.campeao && <span className="text-[10px] bg-yellow-500 text-neutral-900 font-black px-2 py-0.5 rounded uppercase tracking-widest">🏆 CAMPEÃO</span>}
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <span className={`text-4xl font-black leading-none ${campanha.posicao === 1 ? 'text-yellow-500' : campanha.posicao <= 4 ? 'text-cyan-400' : 'text-white'}`}>
                                            {campanha.posicao}º
                                        </span>
                                        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 ml-1">Lugar</span>
                                    </div>
                                    <div className="flex gap-4 text-right">
                                        <div>
                                            <p className="text-lg font-black text-white leading-none">{campanha.pontos}</p>
                                            <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">PTS</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-black text-neutral-300 leading-none">{campanha.vitorias}</p>
                                            <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">VIT</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-black text-neutral-300 leading-none">{campanha.saldo > 0 ? `+${campanha.saldo}` : campanha.saldo}</p>
                                            <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">SG</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )).reverse() 
                    )}
                </div>
            )}

            {/* ABA DE EDIÇÃO */}
            {abaAtiva === 'EDITAR' && (
                <div className="flex-1 flex flex-col h-full">
                    <div className="bg-fifa-blue/10 border border-fifa-blue/30 p-3 rounded-lg mb-6 text-center">
                        <p className="text-[10px] text-fifa-blue uppercase font-bold tracking-widest">As mudanças são refletidas em todo o sistema. Trocas proibidas durante o torneio.</p>
                    </div>
                    <div className="space-y-4 mb-auto">
                        <div>
                            <label className="block text-fifa-blue text-[10px] uppercase font-bold tracking-widest mb-1">Nome do Clube</label>
                            <input type="text" value={editNomeTime} onChange={e => setEditNomeTime(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-fifa-blue font-black tracking-tighter uppercase"/>
                        </div>
                        <div>
                            <label className="block text-cyan-400 text-[10px] uppercase font-bold tracking-widest mb-1">Treinador (Você)</label>
                            <input type="text" value={editNomeTecnico} onChange={e => setEditNomeTecnico(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-400 font-black tracking-tighter uppercase"/>
                        </div>
                    </div>
                    <button onClick={salvarPerfil} disabled={salvando} className="w-full mt-6 py-4 bg-fifa-green rounded-xl font-black text-white uppercase tracking-widest text-xs hover:bg-opacity-80 transition-colors shadow-lg disabled:opacity-50">
                        {salvando ? 'Aguarde...' : 'Salvar Alterações'}
                    </button>
                </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
