import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import toast from 'react-hot-toast';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [nomeTime, setNomeTime] = useState<string | null>(null);
  const [nomeTecnico, setNomeTecnico] = useState<string | null>(null);
  const [xpTotal, setXpTotal] = useState<number>(0);
  const [faseAtual, setFaseAtual] = useState<string>("Carregando...");
  const [rawPhase, setRawPhase] = useState<string>("");
  const [historico, setHistorico] = useState<any[]>([]);
  const [rivalidades, setRivalidades] = useState<Record<string, any>>({});

  const [userUid, setUserUid] = useState<string | null>(null);
  const path = location.pathname;

  // ESTADOS DO MODAL DE PERFIL/HISTÓRICO/RANKING
  const [modalAberto, setModalAberto] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'HISTORICO' | 'EDITAR' | 'RANKING'>('HISTORICO');
  const [editNomeTime, setEditNomeTime] = useState("");
  const [editNomeTecnico, setEditNomeTecnico] = useState("");
  const [salvando, setSalvando] = useState(false);
  
  // ESTADOS DO RANKING
  const [rankingUsers, setRankingUsers] = useState<any[]>([]);
  const [carregandoRanking, setCarregandoRanking] = useState(false);

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
        setNomeTime(data.nomeTime || "");
        setNomeTecnico(data.nomeTecnico || "");
        setXpTotal(data.xpTotal || 0);
        setHistorico(data.historicoCampanhas || []);
        setRivalidades(data.rivalidades || {});
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

  // Carrega os usuários e ordena pelo XP
  const carregarRanking = async () => {
    setCarregandoRanking(true);
    try {
        const snap = await getDocs(collection(db, "usuarios"));
        const users: any[] = [];
        snap.forEach(doc => {
            const data = doc.data();
            if (data.nomeTime) {
                // Calcula o win rate para desempate ou exibição
                const hist = data.historicoCampanhas || [];
                const tJogos = hist.reduce((acc: number, h: any) => acc + (h.jogos || (h.vitorias + h.empates + h.derrotas) || 0), 0) || 1;
                const tVitorias = hist.reduce((acc: number, h: any) => acc + (h.vitorias || 0), 0);
                const winRateCalc = hist.length > 0 ? Math.round((tVitorias / tJogos) * 100) : 0;

                users.push({ 
                    id: doc.id, 
                    ...data,
                    winRateCalc,
                    titulosCalc: hist.filter((h: any) => h.campeao).length
                });
            }
        });
        // Ordena do maior XP para o menor
        users.sort((a, b) => (b.xpTotal || 0) - (a.xpTotal || 0));
        setRankingUsers(users);
    } catch (error) {
        toast.error("Erro ao carregar ranking.");
    } finally {
        setCarregandoRanking(false);
    }
  };

  // Toda vez que clicar na aba RANKING, recarrega os dados
  useEffect(() => {
      if (abaAtiva === 'RANKING' && modalAberto) {
          carregarRanking();
      }
  }, [abaAtiva, modalAberto]);

  const validarNomesUnicos = async (novoTime: string, novoTecnico: string) => {
    const usersSnap = await getDocs(collection(db, "usuarios"));
    let conflito = false;
    
    usersSnap.forEach(userDoc => {
        if (userDoc.id === userUid) return; 
        const dados = userDoc.data();
        
        if (dados.nomeTime?.trim().toLowerCase() === novoTime.trim().toLowerCase()) {
            toast.error(`O clube "${novoTime}" já existe na liga!`);
            conflito = true;
        }
        if (dados.nomeTecnico?.trim().toLowerCase() === novoTecnico.trim().toLowerCase()) {
            toast.error(`O técnico "${novoTecnico}" já possui um contrato na liga!`);
            conflito = true;
        }
    });
    
    return !conflito;
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
        const nomesLivres = await validarNomesUnicos(editNomeTime, editNomeTecnico);
        if (!nomesLivres) return;

        await updateDoc(doc(db, "usuarios", userUid), {
            nomeTime: editNomeTime.trim(),
            nomeTecnico: editNomeTecnico.trim()
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
  const artilharias = historico.filter((h: any) => h.teveArtilheiro).length;
  
  const totalJogos = historico.reduce((acc, h) => acc + (h.jogos || (h.vitorias + h.empates + h.derrotas) || 0), 0) || 1;
  const totalVitorias = historico.reduce((acc, h) => acc + (h.vitorias || 0), 0);
  const saldoGlobal = historico.reduce((acc, h) => acc + (h.saldo || 0), 0);
  const winRate = historico.length > 0 ? Math.round((totalVitorias / totalJogos) * 100) : 0;

  const RenderLogo = () => (
    <div className="flex items-center gap-2">
      <img src="/header.png" alt="FootDraft Logo" className="h-13 w-auto object-contain rounded-md" />
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
              <span className="hidden md:inline-block text-[10px] bg-neutral-900 border border-fifa-gray-dark text-fifa-gray-light px-2 py-0.5 rounded font-bold tracking-wider ml-2">v1.2 B2X</span>
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
              <button onClick={abrirModal} title="Ver Sala de Troféus e Perfil" className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 py-1 pl-1 pr-4 rounded-full border border-neutral-800 shadow-inner transition-colors text-left relative overflow-hidden group">
                <div className="w-8 h-8 rounded-full bg-neutral-950 border border-fifa-green flex items-center justify-center text-xs font-black text-white shadow-md shrink-0 z-10">
                  {Math.floor(xpTotal / 100) + 1}
                </div>
                <div className="hidden sm:block text-left z-10">
                  <p className="text-[11px] font-bold text-white leading-tight truncate max-w-25">{nomeTecnico || 'Manager'}</p>
                  <p className="text-[9px] text-fifa-green uppercase font-black tracking-widest leading-tight truncate max-w-25">{nomeTime || 'Sem Clube'}</p>
                </div>
              </button>
              <button onClick={handleLogout} className="p-2 bg-neutral-900 hover:bg-fifa-red/20 border border-neutral-800 hover:border-fifa-red/50 rounded-full text-fifa-gray-light hover:text-fifa-red transition-all shadow-sm" title="Sair do Jogo">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm font-fifa">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            
            <div className="bg-linear-to-r from-neutral-950 to-neutral-900 p-6 border-b border-neutral-800 relative">
                <button onClick={() => setModalAberto(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white font-black text-lg bg-neutral-800 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10">X</button>
                <div className="flex items-center gap-4 relative z-0">
                    <div className="w-20 h-20 bg-neutral-950 border-2 border-fifa-green rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(60,172,59,0.3)] shrink-0">
                        <span className="text-3xl font-black text-fifa-green">{Math.floor(xpTotal / 100) + 1}</span>
                    </div>
                    <div className="overflow-hidden">
                        <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter leading-none truncate">{editNomeTime || "Sem Clube"}</h2>
                        <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1 mb-2 truncate">Téc: {editNomeTecnico || "Desconhecido"}</p>
                        <span className="text-[10px] bg-fifa-green/20 text-fifa-green px-2 py-1 rounded font-black tracking-widest uppercase border border-fifa-green/30 inline-block truncate max-w-full">
                            {xpTotal} XP Acumulado
                        </span>
                    </div>
                </div>
            </div>

            {/* ABAS NAVEGAÇÃO */}
            <div className="flex border-b border-neutral-800 px-4 pt-4 bg-neutral-900 overflow-x-auto custom-scrollbar">
                <button 
                    onClick={() => setAbaAtiva('HISTORICO')} 
                    className={`uppercase font-black text-[10px] sm:text-xs tracking-widest transition-colors pb-3 border-b-2 px-2 flex-1 whitespace-nowrap ${abaAtiva === 'HISTORICO' ? 'text-yellow-500 border-yellow-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                >
                    Resumo
                </button>
                <button 
                    onClick={() => setAbaAtiva('RANKING')} 
                    className={`uppercase font-black text-[10px] sm:text-xs tracking-widest transition-colors pb-3 border-b-2 px-2 flex-1 whitespace-nowrap ${abaAtiva === 'RANKING' ? 'text-purple-400 border-purple-400' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                >
                    Ranking
                </button>
                <button 
                    onClick={() => setAbaAtiva('EDITAR')} 
                    className={`uppercase font-black text-[10px] sm:text-xs tracking-widest transition-colors pb-3 border-b-2 px-2 flex-1 whitespace-nowrap ${abaAtiva === 'EDITAR' ? 'text-fifa-blue border-fifa-blue' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                >
                    Identidade
                </button>
            </div>

            <div className="p-4 sm:p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                
                {/* ABA DE HISTÓRICO */}
                {abaAtiva === 'HISTORICO' && (
                    <div className="flex flex-col gap-6 animate-fade-in">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                <p className="text-2xl font-black text-yellow-500 leading-none">{titulos}</p>
                                <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Taças Levantadas</p>
                            </div>
                            <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                <p className="text-2xl font-black text-white leading-none">{winRate}%</p>
                                <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Taxa de Vitórias</p>
                            </div>
                            <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                <p className="text-2xl font-black text-orange-500 leading-none">{artilharias}</p>
                                <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Chuteiras de Ouro</p>
                            </div>
                            <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                <p className={`text-2xl font-black leading-none ${saldoGlobal > 0 ? 'text-fifa-green' : saldoGlobal < 0 ? 'text-fifa-red' : 'text-neutral-400'}`}>
                                    {saldoGlobal > 0 ? `+${saldoGlobal}` : saldoGlobal}
                                </p>
                                <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Saldo Histórico</p>
                            </div>
                        </div>

                        <div className="border-t border-neutral-800 pt-4">
                            <h3 className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-3 text-center">Registro de Campanhas</h3>
                            {historico.length === 0 ? (
                                <p className="text-center text-neutral-600 text-xs uppercase font-bold tracking-widest py-6">O clube ainda não possui registros oficiais.</p>
                            ) : (
                                <div className="space-y-3">
                                    {historico.map((campanha, idx) => (
                                        <div key={idx} className={`p-3 rounded-xl border flex flex-col gap-3 ${campanha.campeao ? 'bg-yellow-900/10 border-yellow-500/30 shadow-[inset_0_0_15px_rgba(234,179,8,0.05)]' : 'bg-neutral-950 border-neutral-800'}`}>
                                            <div className="flex justify-between items-center border-b border-neutral-800/50 pb-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[12px] text-white uppercase font-black tracking-widest truncate max-w-40 sm:max-w-48">
                                                        {campanha.nomeCampeonato || 'Campeonato Base'}
                                                    </span>
                                                    <span className="text-[8px] text-neutral-500 uppercase font-bold tracking-widest truncate max-w-40 mt-0.5">
                                                        Edição: {campanha.temporada}
                                                    </span>
                                                </div>

                                                <div className="flex flex-col gap-1 items-end shrink-0">
                                                    {campanha.campeao && <span className="text-[9px] bg-yellow-500 text-neutral-900 font-black px-1.5 py-0.5 rounded uppercase tracking-widest leading-none">🏆 Campeão</span>}
                                                    {campanha.teveArtilheiro && <span className="text-[9px] bg-orange-500 text-neutral-900 font-black px-1.5 py-0.5 rounded uppercase tracking-widest leading-none">👞 Artilheiro</span>}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-lg border ${campanha.posicao === 1 ? 'bg-yellow-500 text-black border-yellow-400' : campanha.posicao <= 4 ? 'bg-cyan-900 text-cyan-400 border-cyan-700' : 'bg-neutral-900 text-white border-neutral-700'}`}>
                                                        {campanha.posicao}º
                                                    </div>
                                                    <span className="text-[9px] uppercase font-bold tracking-widest text-neutral-500 leading-tight">Posição<br/>Final</span>
                                                </div>
                                                <div className="flex gap-3 sm:gap-4 text-right">
                                                    <div>
                                                        <p className="text-base font-black text-white leading-none">{campanha.pontos}</p>
                                                        <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">PTS</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-neutral-300 leading-none">{campanha.vitorias}</p>
                                                        <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">VIT</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-neutral-300 leading-none">{campanha.saldo > 0 ? `+${campanha.saldo}` : campanha.saldo}</p>
                                                        <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">SG</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )).reverse()}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ABA DE RANKING GLOBAL */}
                {abaAtiva === 'RANKING' && (
                    <div className="flex flex-col animate-fade-in">
                        <div className="bg-purple-900/10 border border-purple-500/30 p-3 rounded-lg mb-4 text-center shadow-inner">
                            <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest leading-relaxed">
                                Placar de Líderes Global.<br/>Ganhe XP jogando campeonatos na CBF.
                            </p>
                        </div>
                        
                        {carregandoRanking ? (
                            <div className="flex flex-col items-center justify-center py-10">
                                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Calculando posições...</span>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {rankingUsers.map((user, idx) => {
                                    const isMe = user.id === userUid;
                                    const userNivel = Math.floor((user.xpTotal || 0) / 100) + 1;
                                    return (
                                        <div key={user.id} className={`flex items-center justify-between p-3 rounded-xl border ${isMe ? 'bg-purple-900/20 border-purple-500/50' : 'bg-neutral-950 border-neutral-800'}`}>
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-6 text-center shrink-0">
                                                    <span className={`font-black text-sm ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-neutral-400' : idx === 2 ? 'text-orange-500' : 'text-neutral-600'}`}>{idx + 1}º</span>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center font-black text-xs text-white shrink-0">
                                                    {userNivel}
                                                </div>
                                                <div className="flex flex-col truncate">
                                                    <span className={`text-[11px] sm:text-xs font-black uppercase tracking-tighter truncate ${isMe ? 'text-purple-400' : 'text-white'}`}>
                                                        {user.nomeTime} {isMe && '(Você)'}
                                                    </span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[8px] sm:text-[9px] text-neutral-500 font-bold uppercase tracking-widest truncate max-w-24 sm:max-w-32">
                                                            {user.nomeTecnico}
                                                        </span>
                                                        {user.titulosCalc > 0 && <span className="text-[8px] text-yellow-500">🏆 {user.titulosCalc}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-neutral-900 px-2 py-1 rounded border border-neutral-800 text-center shrink-0 ml-2">
                                                <span className="block text-xs sm:text-sm font-black text-fifa-green leading-none">{user.xpTotal || 0}</span>
                                                <span className="block text-[8px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">XP</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        
                        <div className="mt-6 pt-4 border-t border-neutral-800">
                            <h3 className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-3 text-center">Rivalidades (Confronto Direto)</h3>
                            
                            {(() => {
                                const listaRivalidades = Object.values(rivalidades).sort((a: any, b: any) => b.jogos - a.jogos);
                                
                                if (listaRivalidades.length === 0) {
                                    return (
                                        <div className="bg-neutral-950 border border-neutral-800 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-50">
                                            <span className="text-3xl mb-2">⚔️</span>
                                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest leading-relaxed">
                                                Nenhum confronto registrado na sua história.
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-2 max-h-50 overflow-y-auto custom-scrollbar pr-1">
                                        {listaRivalidades.map((riv: any, idx: number) => {
                                            const isFregues = riv.vitorias > riv.derrotas;
                                            const isPai = riv.derrotas > riv.vitorias;

                                            return (
                                                <div key={idx} className={`bg-neutral-950 border p-3 rounded-xl flex items-center justify-between transition-colors
                                                    ${isFregues ? 'border-fifa-green/30 hover:border-fifa-green' : isPai ? 'border-fifa-red/30 hover:border-fifa-red' : 'border-neutral-800'}
                                                `}>
                                                    <div className="flex flex-col truncate max-w-[50%]">
                                                        <span className="text-[11px] font-black text-white uppercase tracking-tighter truncate">{riv.nomeAdversario}</span>
                                                        <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">{riv.jogos} Jogos Disputados</span>
                                                    </div>
                                                    <div className="flex gap-3 text-center shrink-0 items-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-xs font-black text-fifa-green">{riv.vitorias}</span>
                                                            <span className="text-[7px] text-neutral-500 font-bold uppercase">VIT</span>
                                                        </div>
                                                        <div className="flex flex-col items-center opacity-60">
                                                            <span className="text-xs font-black text-neutral-400">{riv.empates}</span>
                                                            <span className="text-[7px] text-neutral-500 font-bold uppercase">EMP</span>
                                                        </div>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-xs font-black text-fifa-red">{riv.derrotas}</span>
                                                            <span className="text-[7px] text-neutral-500 font-bold uppercase">DER</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* ABA DE EDIÇÃO */}
                {abaAtiva === 'EDITAR' && (
                    <div className="flex-1 flex flex-col animate-fade-in">
                        <div className="bg-fifa-blue/10 border border-fifa-blue/30 p-3 rounded-lg mb-6 text-center shadow-inner">
                            <p className="text-[10px] text-fifa-blue uppercase font-bold tracking-widest leading-relaxed">
                                Os nomes escolhidos serão únicos no servidor.<br/>Trocas só são permitidas fora de temporada.
                            </p>
                        </div>
                        <div className="space-y-4 mb-auto">
                            <div>
                                <label className="block text-fifa-blue text-[10px] uppercase font-black tracking-widest mb-1.5">Nome da Franquia (Clube)</label>
                                <input type="text" value={editNomeTime} onChange={e => setEditNomeTime(e.target.value)} placeholder="Ex: Galáticos FC" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 sm:p-4 text-white focus:outline-none focus:border-fifa-blue font-black tracking-tighter uppercase transition-colors"/>
                            </div>
                            <div>
                                <label className="block text-cyan-400 text-[10px] uppercase font-black tracking-widest mb-1.5">Nome do Treinador (Você)</label>
                                <input type="text" value={editNomeTecnico} onChange={e => setEditNomeTecnico(e.target.value)} placeholder="Ex: Pep Guardiola" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 sm:p-4 text-white focus:outline-none focus:border-cyan-400 font-black tracking-tighter uppercase transition-colors"/>
                            </div>
                        </div>
                        <button onClick={salvarPerfil} disabled={salvando} className="w-full mt-8 py-4 bg-fifa-green rounded-xl font-black text-white uppercase tracking-widest text-xs hover:bg-opacity-80 transition-all shadow-[0_0_15px_rgba(60,172,59,0.3)] disabled:opacity-50 disabled:cursor-not-allowed">
                            {salvando ? 'Verificando Servidor...' : 'Assinar Contrato (Salvar)'}
                        </button>
                    </div>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
