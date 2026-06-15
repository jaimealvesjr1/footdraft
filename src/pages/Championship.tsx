import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot, updateDoc, increment, arrayUnion, getDoc } from "firebase/firestore";
import { type GameState } from "../types";
import toast from 'react-hot-toast'; 

export default function Championship() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [resgatando, setResgatando] = useState(false);
  const currentUserUid = auth.currentUser?.uid;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) setGameState(docSnap.data() as GameState);
    });
    return () => unsub();
  }, []);

  if (!gameState || !gameState.teams || gameState.teams.length === 0 || !gameState.schedule || gameState.schedule.length === 0) {
    return (
      <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-fifa text-center px-4">
        <div className="w-12 h-12 border-4 border-fifa-green border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-fifa-green font-black tracking-widest uppercase animate-pulse mb-2">Aguardando o Sorteio...</p>
        <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">A CBF está gerando o Calendário de Jogos.</p>
      </div>
    );
  }

  const getNomeClube = (id: string) => {
    const time = gameState?.teams?.find(t => t.id === id);
    return time ? time.nome : "Time não encontrado";
  };

  // MATEMÁTICA DINÂMICA (Para rodadas e Classificações)
  const totalTeams = (gameState as any)?.totalTeams || 20;
  const totalRounds = (totalTeams - 1) * 2;
  const midSeason = totalTeams - 1;

  // CÁLCULO DINÂMICO DE VAGAS NA TABELA DE CLASSIFICAÇÃO
  const tLibertadores = Math.max(1, Math.floor(totalTeams * 0.20)); // Top 20%
  const tPreLiberta = tLibertadores + Math.max(1, Math.floor(totalTeams * 0.10)); // +10%
  const tSudamericana = tPreLiberta + Math.max(1, Math.floor(totalTeams * 0.30)); // +30%
  const tRebaixamento = totalTeams - Math.max(1, Math.floor(totalTeams * 0.20)); // Últimos 20%

  // Função que diz a cor da linha da tabela de acordo com a posição (index 0 = 1º lugar)
  const getCorTabela = (index: number) => {
    if (index < tLibertadores) return 'text-cyan-400';
    if (index < tPreLiberta) return 'text-blue-400';
    if (index < tSudamericana) return 'text-green-400';
    if (index >= tRebaixamento) return 'text-orange-500';
    return 'text-neutral-500'; // Zona Morte (Cinza)
  };

  if (gameState.phase === 'FINISHED' || gameState.currentRound > totalRounds) {
    const standings = gameState.standings || [];
    const campeao = standings[0];
    
    // Matemática Dinâmica de Recompensa (O campeão e rebaixados ganham o mesmo, o meio adapta)
    const calcularPontosTemporada = (posicaoIndex: number) => {
      if (posicaoIndex === 0) return 100;
      if (posicaoIndex === 1) return 80;
      if (posicaoIndex === 2) return 70;
      if (posicaoIndex === 3) return 60;
      if (posicaoIndex < tPreLiberta) return 50;
      if (posicaoIndex < tSudamericana) return 30;
      if (posicaoIndex < tRebaixamento) return 10;
      return 0; // Rebaixados não ganham XP
    };

    const artilheirosMap: Record<string, { nome: string; gols: number; clube: string }> = {};
    
    gameState.schedule?.forEach(rodada => {
      rodada.jogos?.forEach(jogo => {
        jogo.relatorio?.forEach((evento: any) => {
          if (evento.tipo === 'GOL' && evento.jogadorId) {
            if (!artilheirosMap[evento.jogadorId]) {
              let nomeAutor = evento.jogadorNome;
              
              if (!nomeAutor) {
                const regexNomes = /(?:GOLAÇO!|GOL!|ROLO COMPRESSOR!|VIROU PASSEIO!|ZEBRA!|MILAGRE!|INACREDITÁVEL!|CAIXA!|encontra|de|,\s)\s*([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]*?)\s+(acerta|sobe|confere|apenas|ganha|chuta|guarda|tabela|aproveita|acha|que|cala)/;
                const match = evento.texto.match(regexNomes);
                nomeAutor = (match && match[1]) ? match[1].trim() : "Artilheiro Desconhecido";
              }
              
              const timeId = evento.time === 'CASA' ? jogo.homeId : jogo.awayId;
              const nomeClube = getNomeClube(timeId);
              
              artilheirosMap[evento.jogadorId] = { nome: nomeAutor, gols: 0, clube: nomeClube };
            }
            artilheirosMap[evento.jogadorId].gols += 1;
          }
        });
      });
    });

    const topArtilheiros = Object.values(artilheirosMap).sort((a, b) => b.gols - a.gols).slice(0, 5);

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-fifa">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          
          <div className="text-center mb-12 mt-8">
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white drop-shadow-xl">Fim de <span className="text-fifa-green">Temporada</span></h1>
            <p className="text-fifa-blue font-bold uppercase tracking-widest mt-2 animate-pulse">A Glória Eterna</p>
          </div>

          {campeao && (
            <div className="bg-linear-to-br from-neutral-900 via-fifa-blue/40 to-fifa-green/40 border-2 border-fifa-green p-8 md:p-12 rounded-3xl shadow-[0_0_80px_rgba(60,172,59,0.3)] max-w-3xl w-full mx-auto text-center relative overflow-hidden mb-16 animate-fade-in">
              <span className="text-8xl absolute -top-4 -right-4 opacity-20">🏆</span>
              <span className="text-8xl absolute -bottom-4 -left-4 opacity-20">🏆</span>
              <h2 className="text-xl md:text-2xl font-black uppercase text-fifa-green tracking-widest mb-4">O Grande Campeão</h2>
              <h3 className="text-4xl md:text-7xl font-black uppercase tracking-tighter text-white mb-4 drop-shadow-md">{getNomeClube(campeao.id)}</h3>
              <div className="flex items-center justify-center gap-6 mt-6">
                <div className="bg-yellow-950/40 p-4 rounded-xl border border-yellow-500/30">
                  <p className="text-xs text-fifa-green uppercase font-black tracking-widest">Campanha</p>
                  <p className="text-2xl font-black text-white">{campeao.pts} PTS</p>
                </div>
                <div className="bg-yellow-950/40 p-4 rounded-xl border border-yellow-500/30">
                  <p className="text-xs text-fifa-green uppercase font-black tracking-widest">Prêmio de Temporada</p>
                  <p className="text-2xl font-black text-cyan-300">+{calcularPontosTemporada(0)} XP</p>
                </div>
              </div>
              {campeao.id === currentUserUid && <p className="text-white font-black tracking-widest uppercase bg-fifa-green py-3 rounded-lg mt-8 shadow-[0_0_20px_rgba(60,172,59,0.4)]">Você escreveu o seu nome na história!</p>}
            </div>
          )}

          {/* EXIBIÇÃO DO PLACAR DA ÚLTIMA RODADA CRUCIAL */}
          {(() => {
            const ultimosJogos = gameState.schedule?.[totalRounds - 1]?.jogos || [];
            const meuUltimoJogoGeral = ultimosJogos.find((j: any) => j.homeId === currentUserUid || j.awayId === currentUserUid);
            if (!meuUltimoJogoGeral || meuUltimoJogoGeral.homeScore === null) return null;
            
            return (
              <div className="max-w-3xl mx-auto bg-neutral-900 p-4 sm:p-5 rounded-2xl border border-neutral-800 shadow-2xl mb-8 animate-fade-in">
                <h3 className="text-yellow-500 font-black mb-4 uppercase text-[10px] sm:text-xs tracking-widest border-b border-neutral-800 pb-2 text-center">Seu Desempenho na Rodada Final (Rodada {totalRounds})</h3>
                <div className="flex justify-center items-center gap-2 sm:gap-4 text-2xl sm:text-3xl font-black text-white bg-neutral-950 py-3 sm:py-4 rounded-xl border border-neutral-800 shadow-inner px-4">
                  <div className="text-right flex-1 text-xs sm:text-lg md:text-xl text-neutral-400 uppercase tracking-tighter truncate">{getNomeClube(meuUltimoJogoGeral.homeId)}</div>
                  <span className={meuUltimoJogoGeral.homeScore > (meuUltimoJogoGeral.awayScore || 0) ? "text-fifa-green" : "text-white"}>{meuUltimoJogoGeral.homeScore}</span>
                  <span className="text-neutral-700 text-lg sm:text-xl">x</span>
                  <span className={(meuUltimoJogoGeral.awayScore || 0) > meuUltimoJogoGeral.homeScore ? "text-fifa-green" : "text-white"}>{meuUltimoJogoGeral.awayScore}</span>
                  <div className="text-left flex-1 text-xs sm:text-lg md:text-xl text-neutral-400 uppercase tracking-tighter truncate">{getNomeClube(meuUltimoJogoGeral.awayId)}</div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl h-fit">
              <h2 className="text-xl font-black text-yellow-500 uppercase tracking-widest border-b border-neutral-800 pb-4 mb-4 flex items-center gap-3"><span className="text-2xl">⚽</span> Chuteira de Ouro</h2>
              {topArtilheiros.length === 0 ? (
                <p className="text-neutral-500 text-sm font-bold uppercase tracking-widest text-center py-4">Nenhum gol registrado.</p>
              ) : (
                <ul className="space-y-3">
                  {topArtilheiros.map((artilheiro, idx) => (
                    <li key={idx} className="flex justify-between items-center bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                      <div className="flex items-center gap-3">
                        <span className={`font-black text-lg ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-neutral-400' : idx === 2 ? 'text-orange-500' : 'text-neutral-600'}`}>{idx + 1}º</span>
                        <div className="flex flex-col leading-tight">
                          <span className="font-bold text-white uppercase tracking-tighter text-sm md:text-base truncate max-w-37.5 sm:max-w-50">{artilheiro.nome}</span>
                          <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest truncate max-w-37.5 sm:max-w-50">{artilheiro.clube}</span>
                        </div>
                      </div>
                      <div className="bg-neutral-900 px-3 py-1 rounded border border-neutral-700 shrink-0 text-center">
                        <span className="font-black text-fifa-green">{artilheiro.gols}</span> <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Gols</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="lg:col-span-2 bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl overflow-x-auto">
              <h2 className="text-xl font-black text-white uppercase tracking-widest border-b border-neutral-800 pb-4 mb-4">Classificação Final</h2>
              <table className="w-full text-left border-collapse min-w-125">
                <thead>
                  <tr className="text-[10px] text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                    <th className="pb-3 w-8 text-center">#</th>
                    <th className="pb-3">Clube</th>
                    <th className="pb-3 text-center text-yellow-500">PTS</th>
                    <th className="pb-3 text-center hidden sm:table-cell">J</th>
                    <th className="pb-3 text-center hidden sm:table-cell">V</th>
                    <th className="pb-3 text-center">SG</th>
                    <th className="pb-3 text-center text-cyan-400">Prêmio (XP)</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((time, index) => {
                    const isUser = gameState.teams?.find(t => t.id === time.id)?.isUser;
                    return (
                      <tr key={time.id} className={`text-sm border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors ${time.id === currentUserUid ? 'bg-yellow-900/20' : ''}`}>
                        <td className={`py-3 text-center font-black ${getCorTabela(index)}`}>
                          {index + 1}
                        </td>
                        <td className={`py-3 font-black uppercase tracking-tighter truncate max-w-37.5 ${time.id === currentUserUid ? 'text-fifa-green' : (isUser ? 'text-white' : 'text-neutral-400')}`}>
                          {getNomeClube(time.id)}
                        </td>
                        <td className="py-3 text-center font-black text-white bg-neutral-950/50 rounded">{time.pts}</td>
                        <td className="py-3 text-center text-neutral-400 font-bold hidden sm:table-cell">{time.j}</td>
                        <td className="py-3 text-center text-neutral-400 font-bold hidden sm:table-cell">{time.v}</td>
                        <td className="py-3 text-center text-neutral-400 font-bold">{time.sg > 0 ? `+${time.sg}` : time.sg}</td>
                        <td className="py-3 text-center">
                           <span className={`text-[10px] px-2 py-1 rounded font-black tracking-widest ${index < tLibertadores ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-800' : index >= tRebaixamento ? 'bg-red-900/20 text-red-500' : 'bg-neutral-800 text-neutral-400'}`}>
                              +{calcularPontosTemporada(index)}
                           </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              
              <div className="mt-4 pt-4 border-t border-neutral-800 text-[10px] font-bold tracking-widest uppercase flex flex-wrap gap-4 justify-between">
                <span className="text-cyan-400">■ G{tLibertadores} (Libertadores)</span>
                <span className="text-blue-400">■ G{tPreLiberta} (Qualificatórias)</span>
                <span className="text-green-400">■ G{tSudamericana} (Sul-Americana)</span>
                <span className="text-orange-500">■ Z{totalTeams - tRebaixamento} (Rebaixamento)</span>
              </div>
            </div>
          </div>

          <div className="mt-16 text-center">
            <button 
              disabled={resgatando}
              onClick={async () => {
                if (!currentUserUid) return;
                setResgatando(true);
                try {
                  const userIndex = standings.findIndex(t => t.id === currentUserUid);
                  const xpGanho = userIndex !== -1 ? calcularPontosTemporada(userIndex) : 0;
                  
                  if (xpGanho > 0) {
                    const userRef = doc(db, "usuarios", currentUserUid);
                    const userSnap = await getDoc(userRef);
                    
                    if (userSnap.data()?.xpResgatadoTemporada === gameState.currentRound) {
                      toast.error("Você já resgatou sua recompensa desta temporada!");
                      navigate('/dashboard');
                      return;
                    }

                    await updateDoc(userRef, { 
                      xpTotal: increment(xpGanho),
                      xpResgatadoTemporada: gameState.currentRound 
                    });
                    toast.success(`Você resgatou ${xpGanho} XP!`);
                  }
                  navigate('/dashboard');
                } catch (error) {
                  toast.error("Erro ao resgatar recompensa.");
                  setResgatando(false);
                }
              }} 
              className="px-10 py-4 bg-fifa-green hover:bg-opacity-90 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(60,172,59,0.4)] disabled:opacity-50"
            >
              {resgatando ? 'Salvando...' : 'Resgatar XP e Voltar ao CT'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // JOGO NORMAL (DURANTE A TEMPORADA)
  // ==========================================
  const isReady = gameState.playersReady?.includes(currentUserUid || '');
  
  const indexNaoSimulada = gameState.schedule?.findIndex((r: any) => r.jogos[0]?.homeScore == null) ?? -1;
  const rodadaIndex = indexNaoSimulada !== -1 ? indexNaoSimulada : (totalRounds - 1);
  const rodadaVerdadeira = rodadaIndex + 1;

  const jogosDaRodada = gameState.schedule?.[rodadaIndex]?.jogos || [];
  const meuProximoJogo = jogosDaRodada.find((j: any) => j.homeId === currentUserUid || j.awayId === currentUserUid);

  const rodadaAnteriorIndex = rodadaIndex - 1;
  let meuUltimoJogo = null;
  if (rodadaAnteriorIndex >= 0) {
    const jogosAnteriores = gameState.schedule?.[rodadaAnteriorIndex]?.jogos || [];
    meuUltimoJogo = jogosAnteriores.find((j: any) => j.homeId === currentUserUid || j.awayId === currentUserUid);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-sans">
      <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row justify-between items-center bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-2xl mb-6 sm:mb-8 gap-4 sm:gap-0">
        <div className="text-center md:text-left">
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter">{(gameState as any).nomeCampeonato || "Campeonato Brasileiro"}</h1>
          <p className="text-cyan-400 font-bold tracking-widest uppercase text-xs sm:text-sm mt-1">
            RODADA {rodadaVerdadeira} DE {totalRounds}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button onClick={() => navigate('/dashboard')} className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-fifa-gray-light hover:text-white font-black uppercase tracking-widest rounded-lg transition-colors border border-neutral-800 shadow-lg text-[10px] sm:text-sm">
            ← Escalação
          </button>
          
          <button 
            disabled={!isReady}
            onClick={async () => {
              if (currentUserUid) {
                await updateDoc(doc(db, "game", "state"), {
                  playersInLive: arrayUnion(currentUserUid)
                });
              }
              navigate('/live');
            }} 
            className={`w-full sm:w-auto px-4 sm:px-6 py-3 font-black uppercase tracking-widest rounded-lg transition-colors shadow-lg text-[10px] sm:text-sm
              ${isReady ? 'bg-fifa-red hover:bg-opacity-80 text-white shadow-[0_0_15px_rgba(230,29,37,0.4)]' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed border-transparent'}`}
          >
            📺 Transmissão
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full max-w-7xl mx-auto">
        
        <div className="xl:col-span-2 space-y-8">
          <div className="bg-neutral-900 p-4 sm:p-8 rounded-xl border border-neutral-800 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-2 bg-linear-to-r ${rodadaVerdadeira > midSeason ? 'from-purple-600 to-purple-300' : 'from-yellow-600 to-yellow-300'}`}></div>
            <h2 className="text-xs sm:text-sm font-black text-neutral-500 mb-6 sm:mb-8 uppercase tracking-widest">
              {rodadaVerdadeira > midSeason ? 'Fase de Returno (2ª Metade)' : 'O Seu Próximo Confronto'}
            </h2>
            
            <div className="flex items-center justify-center gap-2 sm:gap-6 w-full mb-8 sm:mb-10">
              <div className="flex-1 text-right">
                <span className="font-black text-lg sm:text-2xl md:text-4xl text-white block uppercase tracking-tighter wrap-break-word">{meuProximoJogo ? getNomeClube(meuProximoJogo.homeId) : '...'}</span>
                {meuProximoJogo?.homeId === currentUserUid && <span className="text-[8px] sm:text-xs text-yellow-500 font-black tracking-widest uppercase bg-yellow-900/30 px-2 py-1 rounded inline-block mt-1">SEU TIME (MANDANTE)</span>}
              </div>
              <div className="text-2xl sm:text-4xl font-black text-neutral-700 px-2">VS</div>
              <div className="flex-1 text-left">
                <span className="font-black text-lg sm:text-2xl md:text-4xl text-white block uppercase tracking-tighter wrap-break-word">{meuProximoJogo ? getNomeClube(meuProximoJogo.awayId) : '...'}</span>
                {meuProximoJogo?.awayId === currentUserUid && <span className="text-[8px] sm:text-xs text-yellow-500 font-black tracking-widest uppercase bg-yellow-900/30 px-2 py-1 rounded inline-block mt-1">SEU TIME (VISITANTE)</span>}
              </div>
            </div>

            <div className={`w-full py-3 sm:py-4 rounded-xl font-black text-xs sm:text-lg uppercase tracking-widest border-2 transition-all
              ${isReady ? 'bg-fifa-green/20 border-fifa-green text-fifa-green shadow-[0_0_15px_rgba(60,172,59,0.2)]' : 'bg-fifa-red/20 border-fifa-red text-fifa-red'}`}>
              {isReady ? `VOCÊ ESTÁ PRONTO! CLIQUE EM "TRANSMISSÃO".` : 'VOCÊ AINDA NÃO DEU CHECK NO VESTIÁRIO!'}
            </div>
          </div>

          {meuUltimoJogo && meuUltimoJogo.homeScore !== null && (
            <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border border-neutral-800 shadow-xl">
              <h3 className="text-yellow-500 font-black mb-4 uppercase text-[10px] sm:text-xs tracking-widest border-b border-neutral-800 pb-2">Resultado da Rodada Anterior</h3>
              <div className="flex justify-center items-center gap-2 sm:gap-4 text-2xl sm:text-3xl font-black text-white mb-4 bg-neutral-950 py-3 sm:py-4 rounded-xl border border-neutral-800 shadow-inner px-2">
                <div className="text-right flex-1 text-xs sm:text-lg md:text-xl text-neutral-400 uppercase tracking-tighter truncate">{getNomeClube(meuUltimoJogo.homeId)}</div>
                <span className={meuUltimoJogo.homeScore > (meuUltimoJogo.awayScore || 0) ? "text-fifa-green" : "text-white"}>{meuUltimoJogo.homeScore}</span>
                <span className="text-neutral-700 text-lg sm:text-xl">x</span>
                <span className={(meuUltimoJogo.awayScore || 0) > meuUltimoJogo.homeScore ? "text-fifa-green" : "text-white"}>{meuUltimoJogo.awayScore}</span>
                <div className="text-left flex-1 text-xs sm:text-lg md:text-xl text-neutral-400 uppercase tracking-tighter truncate">{getNomeClube(meuUltimoJogo.awayId)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-2xl flex flex-col h-fit">
          <h2 className="text-lg sm:text-xl font-black text-white mb-4 sm:mb-6 uppercase tracking-widest border-b border-neutral-800 pb-2 sm:pb-4">Tabela de Classificação</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-75">
              <thead>
                <tr className="text-[8px] sm:text-[10px] text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                  <th className="pb-2 sm:pb-3 w-6 sm:w-8 text-center">#</th>
                  <th className="pb-2 sm:pb-3">Clube</th>
                  <th className="pb-2 sm:pb-3 text-center text-yellow-500">PTS</th>
                  <th className="pb-2 sm:pb-3 text-center">J</th>
                  <th className="pb-2 sm:pb-3 text-center">V</th>
                  <th className="pb-2 sm:pb-3 text-center">SG</th>
                </tr>
              </thead>
              <tbody>
                {gameState.standings?.map((time, index) => {
                  const isUser = gameState.teams?.find(t => t.id === time.id)?.isUser;
                  return (
                    <tr key={time.id} className={`text-[10px] sm:text-sm border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors ${time.id === currentUserUid ? 'bg-fifa-blue/20' : ''}`}>
                      <td className={`py-3 sm:py-4 text-center font-black ${getCorTabela(index)}`}>{index + 1}</td>
                      <td className={`py-3 sm:py-4 font-black uppercase tracking-tighter truncate max-w-24 sm:max-w-35 ${time.id === currentUserUid ? 'text-fifa-green' : (isUser ? 'text-white' : 'text-neutral-400')}`}>{getNomeClube(time.id)}</td>
                      <td className="py-3 sm:py-4 text-center font-black text-white bg-neutral-950/50 rounded">{time.pts}</td>
                      <td className="py-3 sm:py-4 text-center text-neutral-400 font-bold">{time.j}</td>
                      <td className="py-3 sm:py-4 text-center text-neutral-400 font-bold">{time.v}</td>
                      <td className="py-3 sm:py-4 text-center text-neutral-400 font-bold">{time.sg > 0 ? `+${time.sg}` : time.sg}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 pt-4 border-t border-neutral-800 text-[8px] sm:text-[10px] font-bold tracking-widest uppercase flex flex-wrap gap-2 sm:gap-4 justify-between">
            <span className="text-cyan-400">■ G{tLibertadores} (Libertadores)</span>
            <span className="text-blue-400">■ G{tPreLiberta} (Qualificatórias)</span>
            <span className="text-green-400">■ G{tSudamericana} (Sul-Americana)</span>
            <span className="text-orange-500">■ Z{totalTeams - tRebaixamento} (Rebaixamento)</span>
          </div>
        </div>

      </div>
    </div>
  );
}
