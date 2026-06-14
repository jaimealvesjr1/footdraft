import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import type { Jogador } from "../types";

type Formacao = "4-3-3" | "4-4-2" | "3-5-2" | "4-5-1";
const REGRAS_FORMACAO: Record<Formacao, { DEF: number; MEI: number; ATA: number }> = {
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 },
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 },
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 },
  "4-5-1": { DEF: 4, MEI: 5, ATA: 1 },
};

const POSICOES_PERMITIDAS: Record<string, string[]> = {
  "GOL": ["GOL", "DEF"],
  "DEF": ["DEF", "GOL", "MEI"],
  "MEI": ["MEI", "DEF", "ATA"],
  "ATA": ["ATA", "MEI"]
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [elenco, setElenco] = useState<Jogador[]>([]);
  const [titularesIds, setTitularesIds] = useState<(string | null)[]>(Array(11).fill(null));
  const [formacao, setFormacao] = useState<Formacao>("4-3-3");
  const [nomeTime, setNomeTime] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [xpTotal, setXpTotal] = useState(0); 
  const [carregando, setCarregando] = useState(true);

  const [modalAberto, setModalAberto] = useState(false);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [posicaoModal, setPosicaoModal] = useState<string>('');
  const [jogadorSendoSubstituido, setJogadorSendoSubstituido] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists()) {
          const dados = docSnap.data();
          
          const elencoBruto = dados.elenco || [];
          const elencoUnico = Array.from(new Map(elencoBruto.map((j: Jogador) => [j.id, j])).values()) as Jogador[];
          
          setElenco(elencoUnico); 
          setNomeTime(dados.nomeTime || "Time Desconhecido");
          setNomeTecnico(dados.nomeTecnico || "Técnico");
          setXpTotal(dados.xpTotal || 0); 
          
          const formacaoDB = dados.formacao as Formacao;
          setFormacao(REGRAS_FORMACAO[formacaoDB] ? formacaoDB : "4-3-3");
          
          const titularsDB = dados.titularesIds;
          setTitularesIds(Array.isArray(titularsDB) && titularsDB.length === 11 ? titularsDB : Array(11).fill(null));
        }
        setCarregando(false);
      } else navigate("/");
    });
    return () => unsubscribe();
  }, [navigate]);

  const reservas = useMemo(() => elenco.filter(j => !titularesIds.includes(j.id)), [elenco, titularesIds]);
  const regraAtual = REGRAS_FORMACAO[formacao] || REGRAS_FORMACAO["4-3-3"];
  const isValido = titularesIds.every(id => id !== null);

  // 🚨 CORREÇÃO: Todos os Hooks (useMemo) precisam ficar ANTES do if (carregando) return...
  const posicoesAceitas = POSICOES_PERMITIDAS[posicaoModal] || [posicaoModal];
  
  const jogadoresParaModal = useMemo(() => {
    const filtrados = reservas.filter(j => posicoesAceitas.includes(j.posicao));
    
    return [...filtrados].sort((a, b) => {
      const aNativo = a.posicao === posicaoModal ? 1 : 0;
      const bNativo = b.posicao === posicaoModal ? 1 : 0;
      
      if (aNativo !== bNativo) {
        return bNativo - aNativo; 
      }
      return b.overall - a.overall;
    });
  }, [reservas, posicoesAceitas, posicaoModal]);

  const salvarEscalacao = async () => {
    if (!isValido || !auth.currentUser) return;
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { titularesIds, formacao });
    await updateDoc(doc(db, "game", "state"), { playersReady: arrayUnion(auth.currentUser.uid) });
    navigate('/championship'); 
  };

  const abrirModal = (posicao: string, index: number, idAtual: string | null = null) => {
    setPosicaoModal(posicao); setSlotIndex(index); setJogadorSendoSubstituido(idAtual); setModalAberto(true);
  };

  const confirmarTroca = (idNovo: string) => {
    if (slotIndex === null) return;
    const novaLista = [...titularesIds];
    const slotOcupado = novaLista.indexOf(idNovo);
    if (slotOcupado !== -1) novaLista[slotOcupado] = null;
    novaLista[slotIndex] = idNovo; 
    setTitularesIds(novaLista); 
    setModalAberto(false);
  };

  const removerDoTime = (id: string) => {
    setTitularesIds(prev => prev.filter(tid => tid !== id)); setModalAberto(false);
  };

  const calcularForcaSetor = (posicaoAlvo: string, offset: number, quantidade: number) => {
    let soma = 0;
    let validos = 0;
    
    for (let i = 0; i < quantidade; i++) {
      const jogadorId = titularesIds[offset + i];
      const jogador = elenco.find(j => j.id === jogadorId);
      if (jogador) {
        const isImprovisado = jogador.posicao !== posicaoAlvo;
        const penalidadeFadiga = [1, 0.9, 0.8, 0.7, 0.5];
        const nivelFadiga = Math.max(1, Math.min(5, jogador.statusFisico?.cansaco || 1)) - 1;
        
        let ovrReal = isImprovisado ? (jogador.overall * 0.85) : jogador.overall;
        ovrReal *= penalidadeFadiga[nivelFadiga];
        
        if (jogador.statusFisico?.lesionado || jogador.statusFisico?.suspenso) ovrReal = 0;
        
        soma += ovrReal;
        validos++;
      }
    }
    return validos > 0 ? Math.round(soma / validos) : 0;
  };

  const ovrAtaque = calcularForcaSetor('ATA', 0, regraAtual.ATA);
  const ovrMeio = calcularForcaSetor('MEI', regraAtual.ATA, regraAtual.MEI);
  const ovrDefesa = Math.round((calcularForcaSetor('DEF', regraAtual.ATA + regraAtual.MEI, regraAtual.DEF) * 0.8) + (calcularForcaSetor('GOL', 10, 1) * 0.2));
  const ovrGeral = Math.round((ovrAtaque + ovrMeio + ovrDefesa) / (isValido ? 3 : 1));

  const renderEnergia = (cansacoLevel: number) => {
    const fadiga = Math.max(1, Math.min(5, cansacoLevel || 1));
    const energia = 6 - fadiga; 
    const cor = energia >= 4 ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : energia === 3 ? 'bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.5)]' : 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]';
    return (
      <div className="flex gap-0.5 items-center" title={`Fadiga: ${fadiga}/5 (Energia: ${energia}/5)`}>
        {[1, 2, 3, 4, 5].map(i => <div key={i} className={`w-1.5 h-2.5 rounded-[1px] ${i <= energia ? cor : 'bg-neutral-900 border border-neutral-700/50'}`}></div>)}
      </div>
    );
  };

  const renderLinhaCampo = (posicao: string, quantidade: number, offset: number) => {
    return (
      <div className="flex justify-center gap-2 sm:gap-4 w-full mb-4 z-10 relative">
        {Array.from({ length: quantidade }).map((_, i) => {
          const slotOcupado = offset + i; 
          const jogadorId = titularesIds[slotOcupado];
          const jogador = elenco.find(j => j.id === jogadorId);
          
          const isImprovisado = jogador && jogador.posicao !== posicao;
          const overallExibido = jogador ? (isImprovisado ? Math.floor(jogador.overall * 0.85) : jogador.overall) : 0;
          
          return (
            <div key={slotOcupado} onClick={() => abrirModal(posicao, slotOcupado, jogador?.id || null)} className="relative w-16 h-24 sm:w-24 sm:h-37.5 cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] group">
              {jogador ? (
                <div className={`w-full h-full flex flex-col justify-between p-1.5 sm:p-2 rounded-t-sm rounded-b-xl border-2 shadow-xl overflow-hidden ${overallExibido >= 88 ? 'bg-linear-to-b from-yellow-200 via-yellow-600 to-neutral-950 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-linear-to-b from-neutral-200 via-neutral-500 to-neutral-950 border-neutral-400 shadow-lg'}`}>
                  <div className="flex flex-col items-start leading-none z-10">
                    <span className={`text-sm sm:text-xl font-black tracking-tighter ${overallExibido >= 88 ? 'text-yellow-950' : 'text-white'}`}>{overallExibido}</span>
                    <span className={`text-[8px] sm:text-[10px] font-black uppercase ${overallExibido >= 88 ? 'text-yellow-900' : 'text-neutral-400'}`}>
                      {isImprovisado ? `IMP (${jogador.posicao})` : jogador.posicao}
                    </span>
                  </div>
                  <div className="flex flex-col items-center w-full mt-auto z-10">
                    <div className={`w-full h-px mb-1 opacity-40 ${overallExibido >= 88 ? 'bg-yellow-950' : 'bg-black'}`}></div>
                    <span className={`text-[9px] sm:text-xs font-black truncate w-full text-center tracking-tight leading-none pb-1 ${overallExibido >= 88 ? 'text-yellow-100' : 'text-white'}`}>{jogador.nome}</span>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5 w-full">
                      {renderEnergia(jogador.statusFisico?.cansaco ?? 1)}
                      {jogador.statusFisico?.lesionado && <span className="text-[10px] drop-shadow-md">🏥</span>}
                      {jogador.statusFisico?.suspenso && <span className="text-[10px] drop-shadow-md">🟥</span>}
                      {isImprovisado && <span className="text-[10px] drop-shadow-md text-red-600" title="Improvisado (-15% OVR)">⚠️</span>}
                    </div>
                  </div>
                  <div className="absolute top-0 left-0 w-full h-1/2 bg-linear-to-b from-white/30 to-transparent opacity-50 pointer-events-none"></div>
                </div>
              ) : (
                <div className="w-full h-full bg-black/40 border-2 border-dashed border-white/20 rounded-t-sm rounded-b-xl flex flex-col items-center justify-center transition-colors group-hover:border-yellow-500/50 group-hover:bg-black/60">
                  <span className="text-white/20 text-xl sm:text-3xl font-black group-hover:text-yellow-500/50 transition-colors">+</span>
                  <span className="text-[8px] sm:text-[10px] text-white/30 font-bold uppercase mt-1 group-hover:text-yellow-500/50 transition-colors">{posicao}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 🚨 O RETURN ANTECIPADO FICA ABAIXO DE TODOS OS HOOKS
  if (carregando) return <div className="h-screen bg-neutral-950 flex items-center justify-center text-yellow-400 font-bold uppercase tracking-widest animate-pulse">Carregando Vestiário...</div>;

  const nivelTecnico = Math.floor(xpTotal / 100) + 1;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-sans">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-center bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-neutral-950 border-2 border-cyan-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <span className="text-2xl font-black text-cyan-400">{nivelTecnico}</span>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">{nomeTime}</h1>
              <p className="text-cyan-400 font-bold uppercase tracking-widest text-xs mt-1">Técnico: {nomeTecnico} • <span className="text-yellow-500">{xpTotal} XP</span></p>
            </div>
          </div>
          <div className="flex gap-4 mt-4 md:mt-0 items-center w-full md:w-auto">
            <select value={formacao} onChange={(e) => { setFormacao(e.target.value as Formacao); setTitularesIds(Array(11).fill(null)); }} className="flex-1 md:flex-none bg-neutral-950 text-white p-4 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-yellow-500">
              <option value="4-3-3">Tática 4-3-3</option>
              <option value="4-4-2">Tática 4-4-2</option>
              <option value="3-5-2">Tática 3-5-2</option>
              <option value="4-5-1">Tática 4-5-1</option>
            </select>
            <button onClick={salvarEscalacao} disabled={!isValido} className={`flex-1 md:flex-none px-8 py-4 rounded-lg font-black uppercase tracking-widest transition-all ${isValido ? 'bg-yellow-500 text-neutral-950 hover:bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'}`}>
              IR PARA O JOGO
            </button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="w-full xl:w-72 flex flex-col gap-4">
            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-xl">
              <h3 className="text-neutral-500 font-black uppercase tracking-widest text-xs border-b border-neutral-800 pb-2 mb-4">Análise do Elenco</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-neutral-400">Geral</span>
                  <span className={`text-2xl font-black ${isValido ? 'text-yellow-400' : 'text-neutral-600'}`}>{isValido ? ovrGeral : '--'}</span>
                </div>
                <div className="space-y-2 pt-2 border-t border-neutral-800/50">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-blue-400">Ataque</span>
                      <span className="text-white">{ovrAtaque}</span>
                    </div>
                    <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, ovrAtaque)}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-green-400">Meio-Campo</span>
                      <span className="text-white">{ovrMeio}</span>
                    </div>
                    <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, ovrMeio)}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-orange-400">Defesa</span>
                      <span className="text-white">{ovrDefesa}</span>
                    </div>
                    <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-orange-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, ovrDefesa)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
              {!isValido && (
                <div className="mt-6 p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-center">
                  <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Escalação Incompleta</p>
                </div>
              )}
            </div>
            
            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-xl flex-1 flex flex-col">
              <h3 className="text-neutral-500 font-black uppercase tracking-widest text-xs border-b border-neutral-800 pb-2 mb-4">Plantel Atual</h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-neutral-400">Atletas Aptos</span>
                <span className="text-sm font-black text-cyan-400">{reservas.filter(r => !r.statusFisico?.lesionado && !r.statusFisico?.suspenso).length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-neutral-400">Dpto. Médico (DM)</span>
                <span className="text-sm font-black text-orange-500">{elenco.filter(r => r.statusFisico?.lesionado).length}</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm font-bold text-neutral-400">Suspensos</span>
                <span className="text-sm font-black text-red-500">{elenco.filter(r => r.statusFisico?.suspenso).length}</span>
              </div>
            </div>
          </div>

          <div className="relative flex-1 min-h-150 md:min-h-187.5 bg-linear-to-b from-[#0a2e1c] to-[#041a0e] rounded-xl border-4 border-white/10 overflow-hidden flex flex-col justify-evenly py-6 sm:py-8 shadow-2xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 border-b-4 border-x-4 border-white/20 rounded-b-xl"></div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-24 border-t-4 border-x-4 border-white/20 rounded-t-xl"></div>
            <div className="absolute top-1/2 left-0 w-full border-t-4 border-white/20"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-4 border-white/20 rounded-full"></div>

            {renderLinhaCampo('ATA', regraAtual.ATA, 0)}
            {renderLinhaCampo('MEI', regraAtual.MEI, regraAtual.ATA)}
            {renderLinhaCampo('DEF', regraAtual.DEF, regraAtual.ATA + regraAtual.MEI)}
            {renderLinhaCampo('GOL', 1, 10)}
          </div>
          
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-black text-white uppercase tracking-wider">Banco <span className="text-cyan-400">{posicaoModal}</span></h2>
              <button onClick={() => setModalAberto(false)} className="text-neutral-500 hover:text-white font-black text-xl bg-neutral-800 w-8 h-8 rounded-full flex items-center justify-center">X</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {jogadoresParaModal.length === 0 && (
                <p className="text-neutral-500 text-center py-8 text-sm font-bold uppercase tracking-widest">Nenhum jogador disponível para improvisar nesta vaga.</p>
              )}
              {jogadoresParaModal.map(j => {
                const isLesionado = j.statusFisico?.lesionado;
                const isSuspenso = j.statusFisico?.suspenso;
                const isBloqueado = isLesionado || isSuspenso;
                
                const isImprovisadoModal = j.posicao !== posicaoModal;
                const overallPenalizado = isImprovisadoModal ? Math.floor(j.overall * 0.85) : j.overall;

                return (
                  <button 
                    key={j.id} 
                    onClick={() => !isBloqueado && confirmarTroca(j.id)} 
                    disabled={isBloqueado}
                    className={`w-full p-4 rounded-lg flex justify-between items-center transition-all text-left border relative overflow-hidden
                      ${isBloqueado ? 'bg-neutral-950 border-neutral-800 opacity-50 cursor-not-allowed grayscale' : 'bg-neutral-800 border-neutral-700 hover:border-yellow-500 cursor-pointer'}
                    `}
                  >
                    {!isBloqueado && <div className={`absolute top-0 left-0 w-1 h-full ${overallPenalizado >= 88 ? 'bg-yellow-500' : 'bg-neutral-500'}`}></div>}
                    <div className="pl-2">
                      <p className="font-black text-neutral-200">{j.nome}</p>
                      <div className="text-[10px] text-neutral-400 font-bold uppercase mt-1 flex items-center gap-2 flex-wrap">
                        <span>{j.clubeHistorico}</span> 
                        <span className="bg-neutral-800 text-cyan-400 px-1.5 py-0.5 rounded border border-neutral-700">
                          {j.posicao}
                        </span>
                        {isImprovisadoModal && <span className="text-red-400 font-black">⚠️ Improvisado</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {renderEnergia(j.statusFisico?.cansaco ?? 1)}
                        {isLesionado && <span className="text-[10px] text-orange-500 font-bold ml-1">🏥 INAPTO (Tratamento Médico)</span>}
                        {isSuspenso && !isLesionado && <span className="text-[10px] text-red-500 font-bold ml-1">🟥 INAPTO (Suspenso 1 Jogo)</span>}
                      </div>
                    </div>
                    <span className={`text-sm px-3 py-2 rounded font-black border ${overallPenalizado >= 88 ? 'bg-yellow-900/50 text-yellow-500 border-yellow-700/50' : 'bg-neutral-900 text-white border-neutral-700'}`}>
                      {overallPenalizado}
                    </span>
                  </button>
                );
              })}
            </div>

            {jogadorSendoSubstituido && (
              <button onClick={() => removerDoTime(jogadorSendoSubstituido)} className="mt-4 w-full bg-neutral-950 hover:bg-neutral-800 text-neutral-400 font-bold py-4 rounded-lg border border-neutral-800 transition-colors uppercase tracking-widest text-sm">
                Remover jogador para o Banco
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
