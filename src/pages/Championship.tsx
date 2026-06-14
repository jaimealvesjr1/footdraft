import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot, updateDoc, increment, arrayUnion } from "firebase/firestore";
import { type GameState } from "../types";

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
      <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans text-center px-4">
        <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-yellow-400 font-black tracking-widest uppercase animate-pulse mb-2">Aguardando o Sorteio...</p>
        <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">A CBF está gerando o Calendário de Jogos.</p>
      </div>
    );
  }

  const getNomeClube = (id: string) => {
    const time = gameState?.teams?.find(t => t.id === id);
    return time ? time.nome : "Time não encontrado";
  };

  // ==========================================
  // TELA DE CELEBRAÇÃO (ENCERRAMENTO PADRÃO BRASILEIRÃO)
  // ==========================================
  if (gameState.phase === 'FINISHED' || gameState.currentRound > 38) {
    const standings = gameState.standings || [];
    const campeao = standings[0];
    
    const calcularPontosTemporada = (posicaoIndex: number) => {
      if (posicaoIndex === 0) return 100;
      if (posicaoIndex === 1) return 80;
      if (posicaoIndex === 2) return 70;
      if (posicaoIndex === 3) return 60;
      if (posicaoIndex <= 5) return 50;
      if (posicaoIndex <= 11) return 30;
      if (posicaoIndex <= 15) return 10;
      return 0;
    };

    const artilheirosMap: Record<string, { nome: string; gols: number }> = {};
    
    gameState.schedule?.forEach(rodada => {
      rodada.jogos?.forEach(jogo => {
        jogo.relatorio?.forEach((evento: any) => {
          if (evento.tipo === 'GOL' && evento.jogadorId) {
            if (!artilheirosMap[evento.jogadorId]) {
              let nomeAutor = "Jogador";
              if (evento.texto.includes("balança a rede!")) nomeAutor = evento.texto.split("! ")[1]?.replace(" balança a rede!", "");
              else if (evento.texto.includes("Bela finalização de ")) nomeAutor = evento.texto.split("de ")[1]?.replace("!", "");
              artilheirosMap[evento.jogadorId] = { nome: nomeAutor, gols: 0 };
            }
            artilheirosMap[evento.jogadorId].gols += 1;
          }
        });
      });
    });

    const topArtilheiros = Object.values(artilheirosMap).sort((a, b) => b.gols - a.gols).slice(0, 5);

    return (
      <div className="min-h-screen bg-neutral-950 text-white font-sans overflow-x-hidden pb-16">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          
          <div className="text-center mb-12 mt-8">
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white drop-shadow-xl">Fim de <span className="text-yellow-500">Temporada</span></h1>
            <p className="text-cyan-400 font-bold uppercase tracking-widest mt-2 animate-pulse">A Glória Eterna do Campeonato Brasileiro</p>
          </div>

          {campeao && (
            <div className="bg-linear-to-b from-yellow-600 to-yellow-900 border-2 border-yellow-400 p-8 md:p-12 rounded-3xl shadow-[0_0_80px_rgba(234,179,8,0.2)] max-w-3xl w-full mx-auto text-center relative overflow-hidden mb-16 animate-fade-in">
              <span className="text-8xl absolute -top-4 -right-4 opacity-20">🏆</span>
              <span className="text-8xl absolute -bottom-4 -left-4 opacity-20">🏆</span>
              <h2 className="text-xl md:text-2xl font-black uppercase text-yellow-200 tracking-widest mb-4">O Grande Campeão</h2>
              <h3 className="text-4xl md:text-7xl font-black uppercase tracking-tighter text-white mb-4 drop-shadow-md">{getNomeClube(campeao.id)}</h3>
              <div className="flex items-center justify-center gap-6 mt-6">
                <div className="bg-yellow-950/40 p-4 rounded-xl border border-yellow-500/30">
                  <p className="text-xs text-yellow-400 uppercase font-black tracking-widest">Campanha</p>
                  <p className="text-2xl font-black text-white">{campeao.pts} PTS</p>
                </div>
                <div className="bg-yellow-950/40 p-4 rounded-xl border border-yellow-500/30">
                  <p className="text-xs text-yellow-400 uppercase font-black tracking-widest">Prêmio de Temporada</p>
                  <p className="text-2xl font-black text-cyan-300">+{calcularPontosTemporada(0)} XP</p>
                </div>
              </div>
              {campeao.id === currentUserUid && <p className="text-neutral-900 font-black tracking-widest uppercase bg-yellow-400 py-3 rounded-lg mt-8 shadow-xl">Você escreveu o seu nome na história!</p>}
            </div>
          )}

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
                        <span className="font-bold text-white uppercase tracking-tighter text-sm md:text-base">{artilheiro.nome}</span>
                      </div>
                      <div className="bg-neutral-900 px-3 py-1 rounded border border-neutral-700">
                        <span className="font-black text-yellow-400">{artilheiro.gols}</span> <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Gols</span>
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
                        <td className={`py-3 text-center font-black ${index < 4 ? 'text-cyan-400' : index < 6 ? 'text-blue-400' : index >= 6 && index <= 11 ? 'text-green-400' : index > 15 ? 'text-orange-500' : 'text-neutral-500'}`}>
                          {index + 1}
                        </td>
                        <td className={`py-3 font-black uppercase tracking-tighter truncate max-w-37.5 ${time.id === currentUserUid ? 'text-yellow-400' : (isUser ? 'text-white' : 'text-neutral-400')}`}>
                          {getNomeClube(time.id)}
                        </td>
                        <td className="py-3 text-center font-black text-white bg-neutral-950/50 rounded">{time.pts}</td>
                        <td className="py-3 text-center text-neutral-400 font-bold hidden sm:table-cell">{time.j}</td>
                        <td className="py-3 text-center text-neutral-400 font-bold hidden sm:table-cell">{time.v}</td>
                        <td className="py-3 text-center text-neutral-400 font-bold">{time.sg > 0 ? `+${time.sg}` : time.sg}</td>
                        <td className="py-3 text-center">
                           <span className={`text-[10px] px-2 py-1 rounded font-black tracking-widest ${index < 4 ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-800' : index > 15 ? 'bg-red-900/20 text-red-500' : 'bg-neutral-800 text-neutral-400'}`}>
                             +{calcularPontosTemporada(index)}
                           </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="mt-4 pt-4 border-t border-neutral-800 text-[10px] font-bold tracking-widest uppercase flex flex-wrap gap-4 justify-between">
                <span className="text-cyan-400">■ Grupos Libertadores</span>
                <span className="text-blue-400">■ Qualificatórias Libertadores</span>
                <span className="text-green-400">■ Grupos Sudamericana</span>
                <span className="text-orange-500">■ Z4 (Rebaixamento)</span>
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
                  if (xpGanho > 0) await updateDoc(doc(db, "usuarios", currentUserUid), { xpTotal: increment(xpGanho) });
                  navigate('/dashboard');
                } catch (error) {
                  alert("Erro ao resgatar recompensa.");
                  setResgatando(false);
                }
              }} 
              className="px-10 py-4 bg-yellow-500 hover:bg-yellow-400 text-neutral-950 font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(250,204,21,0.4)] disabled:opacity-50"
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
  const rodadaIndex = Math.min(gameState.currentRound - 1, 37);
  const jogosDaRodada = gameState.schedule[rodadaIndex]?.jogos || [];
  const meuProximoJogo = jogosDaRodada.find((j: any) => j.homeId === currentUserUid || j.awayId === currentUserUid);

  const rodadaAnteriorIndex = rodadaIndex - 1;
  let meuUltimoJogo = null;
  if (rodadaAnteriorIndex >= 0) {
    const jogosAnteriores = gameState.schedule[rodadaAnteriorIndex]?.jogos || [];
    meuUltimoJogo = jogosAnteriores.find((j: any) => j.homeId === currentUserUid || j.awayId === currentUserUid);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-sans">
      
      <div className="max-w-7xl mx-auto w-full flex justify-between items-center bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl mb-8">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Campeonato Brasileiro</h1>
          <p className="text-cyan-400 font-bold tracking-widest uppercase text-sm mt-1">
            RODADA {Math.min(gameState.currentRound || 1, 38)} DE 38
          </p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-yellow-400 font-black uppercase tracking-widest rounded-lg transition-colors border border-neutral-700 shadow-lg hidden sm:block">
            ← Ver Escalação
          </button>
          
          {/* BOTÃO MANTIDO E ATIVADO APENAS QUANDO O JOGADOR DEU CHECK NO VESTIÁRIO */}
          <button 
            disabled={!isReady}
            onClick={async () => {
              if (currentUserUid) {
                // Registra que o jogador sentou na arquibancada virtual
                await updateDoc(doc(db, "game", "state"), {
                  playersInLive: arrayUnion(currentUserUid)
                });
              }
              navigate('/live');
            }} 
            className={`px-6 py-3 font-black uppercase tracking-widest rounded-lg transition-colors shadow-lg 
              ${isReady ? 'bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 shadow-cyan-900/50' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed border-neutral-700'}`}
          >
            📺 Transmissão ao Vivo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full max-w-7xl mx-auto">
        
        <div className="xl:col-span-2 space-y-8">
          <div className="bg-neutral-900 p-8 rounded-xl border border-neutral-800 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-2 bg-linear-to-r ${gameState.currentRound > 19 ? 'from-purple-600 to-purple-300' : 'from-yellow-600 to-yellow-300'}`}></div>
            <h2 className="text-sm font-black text-neutral-500 mb-8 uppercase tracking-widest">
              {gameState.currentRound > 19 ? 'Fase de Returno (2ª Metade)' : 'O Seu Próximo Confronto'}
            </h2>
            
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

            <div className={`w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest border-2 transition-all
              ${isReady ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-400' : 'bg-orange-900/20 border-orange-500/50 text-orange-500'}`}>
              {isReady ? `VOCÊ ESTÁ PRONTO! CLIQUE EM "TRANSMISSÃO" PARA IR AO ESTÁDIO.` : 'VOCÊ AINDA NÃO DEU CHECK NO VESTIÁRIO!'}
            </div>
          </div>

          {meuUltimoJogo && meuUltimoJogo.homeScore !== null && (
            <div className="bg-neutral-900 p-5 rounded-xl border border-neutral-800 shadow-xl">
              <h3 className="text-yellow-500 font-black mb-4 uppercase text-xs tracking-widest border-b border-neutral-800 pb-2">Resultado da Rodada Anterior</h3>
              <div className="flex justify-center items-center gap-4 text-3xl font-black text-white mb-4 bg-neutral-950 py-4 rounded-xl border border-neutral-800 shadow-inner">
                <div className="text-right flex-1 text-lg md:text-xl text-neutral-400 uppercase tracking-tighter truncate">{getNomeClube(meuUltimoJogo.homeId)}</div>
                <span className={meuUltimoJogo.homeScore > (meuUltimoJogo.awayScore || 0) ? "text-yellow-400" : "text-white"}>{meuUltimoJogo.homeScore}</span>
                <span className="text-neutral-700 text-xl">x</span>
                <span className={(meuUltimoJogo.awayScore || 0) > meuUltimoJogo.homeScore ? "text-yellow-400" : "text-white"}>{meuUltimoJogo.awayScore}</span>
                <div className="text-left flex-1 text-lg md:text-xl text-neutral-400 uppercase tracking-tighter truncate">{getNomeClube(meuUltimoJogo.awayId)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl flex flex-col h-fit">
          <h2 className="text-xl font-black text-white mb-6 uppercase tracking-widest border-b border-neutral-800 pb-4">Tabela de Classificação</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-75">
              <thead>
                <tr className="text-[10px] text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                  <th className="pb-3 w-8 text-center">#</th>
                  <th className="pb-3">Clube</th>
                  <th className="pb-3 text-center text-yellow-500">PTS</th>
                  <th className="pb-3 text-center">J</th>
                  <th className="pb-3 text-center">V</th>
                  <th className="pb-3 text-center">SG</th>
                </tr>
              </thead>
              <tbody>
                {gameState.standings?.map((time, index) => {
                  const isUser = gameState.teams?.find(t => t.id === time.id)?.isUser;
                  return (
                    <tr key={time.id} className={`text-sm border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors ${time.id === currentUserUid ? 'bg-yellow-900/10' : ''}`}>
                      <td className={`py-4 text-center font-black ${index < 4 ? 'text-cyan-400' : index < 6 ? 'text-blue-400' : index >= 6 && index <= 11 ? 'text-green-400' : index > 15 ? 'text-orange-500' : 'text-neutral-500'}`}>{index + 1}</td>
                      <td className={`py-4 font-black uppercase tracking-tighter truncate max-w-35 ${time.id === currentUserUid ? 'text-yellow-400' : (isUser ? 'text-white' : 'text-neutral-400')}`}>{getNomeClube(time.id)}</td>
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
        </div>

      </div>
    </div>
  );
}
