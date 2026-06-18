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

  const totalTeams = (gameState as any)?.totalTeams || 20;
  
  const eventosLiga = gameState.schedule?.filter(e => e.tipo === 'LIGA' || e.tipo === 'LIGA_GRUPOS') || [];
  const totalRounds = eventosLiga.length; 
  
  // Identifica o formato do torneio ativo
  const isCopaPura = gameState.schedule?.some(e => e.tipo === 'COPA') && eventosLiga.length === 0;
  const isFormatoGrupos = gameState.schedule?.some(e => e.tipo === 'LIGA_GRUPOS');
  
  const eventosPassadosLiga = gameState.schedule?.slice(0, gameState.currentRound - 1).filter(e => e.tipo === 'LIGA' || e.tipo === 'LIGA_GRUPOS').length || 0;
  const rodadaVerdadeira = isCopaPura ? gameState.currentRound : Math.min(eventosPassadosLiga + 1, totalRounds);
  const isReturno = !isCopaPura && eventosPassadosLiga >= (totalRounds / 2);
  
  const nomeCampeonato = (gameState as any)?.nomeCampeonato || (isCopaPura ? "Copa Mata-Mata" : "Campeonato");

  // LEITURA DE EVENTOS ATIVOS
  const eventoAtual = gameState.schedule?.[gameState.currentRound - 1];
  const meuProximoJogo = eventoAtual?.jogos?.find((j: any) => j.homeId === currentUserUid || j.awayId === currentUserUid);

  let meuUltimoJogo = null;
  for (let i = gameState.currentRound - 2; i >= 0; i--) {
    const eventoPassado = gameState.schedule?.[i];
    if (eventoPassado?.tipo === 'LIGA' || eventoPassado?.tipo === 'COPA' || eventoPassado?.tipo === 'LIGA_GRUPOS') {
      const jogoPassado = eventoPassado.jogos?.find((j: any) => j.homeId === currentUserUid || j.awayId === currentUserUid);
      if (jogoPassado && jogoPassado.homeScore !== null) {
        meuUltimoJogo = jogoPassado;
        break;
      }
    }
  }

  // CÁLCULO DINÂMICO DE VAGAS NA TABELA DE CLASSIFICAÇÃO
  const regras = (gameState as any)?.regrasClassificacao || {
    zona1: { nome: 'Libertadores', vagas: Math.max(1, Math.floor(totalTeams * 0.20)) },
    zona2: { nome: 'Pré-Libertadores', vagas: Math.max(1, Math.floor(totalTeams * 0.10)) },
    zona3: { nome: 'Sul-Americana', vagas: Math.max(1, Math.floor(totalTeams * 0.30)) },
    zona4: { nome: 'Rebaixamento', vagas: Math.max(1, Math.floor(totalTeams * 0.20)) }
  };

  const tZona1 = regras.zona1.vagas; 
  const tZona2 = tZona1 + regras.zona2.vagas; 
  const tZona3 = tZona2 + regras.zona3.vagas; 
  const tZona4 = totalTeams - regras.zona4.vagas;

  const getCorTabela = (index: number, isGrupo: boolean = false) => {
    // Se for fase de grupos (Estilo Libertadores), a regra é diferente: os 2 primeiros passam.
    if (isGrupo) {
       if (index === 0) return 'text-yellow-500';
       if (index === 1) return 'text-cyan-400';
       return 'text-neutral-600';
    }

    if (regras.zona1.vagas > 0 && index < tZona1) return 'text-cyan-400';
    if (regras.zona2.vagas > 0 && index < tZona2) return 'text-blue-400';
    if (regras.zona3.vagas > 0 && index < tZona3) return 'text-green-400';
    if (regras.zona4.vagas > 0 && index >= tZona4) return 'text-orange-500';
    return 'text-neutral-500';
  };

  // =======================================================
  // TELA DE ENCERRAMENTO
  // =======================================================
  if (gameState.phase === 'FINISHED') {
    const standings = gameState.standings || [];
    
    // Cálculo Dinâmico de Vencedor para Liga ou Copa
    let campeao = standings[0];
    if (isCopaPura || isFormatoGrupos) {
      const copas = gameState.schedule?.filter(e => e.tipo === 'COPA') || [];
      const ultimaFase = copas[copas.length - 1];
      const ultimoJogo = ultimaFase?.jogos?.[0];
      let cId = ultimoJogo?.homeId || "";
      if (ultimoJogo && ultimoJogo.homeScore !== null && ultimoJogo.awayScore !== null) {
        const rel = ultimoJogo.relatorio || [];
        const pkCasa = rel.some(r => r.minuto === 120 && r.time === 'CASA');
        const pkFora = rel.some(r => r.minuto === 120 && r.time === 'FORA');
        if (pkCasa) cId = ultimoJogo.homeId;
        else if (pkFora) cId = ultimoJogo.awayId;
        else if (ultimoJogo.homeScore > ultimoJogo.awayScore) cId = ultimoJogo.homeId;
        else cId = ultimoJogo.awayId;
      }
      campeao = { id: cId, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 } as any;
    }
    
    const calcularPontosTemporada = (posicaoIndex: number, timeId: string) => {
      if (isCopaPura || isFormatoGrupos) {
        const copas = gameState.schedule?.filter(e => e.tipo === 'COPA') || [];
        let xp = isFormatoGrupos ? 20 : 0; // Ganha um trocado só por jogar os grupos
        const campeaoFinal = campeao?.id;
        
        if (campeaoFinal === timeId) xp += 50;
        
        copas.forEach(fase => {
          const jogo = fase.jogos.find(j => j.homeId === timeId || j.awayId === timeId);
          if (jogo) {
            const venceu = jogo.homeId === timeId ? (jogo.homeScore ?? 0) > (jogo.awayScore ?? 0) : (jogo.awayScore ?? 0) > (jogo.homeScore ?? 0);
            if (venceu) xp += 20;
          }
        });
        return xp;
      }
  
      if (posicaoIndex === 0) return 100;
      if (regras.zona1.vagas > 0 && posicaoIndex < tZona1) return 80;
      if (regras.zona2.vagas > 0 && posicaoIndex < tZona2) return 50;
      if (regras.zona3.vagas > 0 && posicaoIndex < tZona3) return 30;
      if (regras.zona4.vagas > 0 && posicaoIndex >= tZona4) return 0;
      return 10;
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
              artilheirosMap[evento.jogadorId] = { nome: nomeAutor, gols: 0, clube: getNomeClube(timeId) };
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
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white drop-shadow-xl">Fim de <span className="text-fifa-green">{nomeCampeonato}</span></h1>
            <p className="text-fifa-blue font-bold uppercase tracking-widest mt-2 animate-pulse">Até a próxima temporada!</p>
          </div>

          {campeao && (
            <div className="bg-linear-to-br from-neutral-900 via-fifa-blue/40 to-fifa-green/40 border-2 border-fifa-green p-8 md:p-12 rounded-3xl shadow-[0_0_80px_rgba(60,172,59,0.3)] max-w-3xl w-full mx-auto text-center relative overflow-hidden mb-16 animate-fade-in">
              <span className="text-8xl absolute -top-4 -right-4 opacity-20">🏆</span>
              <span className="text-8xl absolute -bottom-4 -left-4 opacity-20">🏆</span>
              <h2 className="text-xl md:text-2xl font-black uppercase text-fifa-green tracking-widest mb-4">O Grande Campeão</h2>
              <h3 className="text-4xl md:text-7xl font-black uppercase tracking-tighter text-white mb-4 drop-shadow-md">{getNomeClube(campeao.id)}</h3>
              <div className="flex items-center justify-center gap-6 mt-6">
                <div className="bg-yellow-950/40 p-4 rounded-xl border border-yellow-500/30">
                  <p className="text-xs text-fifa-green uppercase font-black tracking-widest">Formato</p>
                  <p className="text-xl font-black text-white">{isCopaPura || isFormatoGrupos ? 'Mata-Mata' : `${campeao.pts} PTS`}</p>
                </div>
                <div className="bg-yellow-950/40 p-4 rounded-xl border border-yellow-500/30">
                  <p className="text-xs text-fifa-green uppercase font-black tracking-widest">Prêmio de Temporada</p>
                  <p className="text-2xl font-black text-cyan-300">+{calcularPontosTemporada(0, campeao.id)} XP</p>
                </div>
              </div>
              {campeao.id === currentUserUid && <p className="text-white font-black tracking-widest uppercase bg-fifa-green py-3 rounded-lg mt-8 shadow-[0_0_20px_rgba(60,172,59,0.4)]">Você escreveu o seu nome na história!</p>}
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

            {/* TABELA OU RESUMO DE BRACKET FINAL */}
            <div className="lg:col-span-2 bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-2xl overflow-x-auto">
              <h2 className="text-xl font-black text-white uppercase tracking-widest border-b border-neutral-800 pb-4 mb-4">Resultado Final</h2>
              {isCopaPura || isFormatoGrupos ? (
                <div className="space-y-2">
                   {[...(gameState.teams || [])]
                     .map(t => ({
                       ...t,
                       xpGanho: calcularPontosTemporada(0, t.id)
                     }))
                     .sort((a, b) => b.xpGanho - a.xpGanho) // Ordena do maior XP para o menor
                     .map((t, index) => {
                      const isMe = t.id === currentUserUid;
                      return (
                        <div 
                          key={t.id} 
                          className={`p-3 rounded flex justify-between items-center font-black transition-colors border
                            ${isMe 
                              ? 'bg-fifa-blue/20 border-fifa-blue/60 shadow-[0_0_15px_rgba(42,57,141,0.2)]' 
                              : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-900'
                            }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`text-lg sm:text-xl w-6 text-center ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-neutral-400' : index === 2 ? 'text-orange-500' : 'text-neutral-600'}`}>
                              {index + 1}º
                            </span>
                            <span className={t.id === campeao?.id ? "text-yellow-500" : isMe ? "text-fifa-green uppercase tracking-tighter" : "text-white uppercase tracking-tighter"}>
                              {t.nome}
                            </span>
                            {isMe && (
                              <span className="text-[8px] bg-fifa-green text-white px-1.5 py-0.5 rounded font-black tracking-widest uppercase">VOCÊ</span>
                            )}
                          </div>
                          <span className={`text-[10px] px-2 py-1 rounded tracking-widest ${t.id === campeao?.id ? 'bg-yellow-500 text-neutral-950 shadow-[0_0_10px_rgba(234,179,8,0.4)]' : isMe ? 'bg-fifa-green/20 text-fifa-green border border-fifa-green/30' : 'bg-neutral-900 border border-neutral-800 text-cyan-400'}`}>
                            +{t.xpGanho} XP
                          </span>
                        </div>
                      );
                     })}
                </div>
              ) : (
                <table className="w-full text-left border-collapse min-w-125">
                  <thead>
                    <tr className="text-[10px] text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                      <th className="pb-3 w-8 text-center">#</th>
                      <th className="pb-3">Clube</th>
                      <th className="pb-3 text-center text-yellow-500">PTS</th>
                      <th className="pb-3 text-center">SG</th>
                      <th className="pb-3 text-center text-cyan-400">Prêmio (XP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((time, index) => {
                      const isUser = gameState.teams?.find(t => t.id === time.id)?.isUser;
                      const isMe = time.id === currentUserUid;
                      return (
                        <tr 
                          key={time.id} 
                          className={`text-sm border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors 
                            ${isMe ? 'bg-fifa-blue/20 border-y border-y-fifa-blue/40' : ''}`}
                        >
                          <td className={`py-3 text-center font-black ${getCorTabela(index)}`}>{index + 1}</td>
                          <td className={`py-3 font-black uppercase tracking-tighter truncate max-w-37.5 flex items-center gap-2 ${isMe ? 'text-fifa-green' : (isUser ? 'text-white' : 'text-neutral-400')}`}>
                            <span>{getNomeClube(time.id)}</span>
                            {isMe && (
                              <span className="text-[8px] bg-fifa-green text-white px-1.5 py-0.5 rounded font-black tracking-widest uppercase inline-block">VOCÊ</span>
                            )}
                          </td>
                          <td className="py-3 text-center font-black text-white bg-neutral-950/50 rounded">{time.pts}</td>
                          <td className="py-3 text-center text-neutral-400 font-bold">{time.sg > 0 ? `+${time.sg}` : time.sg}</td>
                          <td className="py-3 text-center">
                             <span className={`text-[10px] px-2 py-1 rounded font-black tracking-widest ${getCorTabela(index).replace('text-', 'border border-').replace('400', '800').replace('500', '900')} ${getCorTabela(index)} bg-neutral-900`}>
                               +{calcularPontosTemporada(index, time.id)}
                             </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
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
                  const xpGanho = calcularPontosTemporada(userIndex, currentUserUid);
                  
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

  const isReady = gameState.playersReady?.includes(currentUserUid || '');

  // NOVO: Verifica se o jogador tem jogo hoje. Se não tiver, ele tem "Passe Livre" pra TV!
  const temJogoNaRodada = !!meuProximoJogo;
  const podeAcessarTransmissao = !temJogoNaRodada || isReady;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 flex flex-col font-sans">
      <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row justify-between items-center bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-2xl mb-6 sm:mb-8 gap-4 sm:gap-0">
        <div className="text-center md:text-left">
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter">{nomeCampeonato}</h1>
          <p className="text-cyan-400 font-bold tracking-widest uppercase text-xs sm:text-sm mt-1">
            {isCopaPura && eventoAtual ? eventoAtual.titulo : `RODADA ${rodadaVerdadeira} DE ${totalRounds}`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button onClick={() => navigate('/dashboard')} className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-fifa-gray-light hover:text-white font-black uppercase tracking-widest rounded-lg transition-colors border border-neutral-800 shadow-lg text-[10px] sm:text-sm">
            ← Escalação
          </button>
          
          <button 
            disabled={!podeAcessarTransmissao}
            onClick={async () => {
              if (currentUserUid) {
                await updateDoc(doc(db, "game", "state"), {
                  playersInLive: arrayUnion(currentUserUid)
                });
              }
              navigate('/live');
            }} 
            className={`w-full sm:w-auto px-4 sm:px-6 py-3 font-black uppercase tracking-widest rounded-lg transition-colors shadow-lg text-[10px] sm:text-sm
              ${podeAcessarTransmissao ? 'bg-fifa-red hover:bg-opacity-80 text-white shadow-[0_0_15px_rgba(230,29,37,0.4)]' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed border-transparent'}`}
          >
              <img src="/transmissao.png" alt="Cazé TV" className="h-6 sm:h-10 object-contain drop-shadow-md shrink-0" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full max-w-7xl mx-auto">
        
        <div className="xl:col-span-2 space-y-8">
          <div className="bg-neutral-900 p-4 sm:p-8 rounded-xl border border-neutral-800 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-2 bg-linear-to-r ${isCopaPura || (isFormatoGrupos && eventoAtual?.tipo === 'COPA') ? 'from-orange-600 to-orange-300' : (isReturno ? 'from-purple-600 to-purple-300' : 'from-yellow-600 to-yellow-300')}`}></div>
            <h2 className="text-xs sm:text-sm font-black text-neutral-500 mb-6 sm:mb-8 uppercase tracking-widest">
              {isCopaPura || (isFormatoGrupos && eventoAtual?.tipo === 'COPA') ? 'Decisão no Mata-Mata' : (isReturno ? 'Fase de Returno (2ª Metade)' : 'O Seu Próximo Confronto')}
            </h2>
            
            <div className="flex items-center justify-center gap-2 sm:gap-6 w-full mb-8 sm:mb-10">
              <div className="flex-1 text-right">
                <span className="font-black text-lg sm:text-2xl md:text-4xl text-white block uppercase tracking-tighter wrap-break-word">{meuProximoJogo ? getNomeClube(meuProximoJogo.homeId) : '-'}</span>
                {meuProximoJogo?.homeId === currentUserUid && <span className="text-[8px] sm:text-xs text-yellow-500 font-black tracking-widest uppercase bg-yellow-900/30 px-2 py-1 rounded inline-block mt-1">SEU TIME (MANDANTE)</span>}
              </div>
              <div className="text-2xl sm:text-4xl font-black text-neutral-700 px-2">VS</div>
              <div className="flex-1 text-left">
                <span className="font-black text-lg sm:text-2xl md:text-4xl text-white block uppercase tracking-tighter wrap-break-word">{meuProximoJogo ? getNomeClube(meuProximoJogo.awayId) : '-'}</span>
                {meuProximoJogo?.awayId === currentUserUid && <span className="text-[8px] sm:text-xs text-yellow-500 font-black tracking-widest uppercase bg-yellow-900/30 px-2 py-1 rounded inline-block mt-1">SEU TIME (VISITANTE)</span>}
              </div>
            </div>

            <div className={`w-full py-3 sm:py-4 rounded-xl font-black text-xs sm:text-lg uppercase tracking-widest border-2 transition-all
              ${!temJogoNaRodada ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]' 
              : isReady ? 'bg-fifa-green/20 border-fifa-green text-fifa-green shadow-[0_0_15px_rgba(60,172,59,0.2)]' 
              : 'bg-fifa-red/20 border-fifa-red text-fifa-red'}`}>
              
              {!temJogoNaRodada 
                ? 'VOCÊ ESTÁ FORA DESTA RODADA! VÁ ASSISTIR AO JOGO NA TV.' 
                : isReady 
                  ? 'VOCÊ ESTÁ PRONTO! CLIQUE EM "TRANSMISSÃO".' 
                  : 'VOCÊ AINDA NÃO ATUALIZOU A ESCALAÇAO NO CT!'}
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

        {/* CHAVEAMENTO COMPLETO (BRACKET DINÂMICO PARA MATA-MATA) */}
        {isCopaPura || (isFormatoGrupos && eventoAtual?.tipo === 'COPA' || eventoAtual?.tipo === 'SORTEIO_MATA_MATA') ? (
          <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-2xl flex flex-col h-fit">
            <h2 className="text-lg sm:text-xl font-black text-white mb-4 sm:mb-6 uppercase tracking-widest border-b border-neutral-800 pb-2 sm:pb-4 flex items-center justify-between">
              Chaveamento da Copa
            </h2>
            
            <div className="space-y-6 overflow-y-auto max-h-115 custom-scrollbar pr-2">
              {gameState.schedule?.filter(e => e.tipo === 'COPA')
                .sort((a, b) => {
                  const aConcluida = a.jogos.every(j => j.homeScore !== null);
                  const bConcluida = b.jogos.every(j => j.homeScore !== null);
                  return aConcluida === bConcluida ? 0 : aConcluida ? 1 : -1;
                })
                .map((fase, fIdx) => (
                <div key={fIdx} className="bg-neutral-950 p-4 rounded-xl border border-neutral-800/60 space-y-3">
                  <div className="flex justify-between items-center border-b border-neutral-800/80 pb-1.5">
                    <span className="text-xs font-black text-orange-400 uppercase tracking-wider">
                      {fase.titulo}
                    </span>
                    <span className={`text-[9px] border px-2 py-0.5 rounded font-black tracking-wider ${fase.jogos.every(j => j.homeScore !== null) ? 'bg-fifa-green/10 border-fifa-green/30 text-fifa-green' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
                      {fase.jogos.every(j => j.homeScore !== null) ? 'CONCLUÍDO' : 'EM CURSO'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2.5">
                    {fase.jogos.map((jogo, jIdx) => {
                      const isMeuJogo = jogo.homeId === currentUserUid || jogo.awayId === currentUserUid;
                      
                      // CÁLCULO DO PLACAR AGREGADO (Se for jogo de volta, procura o jogo de ida e soma)
                      let agregadoHome = jogo.homeScore;
                      let agregadoAway = jogo.awayScore;
                      let temAgregado = false;
                      
                      if (fase.titulo.includes('(Volta)')) {
                         const faseIda = gameState.schedule?.find(f => f.titulo === fase.titulo.replace('(Volta)', '(Ida)'));
                         if (faseIda) {
                            const jogoIda = faseIda.jogos.find(j => j.homeId === jogo.awayId && j.awayId === jogo.homeId);
                            if (jogoIda && jogoIda.homeScore !== null && jogo.homeScore !== null) {
                               temAgregado = true;
                               agregadoHome = (jogo.homeScore || 0) + (jogoIda.awayScore || 0);
                               agregadoAway = (jogo.awayScore || 0) + (jogoIda.homeScore || 0);
                            }
                         }
                      }
                      
                      return (
                        <div key={jIdx} className={`p-3 rounded-lg border text-xs flex flex-col gap-2 transition-all ${isMeuJogo ? 'bg-yellow-900/10 border-yellow-500/40 shadow-md' : 'bg-neutral-900/40 border-neutral-800/80'}`}>
                          <div className="flex justify-between items-center font-bold relative">
                            <span className={`truncate max-w-37.5 uppercase ${jogo.homeId === currentUserUid ? 'text-fifa-green font-black' : 'text-neutral-300'}`}>
                              {getNomeClube(jogo.homeId)}
                            </span>
                            <div className="flex items-center gap-2">
                               {temAgregado && <span className="text-[9px] text-neutral-500 font-black">({agregadoHome})</span>}
                               <span className="font-black text-sm text-white bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                                 {jogo.homeScore !== null ? jogo.homeScore : '-'}
                               </span>
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center font-bold">
                            <span className={`truncate max-w-37.5 uppercase ${jogo.awayId === currentUserUid ? 'text-fifa-green font-black' : 'text-neutral-300'}`}>
                              {getNomeClube(jogo.awayId)}
                            </span>
                            <div className="flex items-center gap-2">
                               {temAgregado && <span className="text-[9px] text-neutral-500 font-black">({agregadoAway})</span>}
                               <span className="font-black text-sm text-white bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                                 {jogo.awayScore !== null ? jogo.awayScore : '-'}
                               </span>
                            </div>
                          </div>
                          
                          {/* Indica se houve pênaltis no relatório deste jogo */}
                          {jogo.relatorio && jogo.relatorio.some((r:any) => r.minuto === 120) && (
                             <p className="text-[8px] text-center text-orange-400 font-black tracking-widest mt-1 border-t border-neutral-800/50 pt-1">
                               Decidido nos Pênaltis
                             </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mt-4 text-center border-t border-neutral-800 pt-4">
              Empate no placar agregado leva a decisão para os pênaltis!
            </p>
          </div>
        ) : (
          /* TABELAS DE CLASSIFICAÇÃO (LIGA OU GRUPOS) */
          <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-2xl flex flex-col h-fit">
            <h2 className="text-lg sm:text-xl font-black text-white mb-4 sm:mb-6 uppercase tracking-widest border-b border-neutral-800 pb-2 sm:pb-4">
              {isFormatoGrupos ? 'Fase de Grupos' : 'Tabela de Classificação'}
            </h2>
            <div className="overflow-x-auto">
              
              {isFormatoGrupos ? (
                // RENDERIZAÇÃO MÚLTIPLA POR GRUPOS
                <div className="space-y-6">
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(letraGrupo => {
                    const timesDoGrupo = gameState.standings?.filter((t:any) => t.grupo === letraGrupo);
                    if (!timesDoGrupo || timesDoGrupo.length === 0) return null;
                    
                    return (
                      <div key={letraGrupo} className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                        <h3 className="text-xs font-black text-yellow-500 uppercase tracking-widest mb-2 px-2 border-b border-neutral-800/50 pb-2">Grupo {letraGrupo}</h3>
                        <table className="w-full text-left border-collapse min-w-75">
                          <thead>
                            <tr className="text-[8px] sm:text-[10px] text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                              <th className="pb-2 sm:pb-3 w-6 sm:w-8 text-center">#</th>
                              <th className="pb-2 sm:pb-3">Clube</th>
                              <th className="pb-2 sm:pb-3 text-center text-yellow-500">PTS</th>
                              <th className="pb-2 sm:pb-3 text-center">V</th>
                              <th className="pb-2 sm:pb-3 text-center">SG</th>
                            </tr>
                          </thead>
                          <tbody>
                            {timesDoGrupo.map((time, index) => {
                              const isMe = time.id === currentUserUid;
                              return (
                                <tr key={time.id} className={`text-[10px] sm:text-sm border-b border-neutral-800/50 hover:bg-neutral-800 transition-colors ${isMe ? 'bg-fifa-blue/20 border-y border-y-fifa-blue/40' : ''}`}>
                                  <td className={`py-3 sm:py-4 text-center font-black ${getCorTabela(index, true)}`}>{index + 1}</td>
                                  <td className={`py-3 sm:py-4 font-black uppercase tracking-tighter truncate max-w-24 sm:max-w-35 flex items-center gap-2 ${isMe ? 'text-fifa-green' : 'text-white'}`}>
                                    <span>{getNomeClube(time.id)}</span>
                                  </td>
                                  <td className="py-3 sm:py-4 text-center font-black text-white bg-neutral-950/50 rounded">{time.pts}</td>
                                  <td className="py-3 sm:py-4 text-center text-neutral-400 font-bold">{time.v}</td>
                                  <td className="py-3 sm:py-4 text-center text-neutral-400 font-bold">{time.sg > 0 ? `+${time.sg}` : time.sg}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              ) : (
                // RENDERIZAÇÃO ÚNICA DA LIGA GIGANTE
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
              )}
            </div>
            
            {/* LENGENDAS DE ZONAS SÓ PARA LIGA */}
            {!isFormatoGrupos && (
              <div className="mt-4 pt-4 border-t border-neutral-800 text-[8px] sm:text-[10px] font-bold tracking-widest uppercase flex flex-wrap gap-2 sm:gap-4 justify-between">
                {regras.zona1.vagas > 0 && <span className="text-cyan-400">■ G{tZona1} ({regras.zona1.nome})</span>}
                {regras.zona2.vagas > 0 && <span className="text-blue-400">■ G{tZona2} ({regras.zona2.nome})</span>}
                {regras.zona3.vagas > 0 && <span className="text-green-400">■ G{tZona3} ({regras.zona3.nome})</span>}
                {regras.zona4.vagas > 0 && <span className="text-orange-500">■ Z{regras.zona4.vagas} ({regras.zona4.nome})</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
