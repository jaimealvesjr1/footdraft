import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc } from "firebase/firestore"; 
import { onAuthStateChanged } from "firebase/auth";
import type { Jogador } from "../types";
import toast from 'react-hot-toast';

type Formacao = "4-3-3" | "4-4-2" | "3-5-2" | "4-5-1" | "5-4-1" | "3-4-3";

type Mentalidade = 'OFENSIVA' | 'DEFENSIVA' | 'EQUILIBRADA';

// Mapeamento Formação -> Mentalidade
export const MENTALIDADE_TATICA: Record<Formacao, Mentalidade> = {
  "4-3-3": 'OFENSIVA',
  "3-4-3": 'OFENSIVA',
  "4-4-2": 'EQUILIBRADA',
  "3-5-2": 'EQUILIBRADA',
  "4-5-1": 'DEFENSIVA',
  "5-4-1": 'DEFENSIVA',
};

const REGRAS_FORMACAO: Record<Formacao, { DEF: number; MEI: number; ATA: number }> = {
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 }, // Ofensiva
  "3-4-3": { DEF: 3, MEI: 4, ATA: 3 }, // Ofensiva
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 }, // Equilibrada
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 }, // Equilibrada
  "4-5-1": { DEF: 4, MEI: 5, ATA: 1 }, // Defensiva
  "5-4-1": { DEF: 5, MEI: 4, ATA: 1 }, // Defensiva
};

const POSICOES_PERMITIDAS: Record<string, string[]> = {
  "GOL": ["GOL", "DEF"],
  "DEF": ["DEF", "GOL", "MEI"],
  "MEI": ["MEI", "DEF", "ATA"],
  "ATA": ["ATA", "MEI"]
};

