import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot, updateDoc, getDoc } from "firebase/firestore";
import { type GameState, type Jogador } from "../types";
import { type EventoPartida, simularPartidaV2, escalarBot } from "../services/matchEngine";

// ... (interfaces JogoAoVivo se mantêm iguais) ...
interface JogoAoVivo {
  timeA: string; timeB: string; nomeTimeA: string; nomeTimeB: string;
  golsCasaFinal: number; golsForaFinal: number; golsCasaLive: number; golsForaLive: number;
  relatorioFinal: EventoPartida[]; eventosLive: EventoPartida[];
  pressaoFinal: { minuto: number, valor: number }[]; pressaoLive: { minuto: number, valor: number }[]; 
}

export default function Matches() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const currentUserUid = auth.currentUser?.uid;
  
  const [simulacaoAoVivo, setSimulacaoAoVivo] = useState(false);
  const [minuto, setMinuto] = useState(0);
  const [partidasAoVivo, setPartidasAoVivo] = useState<JogoAoVivo[]>([]);
  const [rodadaSendoTransmitida, setRodadaSendoTransmitida] = useState<number>(1);

  const [countdownToStart, setCountdownToStart] = useState<number | null>(null);
  const [simulandoMagicamente, setSimulandoMagicamente] = useState(false);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  
  const rodadaEsperadaRef = useRef<number | null>(null);

  // 1. AUTO-CURA: O Listener agora é limpo e independente
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) setGameState(docSnap.data() as GameState);
    });
    return () => unsub();
  }, []);

  // 2. AUTO-CURA: A lógica que dispara a partida sem depender de currentRound
  useEffect(() => {
    if (!gameState || !gameState.schedule) return;
    const data = gameState;
    
    // CORREÇÃO TYPESCRIPT: Encadeamento opcional (?.) e Fallback (??)
    const indexNaoSimulada = data.schedule?.findIndex((r: any) => r.jogos[0]?.homeScore == null) ?? -1;
    const rodadaAlvo = indexNaoSimulada !== -1 ? indexNaoSimulada : (data.schedule?.length ?? 0);

    if (rodadaEsperadaRef.current === null) {
      rodadaEsperadaRef.current = rodadaAlvo;
    } else if (rodadaEsperadaRef.current < rodadaAlvo && !simulacaoAoVivo) {
      iniciarPlayback(data, rodadaEsperadaRef.current);
      rodadaEsperadaRef.current = rodadaAlvo; 
      setPreparando(false); 
    }

    if (data.teams && (data as any).playersInLive) {
      const totalUsers = data.teams.filter((t: any) => t.isUser).length;
      const pessoasNaTV = (data as any).playersInLive.length;

      if (totalUsers > 0 && pessoasNaTV >= totalUsers && countdownToStart === null && !simulandoMagicamente && !simulacaoAoVivo && !erroSimulacao && !preparando) {
        setCountdownToStart(10);
      }
    }
  }, [gameState, simulacaoAoVivo, countdownToStart, simulandoMagicamente, erroSimulacao, preparando]);

  useEffect(() => {
    if (countdownToStart === null) return;
    if (countdownToStart <= 0) {
      setCountdownToStart(null);
      setPreparando(true); 
      
      const liderId = gameState?.teams?.filter(t => t.isUser)[0]?.id;
      if (currentUserUid === liderId && !simulandoMagicamente) {
        executarSimulacaoAutomatica();
      }
      return;
    }
    const timer = setTimeout(() => setCountdownToStart(prev => prev! - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdownToStart]);

  const executarSimulacaoAutomatica = async () => {
    if (!gameState || !gameState.schedule || !gameState.standings) return;
    setSimulandoMagicamente(true);
    setErroSimulacao(null); 

    try {
      // 3. AUTO-CURA: Localiza a rodada VERDADEIRA diretamente pelo calendário
      const rodadaIndex = gameState.schedule.findIndex((r: any) => r.jogos[0]?.homeScore == null);
      if (rodadaIndex === -1) return;
      const rodadaAtualData = gameState.schedule[rodadaIndex];
      const rodadaVerdadeira = rodadaIndex + 1; // Se index = 19, rodada verdadeira = 20
      
      const jogos = rodadaAtualData.jogos;
      let novosStandings = [...gameState.standings];

      const validarTitularesHumanos = (titularesIds: string[], elenco: Jogador[], nomeTime: string) => {
        const idsParaValidar = titularesIds.length > 0 ? titularesIds : elenco.slice(0, 11).map(j => j.id);
        const time = idsParaValidar.map(id => elenco.find(j => j.id === id)).filter(Boolean) as Jogador[];

        if (time.length < 11) {
           throw new Error(`O time ${nomeTime} não possui 11 jogadores escalados!`);
        }

        const irregulares = time.filter(j => j.statusFisico?.suspenso || j.statusFisico?.lesionado);
        if (irregulares.length > 0) {
          const nomes = irregulares.map(j => j.nome).join(", ");
          throw new Error(`ESCÂNDALO! O time ${nomeTime} escalou jogadores irregulares (Lesionados/Suspensos): ${nomes}. A partida não pode começar!`);
        }

        const temGoleiro = time.some(j => j.posicao.toUpperCase().includes('GOL') || j.posicao.toUpperCase() === 'GL');
        if (!temGoleiro) {
          throw new Error(`O time ${nomeTime} tentou entrar em campo sem um goleiro titular! A partida não pode começar!`);
        }

        return time;
      };

      for (let jogo of jogos) {
        const isHomeUser = gameState.teams?.find(t => t.id === jogo.homeId)?.isUser || false;
        const isAwayUser = gameState.teams?.find(t => t.id === jogo.awayId)?.isUser || false;
        
        const nomeHome = gameState.teams?.find(t => t.id === jogo.homeId)?.nome || "Mandante";
        const nomeAway = gameState.teams?.find(t => t.id === jogo.awayId)?.nome || "Visitante";

        const homeDoc = await getDoc(doc(db, isHomeUser ? "usuarios" : "clubes", jogo.homeId));
        const awayDoc = await getDoc(doc(db, isAwayUser ? "usuarios" : "clubes", jogo.awayId));
        
        const homeElenco = homeDoc.data()?.elenco as Jogador[] || [];
        const awayElenco = awayDoc.data()?.elenco as Jogador[] || [];

        const homeTitularesIds = homeDoc.data()?.titularesIds || [];
        const awayTitularesIds = awayDoc.data()?.titularesIds || [];

        const homeTitulares = isHomeUser ? validarTitularesHumanos(homeTitularesIds, homeElenco, nomeHome) : escalarBot(homeElenco);
        const awayTitulares = isAwayUser ? validarTitularesHumanos(awayTitularesIds, awayElenco, nomeAway) : escalarBot(awayElenco);

        const resultado = simularPartidaV2(homeTitulares, awayTitulares, {
          isUserA: isHomeUser,
          isUserB: isAwayUser,
          rodada: gameState.currentRound
        });

        jogo.homeScore = resultado.golsCasa;
        jogo.awayScore = resultado.golsFora;
        jogo.relatorio = resultado.relatorio;
        jogo.pressao = resultado.pressao;

        const resetarCansaco = gameState.currentRound === 19;

        const processarElenco = (elencoCompleto: Jogador[], titularesIdsValidos: string[], isCasa: boolean) => {
          return elencoCompleto.map((jogador: Jogador) => {
            if (!jogador) return jogador;

            let status = {
              cansaco: jogador.statusFisico?.cansaco ?? 1, 
              lesionado: jogador.statusFisico?.lesionado ?? false,
              suspenso: jogador.statusFisico?.suspenso ?? false, 
              amarelos: (jogador.statusFisico as any)?.amarelos ?? 0
            };

            const estavaSuspenso = jogador.statusFisico?.suspenso === true;
            const estavaLesionado = jogador.statusFisico?.lesionado === true;

            if (estavaSuspenso) status.suspenso = false;

            const isEscalado = titularesIdsValidos.length > 0 
              ? titularesIdsValidos.includes(jogador.id) 
              : elencoCompleto.indexOf(jogador) < 11;
              
            const jogouDeVerdade = isEscalado && !estavaSuspenso && !estavaLesionado;
            const eventosDesteJogador = resultado.relatorio.filter((e: any) => e.jogadorId === jogador.id && e.time === (isCasa ? 'CASA' : 'FORA'));

            if (jogouDeVerdade) {
              if (!status.lesionado) status.cansaco = resetarCansaco ? 1 : Math.min(5, status.cansaco + 1);
              if (eventosDesteJogador.some((e: any) => e.tipo === 'LESAO')) status.lesionado = true;
              
              const amarelosNaPartida = eventosDesteJogador.filter((e: any) => e.tipo === 'CARTAO_AMARELO').length;
              const vermelhoNaPartida = eventosDesteJogador.some((e: any) => e.tipo === 'CARTAO_VERMELHO');

              if (vermelhoNaPartida) { 
                status.suspenso = true; 
                status.amarelos = 0; 
              } else if (amarelosNaPartida > 0) {
                status.amarelos += amarelosNaPartida;
                if (status.amarelos >= 2) { 
                  status.suspenso = true; 
                  status.amarelos = 0; 
                }
              }
            } else {
              if (estavaLesionado) {
                status.cansaco = Math.max(1, status.cansaco - 1);
                if (status.cansaco === 1) status.lesionado = false;
              } else {
                if (status.cansaco > 1) status.cansaco = Math.max(1, status.cansaco - 2);
              }
            }

            if (resetarCansaco) {
               status.cansaco = 1;
               status.lesionado = false;
            }
            
            return { ...jogador, statusFisico: status };
          });
        };

        const finalHomeRoster = processarElenco(homeElenco, homeTitularesIds, true);
        const finalAwayRoster = processarElenco(awayElenco, awayTitularesIds, false);

        await updateDoc(doc(db, isHomeUser ? "usuarios" : "clubes", jogo.homeId), { elenco: finalHomeRoster });
        await updateDoc(doc(db, isAwayUser ? "usuarios" : "clubes", jogo.awayId), { elenco: finalAwayRoster });

        const updateStanding = (id: string, gf: number, gc: number) => {
          let t = novosStandings.find(s => s.id === id);
          if (t) {
            t.j += 1; t.gp += gf; t.gc += gc; t.sg = t.gp - t.gc;
            if (gf > gc) { t.pts += 3; t.v += 1; } else if (gf === gc) { t.pts += 1; t.e += 1; } else { t.d += 1; }
          }
        };
        updateStanding(jogo.homeId, resultado.golsCasa, resultado.golsFora);
        updateStanding(jogo.awayId, resultado.golsFora, resultado.golsCasa);
      }

      novosStandings.sort((a, b) => b.pts !== a.pts ? b.pts - a.pts : (b.sg !== a.sg ? b.sg - a.sg : b.gp - a.gp));

      let updatedSchedule = gameState.schedule.map((rodada, index) => index === rodadaIndex ? { jogos: jogos } : rodada);
      let proximaFase = gameState.phase;

      if (rodadaVerdadeira === 19) proximaFase = 'TRANSFER_WINDOW';
      else if (rodadaVerdadeira === 38) proximaFase = 'FINISHED';

      await updateDoc(doc(db, "game", "state"), {
        schedule: updatedSchedule, 
        standings: novosStandings, 
        currentRound: rodadaVerdadeira + 1,
        phase: proximaFase, 
        playersReady: [],
        playersInLive: [] 
      });

    } catch (error) {
      console.error("Erro na Simulação Automática", error);
      setErroSimulacao((error as Error).message);
      setPreparando(false); // Desliga a tela de processamento em caso de erro
    } finally {
      setSimulandoMagicamente(false);
    }
  };

  useEffect(() => {
    if (!simulacaoAoVivo) return;

    const timer = setInterval(() => {
      setMinuto((prevMinuto) => {
        if (prevMinuto >= 90) {
          clearInterval(timer);
          return 90; 
        }
        return prevMinuto + 1;
      });
    }, 666); 

    return () => clearInterval(timer);
  }, [simulacaoAoVivo]);

  useEffect(() => {
    if (minuto === 0 || minuto > 90) return;

    setPartidasAoVivo((partidas) =>
      partidas.map((p) => {
        const eventosAgora = p.relatorioFinal.filter((e) => e.minuto === minuto);
        const pressaoAgora = p.pressaoFinal.filter((pr) => pr.minuto <= minuto); 

        if (eventosAgora.length === 0 && pressaoAgora.length === p.pressaoLive.length) return p;
        if (p.eventosLive.some(e => e.minuto === minuto)) return { ...p, pressaoLive: pressaoAgora };

        let novosGolsA = p.golsCasaLive;
        let novosGolsB = p.golsForaLive;

        eventosAgora.forEach((e) => {
          if (e.tipo === 'GOL') {
            if (e.time === 'CASA') novosGolsA++;
            else novosGolsB++;
          }
        });

        return {
          ...p,
          golsCasaLive: novosGolsA,
          golsForaLive: novosGolsB,
          eventosLive: [...eventosAgora, ...p.eventosLive],
          pressaoLive: pressaoAgora, 
        };
      })
    );
  }, [minuto]);

  const iniciarPlayback = (dataSnapshot: GameState, rodadaIndex: number) => {
    if (!dataSnapshot.schedule) return;
    
    const jogosDaRodada = dataSnapshot.schedule[rodadaIndex]?.jogos || [];
    const preparacaoAoVivo: JogoAoVivo[] = [];

    jogosDaRodada.forEach((jogo: any) => {
      preparacaoAoVivo.push({
        timeA: jogo.homeId,
        timeB: jogo.awayId,
        nomeTimeA: dataSnapshot.teams?.find(t => t.id === jogo.homeId)?.nome || "Casa",
        nomeTimeB: dataSnapshot.teams?.find(t => t.id === jogo.awayId)?.nome || "Fora",
        golsCasaFinal: jogo.homeScore || 0,
        golsForaFinal: jogo.awayScore || 0,
        golsCasaLive: 0,
        golsForaLive: 0,
        relatorioFinal: jogo.relatorio || [],
        eventosLive: [],
        pressaoFinal: jogo.pressao || [],
        pressaoLive: [],
      });
    });

    setRodadaSendoTransmitida(rodadaIndex + 1);
    setPartidasAoVivo(preparacaoAoVivo);
    setMinuto(0);
    setSimulacaoAoVivo(true);
  };

  if (!gameState) return <div className="h-screen bg-neutral-950 flex items-center justify-center"><p className="text-yellow-500 font-bold animate-pulse tracking-widest uppercase text-sm sm:text-base">Conectando à Central de TV...</p></div>;

  // ==========================================
  // RENDERIZAÇÃO DA SALA DE ESPERA E CRONÔMETRO
  // ==========================================
  if (!simulacaoAoVivo) {
    return (
      <div className="p-4 sm:p-8 bg-neutral-950 min-h-screen flex items-center justify-center text-neutral-200 font-fifa">
        <div className="max-w-xl mx-auto w-full text-center bg-neutral-900 p-6 sm:p-10 rounded-2xl border border-neutral-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-fifa-red animate-pulse"></div>
          
          <h1 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tighter mb-2 sm:mb-4">
            Transmissão <span className="text-fifa-red">Ao Vivo</span>
          </h1>
          <p className="text-neutral-400 font-bold tracking-widest uppercase mb-4 text-xs sm:text-sm">
            Rodada {gameState.currentRound}
          </p>
          
          <div className="my-8 sm:my-14">
            {erroSimulacao ? (
              <div className="animate-fade-in bg-fifa-red/10 border border-fifa-red p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="text-xl sm:text-3xl text-fifa-red font-black tracking-widest uppercase mb-2 sm:mb-4 animate-pulse">🚨 JOGO PARALISADO!</h2>
                <p className="text-white font-bold mb-4 sm:mb-6 text-xs sm:text-sm leading-relaxed">{erroSimulacao}</p>
                <button onClick={() => setErroSimulacao(null)} className="w-full bg-neutral-800 hover:bg-neutral-700 uppercase tracking-widest py-3 rounded-lg text-white font-black transition-colors text-xs sm:text-base">
                  Aguardar Correção
                </button>
              </div>
            ) : preparando ? (
              // NOVO: Tela animada exibindo que o sistema está gerando a partida
              <div className="animate-fade-in">
                <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-neutral-800 border-t-fifa-green rounded-full animate-spin mx-auto mb-4 sm:mb-6"></div>
                <h2 className="text-xl sm:text-3xl text-fifa-green font-black uppercase tracking-widest animate-pulse">Gerando Lances...</h2>
                <p className="text-neutral-500 text-[10px] sm:text-xs mt-3 font-bold uppercase tracking-widest">A inteligência do servidor está calculando a partida. Prepare o coração!</p>
              </div>
            ) : countdownToStart !== null ? (
              <div className="animate-fade-in">
                 <h2 className="text-2xl sm:text-4xl text-yellow-500 font-black animate-pulse tracking-widest">TODOS PRONTOS!</h2>
                 <p className="text-neutral-400 font-bold uppercase tracking-widest mt-2 sm:mt-4 text-xs sm:text-base">O juiz vai apitar o início em</p>
                 <span className="text-7xl sm:text-9xl font-black text-fifa-blue mt-4 sm:mt-6 block">{countdownToStart}</span>
              </div>
            ) : (
              <div className="animate-fade-in">
                <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-neutral-800 border-t-yellow-500 rounded-full animate-spin mx-auto mb-4 sm:mb-6"></div>
                <h2 className="text-xl sm:text-3xl font-black text-white uppercase tracking-widest animate-pulse">
                  {gameState?.teams && (gameState as any)?.playersInLive
                    ? `${(gameState as any).playersInLive.length} / ${gameState.teams.filter(t => t.isUser).length} No Estádio`
                    : 'Preparando Arquibancadas...'}
                </h2>
                <p className="text-neutral-500 text-[10px] sm:text-xs mt-3 font-bold uppercase tracking-widest">Aguardando a chegada de todos os técnicos...</p>
              </div>
            )}
          </div>

          <button onClick={() => navigate('/championship')} className="mt-4 sm:mt-8 text-[10px] sm:text-xs text-neutral-600 hover:text-white uppercase font-bold tracking-widest transition-colors block mx-auto border border-neutral-800 py-3 px-6 rounded-lg">
            Voltar para o Campeonato
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDERIZAÇÃO: MODO TRANSMISSÃO ATIVA (90 MINS)
  // ==========================================
  return (
    <div className="p-2 sm:p-4 md:p-8 bg-neutral-950 min-h-screen text-neutral-200 font-fifa flex flex-col">
      <div className="max-w-6xl mx-auto w-full mb-4 sm:mb-8 text-center bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-2xl relative overflow-hidden shrink-0">
        <div className="absolute top-0 left-0 h-1 bg-linear-to-r from-fifa-green via-fifa-blue to-fifa-red transition-all duration-700 ease-linear" style={{ width: `${(minuto / 90) * 100}%` }}></div>
        
        <h2 className="text-sm sm:text-xl font-bold text-red-500 uppercase tracking-widest flex items-center justify-center gap-2 mb-2">
          <span className="w-2 h-2 sm:w-3 sm:h-3 bg-red-500 rounded-full animate-ping"></span>
          Multicast - Rodada {rodadaSendoTransmitida}
        </h2>
        <div className="text-5xl sm:text-6xl font-black font-mono text-white tracking-tighter">
          {minuto}'
        </div>
        {minuto >= 90 && (
          <button onClick={() => navigate('/championship')} className="mt-4 sm:mt-6 bg-fifa-blue hover:bg-opacity-80 px-4 py-2 sm:px-8 sm:py-3 rounded-xl text-white font-black text-xs sm:text-base uppercase tracking-widest transition-colors shadow-lg shadow-fifa-blue/50">
            Ver Classificação
          </button>
        )}
      </div>

      <div className="max-w-7xl mx-auto w-full flex flex-col xl:flex-row gap-4 sm:gap-8 flex-1 pb-10">
        <div className="flex-1 flex flex-col gap-4">
          <h3 className="text-yellow-500 font-black tracking-widest uppercase mb-2 border-b border-neutral-800 pb-2 text-sm sm:text-base">O Seu Confronto</h3>
          
          {partidasAoVivo.filter(j => j.timeA === currentUserUid || j.timeB === currentUserUid).map((jogo, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-100 sm:min-h-125">
              
              <div className="p-4 sm:p-8 pb-4 bg-neutral-950 flex justify-between items-center shrink-0">
                <span className={`font-black uppercase tracking-tighter flex-1 text-right truncate pr-2 sm:pr-6 text-sm sm:text-2xl md:text-3xl ${jogo.timeA === currentUserUid ? 'text-yellow-400' : 'text-neutral-400'}`} title={jogo.nomeTimeA}>
                  {jogo.nomeTimeA}
                </span>
                <div className="flex items-center gap-2 sm:gap-6 bg-neutral-900 px-3 sm:px-8 py-2 sm:py-4 rounded-xl border border-neutral-800 shadow-inner">
                  <span className={`font-black text-3xl sm:text-6xl transition-all duration-300 ${minuto > 0 && jogo.golsCasaLive > 0 ? 'text-fifa-green scale-110' : 'text-white'}`}>{jogo.golsCasaLive}</span>
                  <span className="text-neutral-600 font-black text-xl sm:text-3xl">X</span>
                  <span className={`font-black text-3xl sm:text-6xl transition-all duration-300 ${minuto > 0 && jogo.golsForaLive > 0 ? 'text-fifa-green scale-110' : 'text-white'}`}>{jogo.golsForaLive}</span>
                </div>
                <span className={`font-black uppercase tracking-tighter flex-1 text-left truncate pl-2 sm:pl-6 text-sm sm:text-2xl md:text-3xl ${jogo.timeB === currentUserUid ? 'text-yellow-400' : 'text-neutral-400'}`} title={jogo.nomeTimeB}>
                  {jogo.nomeTimeB}
                </span>
              </div>

              <div className="px-4 sm:px-8 pb-4 sm:pb-6 bg-neutral-950 border-b border-neutral-800">
                <div className="flex justify-between text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">
                  <span className="text-yellow-500">Pressão Casa</span>
                  <span className="hidden sm:inline">Momentum</span>
                  <span className="text-white">Pressão Fora</span>
                </div>
                <div className="relative w-full h-12 sm:h-20 bg-neutral-900/50 rounded-lg border border-neutral-800/50 flex items-center px-1 overflow-hidden">
                  <div className="absolute top-1/2 left-0 w-full h-px bg-neutral-700/50 z-0"></div>
                  <div className="flex w-full h-full items-center gap-0.5 sm:gap-1 z-10">
                    {Array.from({ length: 18 }).map((_, idx) => {
                      const ponto = jogo.pressaoLive[idx];
                      if (!ponto) return <div key={idx} className="flex-1 h-full"></div>;

                      const isCasa = ponto.valor > 0;
                      const alturaPercentual = Math.min(100, Math.abs(ponto.valor));

                      return (
                        <div key={idx} className="flex-1 h-full flex flex-col group relative">
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                            {ponto.minuto}'
                          </div>
                          <div className="h-1/2 w-full flex items-end">
                            {isCasa && <div className="w-full bg-fifa-green shadow-[0_0_8px_rgba(60,172,59,0.6)] rounded-t-sm" style={{ height: `${alturaPercentual}%` }}></div>}
                          </div>
                          <div className="h-1/2 w-full flex items-start">
                            {!isCasa && <div className="w-full bg-fifa-blue shadow-[0_0_8px_rgba(42,57,141,0.6)] rounded-b-sm" style={{ height: `${alturaPercentual}%` }}></div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 flex-1 overflow-y-auto custom-scrollbar bg-neutral-900/50 h-full">
                {jogo.eventosLive.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-neutral-600 italic font-bold text-sm sm:text-lg tracking-widest text-center">A bola está rolando...</div>
                ) : (
                  <div className="space-y-3 sm:space-y-4 flex flex-col">
                    {jogo.eventosLive.map((evento, idx) => {
                      const isMandante = evento.time === 'CASA';
                      return (
                        <div key={idx} className={`flex w-full ${isMandante ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                          <div className={`max-w-[85%] sm:max-w-[70%] border-l-4 pl-3 sm:pl-4 py-2 sm:py-3 flex items-start gap-3 sm:gap-4 rounded-r-lg
                            ${evento.tipo === 'GOL' ? 'border-fifa-green bg-fifa-green/10' : 
                              evento.tipo === 'CARTAO_VERMELHO' ? 'border-fifa-red bg-fifa-red/10' : 
                              evento.tipo === 'CARTAO_AMARELO' ? 'border-yellow-500 bg-yellow-500/10' : 'border-fifa-blue bg-fifa-blue/10'}`}>
                            <span className="font-black text-white w-8 sm:w-10 shrink-0 text-sm sm:text-xl text-center">{evento.minuto}'</span>
                            <span className="text-neutral-300 font-medium leading-snug sm:leading-tight text-xs sm:text-base mt-0.5">{evento.texto}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {partidasAoVivo.filter(j => j.timeA === currentUserUid || j.timeB === currentUserUid).length === 0 && (
             <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 sm:p-12 text-center text-neutral-500 font-bold uppercase tracking-widest h-64 sm:h-125 flex items-center justify-center text-xs sm:text-base">
                 Você não possui jogos nesta rodada (BYE).
             </div>
          )}
        </div>

        <div className="w-full xl:w-100 flex flex-col gap-4">
          <h3 className="text-neutral-500 font-black tracking-widest uppercase mb-2 border-b border-neutral-800 pb-2 text-sm sm:text-base">Outros Jogos da Rodada</h3>
          <div className="flex flex-col gap-2 sm:gap-3 overflow-y-auto custom-scrollbar max-h-96 xl:max-h-150 pr-1 sm:pr-2">
            {partidasAoVivo.filter(j => j.timeA !== currentUserUid && j.timeB !== currentUserUid).map((jogo, i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 sm:p-4 flex justify-between items-center shadow-lg hover:border-neutral-700 transition-colors">
                <span className="font-bold text-neutral-400 uppercase tracking-widest flex-1 text-right truncate pr-2 sm:pr-3 text-[10px] sm:text-xs" title={jogo.nomeTimeA}>
                  {jogo.nomeTimeA}
                </span>
                <div className="flex items-center gap-2 sm:gap-3 bg-neutral-950 px-2 sm:px-4 py-1 sm:py-2 rounded-lg border border-neutral-800 shrink-0">
                  <span className={`font-black text-sm sm:text-xl ${minuto > 0 && jogo.golsCasaLive > 0 ? 'text-yellow-400' : 'text-white'}`}>{jogo.golsCasaLive}</span>
                  <span className="text-neutral-700 font-black text-[10px] sm:text-xs">X</span>
                  <span className={`font-black text-sm sm:text-xl ${minuto > 0 && jogo.golsForaLive > 0 ? 'text-yellow-400' : 'text-white'}`}>{jogo.golsForaLive}</span>
                </div>
                <span className="font-bold text-neutral-400 uppercase tracking-widest flex-1 text-left truncate pl-2 sm:pl-3 text-[10px] sm:text-xs" title={jogo.nomeTimeB}>
                  {jogo.nomeTimeB}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
