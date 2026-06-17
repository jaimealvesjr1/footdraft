import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, onSnapshot, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { type Jogador, type GameState, type Clube } from '../types';
import toast from 'react-hot-toast';

const LIMITES = { GOL: 2, DEF: 7, MEI: 7, ATA: 5 };
const ESCOLHAS_POR_RODADA = 3;
const TEMPO_LIMITE_MS = 2 * 60 * 1000; // 2 Minutos por rodada

export default function Draft() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [tempoRestante, setTempoRestante] = useState<number>(120); 
  
  const currentUserUid = auth.currentUser?.uid;

  const [clubesBase, setClubesBase] = useState<Clube[]>([]);
  
  // Estados Locais do Jogador
  const [escolhasDaRodada, setEscolhasDaRodada] = useState<Jogador[]>([]);
  const [meuElenco, setMeuElenco] = useState<Jogador[]>([]);
  const [nomeTime, setNomeTime] = useState("Meu Time");
  const [rerollsRestantes, setRerollsRestantes] = useState<number>(2);
  const [clubeReroladoId, setClubeReroladoId] = useState<string | null>(null); // Sobrescrita em caso de reroll

  const [carregando, setCarregando] = useState(true);
  const [processandoBotao, setProcessandoBotao] = useState(false);

  // ==========================================
  // LÓGICA 1: SINCRO EM TEMPO REAL E BANCO DE DADOS
  // ==========================================
  useEffect(() => {
    const unsubscribeGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        setGameState(data);
      }
    });

    const carregarBancoClubes = async () => {
      const queryClubes = await getDocs(collection(db, "clubes"));
      let lista: Clube[] = [];
      queryClubes.forEach(d => { 
        if (d.data().elenco) lista.push({ id: d.id, ...d.data() } as Clube); 
      });
      setClubesBase(lista);
    };

    const unsubscribeUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      snapshot.forEach(documento => {
        const dados = documento.data();

        if (documento.id === currentUserUid) {
          setMeuElenco(dados.elenco || []);
          setNomeTime(dados.nomeTime || "Meu Clube");
          setRerollsRestantes(dados.draftRerollsLeft ?? 2);
        }
      });
      setCarregando(false);
    });

    carregarBancoClubes();
    return () => { unsubscribeGame(); unsubscribeUsuarios(); };
  }, [currentUserUid]);

  // Limpa as escolhas visuais locais assim que a rodada mudar no servidor
  useEffect(() => {
    setEscolhasDaRodada([]);
    setClubeReroladoId(null);
  }, [gameState?.currentRound]);

  // ==========================================
  // LÓGICA 2: ENGENHARIA DE ROTAÇÃO E FILTRO DE TIMES
  // ==========================================
  const { pacoteAtual, nomeClubePacote } = useMemo(() => {
    if (!gameState || clubesBase.length === 0 || !currentUserUid) return { pacoteAtual: [], nomeClubePacote: "" };

    // 1. Filtra apenas os times do tipo BOT que estão participando deste campeonato específico
    const botsDoCampeonato = gameState.teams?.filter(t => !t.isUser) || [];
    const humanPlayers = gameState.draftOrder || [];
    const myHumanIndex = humanPlayers.indexOf(currentUserUid);

    if (myHumanIndex === -1 || botsDoCampeonato.length === 0) return { pacoteAtual: [], nomeClubePacote: "" };

    // 2. Se o jogador usou Reroll nesta rodada, exibe o clube opcional escolhido
    if (clubeReroladoId) {
      const clubeEncontrado = clubesBase.find(c => c.id === clubeReroladoId);
      return { 
        pacoteAtual: clubeEncontrado?.elenco || [], 
        nomeClubePacote: `${clubeEncontrado?.nome} ${clubeEncontrado?.ano}`.trim() 
      };
    }

    // 3. MATEMÁTICA DA CORREIA SIMULTÂNEA: Cada rodada o índice desloca de forma circular
    const rodadaAtual = gameState.currentRound || 1;
    const indiceDoTimeDestaRodada = (myHumanIndex + rodadaAtual - 1) % botsDoCampeonato.length;
    const botAlvo = botsDoCampeonato[indiceDoTimeDestaRodada];

    const clubeOriginal = clubesBase.find(c => c.id === botAlvo.id);
    return { 
      pacoteAtual: clubeOriginal?.elenco || [], 
      nomeClubePacote: botAlvo.nome 
    };
  }, [gameState, clubesBase, currentUserUid, clubeReroladoId]);

  // ==========================================
  // LÓGICA 3: CRONÔMETRO COORDENADO E AUTO-AVANÇO
  // ==========================================
  useEffect(() => {
    if (!gameState || !gameState.draftDeadline) return;
    const deadline = gameState.draftDeadline;

    const intervalo = setInterval(() => {
      const agora = Date.now();
      const faltam = Math.max(0, Math.floor((deadline - agora) / 1000));
      setTempoRestante(faltam);

      if (faltam === 0) {
        clearInterval(intervalo);
        const jaPronto = gameState.playersReady?.includes(currentUserUid || '');
        if (!jaPronto) fazerEscolhaAutomaticaETravar();
      }
    }, 1000);

    return () => clearInterval(intervalo);
  }, [gameState, pacoteAtual]);

  // Escuta se todos os jogadores deram "Pronto" para passar a rodada automaticamente
  useEffect(() => {
    if (!gameState || !gameState.draftOrder) return;
    const totalHumanos = gameState.draftOrder.length;
    const prontos = gameState.playersReady?.length || 0;

    // Apenas o primeiro jogador da lista assume o papel de "servidor mestre" para avançar a rodada, evitando conflitos
    const souOMestre = gameState.draftOrder[0] === currentUserUid;

    if (prontos >= totalHumanos && totalHumanos > 0 && souOMestre) {
      avancarRodadaGeral();
    }
  }, [gameState?.playersReady, currentUserUid]);

  // ==========================================
  // LÓGICA 4: CONTROLES DE ESCOLHAS E ABAS
  // ==========================================
  const podeEscolherMais = (posicao: string) => {
    const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    meuElenco.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
    escolhasDaRodada.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
    return contagem[posicao as keyof typeof contagem] < LIMITES[posicao as keyof typeof LIMITES];
  };

  const toggleJogador = (jogador: Jogador) => {
    const jaPronto = gameState?.playersReady?.includes(currentUserUid || '');
    if (jaPronto || processandoBotao) return;

    setEscolhasDaRodada(prev => {
      if (prev.some(j => j.id === jogador.id)) {
        return prev.filter(j => j.id !== jogador.id);
      } else {
        if (prev.length >= ESCOLHAS_POR_RODADA) return prev;
        if (podeEscolherMais(jogador.posicao)) return [...prev, jogador];
        else { toast.error(`Limite da posição ${jogador.posicao} atingido!`); return prev; }
      }
    });
  };

  const rerolarMesaExclusiva = async () => {
    if (rerollsRestantes <= 0 || jaPronto || escolhasDaRodada.length > 0 || !gameState) return;

    const botsDoCampeonato = gameState.teams?.filter(t => !t.isUser) || [];
    const humanPlayers = gameState.draftOrder || [];
    const rodadaAtual = gameState.currentRound || 1;

    // Descobre quais bots já estão ocupados pelos outros humanos nesta rodada exata
    const idsOcupados = humanPlayers.map((_, idx) => {
      const indexTime = (idx + rodadaAtual - 1) % botsDoCampeonato.length;
      return botsDoCampeonato[indexTime]?.id;
    });

    // Filtra no banco de dados geral do jogo os bots que sobraram livres
    const botsLivres = clubesBase.filter(c => !idsOcupados.includes(c.id));
    if (botsLivres.length === 0) { toast.error("Não há outros times livres para rerolar!"); return; }

    const sorteado = botsLivres[Math.floor(Math.random() * botsLivres.length)];
    
    try {
      setClubeReroladoId(sorteado.id);
      const novoLimiteRerolls = rerollsRestantes - 1;
      setRerollsRestantes(novoLimiteRerolls);
      await updateDoc(doc(db, "usuarios", currentUserUid!), { draftRerollsLeft: novoLimiteRerolls });
      toast.success(`Mesa trocada para o elenco do ${sorteado.nome}!`);
    } catch (e) { toast.error("Erro ao processar reroll."); }
  };

  const confirmarRodadaManual = async () => {
    if (escolhasDaRodada.length !== ESCOLHAS_POR_RODADA || !currentUserUid) return;
    setProcessandoBotao(true);
    try {
      const novoElenco = [...meuElenco, ...escolhasDaRodada];
      await updateDoc(doc(db, "usuarios", currentUserUid), { elenco: novoElenco });
      await updateDoc(doc(db, "game", "state"), { playersReady: arrayUnion(currentUserUid) });
      toast.success("Escolhas enviadas! Aguardando os outros técnicos.");
    } catch (e) { toast.error("Erro ao salvar escolhas."); } finally { setProcessandoBotao(false); }
  };

  const fazerEscolhaAutomaticaETravar = async () => {
    if (!currentUserUid) return;
    let autoPicks = [...escolhasDaRodada];

    for (const jogador of pacoteAtual) {
      if (autoPicks.length >= ESCOLHAS_POR_RODADA) break;
      const jaSelecionado = autoPicks.some(j => j.id === jogador.id);
      
      // Valida se a vaga tática está disponível
      const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
      meuElenco.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
      autoPicks.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
      const temVaga = contagem[jogador.posicao as keyof typeof contagem] < LIMITES[jogador.posicao as keyof typeof LIMITES];

      if (!jaSelecionado && temVaga) {
        autoPicks.push(jogador);
      }
    }

    const novoElenco = [...meuElenco, ...autoPicks];
    await updateDoc(doc(db, "usuarios", currentUserUid), { elenco: novoElenco });
    await updateDoc(doc(db, "game", "state"), { playersReady: arrayUnion(currentUserUid) });
  };

  const avancarRodadaGeral = async () => {
    if (!gameState) return;
    const proximaRodada = (gameState.currentRound || 1) + 1;

    if (proximaRodada > 7) {
      // 🏁 FIM DO DRAFT SIMULTÂNEO: Altera a fase para o campeonato começar de verdade
      await updateDoc(doc(db, "game", "state"), {
        phase: 'FIRST_HALF',
        draftTurnUid: null,
        draftOrder: [],
        playersReady: []
      });
      toast.success("Draft Concluído com Sucesso! Vestiários liberados.");
    } else {
      // ⏭️ PRÓXIMA PARADA DA ESTAÇÃO: Passa o canudo e renova o tempo de 2 minutos
      await updateDoc(doc(db, "game", "state"), {
        currentRound: proximaRodada,
        playersReady: [],
        draftDeadline: Date.now() + TEMPO_LIMITE_MS
      });
    }
  };

  if (carregando) return <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-fifa"><div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-yellow-400 font-black tracking-widest uppercase animate-pulse">Iniciando Draft...</p></div>;

  const jaPronto = gameState?.playersReady?.includes(currentUserUid || '');
  const minutos = Math.floor(tempoRestante / 60).toString().padStart(2, '0');
  const segundos = (tempoRestante % 60).toString().padStart(2, '0');

  const ordemPosicoes: Record<string, number> = { GOL: 1, DEF: 2, MEI: 3, ATA: 4 };
  const elencoOrganizado = [...meuElenco, ...escolhasDaRodada].sort((a, b) => (ordemPosicoes[a.posicao] || 5) - (ordemPosicoes[b.posicao] || 5));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col font-fifa">
      {/* STATUS GLOBAL DA SALA */}
      <div className="bg-black p-3 flex justify-between items-center px-6 border-b border-neutral-800 text-xs sm:text-sm font-bold uppercase tracking-wider">
        <span className="text-fifa-gray-light">Técnicos Prontos nesta rodada: <span className="text-fifa-green font-black">{gameState?.playersReady?.length || 0} / {gameState?.draftOrder?.length || 0}</span></span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-fifa-green rounded-full animate-pulse"></span>
          <span className="text-fifa-green font-black">Draft Simultâneo</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 w-full p-4 md:p-8 flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* PAINEL DE CONTROLE DE TEMPO */}
          <div className="border-b border-neutral-800 pb-4 mb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
            <div>
              <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Rodada <span className="text-yellow-400">{Math.min(gameState?.currentRound || 1, 7)}</span> / 7</h1>
              <p className="text-cyan-400 font-bold uppercase text-xs tracking-widest mt-1">
                {jaPronto ? '✅ Suas escolhas foram salvas! Aguardando encerramento.' : `Sua mesa atual pertence ao: ${nomeClubePacote}`}
              </p>
            </div>
            <div className="flex items-center gap-6 bg-neutral-900 p-3 rounded-xl border border-neutral-800 shadow-xl">
              <div className="text-center px-4 border-r border-neutral-700">
                <span className="block text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Cronômetro</span>
                <span className={`text-2xl font-black font-mono ${tempoRestante < 20 ? 'text-fifa-red animate-pulse' : 'text-white'}`}>{minutos}:{segundos}</span>
              </div>
              <div className="text-center px-2">
                <span className="block text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Selecionados</span>
                <span className="text-2xl font-black text-yellow-400">{escolhasDaRodada.length} / {ESCOLHAS_POR_RODADA}</span>
              </div>
            </div>
          </div>

          {/* LISTAGEM DE CARTAS PARA SELEÇÃO */}
          <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
            {pacoteAtual.map((jogador) => {
              const isSelecionado = escolhasDaRodada.some(j => j.id === null ? false : j.id === jogador.id);
              const boryDisabled = jaPronto || (!isSelecionado && (escolhasDaRodada.length >= ESCOLHAS_POR_RODADA || !podeEscolherMais(jogador.posicao)));

              return (
                <button
                  key={jogador.id}
                  disabled={boryDisabled}
                  onClick={() => toggleJogador(jogador)}
                  className={`p-3 md:p-4 rounded-xl border-2 flex flex-row items-center justify-between transition-all relative overflow-hidden shrink-0 text-left
                    ${isSelecionado ? 'bg-fifa-green/20 border-fifa-green shadow-[0_0_15px_rgba(60,172,59,0.25)]' : boryDisabled ? 'bg-neutral-950 border-neutral-900 opacity-40 cursor-not-allowed' : 'bg-neutral-900 border-neutral-700 hover:border-fifa-blue cursor-pointer'}`}
                >
                  <div className="flex items-center gap-4 pl-2">
                    <span className="w-12 text-center text-[10px] sm:text-xs px-2 py-2 rounded bg-fifa-blue text-white font-black tracking-widest">{jogador.posicao}</span>
                    <div>
                      <p className={`font-black text-base sm:text-lg ${isSelecionado ? 'text-fifa-green' : 'text-white'}`}>{jogador.nome}</p>
                      <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">Overall base: {jogador.overall}</p>
                    </div>
                  </div>
                  {isSelecionado && <span className="text-[10px] bg-yellow-500 text-neutral-950 px-2 py-1 rounded font-black uppercase tracking-widest">Selecionado</span>}
                </button>
              );
            })}
          </div>

          {/* BOTÕES DE INTERAÇÃO DO TURN */}
          {!jaPronto && (
            <div className="mt-4 flex flex-col sm:flex-row gap-4 shrink-0">
              <button 
                onClick={rerolarMesaExclusiva}
                disabled={rerollsRestantes === 0 || escolhasDaRodada.length > 0 || processandoBotao}
                className="w-full sm:w-1/3 py-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-black text-sm uppercase tracking-widest rounded-xl transition-all disabled:opacity-40"
              >
                🎲 Rerolar Time ({rerollsRestantes} rest.)
              </button>
              <button 
                onClick={confirmarRodadaManual}
                disabled={escolhasDaRodada.length !== ESCOLHAS_POR_RODADA || processandoBotao}
                className="w-full sm:w-2/3 py-4 bg-fifa-green text-white font-black text-lg uppercase tracking-widest rounded-xl transition-all shadow-lg disabled:opacity-40"
              >
                {escolhasDaRodada.length === ESCOLHAS_POR_RODADA ? "Confirmar Minhas Escolhas" : `Selecione mais ${ESCOLHAS_POR_RODADA - escolhasDaRodada.length}`}
              </button>
            </div>
          )}
        </div>

        {/* BARRA LATERAL COM INSPEÇÃO DO ELENCO COMPLETO */}
        <div className="w-full lg:w-80 bg-neutral-900 p-6 rounded-xl border border-neutral-800 h-150 shadow-2xl shrink-0 flex flex-col">
          <h3 className="font-black text-xl text-white border-b border-neutral-800 pb-4 mb-4 uppercase tracking-tighter shrink-0">
            Meu Plantel <span className="text-yellow-400 block text-sm tracking-widest">{nomeTime} ({elencoOrganizado.length}/21)</span>
          </h3>
          <ul className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-2">
            {elencoOrganizado.map((j, i) => {
              const deAgora = escolhasDaRodada.some(e => e.id === j.id);
              return (
                <li key={i} className={`flex justify-between items-center p-3 rounded-lg border ${deAgora ? 'bg-yellow-900/10 border-yellow-500/50 animate-pulse' : 'bg-neutral-950 border-neutral-800'}`}>
                  <span className="font-bold text-neutral-200 text-sm truncate w-32">{j.nome}</span>
                  <div className="flex gap-2 items-center">
                    {deAgora && <span className="text-[8px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Novo</span>}
                    <span className="text-[10px] font-black text-cyan-400 bg-neutral-900 px-2 py-1 rounded border border-neutral-800">{j.posicao}</span>
                  </div>
                </li>
              );
            })}
            {elencoOrganizado.length === 0 && <p className="text-center text-neutral-600 italic py-10 uppercase text-xs font-black">Nenhum jogador draftado.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