// NOVO: Adicionamos atributos para identificar Bots e o seu OVR
interface ProximoJogo {
  rodada: number;
  adversarioId: string;
  adversarioNome: string;
  isCasa: boolean;
  isBot: boolean;
  adversarioOvr?: number;
}

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

  const [proximosJogos, setProximosJogos] = useState<ProximoJogo[]>([]);
  const [taticasSalvas, setTaticasSalvas] = useState<Record<string, (string | null)[]>>({});
  const [isSalvandoTatica, setIsSalvandoTatica] = useState(false);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubGame: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        
        unsubUser = onSnapshot(doc(db, "usuarios", user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const dados = docSnap.data();
            
            const elencoBruto = dados.elenco || [];
            const elencoUnico = Array.from(new Map(elencoBruto.map((j: Jogador) => [j.id, j])).values()) as Jogador[];
            
            setElenco(elencoUnico); 
            setNomeTime(dados.nomeTime || "Time Desconhecido");
            setNomeTecnico(dados.nomeTecnico || "Técnico");
            setXpTotal(dados.xpTotal || 0); 
            setTaticasSalvas(dados.taticasSalvas || {}); 
            
            const formacaoDB = dados.formacao as Formacao;
            setFormacao(REGRAS_FORMACAO[formacaoDB] ? formacaoDB : "4-3-3");
            
            const titularsDB = dados.titularesIds;
            setTitularesIds(Array.isArray(titularsDB) && titularsDB.length === 11 ? titularsDB : Array(11).fill(null));
          }
          setCarregando(false);
        });

        // NOVO: Adicionado async para podermos buscar os OVRs dos Bots em tempo real
        unsubGame = onSnapshot(doc(db, "game", "state"), async (gameSnap) => {
          if (gameSnap.exists()) {
            const gameData = gameSnap.data();
            const schedule = gameData.schedule || [];
            
            const indexNaoSimulada = schedule.findIndex((r: any) => r.jogos[0]?.homeScore == null);
            const rodadaVerdadeira = indexNaoSimulada !== -1 ? indexNaoSimulada + 1 : schedule.length;
            
            const proximos: ProximoJogo[] = [];
            
            for (let i = rodadaVerdadeira - 1; i < Math.min(rodadaVerdadeira + 2, schedule.length); i++) {
               const rodadaData = schedule[i];
               if (rodadaData && rodadaData.jogos) {
                 const meuJogo = rodadaData.jogos.find((j: any) => j.homeId === user.uid || j.awayId === user.uid);
                 if (meuJogo) {
                   const isCasa = meuJogo.homeId === user.uid;
                   const adversarioId = isCasa ? meuJogo.awayId : meuJogo.homeId;
                   const adversarioTeam = gameData.teams?.find((t: any) => t.id === adversarioId);
                   const adversarioNome = adversarioTeam?.nome || "Desconhecido";
                   const isBot = adversarioTeam ? !adversarioTeam.isUser : false;
                   
                   proximos.push({ 
                       rodada: i + 1, 
                       adversarioId, 
                       adversarioNome, 
                       isCasa, 
                       isBot 
                   });
                 }
               }
            }

            // BUSCADOR DE OVERALL DOS BOTS
            const proximosComOvr = await Promise.all(proximos.map(async (jogo) => {
                if (jogo.isBot) {
                    try {
                        const botDoc = await getDoc(doc(db, "clubes", jogo.adversarioId));
                        if (botDoc.exists()) {
                            const botElenco = botDoc.data().elenco || [];
                            const sorted = [...botElenco].sort((a: any, b: any) => b.overall - a.overall).slice(0, 11);
                            const sum = sorted.reduce((acc: number, jog: any) => acc + jog.overall, 0);
                            jogo.adversarioOvr = sorted.length > 0 ? Math.round(sum / sorted.length) : 0;
                        }
                    } catch(e) { 
                        console.log("Erro ao buscar OVR do bot", e);
                    }
                }
                return jogo;
            }));

            setProximosJogos(proximosComOvr);
          }
        });

      } else {
        navigate("/");
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUser) unsubUser();
      if (unsubGame) unsubGame();
    };
  }, [navigate]);

  const reservas = useMemo(() => elenco.filter(j => !titularesIds.includes(j.id)), [elenco, titularesIds]);
  const regraAtual = REGRAS_FORMACAO[formacao] || REGRAS_FORMACAO["4-3-3"];
  
  const isValido = titularesIds.every(id => {
    if (id === null) return false;
    const jogador = elenco.find(j => j.id === id);
    return jogador && !jogador.statusFisico?.lesionado && !jogador.statusFisico?.suspenso;
  });

  const posicoesAceitas = POSICOES_PERMITIDAS[posicaoModal] || [posicaoModal];
  
  const jogadoresParaModal = useMemo(() => {
    const filtrados = reservas.filter(j => posicoesAceitas.includes(j.posicao));
    
    return [...filtrados].sort((a, b) => {
      const aNativo = a.posicao === posicaoModal ? 1 : 0;
      const bNativo = b.posicao === posicaoModal ? 1 : 0;
      
      if (aNativo !== bNativo) return bNativo - aNativo; 
      return b.overall - a.overall;
    });
  }, [reservas, posicoesAceitas, posicaoModal]);

  const salvarEscalacao = async () => {
    if (!isValido || !auth.currentUser) return;
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { titularesIds, formacao });
    await updateDoc(doc(db, "game", "state"), { playersReady: arrayUnion(auth.currentUser.uid) });
    navigate('/championship'); 
  };

  const salvarTaticaComoPadrao = async () => {
    if (!auth.currentUser) return;
    if (titularesIds.includes(null)) {
      toast.error("Preencha todos os 11 jogadores antes de salvar a tática.");
      return;
    }

    setIsSalvandoTatica(true);
    try {
      const novasTaticas = { ...taticasSalvas, [formacao]: titularesIds };
      await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { 
        taticasSalvas: novasTaticas,
        titularesIds: titularesIds,
        formacao: formacao
      });
      setTaticasSalvas(novasTaticas);
      toast.success(`Tática ${formacao} salva como padrão!`);
    } catch (error) {
      toast.error("Erro ao salvar tática.");
    } finally {
      setIsSalvandoTatica(false);
    }
  };

  const mudarFormacao = (novaFormacao: Formacao) => {
    setFormacao(novaFormacao);
    if (taticasSalvas[novaFormacao]) {
      setTitularesIds(taticasSalvas[novaFormacao]);
      toast.success(`Tática ${novaFormacao} recuperada da memória.`);
    } else {
      setTitularesIds(Array(11).fill(null));
      toast("Organize os jogadores para esta nova tática.", { icon: '📋' });
    }
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
          
          const isPendurado = jogador?.statusFisico && (jogador.statusFisico as any).amarelos === 1;
          
          return (
            <div key={slotOcupado} onClick={() => abrirModal(posicao, slotOcupado, jogador?.id || null)} className="relative w-16 h-24 sm:w-24 sm:h-37.5 cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] group">
              {jogador ? (
                <div className={`w-full h-full flex flex-col justify-between p-1.5 sm:p-2 rounded-t-sm rounded-b-xl border-2 shadow-xl overflow-hidden transition-all ${overallExibido >= 88 ? 'bg-linear-to-br from-neutral-900 via-fifa-blue/40 to-fifa-green/40 border-fifa-green shadow-[0_0_20px_rgba(60,172,59,0.5)]' : 'bg-neutral-900 border-fifa-gray-dark shadow-lg hover:border-fifa-blue'}`}>
                  <div className="flex flex-col items-start leading-none z-10">
                    <span className={`text-sm sm:text-xl font-black tracking-tighter ${overallExibido >= 88 ? 'text-fifa-green' : 'text-white'}`}>{overallExibido}</span>
                    <span className="text-[8px] sm:text-[10px] font-black uppercase text-fifa-gray-light">
                      {isImprovisado ? `IMP (${jogador.posicao})` : jogador.posicao}
                    </span>
                  </div>
                  <div className="flex flex-col items-center w-full mt-auto z-10">
                    <div className={`w-full h-px mb-1 opacity-50 ${overallExibido >= 88 ? 'bg-fifa-green' : 'bg-fifa-gray-dark'}`}></div>
                    <span className="text-[9px] sm:text-xs font-black truncate w-full text-center tracking-tight leading-none pb-1 text-white drop-shadow-md">{jogador.nome}</span>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5 w-full">
                      {renderEnergia(jogador.statusFisico?.cansaco ?? 1)}
                      {jogador.statusFisico?.lesionado && <span className="text-[10px] drop-shadow-md">🏥</span>}
                      {jogador.statusFisico?.suspenso && <span className="text-[10px] drop-shadow-md">🟥</span>}
                      {isPendurado && <span className="text-[10px] drop-shadow-md" title="Pendurado (1 Amarelo)">🟨</span>}
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

  if (carregando) return <div className="h-screen bg-neutral-950 flex items-center justify-center text-yellow-400 font-bold uppercase tracking-widest animate-pulse">Carregando Centro de Treinamento...</div>;

  const nivelTecnico = Math.floor(xpTotal / 100) + 1;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-fifa">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-center bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-2xl gap-4 md:gap-0">
          <div className="flex items-center gap-4 sm:gap-6 w-full md:w-auto">
            <div className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 bg-neutral-950 border-2 border-fifa-blue rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(42,57,141,0.4)]">
              <span className="text-xl sm:text-2xl font-black text-fifa-blue">{nivelTecnico}</span>
            </div>
            <div className="overflow-hidden w-full">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white uppercase tracking-tighter truncate">{nomeTime}</h1>
              <p className="text-neutral-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1 truncate">Téc: {nomeTecnico} • <span className="text-fifa-red">{xpTotal} XP</span></p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-2 md:mt-0 w-full md:w-auto">
            <div className="flex gap-2 w-full sm:w-auto">
              <select 
                value={formacao} 
                onChange={(e) => mudarFormacao(e.target.value as Formacao)} 
                className="bg-neutral-950 text-white p-3 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-yellow-500"
              >
                <optgroup label="Ofensivas ⚔️ (+xG, Defesa Exposta)">
                  <option value="4-3-3">Tática 4-3-3</option>
                  <option value="3-4-3">Tática 3-4-3</option>
                </optgroup>
                <optgroup label="Equilibradas ⚖️ (Foco no OVR)">
                  <option value="4-4-2">Tática 4-4-2</option>
                  <option value="3-5-2">Tática 3-5-2</option>
                </optgroup>
                <optgroup label="Defensivas 🛡️ (-xG, Proteção Total)">
                  <option value="4-5-1">Tática 4-5-1</option>
                  <option value="5-4-1">Tática 5-4-1</option>
                </optgroup>
              </select>
              <button 
                onClick={salvarTaticaComoPadrao} 
                disabled={isSalvandoTatica || !isValido}
                title="Salvar esta escalação como Padrão"
                className={`flex items-center justify-center px-4 rounded-lg border transition-colors ${!isValido ? 'bg-neutral-800 border-neutral-800 text-neutral-600 cursor-not-allowed' : 'bg-neutral-900 border-fifa-blue text-fifa-blue hover:bg-fifa-blue hover:text-white shadow-[0_0_10px_rgba(42,57,141,0.3)]'}`}
              >
                💾
              </button>
            </div>
            
            <button onClick={salvarEscalacao} disabled={!isValido} className={`w-full sm:w-auto px-4 sm:px-8 py-3 sm:py-4 rounded-lg font-black uppercase tracking-widest transition-all text-xs sm:text-base ${isValido ? 'bg-fifa-green text-white hover:bg-opacity-90 shadow-[0_0_15px_rgba(60,172,59,0.4)]' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'}`}>
              IR PARA O JOGO
            </button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="w-full xl:w-72 flex flex-col gap-4 order-2 xl:order-1 mt-4 xl:mt-0">
            <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl">
              <h3 className="text-neutral-500 font-black uppercase tracking-widest text-[10px] sm:text-xs border-b border-neutral-800 pb-2 mb-4">Análise do Elenco</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm font-bold text-neutral-400">Geral</span>
                  <span className={`text-xl sm:text-2xl font-black ${isValido ? 'text-fifa-green' : 'text-neutral-600'}`}>{isValido ? ovrGeral : '--'}</span>
                </div>
                <div className="space-y-2 pt-2 border-t border-neutral-800/50">
                  <div>
                    <div className="flex justify-between text-[10px] sm:text-xs font-bold mb-1">
                      <span className="text-fifa-red">Ataque</span>
                      <span className="text-white">{ovrAtaque}</span>
                    </div>
                    <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-fifa-red h-full rounded-full transition-all" style={{ width: `${Math.min(100, ovrAtaque)}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] sm:text-xs font-bold mb-1">
                      <span className="text-fifa-green">Meio-Campo</span>
                      <span className="text-white">{ovrMeio}</span>
                    </div>
                    <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-fifa-green h-full rounded-full transition-all" style={{ width: `${Math.min(100, ovrMeio)}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] sm:text-xs font-bold mb-1">
                      <span className="text-fifa-blue">Defesa</span>
                      <span className="text-white">{ovrDefesa}</span>
                    </div>
                    <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-fifa-blue h-full rounded-full transition-all" style={{ width: `${Math.min(100, ovrDefesa)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
              {!isValido && (
                <div className="mt-6 p-3 bg-fifa-red/10 border border-fifa-red/30 rounded-lg text-center">
                  <p className="text-[8px] sm:text-[10px] text-fifa-red font-bold uppercase tracking-widest">
                    {titularesIds.includes(null) ? "Escalação Incompleta" : "Remova atletas inaptos (DM/Suspensos)"}
                  </p>
                </div>
              )}
            </div>
            
            <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl">
              <h3 className="text-neutral-500 font-black uppercase tracking-widest text-[10px] sm:text-xs border-b border-neutral-800 pb-2 mb-4">Plantel Atual</h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-neutral-400">Atletas Aptos</span>
                <span className="text-xs sm:text-sm font-black text-fifa-green">{reservas.filter(r => !r.statusFisico?.lesionado && !r.statusFisico?.suspenso).length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] sm:text-xs font-bold text-neutral-400">Dpto. Médico (DM)</span>
                <span className="text-xs sm:text-sm font-black text-fifa-blue">{elenco.filter(r => r.statusFisico?.lesionado).length}</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] sm:text-xs font-bold text-neutral-400">Suspensos (🟥)</span>
                <span className="text-xs sm:text-sm font-black text-fifa-red">{elenco.filter(r => r.statusFisico?.suspenso).length}</span>
              </div>
              <div className="flex justify-between items-center mt-2 border-t border-neutral-800/50 pt-2">
                <span className="text-[10px] sm:text-xs font-bold text-neutral-400">Pendurados (🟨)</span>
                <span className="text-xs sm:text-sm font-black text-yellow-500">{elenco.filter(r => r.statusFisico && (r.statusFisico as any).amarelos === 1 && !r.statusFisico.suspenso && !r.statusFisico.lesionado).length}</span>
              </div>
            </div>

            <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl flex-1 flex flex-col">
              <h3 className="text-neutral-500 font-black uppercase tracking-widest text-[10px] sm:text-xs border-b border-neutral-800 pb-2 mb-4">Próximos Confrontos</h3>
              {proximosJogos.length === 0 ? (
                 <p className="text-[10px] text-neutral-500 italic">Sem jogos agendados.</p>
              ) : (
                 <ul className="space-y-3">
                   {proximosJogos.map((jogo, idx) => (
                     <li key={idx} className="flex justify-between items-center bg-neutral-950 p-2 sm:p-3 rounded-lg border border-neutral-800">
                       <div className="flex flex-col">
                         <span className="text-[8px] sm:text-[10px] text-cyan-400 font-bold uppercase tracking-widest block">Rodada {jogo.rodada}</span>
                         <div className="flex items-center gap-1.5 mt-0.5">
                           <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-tighter truncate max-w-30 block">{jogo.adversarioNome}</span>
                           {/* NOVO: Badge Dourada do OVR do Bot */}
                           {jogo.isBot && jogo.adversarioOvr ? (
                              <span className="text-[8px] bg-neutral-800 text-yellow-500 px-1 py-0.5 rounded font-black border border-neutral-700 leading-none shadow-sm" title="Overall Médio do Bot">⭐ {jogo.adversarioOvr} OVR</span>
                           ) : null}
                         </div>
                       </div>
                       <div className="shrink-0">
                         <span className={`text-[8px] sm:text-[10px] px-2 py-1 rounded font-black tracking-widest ${jogo.isCasa ? 'bg-yellow-900/30 text-yellow-500 border border-yellow-700/50' : 'bg-neutral-800 text-neutral-400'}`}>
                           {jogo.isCasa ? 'CASA' : 'FORA'}
                         </span>
                       </div>
                     </li>
                   ))}
                 </ul>
              )}
            </div>
          </div>

          <div className="relative flex-1 min-h-150 md:min-h-187.5 bg-linear-to-b from-[#0a2e1c] to-[#041a0e] rounded-xl border-4 border-white/10 overflow-hidden flex flex-col justify-evenly py-6 sm:py-8 shadow-2xl order-1 xl:order-2">
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
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-lg p-4 sm:p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-4 shrink-0">
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">Substituição <span className="text-cyan-400">{posicaoModal}</span></h2>
              <button onClick={() => setModalAberto(false)} className="text-neutral-500 hover:text-white font-black text-lg bg-neutral-800 w-8 h-8 rounded-full flex items-center justify-center">X</button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-6">

              {jogadorSendoSubstituido && (() => {
                const jAtual = elenco.find(j => j.id === jogadorSendoSubstituido);
                if (!jAtual) return null;
                const isImprovAtual = jAtual.posicao !== posicaoModal;
                const ovrAtual = isImprovAtual ? Math.floor(jAtual.overall * 0.85) : jAtual.overall;

                return (
                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 shrink-0 shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-fifa-red/80"></div>
                    <span className="text-[10px] sm:text-xs text-fifa-red font-black uppercase tracking-widest block mb-2 pl-3">⬇️ Deixando o Campo</span>
                    <div className="flex justify-between items-center pl-3">
                      <div>
                        <p className="font-black text-base sm:text-lg text-white">{jAtual.nome}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded font-bold">{jAtual.posicao}</span>
                          {renderEnergia(jAtual.statusFisico?.cansaco ?? 1)}
                          {isImprovAtual && <span className="text-[10px] text-red-400 font-black">⚠️ Improv.</span>}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-center justify-center">
                        <span className="text-xl sm:text-2xl font-black text-white bg-neutral-900 px-3 py-1 rounded-lg border border-neutral-700">{ovrAtual}</span>
                        <span className="block text-[8px] text-neutral-500 uppercase font-bold tracking-widest mt-1">OVR em Campo</span>
                      </div>
                    </div>
                    <button onClick={() => removerDoTime(jogadorSendoSubstituido)} className="mt-4 ml-3 w-[calc(100%-0.75rem)] bg-neutral-900 hover:bg-fifa-red hover:text-white text-fifa-red font-bold py-2 sm:py-3 rounded-lg border border-neutral-800 hover:border-fifa-red transition-colors uppercase tracking-widest text-[10px] sm:text-xs shadow-lg">
                      Remover Jogador (Deixar Posição Vazia)
                    </button>
                  </div>
                );
              })()}

              <div className="flex flex-col gap-2">
                <span className="text-[10px] sm:text-xs text-fifa-green font-black uppercase tracking-widest block mb-1">⬆️ Entrando (Opções no Banco)</span>
                
                {jogadoresParaModal.length === 0 && (
                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center">
                    <p className="text-neutral-500 text-xs sm:text-sm font-bold uppercase tracking-widest">Nenhum atleta apto para esta vaga.</p>
                  </div>
                )}

                {jogadoresParaModal.map(j => {
                  const isLesionado = j.statusFisico?.lesionado;
                  const isSuspenso = j.statusFisico?.suspenso;
                  const isBloqueado = isLesionado || isSuspenso;
                  
                  const isImprovisadoModal = j.posicao !== posicaoModal;
                  const overallPenalizado = isImprovisadoModal ? Math.floor(j.overall * 0.85) : j.overall;
                  
                  const isPendurado = j.statusFisico && (j.statusFisico as any).amarelos === 1;

                  let diffBadge = null;
                  if (jogadorSendoSubstituido) {
                    const jAtual = elenco.find(x => x.id === jogadorSendoSubstituido);
                    if (jAtual) {
                       const ovrAtual = (jAtual.posicao !== posicaoModal) ? Math.floor(jAtual.overall * 0.85) : jAtual.overall;
                       const diff = overallPenalizado - ovrAtual;
                       if (diff > 0) diffBadge = <span className="text-[10px] text-fifa-green font-black px-1.5 py-0.5 rounded bg-fifa-green/10 border border-fifa-green/30">+{diff} OVR</span>;
                       else if (diff < 0) diffBadge = <span className="text-[10px] text-fifa-red font-black px-1.5 py-0.5 rounded bg-fifa-red/10 border border-fifa-red/30">{diff} OVR</span>;
                       else diffBadge = <span className="text-[10px] text-neutral-500 font-black px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700">= Mantém</span>;
                    }
                  }

                  return (
                    <button 
                      key={j.id} 
                      onClick={() => !isBloqueado && confirmarTroca(j.id)} 
                      disabled={isBloqueado}
                      className={`w-full p-3 sm:p-4 rounded-xl flex justify-between items-center transition-all text-left border relative overflow-hidden group
                        ${isBloqueado ? 'bg-neutral-950 border-neutral-800 opacity-50 cursor-not-allowed grayscale' : 'bg-neutral-800 border-neutral-700 hover:border-fifa-green cursor-pointer hover:bg-neutral-800/80 hover:shadow-[0_0_15px_rgba(60,172,59,0.15)]'}
                      `}
                    >
                      {!isBloqueado && <div className={`absolute top-0 left-0 w-1.5 h-full transition-colors ${overallPenalizado >= 88 ? 'bg-yellow-500 group-hover:bg-fifa-green' : 'bg-neutral-600 group-hover:bg-fifa-green'}`}></div>}
                      <div className="pl-3">
                        <p className="font-black text-sm sm:text-base text-neutral-200">{j.nome}</p>
                        <div className="text-[8px] sm:text-[10px] text-neutral-400 font-bold uppercase mt-1 flex items-center gap-1 sm:gap-2 flex-wrap">
                          <span>{j.clubeHistorico}</span> 
                          <span className="bg-neutral-900 text-cyan-400 px-1.5 py-0.5 rounded border border-neutral-700">
                            {j.posicao}
                          </span>
                          {isImprovisadoModal && <span className="text-red-400 font-black">⚠️ Improvisado</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {renderEnergia(j.statusFisico?.cansaco ?? 1)}
                          {isLesionado && <span className="text-[8px] sm:text-[10px] text-orange-500 font-bold ml-1">🏥 DM</span>}
                          {isSuspenso && !isLesionado && <span className="text-[8px] sm:text-[10px] text-red-500 font-bold ml-1">🟥 Suspenso</span>}
                          {isPendurado && !isBloqueado && <span className="text-[8px] sm:text-[10px] text-yellow-500 font-bold ml-1">🟨 Pendurado</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-base sm:text-lg px-3 py-1 rounded-lg font-black border ${overallPenalizado >= 88 ? 'bg-yellow-900/50 text-yellow-500 border-yellow-700/50' : 'bg-neutral-950 text-white border-neutral-700'}`}>
                          {overallPenalizado}
                        </span>
                        {diffBadge && <div>{diffBadge}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
