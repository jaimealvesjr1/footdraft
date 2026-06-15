import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { type GameState } from "../types";
import { type EventoPartida } from "../services/matchEngine";

interface JogoAoVivo {
  timeA: string; timeB: string; nomeTimeA: string; nomeTimeB: string;
  golsCasaFinal: number; golsForaFinal: number; golsCasaLive: number; golsForaLive: number;
  relatorioFinal: EventoPartida[]; eventosLive: EventoPartida[];
  pressaoFinal: { minuto: number, valor: number }[]; pressaoLive: { minuto: number, valor: number }[]; 
}

export default function Matches() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  
  const [simulacaoAoVivo, setSimulacaoAoVivo] = useState(false);
  const [minuto, setMinuto] = useState(0);
  const [partidasAoVivo, setPartidasAoVivo] = useState<JogoAoVivo[]>([]);
  const [rodadaSendoTransmitida, setRodadaSendoTransmitida] = useState<number>(1);
  
  const rodadaEsperadaRef = useRef<number | null>(null);

  // 1. A TV APENAS ESCUTA O SERVIDOR
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        setGameState(data);
        
        if (data.schedule) {
          const indexNaoSimulada = data.schedule?.findIndex((r: any) => r.jogos[0]?.homeScore == null) ?? -1;
          const rodadaAlvo = indexNaoSimulada !== -1 ? indexNaoSimulada : (data.schedule?.length ?? 0);

          if (rodadaEsperadaRef.current === null) {
            // A TV foi ligada. Memoriza em qual rodada o campeonato está.
            rodadaEsperadaRef.current = rodadaAlvo;
          } else if (rodadaEsperadaRef.current < rodadaAlvo && !simulacaoAoVivo) {
            // O GATILHO: O Admin simulou a rodada! A TV dispara o Playback.
            iniciarPlayback(data, rodadaEsperadaRef.current);
            rodadaEsperadaRef.current = rodadaAlvo; 
          }
        }
      }
    });
    return () => unsub();
  }, [simulacaoAoVivo]);

  // 2. RELÓGIO ACELERADO (150ms)
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
    }, 150); 
    return () => clearInterval(timer);
  }, [simulacaoAoVivo]);

  // 3. DISTRIBUIÇÃO DOS EVENTOS NO TEMPO
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
          ...p, golsCasaLive: novosGolsA, golsForaLive: novosGolsB,
          eventosLive: [...eventosAgora, ...p.eventosLive], pressaoLive: pressaoAgora, 
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
        timeA: jogo.homeId, timeB: jogo.awayId,
        nomeTimeA: dataSnapshot.teams?.find(t => t.id === jogo.homeId)?.nome || "Casa",
        nomeTimeB: dataSnapshot.teams?.find(t => t.id === jogo.awayId)?.nome || "Fora",
        golsCasaFinal: jogo.homeScore || 0, golsForaFinal: jogo.awayScore || 0,
        golsCasaLive: 0, golsForaLive: 0,
        relatorioFinal: jogo.relatorio || [], eventosLive: [],
        pressaoFinal: jogo.pressao || [], pressaoLive: [],
      });
    });

    setRodadaSendoTransmitida(rodadaIndex + 1);
    setPartidasAoVivo(preparacaoAoVivo);
    setMinuto(0);
    setSimulacaoAoVivo(true);
  };

  if (!gameState) return <div className="h-screen bg-neutral-950 flex items-center justify-center"><p className="text-yellow-500 font-bold animate-pulse tracking-widest uppercase text-sm sm:text-base">Conectando à Central de TV...</p></div>;

  // TELA DE ESPERA PASSIVA
  if (!simulacaoAoVivo) {
    return (
      <div className="p-4 sm:p-8 bg-neutral-950 min-h-screen flex items-center justify-center text-neutral-200 font-fifa">
        <div className="max-w-xl mx-auto w-full text-center bg-neutral-900 p-6 sm:p-10 rounded-2xl border border-neutral-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-fifa-red animate-pulse"></div>
          <h1 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tighter mb-2 sm:mb-4">
            Transmissão <span className="text-fifa-red">Ao Vivo</span>
          </h1>
          <p className="text-neutral-400 font-bold tracking-widest uppercase mb-4 text-xs sm:text-sm">
            Aguardando Início
          </p>
          
          <div className="my-8 sm:my-14 animate-fade-in">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-neutral-800 border-t-yellow-500 rounded-full animate-spin mx-auto mb-4 sm:mb-6"></div>
            <h2 className="text-xl sm:text-3xl font-black text-white uppercase tracking-widest animate-pulse">
              Aguardando o Apito Inicial
            </h2>
            <p className="text-neutral-500 text-[10px] sm:text-xs mt-3 font-bold uppercase tracking-widest">
              Aguardando o Game Master simular a rodada no servidor...
            </p>
          </div>

          <button onClick={() => navigate('/championship')} className="mt-4 sm:mt-8 text-[10px] sm:text-xs text-neutral-600 hover:text-white uppercase font-bold tracking-widest transition-colors block mx-auto border border-neutral-800 py-3 px-6 rounded-lg">
            Voltar para o Campeonato
          </button>
        </div>
      </div>
    );
  }

  // TELA DE TRANSMISSÃO
  return (
    <div className="p-2 sm:p-4 md:p-8 bg-neutral-950 min-h-screen text-neutral-200 font-fifa flex flex-col">
      <div className="max-w-6xl mx-auto w-full mb-4 sm:mb-8 text-center bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6 shadow-2xl relative overflow-hidden shrink-0">
        <div className="absolute top-0 left-0 h-1 bg-linear-to-r from-fifa-green via-fifa-blue to-fifa-red transition-all duration-700 ease-linear" style={{ width: `${(minuto / 90) * 100}%` }}></div>
        <h2 className="text-sm sm:text-xl font-bold text-red-500 uppercase tracking-widest flex items-center justify-center gap-2 mb-2">
          <span className="w-2 h-2 sm:w-3 sm:h-3 bg-red-500 rounded-full animate-ping"></span>
          Multicast - Rodada {rodadaSendoTransmitida}
        </h2>
        <div className="text-5xl sm:text-6xl font-black font-mono text-white tracking-tighter">{minuto}'</div>
        {minuto >= 90 && (
          <button onClick={() => setSimulacaoAoVivo(false)} className="mt-4 sm:mt-6 bg-fifa-blue hover:bg-opacity-80 px-4 py-2 sm:px-8 sm:py-3 rounded-xl text-white font-black text-xs sm:text-base uppercase tracking-widest transition-colors shadow-lg shadow-fifa-blue/50">
            Aguardar Próxima Rodada
          </button>
        )}
      </div>

      <div className="max-w-7xl mx-auto w-full flex flex-col xl:flex-row gap-4 sm:gap-8 flex-1 pb-10">
        <div className="flex-1 flex flex-col gap-4">
          <h3 className="text-yellow-500 font-black tracking-widest uppercase mb-2 border-b border-neutral-800 pb-2 text-sm sm:text-base">Mesa Central de Jogos</h3>
          {partidasAoVivo.map((jogo, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-100 sm:min-h-125">
              <div className="p-4 sm:p-8 pb-4 bg-neutral-950 flex justify-between items-center shrink-0">
                <span className={`font-black uppercase tracking-tighter flex-1 text-right truncate pr-2 sm:pr-6 text-sm sm:text-2xl md:text-3xl text-neutral-400`} title={jogo.nomeTimeA}>{jogo.nomeTimeA}</span>
                <div className="flex items-center gap-2 sm:gap-6 bg-neutral-900 px-3 sm:px-8 py-2 sm:py-4 rounded-xl border border-neutral-800 shadow-inner">
                  <span className={`font-black text-3xl sm:text-6xl transition-all duration-300 ${minuto > 0 && jogo.golsCasaLive > 0 ? 'text-fifa-green scale-110' : 'text-white'}`}>{jogo.golsCasaLive}</span>
                  <span className="text-neutral-600 font-black text-xl sm:text-3xl">X</span>
                  <span className={`font-black text-3xl sm:text-6xl transition-all duration-300 ${minuto > 0 && jogo.golsForaLive > 0 ? 'text-fifa-green scale-110' : 'text-white'}`}>{jogo.golsForaLive}</span>
                </div>
                <span className={`font-black uppercase tracking-tighter flex-1 text-left truncate pl-2 sm:pl-6 text-sm sm:text-2xl md:text-3xl text-neutral-400`} title={jogo.nomeTimeB}>{jogo.nomeTimeB}</span>
              </div>
              <div className="px-4 sm:px-8 pb-4 sm:pb-6 bg-neutral-950 border-b border-neutral-800">
                <div className="flex justify-between text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">
                  <span className="text-yellow-500">Pressão Casa</span><span className="hidden sm:inline">Momentum</span><span className="text-white">Pressão Fora</span>
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
                          <div className="h-1/2 w-full flex items-end">{isCasa && <div className="w-full bg-fifa-green shadow-[0_0_8px_rgba(60,172,59,0.6)] rounded-t-sm" style={{ height: `${alturaPercentual}%` }}></div>}</div>
                          <div className="h-1/2 w-full flex items-start">{!isCasa && <div className="w-full bg-fifa-blue shadow-[0_0_8px_rgba(42,57,141,0.6)] rounded-b-sm" style={{ height: `${alturaPercentual}%` }}></div>}</div>
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
                            ${evento.tipo === 'GOL' ? 'border-fifa-green bg-fifa-green/10' : evento.tipo === 'CARTAO_VERMELHO' ? 'border-fifa-red bg-fifa-red/10' : evento.tipo === 'CARTAO_AMARELO' ? 'border-yellow-500 bg-yellow-500/10' : 'border-fifa-blue bg-fifa-blue/10'}`}>
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
          {partidasAoVivo.length === 0 && (
             <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 sm:p-12 text-center text-neutral-500 font-bold uppercase tracking-widest h-64 sm:h-125 flex items-center justify-center text-xs sm:text-base">Sem partidas na rodada.</div>
          )}
        </div>
      </div>
    </div>
  );
}
