import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { type GameState } from "../types";
import { type EventoPartida } from "../services/matchEngine";

interface JogoAoVivo {
  timeA: string;
  timeB: string;
  nomeTimeA: string;
  nomeTimeB: string;
  golsCasaFinal: number;
  golsForaFinal: number;
  golsCasaLive: number;
  golsForaLive: number;
  relatorioFinal: EventoPartida[];
  eventosLive: EventoPartida[];
}

export default function Matches() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const currentUserUid = auth.currentUser?.uid;
  
  const [simulacaoAoVivo, setSimulacaoAoVivo] = useState(false);
  const [minuto, setMinuto] = useState(0);
  const [partidasAoVivo, setPartidasAoVivo] = useState<JogoAoVivo[]>([]);
  
  // Usando useRef() para garantir que o "espião" da rodada não faça o React piscar
  const rodadaEsperadaRef = useRef<number | null>(null);
  const [rodadaSendoTransmitida, setRodadaSendoTransmitida] = useState<number>(1);

  // ==========================================
  // 1. GATILHO AUTOMÁTICO DO APITO INICIAL
  // ==========================================
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        setGameState(data);
        
        if (data.schedule && !simulacaoAoVivo) {
          // CORREÇÃO CRÍTICA: '== null' captura tanto 'undefined' quanto 'null' do Firebase
          const indexNaoSimulada = data.schedule.findIndex(r => r.jogos[0]?.homeScore == null);
          const rodadaAlvo = indexNaoSimulada !== -1 ? indexNaoSimulada : data.schedule.length;

          if (rodadaEsperadaRef.current === null) {
            // Entrou na sala agora? Trava a mira na rodada que falta jogar
            rodadaEsperadaRef.current = rodadaAlvo;
          } else if (rodadaEsperadaRef.current < rodadaAlvo) {
            // A rodada mudou! O Admin simulou e o placar deixou de ser 'null'!
            iniciarPlayback(data, rodadaEsperadaRef.current);
            rodadaEsperadaRef.current = rodadaAlvo; // Atualiza a mira para a próxima rodada
          }
        }
      }
    });
    return () => unsub();
  }, [simulacaoAoVivo]);

  // ==========================================
  // 2. RELÓGIO DO PLAYBACK
  // ==========================================
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

  // ==========================================
  // 3. SISTEMA DE CORTE DE CÂMERA (EVENTOS)
  // ==========================================
  useEffect(() => {
    if (minuto === 0 || minuto > 90) return;

    setPartidasAoVivo((partidas) =>
      partidas.map((p) => {
        const eventosAgora = p.relatorioFinal.filter((e) => e.minuto === minuto);
        if (eventosAgora.length === 0) return p;

        if (p.eventosLive.some(e => e.minuto === minuto)) return p;

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
        };
      })
    );
  }, [minuto]);

  // ==========================================
  // 4. PREPARAÇÃO DO PLAYBACK
  // ==========================================
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
      });
    });

    setRodadaSendoTransmitida(rodadaIndex + 1);
    setPartidasAoVivo(preparacaoAoVivo);
    setMinuto(0);
    setSimulacaoAoVivo(true);
  };

  if (!gameState) return <div className="h-screen bg-neutral-950 flex items-center justify-center"><p className="text-yellow-500 font-bold animate-pulse tracking-widest uppercase">Conectando à Central de TV...</p></div>;

  // ==========================================
  // RENDERIZAÇÃO: MODO TRANSMISSÃO AO VIVO
  // ==========================================
  if (simulacaoAoVivo) {
    return (
      <div className="p-4 md:p-8 bg-neutral-950 min-h-screen text-neutral-200 font-sans flex flex-col">
        {/* CABEÇALHO DO MULTICAST */}
        <div className="max-w-6xl mx-auto w-full mb-8 text-center bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 h-1 bg-yellow-500 transition-all duration-666 ease-linear" style={{ width: `${(minuto / 90) * 100}%` }}></div>
          
          <h2 className="text-xl font-bold text-red-500 uppercase tracking-widest flex items-center justify-center gap-2 mb-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
            Multicast - Cobertura da Rodada {rodadaSendoTransmitida}
          </h2>
          <div className="text-6xl font-black font-mono text-white tracking-tighter">
            {minuto}'
          </div>
          {minuto >= 90 && (
            <button onClick={() => setSimulacaoAoVivo(false)} className="mt-6 bg-cyan-600 hover:bg-cyan-500 px-8 py-3 rounded-xl text-white font-black uppercase tracking-widest transition-colors shadow-lg shadow-cyan-900/50">
              Encerrar Transmissão
            </button>
          )}
        </div>

        {/* GRADE DE JOGOS: MEU JOGO VS DEMAIS JOGOS */}
        <div className="max-w-7xl mx-auto w-full flex flex-col xl:flex-row gap-8 flex-1 pb-10">
          
          {/* COLUNA ESQUERDA: O SEU JOGO EM DESTAQUE */}
          <div className="flex-1 flex flex-col gap-4">
            <h3 className="text-yellow-500 font-black tracking-widest uppercase mb-2 border-b border-neutral-800 pb-2">O Seu Confronto</h3>
            
            {partidasAoVivo.filter(j => j.timeA === currentUserUid || j.timeB === currentUserUid).map((jogo, i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-125">
                <div className="p-8 bg-neutral-950 flex justify-between items-center border-b border-neutral-800 shrink-0">
                  <span className={`font-black uppercase tracking-tighter flex-1 text-right truncate pr-6 text-2xl md:text-3xl ${jogo.timeA === currentUserUid ? 'text-yellow-400' : 'text-neutral-400'}`} title={jogo.nomeTimeA}>
                    {jogo.nomeTimeA}
                  </span>
                  <div className="flex items-center gap-6 bg-neutral-900 px-8 py-4 rounded-xl border border-neutral-800 shadow-inner">
                    <span className={`font-black text-6xl transition-all duration-300 ${minuto > 0 && jogo.golsCasaLive > 0 ? 'text-yellow-400 scale-110' : 'text-white'}`}>{jogo.golsCasaLive}</span>
                    <span className="text-neutral-600 font-black text-3xl">X</span>
                    <span className={`font-black text-6xl transition-all duration-300 ${minuto > 0 && jogo.golsForaLive > 0 ? 'text-yellow-400 scale-110' : 'text-white'}`}>{jogo.golsForaLive}</span>
                  </div>
                  <span className={`font-black uppercase tracking-tighter flex-1 text-left truncate pl-6 text-2xl md:text-3xl ${jogo.timeB === currentUserUid ? 'text-yellow-400' : 'text-neutral-400'}`} title={jogo.nomeTimeB}>
                    {jogo.nomeTimeB}
                  </span>
                </div>

                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar bg-neutral-900/50 h-full">
                  {jogo.eventosLive.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-600 italic font-bold text-lg tracking-widest">A bola está rolando...</div>
                  ) : (
                    <div className="space-y-4">
                      {jogo.eventosLive.map((evento, idx) => (
                        <div key={idx} className={`border-l-4 pl-4 py-3 flex items-start gap-4 animate-fade-in
                          ${evento.tipo === 'GOL' ? 'border-yellow-500 bg-yellow-900/10' : 
                            evento.tipo === 'CARTAO_VERMELHO' ? 'border-red-500 bg-red-900/10' : 
                            evento.tipo === 'CARTAO_AMARELO' ? 'border-yellow-200 bg-yellow-900/5' : 'border-cyan-500 bg-cyan-900/5'}`}>
                          <span className="font-black text-white w-12 shrink-0 text-xl">{evento.minuto}'</span>
                          <span className="text-neutral-300 font-medium leading-tight text-lg mt-0.5">{evento.texto}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {partidasAoVivo.filter(j => j.timeA === currentUserUid || j.timeB === currentUserUid).length === 0 && (
               <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center text-neutral-500 font-bold uppercase tracking-widest h-125 flex items-center justify-center">
                   Você não possui jogos nesta rodada (BYE).
               </div>
            )}
          </div>

          {/* COLUNA DIREITA: DEMAIS JOGOS */}
          <div className="w-full xl:w-100 flex flex-col gap-4">
            <h3 className="text-neutral-500 font-black tracking-widest uppercase mb-2 border-b border-neutral-800 pb-2">Outros Jogos da Rodada</h3>
            <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar max-h-150 pr-2">
              {partidasAoVivo.filter(j => j.timeA !== currentUserUid && j.timeB !== currentUserUid).map((jogo, i) => (
                <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex justify-between items-center shadow-lg hover:border-neutral-700 transition-colors">
                  <span className="font-bold text-neutral-400 uppercase tracking-widest flex-1 text-right truncate pr-3 text-xs" title={jogo.nomeTimeA}>
                    {jogo.nomeTimeA}
                  </span>
                  <div className="flex items-center gap-3 bg-neutral-950 px-4 py-2 rounded-lg border border-neutral-800 shrink-0">
                    <span className={`font-black text-xl ${minuto > 0 && jogo.golsCasaLive > 0 ? 'text-yellow-400' : 'text-white'}`}>{jogo.golsCasaLive}</span>
                    <span className="text-neutral-700 font-black text-xs">X</span>
                    <span className={`font-black text-xl ${minuto > 0 && jogo.golsForaLive > 0 ? 'text-yellow-400' : 'text-white'}`}>{jogo.golsForaLive}</span>
                  </div>
                  <span className="font-bold text-neutral-400 uppercase tracking-widest flex-1 text-left truncate pl-3 text-xs" title={jogo.nomeTimeB}>
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

  // ==========================================
  // RENDERIZAÇÃO: PRÉ-JOGO (SALA DE ESPERA DO APITO)
  // ==========================================
  return (
    <div className="p-8 bg-neutral-950 min-h-screen flex items-center justify-center text-neutral-200 font-sans">
      <div className="max-w-xl mx-auto w-full text-center bg-neutral-900 p-10 rounded-2xl border border-neutral-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500 animate-pulse"></div>
        
        <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">
          Transmissão <span className="text-yellow-500">Ao Vivo</span>
        </h1>
        <p className="text-neutral-400 font-bold tracking-widest uppercase mb-4">
          Rodada {rodadaEsperadaRef.current !== null ? rodadaEsperadaRef.current + 1 : '...'}
        </p>
        
        <div className="my-14">
          <div className="w-16 h-16 border-4 border-neutral-800 border-t-yellow-500 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-widest animate-pulse">Aguardando o Apito</h2>
          <p className="text-neutral-500 text-xs mt-3 font-bold uppercase tracking-widest">O Game Master está preparando a rodada...</p>
        </div>

        <button onClick={() => navigate('/championship')} className="mt-8 text-xs text-neutral-600 hover:text-white uppercase font-bold tracking-widest transition-colors block mx-auto border border-neutral-800 py-3 px-6 rounded-lg">
          Voltar para o Campeonato
        </button>
      </div>
    </div>
  );
}
