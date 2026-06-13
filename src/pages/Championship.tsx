// src/pages/Championship.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { type GameState } from "../types";

export default function Championship() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const currentUserUid = auth.currentUser?.uid;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) setGameState(docSnap.data() as GameState);
    });
    return () => unsub();
  }, []);

  if (!gameState || !gameState.schedule || !gameState.teams) {
    return <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans"><div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-yellow-400 font-black tracking-widest uppercase animate-pulse">Carregando a Liga...</p></div>;
  }

  const getNomeClube = (id: string) => gameState.teams?.find(t => t.id === id)?.nome || "Desconhecido";
  const isReady = gameState.playersReady?.includes(currentUserUid || '');
  const totalUsers = gameState.teams.filter(t => t.isUser).length;
  
  // Detalhes da Rodada ATUAL (ou a próxima a ser simulada)
  const rodadaIndex = gameState.currentRound - 1;
  const jogosDaRodada = gameState.schedule[rodadaIndex] || [];
  const meuProximoJogo = jogosDaRodada.find(j => j.homeId === currentUserUid || j.awayId === currentUserUid);

  // Detalhes da Rodada ANTERIOR (para ver o resultado)
  const rodadaAnteriorIndex = gameState.currentRound - 2;
  let meuUltimoJogo = null;
  if (rodadaAnteriorIndex >= 0) {
    const jogosAnteriores = gameState.schedule[rodadaAnteriorIndex];
    meuUltimoJogo = jogosAnteriores.find(j => j.homeId === currentUserUid || j.awayId === currentUserUid);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-sans">
      
      {/* CABEÇALHO */}
      <div className="max-w-7xl mx-auto w-full flex justify-between items-center bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl mb-8">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Campeonato Brasileiro</h1>
          <p className="text-cyan-400 font-bold tracking-widest uppercase text-sm mt-1">RODADA {gameState.currentRound} DE 11</p>
        </div>
        <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-yellow-400 font-black uppercase tracking-widest rounded-lg transition-colors border border-neutral-700 shadow-lg">
          ← Voltar ao CT (Vestiário)
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full max-w-7xl mx-auto">
        
        {/* COLUNA ESQUERDA: PAINEL DO JOGO E RESULTADOS */}
        <div className="xl:col-span-2 space-y-8">
          
          {/* PRÓXIMO JOGO */}
          <div className="bg-neutral-900 p-8 rounded-xl border border-neutral-800 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-yellow-600 to-yellow-300"></div>
            
            <h2 className="text-sm font-black text-neutral-500 mb-8 uppercase tracking-widest">O Seu Próximo Confronto</h2>
            
            <div className="flex items-center justify-center gap-6 w-full mb-10">
              <div className="flex-1 text-right">
                <span className="font-black text-2xl md:text-4xl text-white block uppercase tracking-tighter">{meuProximoJogo ? getNomeClube(meuProximoJogo.homeId) : '...'}</span>
                {meuProximoJogo?.homeId === currentUserUid && <span className="text-xs text-yellow-500 font-black tracking-widest uppercase bg-yellow-900/30 px-2 py-1 rounded">SEU TIME (MANDANTE)</span>}
              </div>
              <div className="text-4xl font-black text-neutral-700">VS</div>
              <div className="flex-1 text-left">
                <span className="font-black text-2xl md:text-4xl text-white block uppercase tracking-tighter">{meuProximoJogo ? getNomeClube(meuProximoJogo.awayId) : '...'}</span>
                {meuProximoJogo?.awayId === currentUserUid && <span className="text-xs text-yellow-500 font-black tracking-widest uppercase bg-yellow-900/30 px-2 py-1 rounded">SEU TIME (VISITANTE)</span>}
              </div>
            </div>

            {/* STATUS DO SERVIDOR (O "CHECK") */}
            <div className={`w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest border-2 transition-all
              ${isReady ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-400' : 'bg-orange-900/20 border-orange-500/50 text-orange-500'}`}>
              {isReady 
                ? `Aguardando oponentes... (${gameState.playersReady.length}/${totalUsers} Prontos)` 
                : 'VOCÊ AINDA NÃO DEU CHECK NO VESTIÁRIO!'}
            </div>
          </div>

          {/* ÚLTIMO RESULTADO */}
          {meuUltimoJogo && meuUltimoJogo.homeScore !== null && (
            <div className="bg-neutral-900 p-8 rounded-xl border border-neutral-800 shadow-xl flex flex-col justify-center">
              <h3 className="text-yellow-500 font-black mb-6 uppercase text-sm tracking-widest border-b border-neutral-800 pb-2">Resultado da Rodada Anterior</h3>
              
              <div className="animate-fade-in">
                <div className="flex justify-center items-center gap-6 text-5xl font-black text-white mb-8 bg-neutral-950 py-8 rounded-xl border border-neutral-800 shadow-inner">
                  <div className="text-right flex-1 text-xl md:text-2xl text-neutral-400 uppercase tracking-tighter">{getNomeClube(meuUltimoJogo.homeId)}</div>
                  <span className={meuUltimoJogo.homeScore > (meuUltimoJogo.awayScore || 0) ? "text-yellow-400" : "text-white"}>{meuUltimoJogo.homeScore}</span>
                  <span className="text-neutral-700 text-3xl">x</span>
                  <span className={(meuUltimoJogo.awayScore || 0) > meuUltimoJogo.homeScore ? "text-yellow-400" : "text-white"}>{meuUltimoJogo.awayScore}</span>
                  <div className="text-left flex-1 text-xl md:text-2xl text-neutral-400 uppercase tracking-tighter">{getNomeClube(meuUltimoJogo.awayId)}</div>
                </div>
                <ul className="space-y-3 bg-neutral-950 p-6 rounded-lg border border-neutral-800 h-64 overflow-y-auto custom-scrollbar">
                  {meuUltimoJogo.relatorio.map((linha, idx) => (
                    <li key={idx} className="text-sm text-neutral-400 font-mono flex items-start gap-2">
                      <span className="text-cyan-500 font-black">&gt;_</span>
                      <span>{linha}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: TABELA DE CLASSIFICAÇÃO */}
        <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl flex flex-col h-fit">
          <h2 className="text-xl font-black text-white mb-6 uppercase tracking-widest border-b border-neutral-800 pb-4">Tabela de Classificação</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                  <th className="pb-3 w-8 text-center">#</th>
                  <th className="pb-3">Clube</th>
                  <th className="pb-3 text-center text-yellow-500" title="Pontos">PTS</th>
                  <th className="pb-3 text-center" title="Jogos">J</th>
                  <th className="pb-3 text-center" title="Vitórias">V</th>
                  <th className="pb-3 text-center" title="Saldo de Gols">SG</th>
                </tr>
              </thead>
              <tbody>
                {gameState.standings?.map((time, index) => {
                  const isUser = gameState.teams?.find(t => t.id === time.id)?.isUser;
                  return (
                    <tr key={time.id} className={`text-sm border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors ${time.id === currentUserUid ? 'bg-yellow-900/10' : ''}`}>
                      <td className={`py-4 text-center font-black ${index < 4 ? 'text-cyan-400' : index > 7 ? 'text-orange-500' : 'text-neutral-500'}`}>
                        {index + 1}
                      </td>
                      <td className={`py-4 font-black uppercase tracking-tighter truncate max-w-35 ${time.id === currentUserUid ? 'text-yellow-400' : (isUser ? 'text-white' : 'text-neutral-400')}`}>
                        {getNomeClube(time.id)}
                      </td>
                      <td className="py-4 text-center font-black text-white bg-neutral-950/50 rounded">{time.pts}</td>
                      <td className="py-4 text-center text-neutral-400 font-bold">{time.j}</td>
                      <td className="py-4 text-center text-neutral-400 font-bold">{time.v}</td>
                      <td className="py-4 text-center text-neutral-400 font-bold">{time.sg > 0 ? `+${time.sg}` : time.sg}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-6 pt-4 border-t border-neutral-800 text-[10px] font-bold tracking-widest uppercase flex justify-between">
            <span className="text-cyan-400">■ G4 (Libertadores)</span>
            <span className="text-orange-500">■ Z4 (Rebaixamento)</span>
          </div>
        </div>

      </div>
    </div>
  );
}
