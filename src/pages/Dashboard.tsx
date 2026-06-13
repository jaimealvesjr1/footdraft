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

export default function Dashboard() {
  const navigate = useNavigate();
  const [elenco, setElenco] = useState<Jogador[]>([]);
  const [titularesIds, setTitularesIds] = useState<(string | null)[]>(Array(11).fill(null));
  const [formacao, setFormacao] = useState<Formacao>("4-3-3");
  const [nomeTime, setNomeTime] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
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
          
          // VACINA ANTI-CLONE: Destrói qualquer duplicata que tenha vindo de bugs antigos do Draft
          const elencoBruto = dados.elenco || [];
          const elencoUnico = Array.from(new Map(elencoBruto.map((j: Jogador) => [j.id, j])).values()) as Jogador[];
          
          setElenco(elencoUnico); // Carrega apenas jogadores únicos
          setNomeTime(dados.nomeTime || "Time Desconhecido");
          setNomeTecnico(dados.nomeTecnico || "Técnico");
          
          const formacaoDB = dados.formacao as Formacao;
          setFormacao(REGRAS_FORMACAO[formacaoDB] ? formacaoDB : "4-3-3");
          
          const titularesDB = dados.titularesIds;
          setTitularesIds(Array.isArray(titularesDB) && titularesDB.length === 11 ? titularesDB : Array(11).fill(null));
        }
        setCarregando(false);
      } else navigate("/");
    });
    return () => unsubscribe();
  }, [navigate]);

  const reservas = useMemo(() => elenco.filter(j => !titularesIds.includes(j.id)), [elenco, titularesIds]);
  const regraAtual = REGRAS_FORMACAO[formacao] || REGRAS_FORMACAO["4-3-3"];
  const isValido = titularesIds.every(id => id !== null);

  const salvarEscalacao = async () => {
    if (!isValido || !auth.currentUser) return;
    
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { titularesIds, formacao });
    
    await updateDoc(doc(db, "game", "state"), { 
      playersReady: arrayUnion(auth.currentUser.uid) 
    });
    
    navigate('/championship'); 
  };

  const abrirModal = (posicao: string, index: number, idAtual: string | null = null) => {
    setPosicaoModal(posicao); 
    setSlotIndex(index); // Agora o slotIndex é definido aqui
    setJogadorSendoSubstituido(idAtual); 
    setModalAberto(true);
  };

  const confirmarTroca = (idNovo: string) => {
    if (slotIndex === null) return;
    
    const novaLista = [...titularesIds];
    
    // PROTEÇÃO: Se o jogador já está no campo, tira ele da vaga antiga (faz um SWAP/Troca)
    const slotOcupado = novaLista.indexOf(idNovo);
    if (slotOcupado !== -1) {
      novaLista[slotOcupado] = null;
    }
    
    novaLista[slotIndex] = idNovo; 
    setTitularesIds(novaLista); 
    setModalAberto(false);
  };

  const removerDoTime = (id: string) => {
    setTitularesIds(prev => prev.filter(tid => tid !== id)); setModalAberto(false);
  };

  const renderLinhaCampo = (posicao: string, quantidade: number, offset: number) => {
    return (
      <div className="flex justify-center gap-2 sm:gap-4 w-full mb-4 z-10 relative">
        {Array.from({ length: quantidade }).map((_, i) => {
          const slotIndex = offset + i; // O índice exato de 0 a 10
          const jogadorId = titularesIds[slotIndex];
          const jogador = elenco.find(j => j.id === jogadorId);
          
          return (
            <div 
              key={slotIndex} 
              onClick={() => abrirModal(posicao, slotIndex, jogador?.id || null)}
              // O container base da carta com animação de flutuação no hover
              className="relative w-16 h-24 sm:w-24 sm:h-36 cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] group"
            >
              {jogador ? (
                /* --- CARTA DE JOGADOR PREENCHIDA --- */
                <div className={`w-full h-full flex flex-col justify-between p-1.5 sm:p-2 rounded-t-sm rounded-b-xl border-2 shadow-xl overflow-hidden
                  ${jogador.overall >= 88 
                    ? 'bg-linear-to-b from-yellow-200 via-yellow-600 to-neutral-950 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]' 
                    : 'bg-linear-to-b from-neutral-200 via-neutral-500 to-neutral-950 border-neutral-400 shadow-lg'
                  }`}
                >
                  {/* Topo da Carta: OVR e Posição */}
                  <div className="flex flex-col items-start leading-none z-10">
                    <span className={`text-sm sm:text-xl font-black tracking-tighter ${jogador.overall >= 88 ? 'text-yellow-950' : 'text-neutral-900'}`}>
                      {jogador.overall}
                    </span>
                    <span className={`text-[8px] sm:text-[10px] font-black uppercase ${jogador.overall >= 88 ? 'text-yellow-900' : 'text-neutral-800'}`}>
                      {jogador.posicao}
                    </span>
                  </div>

                  {/* Fundo da Carta: Nome e Ícones */}
                  <div className="flex flex-col items-center w-full mt-auto z-10">
                    {/* Linha divisória charmosa */}
                    <div className={`w-full h-px mb-1 opacity-40 ${jogador.overall >= 88 ? 'bg-yellow-950' : 'bg-black'}`}></div>
                    
                    <span className={`text-[9px] sm:text-xs font-black truncate w-full text-center tracking-tight leading-none pb-0.5 ${jogador.overall >= 88 ? 'text-yellow-100' : 'text-white'}`}>
                      {jogador.nome}
                    </span>
                    
                    {/* Ícones de Status Físico */}
                    <div className="flex gap-1 mt-1">
                      {(jogador.statusFisico?.cansaco ?? 0) > 50 && <span className="text-[10px] drop-shadow-md">🔋</span>}
                      {jogador.statusFisico?.lesionado && <span className="text-[10px] drop-shadow-md">🏥</span>}
                      {jogador.statusFisico?.suspenso && <span className="text-[10px] drop-shadow-md">🟥</span>}
                    </div>
                  </div>

                  {/* Efeito de brilho no fundo da carta */}
                  <div className="absolute top-0 left-0 w-full h-1/2 bg-linear-to-b from-white/30 to-transparent opacity-50 pointer-events-none"></div>
                </div>
              ) : (
                /* --- SLOT VAZIO (Aguardando Jogador) --- */
                <div className="w-full h-full bg-black/40 border-2 border-dashed border-white/20 rounded-t-sm rounded-b-xl flex flex-col items-center justify-center transition-colors group-hover:border-yellow-500/50 group-hover:bg-black/60">
                  <span className="text-white/20 text-xl sm:text-3xl font-black group-hover:text-yellow-500/50 transition-colors">+</span>
                  <span className="text-[8px] sm:text-[10px] text-white/30 font-bold uppercase mt-1 group-hover:text-yellow-500/50 transition-colors">
                    {posicao}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (carregando) return <div className="h-screen bg-neutral-950 flex items-center justify-center text-yellow-400 font-bold uppercase tracking-widest animate-pulse">Carregando Vestiário...</div>;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-sans">
      <div className="max-w-5xl mx-auto w-full">
        
        {/* Header de Controle */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">{nomeTime}</h1>
            <p className="text-cyan-400 font-bold uppercase tracking-widest text-xs mt-1">Técnico {nomeTecnico}</p>
          </div>
          <div className="flex gap-4 mt-4 md:mt-0 items-center">
            <select value={formacao} onChange={(e) => { setFormacao(e.target.value as Formacao); setTitularesIds(Array(11).fill(null)); }} className="bg-neutral-950 text-white p-3 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-yellow-500">
              <option value="4-3-3">Tática 4-3-3</option>
              <option value="4-4-2">Tática 4-4-2</option>
              <option value="3-5-2">Tática 3-5-2</option>
              <option value="4-5-1">Tática 4-5-1</option>
            </select>
            <button onClick={salvarEscalacao} disabled={!isValido} className={`px-8 py-3 rounded-lg font-black uppercase tracking-widest transition-all ${isValido ? 'bg-yellow-500 text-neutral-950 hover:bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'}`}>
              IR PARA O JOGO
            </button>
          </div>
        </div>

        {/* O CAMPO DE FUTEBOL VISUAL (Gramado Escuro Premium) */}
        <div className="relative w-full max-w-3xl mx-auto min-h-150 md:min-h-187.5 bg-linear-to-b from-[#0a2e1c] to-[#041a0e] rounded-xl border-4 border-white/10 overflow-hidden flex flex-col justify-evenly py-6 sm:py-8 shadow-2xl">
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

      {/* POPUP (MODAL) DE ESCOLHA DE JOGADORES */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-black text-white uppercase tracking-wider">Banco <span className="text-cyan-400">{posicaoModal}</span></h2>
              <button onClick={() => setModalAberto(false)} className="text-neutral-500 hover:text-white font-black text-xl bg-neutral-800 w-8 h-8 rounded-full flex items-center justify-center">X</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {reservas.filter(j => j.posicao === posicaoModal).length === 0 && (
                <p className="text-neutral-500 text-center py-8 text-sm font-bold uppercase tracking-widest">Nenhum {posicaoModal} disponível.</p>
              )}
              {reservas.filter(j => j.posicao === posicaoModal).map(j => {
                const isBloqueado = j.statusFisico?.lesionado || j.statusFisico?.suspenso;

                return (
                  <button 
                    key={j.id} 
                    onClick={() => !isBloqueado && confirmarTroca(j.id)} 
                    disabled={isBloqueado}
                    className={`w-full p-4 rounded-lg flex justify-between items-center transition-all text-left border relative overflow-hidden
                      ${isBloqueado ? 'bg-neutral-950 border-neutral-800 opacity-50 cursor-not-allowed grayscale' : 'bg-neutral-800 border-neutral-700 hover:border-yellow-500 cursor-pointer'}
                    `}
                  >
                    {!isBloqueado && <div className={`absolute top-0 left-0 w-1 h-full ${j.overall >= 88 ? 'bg-yellow-500' : 'bg-neutral-500'}`}></div>}
                    <div className="pl-2">
                      <p className="font-black text-neutral-200">{j.nome}</p>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase mt-1">{j.clubeHistorico}</p>
                      
                      {isBloqueado && (
                        <p className="text-xs text-orange-500 font-bold mt-1">INAPTO PARA JOGAR (Lesão/Cartão)</p>
                      )}
                    </div>
                    <span className={`text-sm px-3 py-2 rounded font-black border ${j.overall >= 88 ? 'bg-yellow-900/50 text-yellow-500 border-yellow-700/50' : 'bg-neutral-900 text-white border-neutral-700'}`}>{j.overall}</span>
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
