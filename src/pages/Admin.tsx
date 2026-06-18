import { useState, useEffect } from 'react';
import { type Clube, type GamePhase, type GameState, type Posicao, type Jogador } from '../types'; 
import { doc, setDoc, deleteDoc, onSnapshot, getDocs, collection, getDoc, updateDoc, arrayUnion, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase'; 
import { simularPartidaV2, escalarBot, getMentalidade } from '../services/matchEngine';
import toast from 'react-hot-toast';

type Formacao = "4-3-3" | "3-4-3" | "4-4-2" | "3-5-2" | "4-5-1" | "5-4-1";
const REGRAS_FORMACAO: Record<Formacao, { DEF: number; MEI: number; ATA: number }> = {
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 },
  "3-4-3": { DEF: 3, MEI: 4, ATA: 3 },
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 },
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 },
  "4-5-1": { DEF: 4, MEI: 5, ATA: 1 },
  "5-4-1": { DEF: 5, MEI: 4, ATA: 1 }
};

const confirmarAcao = (mensagem: string): Promise<boolean> => {
  return new Promise((resolve) => {
    toast.custom(
      (t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-neutral-900 shadow-2xl rounded-xl pointer-events-auto flex flex-col ring-1 ring-neutral-800`}>
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-white uppercase tracking-widest">{mensagem}</p>
          </div>
          <div className="flex border-t border-neutral-800">
            <button onClick={() => { toast.dismiss(t.id); resolve(false); }} className="w-full border-r border-neutral-800 rounded-bl-xl px-4 py-4 text-xs font-black uppercase tracking-widest text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors">Cancelar</button>
            <button onClick={() => { toast.dismiss(t.id); resolve(true); }} className="w-full rounded-br-xl px-4 py-4 text-xs font-black uppercase tracking-widest text-fifa-green hover:bg-fifa-green/10 transition-colors">Confirmar</button>
          </div>
        </div>
      ),
      { duration: Infinity, position: 'top-center' } 
    );
  });
};

export default function Admin() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [clubesSalvos, setClubesSalvos] = useState<Clube[]>([]);
  const [termoBusca, setTermoBusca] = useState('');
  const [jsonImportado, setJsonImportado] = useState('');
  const [erroJson, setErroJson] = useState('');
  
  const [clubeEmEdicao, setClubeEmEdicao] = useState<Clube | null>(null);
  const [salvando, setSalvando] = useState(false);
  
  // ESTADOS DO BANCO E TAGS
  const [buscaBanco, setBuscaBanco] = useState('');
  const [tagFiltro, setTagFiltro] = useState<string>('');
  const [novaTagInput, setNovaTagInput] = useState('');

  // CONFIGURAÇÕES DO NOVO CAMPEONATO
  const [nomeCampeonato, setNomeCampeonato] = useState<string>('');
  const [formatoTorneio, setFormatoTorneio] = useState<'LIGA' | 'COPA' | 'GRUPOS'>('LIGA');
  const [tipoTurno, setTipoTurno] = useState<'IDA_VOLTA' | 'IDA'>('IDA_VOLTA');
  const [distribuicaoGrupos, setDistribuicaoGrupos] = useState<Record<string, string>>({});
  
  // ESTADOS: Quantidade manual de vagas configuradas pelo Admin
  const [zona1Nome, setZona1Nome] = useState<string>('Libertadores');
  const [zona1Vagas, setZona1Vagas] = useState<number>(4);
  const [zona2Nome, setZona2Nome] = useState<string>('Pré-Libertadores');
  const [zona2Vagas, setZona2Vagas] = useState<number>(2);
  const [zona3Nome, setZona3Nome] = useState<string>('Sul-Americana');
  const [zona3Vagas, setZona3Vagas] = useState<number>(6);
  const [zona4Nome, setZona4Nome] = useState<string>('Rebaixamento');
  const [zona4Vagas, setZona4Vagas] = useState<number>(4);
  
  // LISTAS DE SELEÇÃO MANUAL
  const [timesDisponiveis, setTimesDisponiveis] = useState<{ id: string; nome: string; isUser: boolean }[]>([]);
  const [timesSelecionados, setTimesSelecionados] = useState<{ id: string; nome: string; isUser: boolean }[]>([]);
  const [filtroDisponiveis, setFiltroDisponiveis] = useState<'TODOS' | 'HUMANOS' | 'BOTS'>('HUMANOS');
  
  const [jogadorDesistenteUid, setJogadorDesistenteUid] = useState<string>('');
  
  // NAVEGAÇÃO DE ABAS
  const [abaAtiva, setAbaAtiva] = useState<'TORNEIO' | 'CLUBES'>('TORNEIO');

  // EFEITO: Carrega todos os times do banco para o configurador assim que a tela abre
  useEffect(() => {
    const carregarTimesParaSelecao = async () => {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const humanosInscritos: { id: string; nome: string; isUser: boolean }[] = [];
      const humanosEsperando: { id: string; nome: string; isUser: boolean }[] = [];
      
      usersSnap.forEach(d => {
        const data = d.data();
        if (data.nomeTime && data.inscrito) {
          humanosInscritos.push({ id: d.id, nome: String(data.nomeTime), isUser: true });
        }
      });

      const botsSnap = await getDocs(collection(db, "clubes"));
      const bots: { id: string; nome: string; isUser: boolean }[] = [];
      botsSnap.forEach(d => {
        const data = d.data();
        if (data.elenco && data.elenco.length >= 11) {
          bots.push({ id: d.id, nome: `${data.nome || ''} ${data.ano || ''}`.trim(), isUser: false });
        }
      });

      setTimesSelecionados(humanosInscritos);
      setTimesDisponiveis([...humanosEsperando, ...bots]);
    };
    carregarTimesParaSelecao();
  }, []);

  const adicionarTimeAoTorneio = (time: any) => {
    setTimesDisponiveis(prev => prev.filter(t => t.id !== time.id));
    setTimesSelecionados(prev => [...prev, time]);
  };

  const removerTimeDoTorneio = (time: any) => {
    setTimesSelecionados(prev => prev.filter(t => t.id !== time.id));
    setTimesDisponiveis(prev => [...prev, time]);
  };

  useEffect(() => {
    const unsubGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) setGameState(docSnap.data() as GameState);
    });
    const unsubClubes = onSnapshot(collection(db, "clubes"), (snapshot) => {
      const lista: Clube[] = [];
      snapshot.forEach(doc => lista.push({id: doc.id, ...doc.data()} as Clube));
      setClubesSalvos(lista);
    });
    return () => { unsubGame(); unsubClubes(); };
  }, []);

  const mudarFase = async (novaFase: GamePhase) => {
    const confirmado = await confirmarAcao(`Mudar o jogo para a fase: ${novaFase}?`);
    if (confirmado) {
      await setDoc(doc(db, "game", "state"), { phase: novaFase }, { merge: true });
      toast.success(`Fase alterada para ${novaFase}`);
    }
  };

  const encerrarCampeonatoForcado = async () => {
    const confirmado = await confirmarAcao("Deseja realmente encerrar este campeonato IMEDIATAMENTE?");
    if (confirmado) {
      await updateDoc(doc(db, "game", "state"), { phase: 'FINISHED' });
      toast.success("O campeonato foi encerrado à força!");
    }
  };

  const iniciarTemporada = async () => {
    try {
      if (timesSelecionados.length < 4) {
        toast.error("Selecione pelo menos 4 times para formar um campeonato!");
        return;
      }
      if (timesSelecionados.length % 2 !== 0) {
        toast.error("O número de times deve ser par para não haver sobras nas rodadas!");
        return;
      }

      if (formatoTorneio === 'GRUPOS') {
        const naoAlocados = timesSelecionados.filter(t => !distribuicaoGrupos[t.id]);
        if (naoAlocados.length > 0) {
           toast.error(`Você esqueceu de alocar ${naoAlocados.length} times nos grupos!`);
           return;
        }
      }

      const times = [...timesSelecionados].sort(() => Math.random() - 0.5);
      const TOTAL_TIMES = times.length;
      const nomeCamp = nomeCampeonato || `Temporada ${new Date().getFullYear()}`;

      const humanosParticipantes = times.filter(t => t.isUser).map(t => t.id);
      const temHumanos = humanosParticipantes.length > 0;

      const masterCalendar: any[] = []; 
      const standings = times.map(t => ({ 
        id: t.id, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, 
        grupo: distribuicaoGrupos[t.id] || null 
      }));

      // =====================================
      // LÓGICA 1: COPA (MATA-MATA PURO)
      // =====================================
      if (formatoTorneio === 'COPA') {
        const chavesPerfeitas = [4, 8, 16, 32, 64];
        if (!chavesPerfeitas.includes(TOTAL_TIMES)) {
          toast.error("Para Copas, selecione uma quantidade de times que feche uma chave perfeita (4, 8, 16, 32 ou 64)!");
          return;
        }

        const faseNome = TOTAL_TIMES === 4 ? "Semifinal" : TOTAL_TIMES === 8 ? "Quartas de Final" : TOTAL_TIMES === 16 ? "Oitavas de Final" : TOTAL_TIMES === 32 ? "16 avos de Final" : "32 avos de Final";
        const jogosCopa = [];
        
        for (let i = 0; i < TOTAL_TIMES; i += 2) {
          jogosCopa.push({ homeId: times[i].id, awayId: times[i+1].id, homeScore: null, awayScore: null, relatorio: [] });
        }

        if (tipoTurno === 'IDA') {
          masterCalendar.push({ tipo: 'COPA', titulo: `${nomeCamp} - ${faseNome}`, jogos: jogosCopa, decidirCopa: true });
        } else {
          masterCalendar.push({ tipo: 'COPA', titulo: `${nomeCamp} - ${faseNome} (Ida)`, jogos: jogosCopa, decidirCopa: false });
          const jogosVolta = jogosCopa.map(j => ({ homeId: j.awayId, awayId: j.homeId, homeScore: null, awayScore: null, relatorio: [] }));
          masterCalendar.push({ tipo: 'COPA', titulo: `${nomeCamp} - ${faseNome} (Volta)`, jogos: jogosVolta, decidirCopa: true });
        }
      } 
      
      // =====================================
      // LÓGICA 2: GRUPOS (ESTILO LIBERTADORES)
      // =====================================
      else if (formatoTorneio === 'GRUPOS') {
        const gruposUnicos = Array.from(new Set(Object.values(distribuicaoGrupos)));
        const gruposMap: Record<string, string[]> = {};
        
        gruposUnicos.forEach(g => {
           gruposMap[g] = times.filter(t => distribuicaoGrupos[t.id] === g).map(t => t.id);
        });

        for (const g of gruposUnicos) {
           if (gruposMap[g].length % 2 !== 0 || gruposMap[g].length === 0) {
              toast.error(`O Grupo ${g} tem uma quantidade ímpar de times (${gruposMap[g].length}). Tem que ser par!`);
              return;
           }
        }

        const maxTimesNumGrupo = Math.max(...Object.values(gruposMap).map(arr => arr.length));
        const numRodadasIda = maxTimesNumGrupo - 1;

        const scheduleIda: any[] = [];
        for (let rodada = 0; rodada < numRodadasIda; rodada++) {
          const jogosDaRodada = [];
          
          for (const g of gruposUnicos) {
             const idsDoGrupo = gruposMap[g];
             const n = idsDoGrupo.length;
             const metade = n / 2;
             
             let idsRotacao = [idsDoGrupo[0]];
             for (let r = 1; r < n; r++) {
                let idx = (r + rodada - 1) % (n - 1) + 1;
                idsRotacao.push(idsDoGrupo[idx]);
             }

             for (let i = 0; i < metade; i++) {
                const casa = idsRotacao[i];
                const fora = idsRotacao[n - 1 - i];
                if (i === 0 && rodada % 2 === 1) {
                   jogosDaRodada.push({ homeId: fora, awayId: casa, homeScore: null, awayScore: null, relatorio: [], grupoBadge: g });
                } else {
                   jogosDaRodada.push({ homeId: casa, awayId: fora, homeScore: null, awayScore: null, relatorio: [], grupoBadge: g });
                }
             }
          }
          
          masterCalendar.push({ tipo: 'LIGA_GRUPOS', titulo: `${nomeCamp} - Rodada ${rodada + 1}`, jogos: jogosDaRodada });
          scheduleIda.push(jogosDaRodada);
        }

        if (tipoTurno === 'IDA_VOLTA') {
          if (temHumanos) {
            masterCalendar.push({ tipo: 'TRANSFERENCIAS', titulo: `Janela de Transferências`, jogos: [] });
          }
          scheduleIda.forEach((jogosIda, index) => {
             const jogosVolta = jogosIda.map((jogo: any) => ({ homeId: jogo.awayId, awayId: jogo.homeId, homeScore: null, awayScore: null, relatorio: [], grupoBadge: jogo.grupoBadge }));
             masterCalendar.push({ tipo: 'LIGA_GRUPOS', titulo: `${nomeCamp} - Rodada ${numRodadasIda + index + 1} (Returno)`, jogos: jogosVolta });
          });
        }
        
        masterCalendar.push({ tipo: 'SORTEIO_MATA_MATA', titulo: `Sorteio das Eliminatórias`, jogos: [] });
      }

      // =====================================
      // LÓGICA 3: LIGA (PONTOS CORRIDOS)
      // =====================================
      else {
        const numRodadasIda = TOTAL_TIMES - 1;
        const metade = TOTAL_TIMES / 2;
        let idsRotacao = times.map(t => t.id);

        const scheduleIda: any[] = [];
        for (let rodada = 0; rodada < numRodadasIda; rodada++) {
          const jogosDaRodada = [];
          for (let i = 0; i < metade; i++) {
            const casa = idsRotacao[i];
            const fora = idsRotacao[TOTAL_TIMES - 1 - i];
            if (i === 0 && rodada % 2 === 1) {
              jogosDaRodada.push({ homeId: fora, awayId: casa, homeScore: null, awayScore: null, relatorio: [] });
            } else {
              jogosDaRodada.push({ homeId: casa, awayId: fora, homeScore: null, awayScore: null, relatorio: [] });
            }
          }
          
          masterCalendar.push({ tipo: 'LIGA', titulo: `${nomeCamp} - Rodada ${rodada + 1}`, jogos: jogosDaRodada });
          scheduleIda.push(jogosDaRodada);
          
          const ultimoId = idsRotacao.pop();
          if (ultimoId) idsRotacao.splice(1, 0, ultimoId);
        }

        if (tipoTurno === 'IDA_VOLTA') {
          if (temHumanos) {
            masterCalendar.push({ tipo: 'TRANSFERENCIAS', titulo: `Janela de Transferências`, jogos: [] });
          }
          scheduleIda.forEach((jogosIda, index) => {
             const jogosVolta = jogosIda.map((jogo: any) => ({ homeId: jogo.awayId, awayId: jogo.homeId, homeScore: null, awayScore: null, relatorio: [] }));
             masterCalendar.push({ tipo: 'LIGA', titulo: `${nomeCamp} - Rodada ${numRodadasIda + index + 1} (Returno)`, jogos: jogosVolta });
          });
        }
      }

      // INTEGRAÇÃO DINÂMICA
      const ordemSorteada = humanosParticipantes.sort(() => Math.random() - 0.5);

      const faseInicial = temHumanos ? 'PRE_SEASON' : 'FIRST_HALF';

      await setDoc(doc(db, "game", "state"), {
        teams: times, 
        standings: standings, 
        schedule: masterCalendar,
        currentRound: 1, 
        phase: faseInicial,
        draftOrder: ordemSorteada,
        draftTurnUid: temHumanos ? "SIMULTANEO" : null, 
        draftDeadline: temHumanos ? Date.now() + (2 * 60 * 1000) : null, 
        playersReady: [],
        totalTeams: TOTAL_TIMES,
        nomeCampeonato: nomeCamp,
        regrasClassificacao: {
          zona1: { nome: zona1Nome, vagas: zona1Vagas },
          zona2: { nome: zona2Nome, vagas: zona2Vagas },
          zona3: { nome: zona3Nome, vagas: zona3Vagas },
          zona4: { nome: zona4Nome, vagas: zona4Vagas }
        }
      });

      // GARANTE QUE TODO MUNDO COMEÇA O DRAFT COM OS REROLLS NO MÁXIMO E ZERADOS
      if (temHumanos) {
          const batchDraft = writeBatch(db);
          humanosParticipantes.forEach(uid => {
             batchDraft.update(doc(db, "usuarios", uid), { draftRerollsLeft: 2 });
          });
          await batchDraft.commit();
      }

      if (temHumanos) {
        toast.success(`Temporada Iniciada! Calendário gerado e Draft aberto para ${ordemSorteada.length} técnicos!`);
      } else {
        toast.success(`Temporada 100% CPU Iniciada! Calendário gerado, Draft e Janela ignorados.`);
      }
    } catch (error) { 
      toast.error("Erro ao gerar a tabela e iniciar campeonato."); 
    }
  };

  const simularRodadaAtual = async () => {
    if (!gameState || !gameState.schedule || !gameState.standings) return;
    setSalvando(true);

    try {
      const rodadaIndex = gameState.currentRound - 1;
      const eventoAtual = gameState.schedule[rodadaIndex];
      
      if (!eventoAtual) throw new Error("O Calendário Mestre já foi concluído!");
      
      const rodadaVerdadeira = gameState.currentRound;
      
      const batch = writeBatch(db);

      // ==========================================
      // EVENTO 1: JANELA DE TRANSFERÊNCIAS
      // ==========================================
      if (eventoAtual.tipo === 'TRANSFERENCIAS') {
        const usuariosNoJogo = (gameState.teams || []).filter(t => t.isUser).map(t => t.id);
        const tabela = [...gameState.standings];
        
        if (usuariosNoJogo.length === 0) {
           batch.update(doc(db, "game", "state"), { 
             phase: 'SECOND_HALF', 
             currentRound: rodadaVerdadeira + 1
           });
           await batch.commit();
           toast.success("Janela ignorada. Iniciando o Returno Automático (CPUxCPU).");
           setSalvando(false);
           return;
        }

        tabela.forEach((time, index) => {
          if (usuariosNoJogo.includes(time.id)) {
            let totalTrocas = index <= 3 ? 6 : index <= 7 ? 4 : 2;
            batch.update(doc(db, "usuarios", time.id), { trocasPermitidas: totalTrocas, trocasRealizadas: 0, jogadoresDispensados: [] });
          }
        });
        
        const resetPromessas = (gameState.teams || []).map(async (t) => {
           const timeRef = doc(db, t.isUser ? "usuarios" : "clubes", t.id);
           const timeSnap = await getDoc(timeRef);
           if(timeSnap.exists()){
              const elenco = timeSnap.data().elenco || [];
              const novoElenco = elenco.map((j:any) => ({...j, statusFisico: {cansaco: 1, lesionado: false, suspenso: false, amarelos: 0}}));
              batch.update(timeRef, { elenco: novoElenco });
           }
        });
        await Promise.all(resetPromessas);

        const ordemDeEscolha = [...tabela].reverse().filter(time => usuariosNoJogo.includes(time.id)).map(time => time.id);
        
        batch.update(doc(db, "game", "state"), { 
          phase: 'TRANSFER_WINDOW', 
          draftOrder: ordemDeEscolha, 
          draftTurnUid: "SIMULTANEO", 
          playersReady: [],
          draftDeadline: Date.now() + (3 * 60 * 1000),
          currentRound: rodadaVerdadeira + 1
        });
        
        await batch.commit();
        toast.success(`Aberto: ${eventoAtual.titulo}!`);
        setSalvando(false);
        return;
      }

      // ==========================================
      // EVENTO 2: PARTIDAS (LIGA / COPA / GRUPOS)
      // ==========================================
      const jogos = eventoAtual.jogos;
      let novosStandings = [...gameState.standings];

      const validarTitularesHumanos = (titularesIds: string[], elenco: Jogador[], nomeTime: string) => {
        const idsParaValidar = titularesIds.length > 0 ? titularesIds : elenco.slice(0, 11).map(j => j.id);
        const time = idsParaValidar.map(id => elenco.find(j => j.id === id)).filter(Boolean) as Jogador[];
        if (time.length < 11) throw new Error(`O time ${nomeTime} não possui 11 jogadores escalados!`);
        const irregulares = time.filter(j => j.statusFisico?.suspenso || j.statusFisico?.lesionado);
        if (irregulares.length > 0) {
          const nomes = irregulares.map(j => j.nome).join(", ");
          throw new Error(`O time ${nomeTime} escalou jogadores irregulares: ${nomes}.`);
        }
        const temGoleiro = time.some(j => j.posicao.toUpperCase().includes('GOL') || j.posicao.toUpperCase() === 'GL');
        if (!temGoleiro) throw new Error(`O time ${nomeTime} tentou entrar em campo sem um goleiro titular!`);
        return time;
      };

      if ((eventoAtual.tipo as string) !== 'SORTEIO_MATA_MATA') {
        for (let jogo of jogos) {
          const isHomeUser = (gameState.teams || []).find(t => t.id === jogo.homeId)?.isUser || false;
          const isAwayUser = (gameState.teams || []).find(t => t.id === jogo.awayId)?.isUser || false;

          const nomeHome = (gameState.teams || []).find(t => t.id === jogo.homeId)?.nome || "Mandante";
          const nomeAway = (gameState.teams || []).find(t => t.id === jogo.awayId)?.nome || "Visitante";
          
          const homeDoc = await getDoc(doc(db, isHomeUser ? "usuarios" : "clubes", jogo.homeId));
          const awayDoc = await getDoc(doc(db, isAwayUser ? "usuarios" : "clubes", jogo.awayId));
          
          const homeData = homeDoc.data();
          const awayData = awayDoc.data();

          const homeElenco = homeData?.elenco as Jogador[] || [];
          const awayElenco = awayData?.elenco as Jogador[] || [];

          const homeTitularesIds = homeData?.titularesIds || [];
          const awayTitularesIds = awayData?.titularesIds || [];

          const homeTitulares = isHomeUser ? validarTitularesHumanos(homeTitularesIds, homeElenco, nomeHome) : escalarBot(homeElenco);
          const awayTitulares = isAwayUser ? validarTitularesHumanos(awayTitularesIds, awayElenco, nomeAway) : escalarBot(awayElenco);

          const resultado = simularPartidaV2(homeTitulares, awayTitulares, {
            isUserA: isHomeUser,
            isUserB: isAwayUser,
            rodada: gameState.currentRound,
            mentalidadeA: getMentalidade(homeData?.formacao),
            mentalidadeB: getMentalidade(awayData?.formacao)
          });
          
          jogo.homeScore = resultado.golsCasa;
          jogo.awayScore = resultado.golsFora;
          jogo.relatorio = resultado.relatorio;
          jogo.pressao = resultado.pressao;

          const processarElenco = (elencoCompleto: Jogador[], titularesIdsValidos: string[], isCasa: boolean) => {
            return elencoCompleto.map((jogador: Jogador) => {
              if (!jogador) return jogador;

              let status = {
                cansaco: jogador.statusFisico?.cansaco ?? 1,
                lesionado: jogador.statusFisico?.lesionado ?? false,
                suspenso: jogador.statusFisico?.suspenso ?? false, 
                amarelos: (jogador.statusFisico as any)?.amarelos ?? 0
              };

              if (jogador.statusFisico?.suspenso === true) status.suspenso = false;

              const isEscalado = titularesIdsValidos.length > 0 
                ? titularesIdsValidos.includes(jogador.id) 
                : elencoCompleto.indexOf(jogador) < 11;
                
              const jogouDeVerdade = isEscalado && !(jogador.statusFisico?.suspenso === true) && !(jogador.statusFisico?.lesionado === true);
              const eventosDesteJogador = resultado.relatorio.filter((e: any) => e.jogadorId === jogador.id && e.time === (isCasa ? 'CASA' : 'FORA'));

              if (jogouDeVerdade) {
                if (!status.lesionado) status.cansaco = Math.min(5, status.cansaco + 1); 
                if (eventosDesteJogador.some((e: any) => e.tipo === 'LESAO')) status.lesionado = true;
                
                const amarelosNaPartida = eventosDesteJogador.filter((e: any) => e.tipo === 'CARTAO_AMARELO').length;
                if (eventosDesteJogador.some((e: any) => e.tipo === 'CARTAO_VERMELHO')) { 
                  status.suspenso = true; status.amarelos = 0; 
                } else if (amarelosNaPartida > 0) {
                  status.amarelos += amarelosNaPartida;
                  if (status.amarelos >= 2) { status.suspenso = true; status.amarelos = 0; }
                } else {
                  status.amarelos = 0;
                }
              } else {
                if (jogador.statusFisico?.lesionado === true) {
                  status.cansaco = Math.max(1, status.cansaco - 1);
                  if (status.cansaco === 1) status.lesionado = false;
                } else {
                  if (status.cansaco > 1) status.cansaco = Math.max(1, status.cansaco - 2);
                }
                status.amarelos = 0;
              }
              return { ...jogador, statusFisico: status };
            });
          };

          const finalHomeRoster = processarElenco(homeElenco, homeTitularesIds, true);
          const finalAwayRoster = processarElenco(awayElenco, awayTitularesIds, false);

          let rivalidadesHome = homeData?.rivalidades || {};
          let rivalidadesAway = awayData?.rivalidades || {};

          if (isHomeUser) {
              let advRef = rivalidadesHome[jogo.awayId] || { jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsSofridos: 0, nomeAdversario: nomeAway };
              advRef.jogos += 1;
              if (resultado.golsCasa > resultado.golsFora) advRef.vitorias += 1;
              else if (resultado.golsCasa === resultado.golsFora) advRef.empates += 1;
              else advRef.derrotas += 1;
              advRef.golsPro += resultado.golsCasa;
              advRef.golsSofridos += resultado.golsFora;
              advRef.nomeAdversario = nomeAway; 
              rivalidadesHome[jogo.awayId] = advRef;
          }

          if (isAwayUser) {
              let advRef = rivalidadesAway[jogo.homeId] || { jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsSofridos: 0, nomeAdversario: nomeHome };
              advRef.jogos += 1;
              if (resultado.golsFora > resultado.golsCasa) advRef.vitorias += 1;
              else if (resultado.golsFora === resultado.golsCasa) advRef.empates += 1;
              else advRef.derrotas += 1;
              advRef.golsPro += resultado.golsFora;
              advRef.golsSofridos += resultado.golsCasa;
              advRef.nomeAdversario = nomeHome;
              rivalidadesAway[jogo.homeId] = advRef;
          }

          batch.update(doc(db, isHomeUser ? "usuarios" : "clubes", jogo.homeId), { 
              elenco: finalHomeRoster,
              ...(isHomeUser && { rivalidades: rivalidadesHome }) 
          });
          batch.update(doc(db, isAwayUser ? "usuarios" : "clubes", jogo.awayId), { 
              elenco: finalAwayRoster,
              ...(isAwayUser && { rivalidades: rivalidadesAway }) 
          });

          if (eventoAtual.tipo === 'LIGA' || (eventoAtual.tipo as string) === 'LIGA_GRUPOS') {
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
        }
      }

      let updatedSchedule = [...gameState.schedule];
      updatedSchedule[rodadaIndex] = { ...eventoAtual, jogos: jogos };

      if (eventoAtual.tipo === 'LIGA' || (eventoAtual.tipo as string) === 'LIGA_GRUPOS') {
        novosStandings.sort((a, b) => {
           const gA = (a as any).grupo;
           const gB = (b as any).grupo;
           if (gA && gB && gA !== gB) return gA.localeCompare(gB);
           return b.pts !== a.pts ? b.pts - a.pts : (b.sg !== a.sg ? b.sg - a.sg : b.gp - a.gp);
        });
      }

      let proximaFase = gameState.phase;
      let mensagemAlert = `${eventoAtual.titulo} concluída!`;

      if ((eventoAtual.tipo as string) === 'SORTEIO_MATA_MATA') {
         const classificados = novosStandings.filter((time) => {
             const indexNoGrupo = novosStandings.filter(t => (t as any).grupo === (time as any).grupo).indexOf(time);
             return indexNoGrupo < 2;
         });

         const jogosMataMata = [];
         for (let i = 0; i < classificados.length; i += 2) {
             jogosMataMata.push({
                homeId: classificados[i].id, 
                awayId: classificados[i+1]?.id || classificados[i].id,
                homeScore: null, awayScore: null, relatorio: []
             });
         }

         const faseMataMata = classificados.length === 16 ? "Oitavas de Final" : classificados.length === 8 ? "Quartas de Final" : "Semifinal";
         const nomeCamp = (gameState as any).nomeCampeonato || "Torneio";

         if (tipoTurno === 'IDA') {
            updatedSchedule.splice(rodadaIndex + 1, 0, { tipo: 'COPA', titulo: `${nomeCamp} - ${faseMataMata}`, jogos: jogosMataMata, decidirCopa: true } as any);
         } else {
            updatedSchedule.splice(rodadaIndex + 1, 0, { tipo: 'COPA', titulo: `${nomeCamp} - ${faseMataMata} (Ida)`, jogos: jogosMataMata, decidirCopa: false } as any);
            const jogosVolta = jogosMataMata.map(j => ({ homeId: j.awayId, awayId: j.homeId, homeScore: null, awayScore: null, relatorio: [] }));
            updatedSchedule.splice(rodadaIndex + 2, 0, { tipo: 'COPA', titulo: `${nomeCamp} - ${faseMataMata} (Volta)`, jogos: jogosVolta, decidirCopa: true } as any);
         }
         
         mensagemAlert = "Fase de Grupos encerrada! Oitavas de Final sorteadas.";
      }

      if (eventoAtual.tipo === 'COPA' && (eventoAtual as any).decidirCopa) {
        const vencedores: string[] = [];
        
        if (tipoTurno === 'IDA') {
          jogos.forEach(jogo => {
            const nomeH = (gameState.teams || []).find(t => t.id === jogo.homeId)?.nome || "Mandante";
            const nomeA = (gameState.teams || []).find(t => t.id === jogo.awayId)?.nome || "Visitante";
            if ((jogo.homeScore ?? 0) > (jogo.awayScore ?? 0)) vencedores.push(jogo.homeId);
            else if ((jogo.awayScore ?? 0) > (jogo.homeScore ?? 0)) vencedores.push(jogo.awayId);
            else {
              const ganhaHome = Math.random() < 0.5;
              vencedores.push(ganhaHome ? jogo.homeId : jogo.awayId);
              
              // Gera o placar dos pênaltis
              const pV = Math.floor(Math.random() * 3) + 3; 
              const pD = pV - (Math.floor(Math.random() * 2) + 1);
              const scorePenaltis = ganhaHome ? `${pV}x${pD}` : `${pD}x${pV}`;

              jogo.relatorio.push({
                minuto: 120, tipo: 'PENALTIS', time: ganhaHome ? 'CASA' : 'FORA',
                texto: `DECISÃO NOS PÊNALTIS! Após o empate, o ${ganhaHome ? nomeH : nomeA} vence por ${scorePenaltis} nas cobranças e avança de fase!`
              });
            }
          });
        } else {
          const rodadaIdaData = gameState.schedule[rodadaIndex - 1];
          jogos.forEach(jogoVolta => {
            const jogoIda = rodadaIdaData.jogos.find(j => j.homeId === jogoVolta.awayId && j.awayId === jogoVolta.homeId);
            
            const golsCasaVolta = jogoVolta.homeScore ?? 0;
            const golsForaVolta = jogoVolta.awayScore ?? 0;
            const golsCasaIda = jogoIda?.homeScore ?? 0;
            const golsForaIda = jogoIda?.awayScore ?? 0;

            const golsHomeTotal = golsCasaVolta + golsForaIda;
            const golsAwayTotal = golsForaVolta + golsCasaIda;

            // Variáveis para a regra do Gol Fora
            const golsForaTimeHome = golsForaIda; // Gols do time Casa(Volta) feitos como visitante na Ida
            const golsForaTimeAway = golsForaVolta; // Gols do time Fora(Volta) feitos como visitante na Volta

            const nomeH = (gameState.teams || []).find(t => t.id === jogoVolta.homeId)?.nome || "Mandante";
            const nomeA = (gameState.teams || []).find(t => t.id === jogoVolta.awayId)?.nome || "Visitante";

            if (golsHomeTotal > golsAwayTotal) vencedores.push(jogoVolta.homeId);
            else if (golsAwayTotal > golsHomeTotal) vencedores.push(jogoVolta.awayId);
            else {
              // EMPATE NO AGREGADO -> REGRA DO GOL FORA DE CASA
              if (golsForaTimeHome > golsForaTimeAway) {
                  vencedores.push(jogoVolta.homeId);
                  jogoVolta.relatorio.push({
                      minuto: 90, tipo: 'INFO', time: 'CASA',
                      texto: `CLASSIFICAÇÃO PELO GOL FORA! Com o agregado em ${golsHomeTotal}x${golsAwayTotal}, o ${nomeH} avança por ter marcado mais gols como visitante!`
                  });
              } else if (golsForaTimeAway > golsForaTimeHome) {
                  vencedores.push(jogoVolta.awayId);
                  jogoVolta.relatorio.push({
                      minuto: 90, tipo: 'INFO', time: 'FORA',
                      texto: `CLASSIFICAÇÃO PELO GOL FORA! Com o agregado em ${golsHomeTotal}x${golsAwayTotal}, o ${nomeA} avança por ter marcado mais gols como visitante!`
                  });
              } else {
                  // IGUALDADE TOTAL -> PÊNALTIS
                  const ganhaHome = Math.random() < 0.5;
                  vencedores.push(ganhaHome ? jogoVolta.homeId : jogoVolta.awayId);
                  
                  const pV = Math.floor(Math.random() * 3) + 3; 
                  const pD = pV - (Math.floor(Math.random() * 2) + 1);
                  const scorePenaltis = ganhaHome ? `${pV}x${pD}` : `${pD}x${pV}`;

                  jogoVolta.relatorio.push({
                    minuto: 120, tipo: 'PENALTIS', time: ganhaHome ? 'CASA' : 'FORA',
                    texto: `DECISÃO NOS PÊNALTIS! Com igualdade total, o ${ganhaHome ? nomeH : nomeA} vence por ${scorePenaltis} nos pênaltis!`
                  });
              }
            }
          });
        }

        if (vencedores.length === 1) {
          proximaFase = 'FINISHED';
          mensagemAlert = `GRANDE FINAL CONCLUÍDA! O campeão da Copa foi coroado!`;
        } else {
          const proximosJogosCopa = [];
          for (let i = 0; i < vencedores.length; i += 2) {
            proximosJogosCopa.push({
              homeId: vencedores[i], awayId: vencedores[i+1],
              homeScore: null, awayScore: null, relatorio: []
            });
          }
          
          const proximaFaseNome = vencedores.length === 2 ? "Grande Final" 
                                : vencedores.length === 4 ? "Semifinal" 
                                : vencedores.length === 8 ? "Quartas de Final" 
                                : vencedores.length === 16 ? "Oitavas de Final" 
                                : "16 avos de Final";
          const nomeCamp = (gameState as any).nomeCampeonato || "Copa";

          if (tipoTurno === 'IDA') {
            updatedSchedule.splice(rodadaIndex + 1, 0, { tipo: 'COPA', titulo: `${nomeCamp} - ${proximaFaseNome}`, jogos: proximosJogosCopa, decidirCopa: true } as any);
          } else {
            updatedSchedule.splice(rodadaIndex + 1, 0, { tipo: 'COPA', titulo: `${nomeCamp} - ${proximaFaseNome} (Ida)`, jogos: proximosJogosCopa, decidirCopa: false } as any);
            const proximosVolta = proximosJogosCopa.map(j => ({ homeId: j.awayId, awayId: j.homeId, homeScore: null, awayScore: null, relatorio: [] }));
            updatedSchedule.splice(rodadaIndex + 2, 0, { tipo: 'COPA', titulo: `${nomeCamp} - ${proximaFaseNome} (Volta)`, jogos: proximosVolta, decidirCopa: true } as any);
          }
        }
        
        if (proximaFase !== 'FINISHED') {
           proximaFase = 'FIRST_HALF'; 
        }
      }

      const isUltimoEvento = rodadaVerdadeira === updatedSchedule.length;

      if (isUltimoEvento && proximaFase !== 'FINISHED') {
        proximaFase = 'FINISHED';
        mensagemAlert = "CALENDÁRIO ENCERRADO! O histórico da temporada foi arquivado.";
        
        const dataAtual = new Date().toLocaleDateString('pt-BR');
        const nomeCamp = (gameState as any).nomeCampeonato || "Campeonato Brasileiro";

        novosStandings.forEach((timeDaTabela, index) => {
             const isHumano = (gameState.teams || []).find((t:any) => t.id === timeDaTabela.id)?.isUser;
             if (isHumano) {
                 const historicoData = {
                     temporada: dataAtual,
                     nomeCampeonato: nomeCamp,
                     posicao: index + 1,
                     pontos: timeDaTabela.pts,
                     vitorias: timeDaTabela.v,
                     saldo: timeDaTabela.sg,
                     campeao: index === 0
                 };
                 batch.update(doc(db, "usuarios", timeDaTabela.id), {
                     historicoCampanhas: arrayUnion(historicoData),
                     inscrito: false 
                 });
             }
        });
      } else if (updatedSchedule[rodadaIndex + 1]?.tipo === 'LIGA') {
         if (proximaFase === 'TRANSFER_WINDOW') proximaFase = 'SECOND_HALF'; 
      }

      batch.update(doc(db, "game", "state"), {
        schedule: updatedSchedule, standings: novosStandings, currentRound: rodadaVerdadeira + 1,
        phase: proximaFase, playersReady: [], playersInLive: []
      });

      await batch.commit();
      toast.success(mensagemAlert);
    } catch (error) {
      console.error("Erro na Simulação:", error);
      toast.error(`ERRO: ${(error as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const autoEscalarJogador = async (uid: string) => {
    if (!uid) {
        toast.error("Selecione um técnico ausente/desistente primeiro!");
        return;
    }
    setSalvando(true);
    try {
        const userRef = doc(db, "usuarios", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) throw new Error("Usuário não encontrado.");
        
        const userData = userSnap.data();
        let elenco = userData.elenco || [];

        if (elenco.length < 11) {
            const clubesSnap = await getDocs(collection(db, "clubes"));
            let todosJogadores: Jogador[] = [];
            clubesSnap.forEach(d => {
                todosJogadores = [...todosJogadores, ...d.data().elenco];
            });
            
            todosJogadores.sort(() => Math.random() - 0.5);
            
            const novos: Jogador[] = [];
            const pegarDaPosicao = (pos: string, qtd: number) => {
                const disponiveis = todosJogadores.filter(j => j.posicao === pos || j.posicao.includes(pos));
                novos.push(...disponiveis.slice(0, qtd));
            };
            
            pegarDaPosicao('GOL', 2); pegarDaPosicao('DEF', 6); pegarDaPosicao('MEI', 6); pegarDaPosicao('ATA', 4);
            elenco = novos.map(j => ({ ...j, statusFisico: { cansaco: 1, lesionado: false, suspenso: false, amarelos: 0 } }));
        }

        const formacoes = ["4-3-3", "3-4-3", "4-4-2", "3-5-2", "4-5-1", "5-4-1"] as Formacao[];
        const formacaoEscolhida = formacoes[Math.floor(Math.random() * formacoes.length)];
        const regras = REGRAS_FORMACAO[formacaoEscolhida];

        const aptos = elenco.filter((j: any) => !j.statusFisico?.lesionado && !j.statusFisico?.suspenso);
        const gols = aptos.filter((j: any) => j.posicao === 'GOL').sort((a: any, b: any) => b.overall - a.overall);
        const defs = aptos.filter((j: any) => j.posicao === 'DEF').sort((a: any, b: any) => b.overall - a.overall);
        const meis = aptos.filter((j: any) => j.posicao === 'MEI').sort((a: any, b: any) => b.overall - a.overall);
        const atas = aptos.filter((j: any) => j.posicao === 'ATA').sort((a: any, b: any) => b.overall - a.overall);

        const titulares = [
            ...(gols.slice(0, 1)),
            ...(defs.slice(0, regras.DEF)),
            ...(meis.slice(0, regras.MEI)),
            ...(atas.slice(0, regras.ATA))
        ];

        let i = 0;
        const sobras = aptos.filter((j: any) => !titulares.includes(j)).sort((a: any, b: any) => b.overall - a.overall);
        while(titulares.length < 11 && i < sobras.length) {
            titulares.push(sobras[i]);
            i++;
        }

        if (titulares.length < 11) throw new Error(`O time ${userData.nomeTime} tem muitos lesionados/suspensos e não consegue preencher 11 vagas.`);

        let lAta: Jogador[] = [], lMei: Jogador[] = [], lDef: Jogador[] = [], lGol: Jogador[] = [];
        titulares.forEach((t: Jogador) => {
            if (t.posicao === 'GOL' && lGol.length < 1) lGol.push(t);
            else if (t.posicao === 'DEF' && lDef.length < regras.DEF) lDef.push(t);
            else if (t.posicao === 'MEI' && lMei.length < regras.MEI) lMei.push(t);
            else if (t.posicao === 'ATA' && lAta.length < regras.ATA) lAta.push(t);
            else {
                if (lAta.length < regras.ATA) lAta.push(t);
                else if (lMei.length < regras.MEI) lMei.push(t);
                else if (lDef.length < regras.DEF) lDef.push(t);
            }
        });

        const titularesIds = [...lAta, ...lMei, ...lDef, ...lGol].map(t => t.id);

        await updateDoc(userRef, {
            elenco,
            titularesIds,
            formacao: formacaoEscolhida,
            elencoPronto: true
        });

        await updateDoc(doc(db, "game", "state"), {
            playersReady: arrayUnion(uid)
        });

        toast.success(`Esquadrão de ${userData.nomeTime} auto-escalado na tática ${formacaoEscolhida}!`);
        setJogadorDesistenteUid('');
    } catch (error) {
        toast.error(`Erro ao auto-escalar: ${(error as Error).message}`);
    } finally {
        setSalvando(false);
    }
  };

  const pularTurnoAtual = async () => {
    if (!jogadorDesistenteUid) {
      toast.error("Selecione um técnico na lista acima primeiro!");
      return;
    }
    if (!gameState || !gameState.draftOrder || gameState.draftOrder.length === 0) {
      toast.error("Não há nenhum turno em andamento no momento!");
      return;
    }

    const confirmado = await confirmarAcao("Remover este técnico da fila de turnos atual?");
    if (!confirmado) return;

    setSalvando(true);
    try {
      const novaOrdem = gameState.draftOrder.filter((uid: string) => uid !== jogadorDesistenteUid);

      if (novaOrdem.length > 0) {
        await updateDoc(doc(db, "game", "state"), { 
          draftTurnUid: novaOrdem[0], 
          draftOrder: novaOrdem 
        });
        toast.success("Técnico removido da fila com sucesso!");
      } else {
        await updateDoc(doc(db, "game", "state"), { 
          draftTurnUid: null, 
          draftOrder: [] 
        });
        toast.success("Fila encerrada! Todos já jogaram.");
      }
      setJogadorDesistenteUid(''); 
    } catch (error) {
      toast.error("Erro ao remover o turno.");
    } finally {
      setSalvando(false);
    }
  };

  const retornarJogadorAFK = async () => {
    if (!jogadorDesistenteUid) {
      toast.error("Selecione um técnico na lista acima primeiro!");
      return;
    }
    if (gameState?.phase !== 'PRE_SEASON' && gameState?.phase !== 'TRANSFER_WINDOW') {
      toast.error("Só é possível alterar a fila no Draft ou Janela de Transferências.");
      return;
    }

    const filaAtual = gameState.draftOrder || [];
    if (filaAtual.includes(jogadorDesistenteUid)) {
      toast.error("Este técnico JÁ ESTÁ na fila de espera atual!");
      return;
    }

    const confirmado = await confirmarAcao("Deseja colocar este técnico de volta no FIM da fila?");
    if (!confirmado) return;

    setSalvando(true);
    try {
      const novaFila = [...filaAtual, jogadorDesistenteUid];
      const updates: any = { draftOrder: novaFila };

      if (filaAtual.length === 0) {
         updates.draftTurnUid = jogadorDesistenteUid;
      }

      await updateDoc(doc(db, "game", "state"), updates);
      toast.success("Técnico reinserido na fila com sucesso!");
      setJogadorDesistenteUid('');
    } catch (error) {
      toast.error("Erro ao retornar jogador.");
    } finally {
      setSalvando(false);
    }
  };

  const resetarPreTemporada = async () => {
    const confirmado = await confirmarAcao("🚨 ATENÇÃO! Apagar elencos e zerar o servidor completamente?");
    if (!confirmado) return;
    setSalvando(true);
    try {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const promessasUsuarios = usersSnap.docs.map(docSnap => updateDoc(doc(db, "usuarios", docSnap.id), { 
        elenco: [], elencoPronto: false, titularesIds: [], trocasPermitidas: 0, trocasRealizadas: 0, jogadoresDispensados: [], taticasSalvas: {} 
      }));
      
      const clubesSnap = await getDocs(collection(db, "clubes"));
      const promessasClubes = clubesSnap.docs.map(docSnap => {
        const clubeData = docSnap.data() as Clube;
        const elencoCurado = clubeData.elenco.map(j => ({
          ...j, statusFisico: { cansaco: 1, lesionado: false, suspenso: false, amarelos: 0 }
        }));
        return updateDoc(doc(db, "clubes", docSnap.id), { elenco: elencoCurado });
      });

      await Promise.all([...promessasUsuarios, ...promessasClubes]);
      
      await setDoc(doc(db, "game", "state"), { phase: 'SETUP', currentRound: 1, draftOrder: [], draftTurnUid: null, playersReady: [], teams: [], standings: [], schedule: [], playersInLive: [] });
      toast.success("Reset profundo concluído! O servidor está limpo.");
    } catch (error) { toast.error("Erro ao resetar o servidor."); } finally { setSalvando(false); }
  };

  // --- LÓGICAS DE EDIÇÃO DE CLUBES ---
  const termoLimpo = termoBusca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
  const nomeLimpo = termoBusca.replace(/\d+/g, '').trim();
  const anoLimpo = termoBusca.replace(/\D/g, '') || new Date().getFullYear();

  const promptParaIA = termoBusca ? `Você é um gerador de dados estrito. Retorne APENAS um objeto JSON válido. É EXTREMAMENTE PROIBIDO o uso de blocos de código markdown (como \`\`\`json). Não escreva introduções, retorne o JSON cru.
Gere um elenco completo (18 a 22 jogadores) do time: "${termoBusca}".
REGRAS:
1) A propriedade 'posicao' DEVE conter EXATAMENTE E APENAS uma destas 4 opções: "GOL", "DEF", "MEI" ou "ATA". Converta laterais e zagueiros para "DEF", e volantes para "MEI".
2) OBRIGATÓRIO incluir pelo menos 2 jogadores com a posição "GOL" (goleiros).
3) O 'overall' deve ser realista (entre 60 e 95).
4) Crie um array "tags" contendo até 3 categorias relevantes (ex: ["BRASILEIRÃO", "COPA DO BRASIL", "LENDAS"]).
Siga ESTRITAMENTE esta estrutura:
{
  "id": "${termoLimpo}",
  "nome": "${nomeLimpo}",
  "ano": ${anoLimpo},
  "tags": ["TAG1", "TAG2"],
  "elenco": [
    { "id": "${termoLimpo}-nomedojogador", "nome": "Nome do Jogador", "posicao": "GOL", "clubeHistorico": "${termoBusca}", "overall": 85, "statusFisico": { "cansaco": 1, "lesionado": false, "suspenso": false }, "temporadasNoClube": 0 }
  ]
}` : '';

  const carregarJson = () => {
    try {
      setErroJson(''); const obj = JSON.parse(jsonImportado) as Clube;
      if (!obj.elenco) throw new Error('O JSON não possui a propriedade "elenco".');
      setClubeEmEdicao(obj); 
    } catch (error) { setErroJson('Erro ao ler o JSON: ' + (error as Error).message); }
  };

  const handleEditJogador = (idJogador: string, campo: string, valor: any) => {
    setClubeEmEdicao(prev => {
      if (!prev) return prev;
      return { ...prev, elenco: prev.elenco.map(j => j.id === idJogador ? { ...j, [campo]: valor } : j) };
    });
  };

  const salvarClube = async () => {
    if (!clubeEmEdicao) return;
    
    const temGoleiro = clubeEmEdicao.elenco.some(j => j.posicao === 'GOL');
    if (clubeEmEdicao.elenco.length < 11 || !temGoleiro) {
      toast.error("O time precisa ter pelo menos 11 jogadores e 1 Goleiro para não quebrar o motor do jogo!");
      return;
    }

    const isTimeEmCampo = gameState?.teams?.some(t => t.id === clubeEmEdicao.id && !t.isUser);
    if (isTimeEmCampo && gameState?.phase !== 'SETUP') {
      const confirmado = await confirmarAcao(`O time ${clubeEmEdicao.nome} está jogando o campeonato atual! Atualizar o elenco afetará os próximos jogos dele. Continuar?`);
      if (!confirmado) return;
    }

    setSalvando(true);
    try {
      const nomeCompletoClube = `${clubeEmEdicao.nome} ${clubeEmEdicao.ano}`.trim();
      const clubeSanitizado = {
        ...clubeEmEdicao,
        elenco: clubeEmEdicao.elenco.map(jogador => ({
          ...jogador, 
          clubeHistorico: nomeCompletoClube, 
          statusFisico: { cansaco: 1, lesionado: false, suspenso: false }
        }))
      };
      
      await setDoc(doc(db, "clubes", clubeSanitizado.id), clubeSanitizado);
      toast.success(`O time ${clubeSanitizado.nome} foi salvo no banco de dados!`);
      
      if (isTimeEmCampo && gameState) {
        const updatedTeams = gameState.teams?.map(t => 
          t.id === clubeSanitizado.id ? { ...t, nome: clubeSanitizado.nome } : t
        );
        if (updatedTeams) {
          await updateDoc(doc(db, "game", "state"), { teams: updatedTeams });
        }
      }

      setClubeEmEdicao(null); 
      setJsonImportado('');
      setTermoBusca('');
    } catch (error) { 
      toast.error("Erro ao salvar clube."); 
    } finally { 
      setSalvando(false); 
    }
  };

  const excluirClube = async (idClube: string) => {
    const confirmado = await confirmarAcao("ATENÇÃO! Excluir este time do banco de dados definitivamente?");
    if (confirmado) {
      await deleteDoc(doc(db, "clubes", idClube));
      toast.success("Clube excluído com sucesso.");
    }
  };

  const getClubeOvr = (elenco: Jogador[]) => {
    if (!elenco || elenco.length < 11) return 0;
    const sorted = [...elenco].sort((a, b) => b.overall - a.overall).slice(0, 11);
    const sum = sorted.reduce((acc, j) => acc + j.overall, 0);
    return Math.round(sum / 11);
  };

  const timesProntos = gameState?.teams?.filter(t => t.isUser && gameState.playersReady?.includes(t.id)) || [];
  const timesNaTv = gameState?.teams?.filter(t => t.isUser && (gameState as any)?.playersInLive?.includes(t.id)) || [];
  const totalHumanos = gameState?.teams?.filter(t => t.isUser).length || 0;
  
  const podeDarApito = totalHumanos > 0 && timesNaTv.length >= totalHumanos;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 sm:p-8 font-fifa">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        
        {/* CABEÇALHO DO ADMIN E NAVEGAÇÃO DE ABAS */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-center bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl gap-4 sm:gap-6">
            <div className="flex-1 w-full text-center md:text-left">
              <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter">Painel da <span className="text-fifa-blue">CBF</span></h1>
              <p className="text-xs sm:text-sm text-neutral-400 mt-2 font-bold tracking-widest uppercase">
                Fase Atual: <span className="text-fifa-green">{gameState?.phase || '...'}</span> <br className="md:hidden" /> <span className="hidden md:inline">|</span> Rodada: <span className="text-fifa-blue">{gameState?.currentRound || 0}</span>/{(gameState as any)?.totalTeams ? ((gameState as any).totalTeams - 1) * 2 : 38}
              </p>
              <div className="mt-4 w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
                <div className="bg-linear-to-r from-fifa-green via-fifa-blue to-fifa-red h-full transition-all duration-1000" style={{ width: `${Math.min(100, ((gameState?.currentRound || 0) / (((gameState as any)?.totalTeams || 20) - 1) * 2) * 100)}%` }}></div>
              </div>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 text-center flex-1 md:min-w-40 flex flex-col justify-center">
                <p className="text-[17px] text-neutral-500 uppercase font-black">Escalações Prontas</p>
                <p className="text-xl sm:text-2xl font-black text-fifa-green leading-none my-1">{timesProntos.length} <span className="text-sm text-neutral-600">/ {totalHumanos}</span></p>
              </div>

              <div className={`bg-neutral-950 p-4 rounded-lg border text-center flex-1 md:min-w-40 transition-all flex flex-col justify-center ${podeDarApito ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'border-neutral-800'}`}>
                <p className="text-[17px] text-neutral-500 uppercase font-black">Na TV</p>
                <p className={`text-xl sm:text-2xl font-black leading-none my-1 ${podeDarApito ? 'text-yellow-500 animate-pulse' : 'text-neutral-400'}`}>
                  {timesNaTv.length} <span className="text-sm text-neutral-600">/ {totalHumanos}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-lg">
            <button 
              onClick={() => setAbaAtiva('TORNEIO')} 
              className={`flex-1 py-3 px-4 rounded-lg font-black uppercase tracking-widest text-xs transition-colors ${abaAtiva === 'TORNEIO' ? 'bg-fifa-blue text-white shadow-md' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'}`}
            >
              Organização do Torneio
            </button>
            <button 
              onClick={() => setAbaAtiva('CLUBES')} 
              className={`flex-1 py-3 px-4 rounded-lg font-black uppercase tracking-widest text-xs transition-colors ${abaAtiva === 'CLUBES' ? 'bg-fifa-green text-white shadow-md' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'}`}
            >
              Gestão de Clubes & Base
            </button>
          </div>
        </div>

        {/* ================= ABA 1: TORNEIO ================= */}
        {abaAtiva === 'TORNEIO' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border-t-4 border-t-fifa-green flex flex-col gap-2 sm:gap-3 shadow-lg">
              <h3 className="text-[17px] sm:text-xs text-fifa-green font-black uppercase tracking-widest border-b border-neutral-800 pb-2">Preparação</h3>
              <button onClick={() => mudarFase('SETUP')} className="w-full py-2 mt-auto bg-neutral-800 hover:bg-neutral-700 font-bold rounded text-white shadow transition-all text-xs sm:text-sm">
                Retornar à Sala de Espera
              </button>
            </div>

            <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border-t-4 border-t-orange-500 flex flex-col gap-2 sm:gap-3 shadow-lg">
              <h3 className="text-[17px] sm:text-xs text-orange-500 font-black uppercase tracking-widest border-b border-neutral-800 pb-2">Intervenções (AFK)</h3>
              
              <select 
                value={jogadorDesistenteUid} 
                onChange={(e) => setJogadorDesistenteUid(e.target.value)} 
                className="w-full bg-neutral-950 text-white p-2 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-orange-500 text-[17px] sm:text-xs"
              >
                <option value="">Selecione o Técnico...</option>
                {gameState?.teams?.filter(t => t.isUser).map(t => (
                   <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              <button 
                onClick={() => autoEscalarJogador(jogadorDesistenteUid)} 
                disabled={!jogadorDesistenteUid || salvando} 
                className="w-full py-2 bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 text-orange-500 font-bold rounded shadow transition-all text-[17px] sm:text-xs uppercase tracking-widest disabled:opacity-50"
              >
                Auto-Escalar Time
              </button>

              <div className="flex gap-2 w-full mt-auto">
                <button 
                  onClick={pularTurnoAtual} 
                  disabled={salvando || !jogadorDesistenteUid || !gameState?.draftOrder || gameState.draftOrder.length === 0} 
                  className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold rounded shadow transition-all text-[17px] sm:text-[17px] uppercase tracking-widest disabled:opacity-50"
                  title="Remove o jogador selecionado da fila atual"
                >
                  ⏭️ Pular
                </button>
                <button 
                  onClick={retornarJogadorAFK} 
                  disabled={salvando || !jogadorDesistenteUid} 
                  className="flex-1 py-2 bg-fifa-green/20 hover:bg-fifa-green/40 border border-fifa-green/50 text-fifa-green font-bold rounded shadow transition-all text-[17px] sm:text-[17px] uppercase tracking-widest disabled:opacity-50"
                  title="Devolve o jogador para o final da fila"
                >
                  ↩️ Devolver
                </button>
              </div>
            </div>

            <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border-t-4 border-t-fifa-red flex flex-col gap-2 sm:gap-3 shadow-lg">
              <h3 className="text-[17px] sm:text-xs text-fifa-red font-black uppercase tracking-widest border-b border-neutral-800 pb-2">Interrupções</h3>              
              <button onClick={encerrarCampeonatoForcado} className="w-full py-2 mt-auto bg-amber-700/10 hover:bg-amber-700/20 border border-amber-700/30 text-amber-700 font-black rounded shadow transition-all text-[17px] uppercase tracking-widest">
                Encerrar Campeonato Agora
              </button>
              <button onClick={resetarPreTemporada} disabled={salvando} className="py-2 px-6 bg-fifa-red/10 hover:bg-fifa-red/30 border border-fifa-red/30 hover:border-fifa-red/60 text-fifa-red font-black text-[17px] sm:text-xs tracking-widest uppercase rounded-lg shadow transition-all">🚨 Resetar Servidor Profundo</button>
            </div>

            <div className="md:col-span-2 lg:col-span-4 bg-neutral-900 p-4 sm:p-5 rounded-xl border-t-4 border-t-fifa-blue flex flex-col gap-4 shadow-lg order-last lg:order-0">
              <h3 className="text-[17px] sm:text-xs text-fifa-blue font-black uppercase tracking-widest border-b border-neutral-800 pb-2">2. Configuração do Campeonato</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lado Esquerdo: Configurações Globais */}
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[15px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Nome da Edição</label>
                    <input type="text" placeholder="Ex: Brasileirão 2026" value={nomeCampeonato} onChange={(e) => setNomeCampeonato(e.target.value)} className="w-full bg-neutral-950 text-white p-3 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-fifa-blue text-xs" />
                  </div>
                  
                  <div>
                    <label className="block text-[15px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Formato</label>
                    <select 
                      value={formatoTorneio} 
                      onChange={(e) => {
                        setFormatoTorneio(e.target.value as any);
                        setDistribuicaoGrupos({}); 
                      }} 
                      className="w-full bg-neutral-950 text-white p-3 rounded-lg border border-neutral-700 outline-none font-bold uppercase text-xs focus:border-fifa-blue transition-colors"
                    >
                      <option value="LIGA">Liga (Pontos Corridos)</option>
                      <option value="COPA">Copa (Mata-Mata Puro)</option>
                      <option value="GRUPOS">Libertadores (Grupos + Mata-Mata)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[15px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Duração</label>
                    <select value={tipoTurno} onChange={(e) => setTipoTurno(e.target.value as any)} className="w-full bg-neutral-950 text-white p-3 rounded-lg border border-neutral-700 outline-none font-bold uppercase text-xs">
                      <option value="IDA_VOLTA">Ida e Volta</option>
                      <option value="IDA">Apenas Ida</option>
                    </select>
                  </div>

                  {formatoTorneio !== 'GRUPOS' && (
                    <div className="grid grid-cols-1 gap-2 border-t border-neutral-800 pt-3 mt-1">
                      <p className="text-[8px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Zonas de Premiação / Acesso</p>
                      <div className="flex gap-2">
                        <input type="text" value={zona1Nome} onChange={(e) => setZona1Nome(e.target.value)} placeholder="Ex: Campeão / Acesso" className="w-2/3 bg-neutral-950 text-cyan-400 p-2 rounded border border-neutral-800 outline-none font-bold text-[10px] uppercase focus:border-cyan-400" />
                        <input type="number" value={zona1Vagas} onChange={(e) => setZona1Vagas(Math.max(0, Number(e.target.value)))} className="w-1/3 bg-neutral-950 text-white p-2 rounded border border-neutral-800 outline-none font-bold text-center text-[10px] focus:border-cyan-400" title="Quantidade de Vagas" />
                      </div>
                      <div className="flex gap-2">
                        <input type="text" value={zona2Nome} onChange={(e) => setZona2Nome(e.target.value)} placeholder="Ex: Playoffs" className="w-2/3 bg-neutral-950 text-blue-400 p-2 rounded border border-neutral-800 outline-none font-bold text-[10px] uppercase focus:border-blue-400" />
                        <input type="number" value={zona2Vagas} onChange={(e) => setZona2Vagas(Math.max(0, Number(e.target.value)))} className="w-1/3 bg-neutral-950 text-white p-2 rounded border border-neutral-800 outline-none font-bold text-center text-[10px] focus:border-blue-400" />
                      </div>
                      <div className="flex gap-2">
                        <input type="text" value={zona3Nome} onChange={(e) => setZona3Nome(e.target.value)} placeholder="Ex: Manutenção" className="w-2/3 bg-neutral-950 text-fifa-green p-2 rounded border border-neutral-800 outline-none font-bold text-[10px] uppercase focus:border-fifa-green" />
                        <input type="number" value={zona3Vagas} onChange={(e) => setZona3Vagas(Math.max(0, Number(e.target.value)))} className="w-1/3 bg-neutral-950 text-white p-2 rounded border border-neutral-800 outline-none font-bold text-center text-[10px] focus:border-fifa-green" />
                      </div>
                      <p className="text-[8px] text-neutral-500 font-bold uppercase tracking-widest mt-1">Zona de Queda</p>
                      <div className="flex gap-2">
                        <input type="text" value={zona4Nome} onChange={(e) => setZona4Nome(e.target.value)} placeholder="Ex: Rebaixamento" className="w-2/3 bg-neutral-950 text-fifa-red p-2 rounded border border-neutral-800 outline-none font-bold text-[10px] uppercase focus:border-fifa-red" />
                        <input type="number" value={zona4Vagas} onChange={(e) => setZona4Vagas(Math.max(0, Number(e.target.value)))} className="w-1/3 bg-neutral-950 text-white p-2 rounded border border-neutral-800 outline-none font-bold text-center text-[10px] focus:border-fifa-red" />
                      </div>
                    </div>
                  )}

                  {/* PAINEL DE ALOCAÇÃO DE GRUPOS */}
                  {formatoTorneio === 'GRUPOS' && timesSelecionados.length > 0 && (
                    <div className="mt-4 border-t border-neutral-800 pt-4 animate-fade-in">
                      <h4 className="text-[12px] text-yellow-500 font-black uppercase tracking-widest mb-3">Definição de Grupos</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                        {timesSelecionados.map((time) => (
                          <div key={time.id} className="flex items-center justify-between bg-neutral-950 p-2 rounded border border-neutral-800 hover:border-yellow-500/50 transition-colors">
                            <span className="text-xs font-bold uppercase truncate max-w-40">{time.nome}</span>
                            <select 
                              value={distribuicaoGrupos[time.id] || ""}
                              onChange={(e) => setDistribuicaoGrupos(prev => ({ ...prev, [time.id]: e.target.value }))}
                              className="bg-neutral-900 text-white text-xs font-black p-1.5 rounded outline-none border border-neutral-700 focus:border-yellow-500 cursor-pointer"
                            >
                              <option value="">Sortear</option>
                              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(g => (
                                <option key={g} value={g}>Grupo {g}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <p className="text-[9px] text-neutral-500 uppercase mt-2 text-center font-bold tracking-widest">
                        Definidos: {Object.keys(distribuicaoGrupos).filter(k => distribuicaoGrupos[k] !== "").length} / {timesSelecionados.length}
                      </p>
                      <button 
                        onClick={() => {
                           // Sorteio Automático Inteligente
                           const gruposLetras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, Math.ceil(timesSelecionados.length / 4));
                           const timesEmbaralhados = [...timesSelecionados].sort(() => Math.random() - 0.5);
                           const novaDist: Record<string, string> = {};
                           timesEmbaralhados.forEach((t, index) => {
                              novaDist[t.id] = gruposLetras[index % gruposLetras.length];
                           });
                           setDistribuicaoGrupos(novaDist);
                        }}
                        className="w-full mt-3 py-2 bg-yellow-900/20 text-yellow-500 border border-yellow-700/50 rounded font-black text-[10px] uppercase tracking-widest hover:bg-yellow-900/40 transition-colors"
                      >
                        🎲 Sortear Automaticamente
                      </button>
                    </div>
                  )}

                </div>

                {/* Lado Direito: Seleção Dinâmica de Times */}
                <div className="lg:col-span-2 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg p-3 flex flex-col">
                    <div className="flex justify-between items-center mb-2 border-b border-neutral-800 pb-2">
                      <p className="text-[14px] text-neutral-400 font-bold uppercase">Sala de Espera</p>
                      <div className="flex gap-1">
                        <button onClick={() => setFiltroDisponiveis('HUMANOS')} className={`text-[11px] font-black px-1.5 py-0.5 rounded uppercase ${filtroDisponiveis === 'HUMANOS' ? 'bg-yellow-500 text-neutral-900' : 'bg-neutral-800 text-neutral-500'}`}>Humanos</button>
                        <button onClick={() => setFiltroDisponiveis('BOTS')} className={`text-[11px] font-black px-1.5 py-0.5 rounded uppercase ${filtroDisponiveis === 'BOTS' ? 'bg-fifa-blue text-white' : 'bg-neutral-800 text-neutral-500'}`}>Bots</button>
                        <button onClick={() => setFiltroDisponiveis('TODOS')} className={`text-[11px] font-black px-1.5 py-0.5 rounded uppercase ${filtroDisponiveis === 'TODOS' ? 'bg-neutral-300 text-neutral-900' : 'bg-neutral-800 text-neutral-500'}`}>Todos</button>
                      </div>
                    </div>
                    <div className="flex-1 h-40 sm:h-50 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                      {timesDisponiveis
                        .filter(t => filtroDisponiveis === 'TODOS' ? true : filtroDisponiveis === 'HUMANOS' ? t.isUser : !t.isUser)
                        .map(t => (
                         <div key={t.id} onClick={() => adicionarTimeAoTorneio(t)} className="text-[14px] p-2 bg-neutral-900 hover:bg-neutral-800 cursor-pointer rounded border border-neutral-800 flex justify-between group transition-colors">
                            <span className="truncate pr-2">{t.nome} {t.isUser ? <span className="text-yellow-500 font-black">(H)</span> : ''}</span>
                            <span className="text-fifa-green font-black opacity-0 group-hover:opacity-100">+ PUXAR</span>
                         </div>
                      ))}
                      {timesDisponiveis.filter(t => filtroDisponiveis === 'TODOS' ? true : filtroDisponiveis === 'HUMANOS' ? t.isUser : !t.isUser).length === 0 && (
                        <p className="text-neutral-600 italic text-[17px] text-center mt-4">Lista vazia.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 bg-neutral-950 border border-fifa-blue/30 rounded-lg p-3 flex flex-col shadow-[inset_0_0_20px_rgba(42,57,141,0.05)]">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-[14px] text-fifa-blue font-bold uppercase">Participantes</p>
                      <span className={`text-[17px] font-black px-1.5 py-0.5 rounded ${timesSelecionados.length % 2 === 0 && timesSelecionados.length >= 4 ? 'bg-fifa-green/20 text-fifa-green' : 'bg-fifa-red/20 text-fifa-red'}`}>{timesSelecionados.length} Times</span>
                    </div>
                    <div className="flex-1 h-40 sm:h-50 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                      {timesSelecionados.map(t => (
                         <div key={t.id} onClick={() => removerTimeDoTorneio(t)} className="text-[14px] p-2 bg-neutral-900 hover:bg-fifa-red/10 cursor-pointer rounded border border-neutral-800 hover:border-fifa-red/30 flex justify-between group transition-colors">
                            <span className="truncate pr-2">{t.nome} {t.isUser ? <span className="text-yellow-500">(Humano)</span> : ''}</span>
                            <span className="text-fifa-red font-black opacity-0 group-hover:opacity-100">REMOVER</span>
                         </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-2">
                <button onClick={iniciarTemporada} disabled={salvando} className="flex-1 py-4 bg-fifa-blue/20 hover:bg-fifa-blue/30 border border-fifa-blue/50 text-fifa-blue font-black rounded-xl shadow transition-all text-xs uppercase tracking-widest">
                  ▶️ Iniciar Temporada (Tabela + Draft)
                </button>
                
                {(() => {
                  const proximoEvento = gameState?.schedule?.[(gameState?.currentRound || 1) - 1];
                  const isMercado = proximoEvento?.tipo === 'TRANSFERENCIAS';
                  const tituloBotao = proximoEvento ? (isMercado ? 'Abrir Mercado de Transferências' : `Iniciar: ${proximoEvento.titulo}`) : 'Calendário Concluído';
                  
                  return (
                    <button 
                      onClick={simularRodadaAtual} 
                      disabled={salvando || !proximoEvento} 
                      className={`flex-1 py-4 hover:bg-opacity-80 font-black rounded-xl text-white shadow-lg transition-all text-xs uppercase tracking-widest 
                        ${!proximoEvento ? 'bg-neutral-800 text-neutral-600' : isMercado ? 'bg-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.5)] animate-pulse' : (podeDarApito ? 'bg-yellow-500 text-neutral-900 shadow-[0_0_20px_rgba(234,179,8,0.5)] animate-bounce' : 'bg-fifa-green')}
                      `}
                    >
                      {salvando ? 'Processando...' : tituloBotao}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ================= ABA 2: CLUBES E BASE ================= */}
        {abaAtiva === 'CLUBES' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 animate-fade-in">
            <div className="space-y-6 sm:space-y-8">
              <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl">
                <h2 className="font-black text-base sm:text-lg text-white mb-4 uppercase tracking-widest flex items-center gap-2"><span className="text-fifa-blue">🤖</span> Importar JSON</h2>
                <input type="text" placeholder="Prompt (Ex: Cruzeiro 2003)" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 sm:p-3 rounded-xl mb-3 text-sm focus:border-fifa-blue outline-none transition-all placeholder:text-neutral-600 font-bold"/>
                {promptParaIA && <button onClick={() => { navigator.clipboard.writeText(promptParaIA); toast.success("Prompt copiado!"); }} className="w-full mb-3 sm:mb-4 text-[17px] sm:text-xs bg-fifa-blue/20 border border-fifa-blue/50 text-fifa-blue py-2 sm:py-3 rounded-lg font-black uppercase tracking-widest hover:bg-fifa-blue/30 transition-colors">Copiar Prompt Gerado</button>}
                <textarea placeholder='Cole o JSON retornado pela IA aqui...' value={jsonImportado} onChange={(e) => setJsonImportado(e.target.value)} className="w-full h-24 sm:h-32 p-3 sm:p-4 bg-neutral-950 border border-neutral-800 rounded-xl text-[17px] sm:text-xs text-fifa-green font-mono mb-3 sm:mb-4 focus:border-fifa-blue outline-none placeholder:text-neutral-700"/>
                <button onClick={carregarJson} disabled={!jsonImportado} className="w-full bg-fifa-blue text-white py-2 sm:py-3 text-xs sm:text-sm rounded-xl font-black uppercase tracking-widest hover:bg-opacity-80 disabled:opacity-50 transition-colors shadow-lg">Analisar JSON</button>
                {erroJson && <p className="text-orange-500 text-[17px] sm:text-xs mt-3 font-bold bg-orange-950/30 p-2 rounded">{erroJson}</p>}
              </div>
              <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl h-96 sm:h-125 flex flex-col">
                {(() => {
                  // Extrai todas as tags únicas de todos os clubes salvos no banco
                  const todasAsTags = Array.from(new Set(clubesSalvos.flatMap(c => (c as any).tags || []))).sort() as string[];

                  const termo = buscaBanco.toLowerCase();
                  const clubesFiltrados = clubesSalvos.filter(clube => {
                    const matchNome = clube.nome.toLowerCase().includes(termo);
                    const matchAno = clube.ano?.toString().includes(termo);
                    const matchJogador = clube.elenco?.some(jogador => jogador.nome.toLowerCase().includes(termo));
                    const matchTexto = matchNome || matchAno || matchJogador;
                    
                    // Se houver uma tag selecionada, o clube PRECISA ter essa tag
                    const matchTag = tagFiltro ? ((clube as any).tags || []).includes(tagFiltro) : true;

                    return matchTexto && matchTag;
                  });

                  return (
                    <>
                      <h2 className="font-black text-base sm:text-lg text-white mb-4 uppercase tracking-widest flex items-center justify-between shrink-0">
                        Banco <span className="bg-neutral-800 text-neutral-400 text-[17px] sm:text-xs py-1 px-3 rounded-full">{clubesFiltrados.length} / {clubesSalvos.length}</span>
                      </h2>
                      
                      {/* Filtros de Tags */}
                      {todasAsTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3 max-h-20 overflow-y-auto custom-scrollbar pr-1 shrink-0">
                           <button 
                             onClick={() => setTagFiltro('')}
                             className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded transition-colors ${tagFiltro === '' ? 'bg-fifa-blue text-white' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'}`}
                           >
                             Tudo
                           </button>
                           {todasAsTags.map(tag => (
                             <button 
                               key={tag}
                               onClick={() => setTagFiltro(tag)}
                               className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded transition-colors ${tagFiltro === tag ? 'bg-yellow-500 text-neutral-900' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'}`}
                             >
                               {tag}
                             </button>
                           ))}
                        </div>
                      )}

                      {/* Campo de Pesquisa Inteligente */}
                      <input 
                        type="text" 
                        placeholder="🔍 Buscar time, ano ou atleta..." 
                        value={buscaBanco} 
                        onChange={(e) => setBuscaBanco(e.target.value)} 
                        className="w-full bg-neutral-950 border border-neutral-800 text-white p-3 rounded-lg mb-4 text-sm focus:border-fifa-green outline-none transition-all placeholder:text-neutral-600 font-bold shrink-0 shadow-inner"
                      />

                      <div className="space-y-2 sm:space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2">
                        {clubesFiltrados.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-neutral-600 opacity-50">
                            <span className="text-4xl mb-2">🕵️‍♂️</span>
                            <p className="text-xs font-black uppercase tracking-widest text-center">Nenhum resultado encontrado.</p>
                          </div>
                        ) : (
                          clubesFiltrados.map(clube => (
                            <div key={clube.id} className="flex justify-between items-center bg-neutral-950 p-3 sm:p-4 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-all group">
                              <div className="truncate pr-2">
                                <p className="font-black text-white text-xs sm:text-sm tracking-tight truncate">{clube.nome} <span className="text-fifa-green">{clube.ano}</span></p>
                                <p className="text-[8px] sm:text-[17px] text-fifa-blue font-black tracking-widest mt-0.5 sm:mt-1">{clube.elenco.length} atletas • OVR: {getClubeOvr(clube.elenco)}</p>
                              </div>
                              <div className="flex gap-1 sm:gap-2 shrink-0">
                                <button onClick={() => setClubeEmEdicao(clube)} className="text-[17px] sm:text-xs bg-neutral-800 px-2 sm:px-4 py-1 sm:py-2 rounded-lg font-black text-white hover:bg-neutral-700 hover:text-fifa-green transition-colors">Edit</button>
                                <button onClick={() => excluirClube(clube.id)} className="text-[17px] sm:text-xs bg-fifa-red/20 text-fifa-red px-2 sm:px-3 py-1 sm:py-2 rounded-lg font-black hover:bg-fifa-red hover:text-white transition-colors">X</button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            
            <div className="lg:col-span-2">
              {clubeEmEdicao ? (
                <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-fifa-green/50 shadow-[0_0_30px_rgba(60,172,59,0.05)] flex flex-col h-full">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-6 border-b border-neutral-800 pb-4 sm:pb-6 gap-3 sm:gap-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter">Inspetor de Elenco</h2>
                      <p className="text-[17px] sm:text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">Ajuste OVR e posições.</p>
                    </div>
                    <div className="flex gap-2 sm:gap-3 w-full md:w-auto">
                      <button onClick={() => setClubeEmEdicao(null)} className="flex-1 md:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-neutral-800 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors">Descartar</button>
                      <button onClick={salvarClube} disabled={salvando} className="flex-1 md:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-fifa-green rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest text-white hover:bg-opacity-80 transition-colors">{salvando ? 'Salvando...' : 'Injetar'}</button>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <div className="flex-1">
                      <label className="block text-[8px] sm:text-[17px] font-black text-fifa-blue uppercase tracking-widest mb-1 sm:mb-2">Designação</label>
                      <input type="text" value={clubeEmEdicao.nome} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, nome: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 p-3 sm:p-4 rounded-xl text-white text-sm font-black focus:border-fifa-blue outline-none transition-all"/>
                    </div>
                    <div className="w-full md:w-32 sm:w-40">
                      <label className="block text-[8px] sm:text-[17px] font-black text-fifa-blue uppercase tracking-widest mb-1 sm:mb-2">Temporada</label>
                      <input type="number" value={clubeEmEdicao.ano} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, ano: Number(e.target.value)})} className="w-full bg-neutral-950 border border-neutral-800 p-3 sm:p-4 rounded-xl text-fifa-green text-sm font-black text-center focus:border-fifa-blue outline-none transition-all"/>
                    </div>
                  </div>
                  
                  {/* GERENCIADOR DE TAGS DO CLUBE */}
                  <div className="mb-4 sm:mb-6 bg-neutral-950 border border-neutral-800 p-3 sm:p-4 rounded-xl">
                     <label className="block text-[8px] sm:text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2">Categorias / Tags</label>
                     <div className="flex flex-wrap gap-2 mb-3">
                        {((clubeEmEdicao as any).tags || []).map((tag: string) => (
                           <div key={tag} className="flex items-center gap-1 bg-neutral-800 text-neutral-300 text-[10px] sm:text-xs font-bold uppercase tracking-widest px-2 py-1 rounded">
                              {tag}
                              <button 
                                onClick={() => {
                                  const novasTags = ((clubeEmEdicao as any).tags || []).filter((t: string) => t !== tag);
                                  setClubeEmEdicao({ ...clubeEmEdicao, tags: novasTags } as Clube);
                                }}
                                className="text-fifa-red hover:text-white ml-1 font-black"
                              >
                                &times;
                              </button>
                           </div>
                        ))}
                        {((clubeEmEdicao as any).tags || []).length === 0 && <span className="text-[10px] text-neutral-600 italic font-bold">Nenhuma tag atribuída.</span>}
                     </div>
                     <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Nova tag (Ex: LIBERTADORES)" 
                          value={novaTagInput} 
                          onChange={(e) => setNovaTagInput(e.target.value)} 
                          onKeyDown={(e) => {
                             if (e.key === 'Enter') {
                               e.preventDefault();
                               if (!novaTagInput.trim()) return;
                               const novaTagVal = novaTagInput.trim().toUpperCase();
                               const tagsAtuais = (clubeEmEdicao as any).tags || [];
                               if (!tagsAtuais.includes(novaTagVal)) {
                                  setClubeEmEdicao({ ...clubeEmEdicao, tags: [...tagsAtuais, novaTagVal] } as Clube);
                               }
                               setNovaTagInput('');
                             }
                          }}
                          className="flex-1 bg-neutral-900 border border-neutral-700 text-white p-2 rounded text-[10px] sm:text-xs font-bold uppercase focus:border-fifa-blue outline-none"
                        />
                        <button 
                           onClick={() => {
                               if (!novaTagInput.trim()) return;
                               const novaTagVal = novaTagInput.trim().toUpperCase();
                               const tagsAtuais = (clubeEmEdicao as any).tags || [];
                               if (!tagsAtuais.includes(novaTagVal)) {
                                  setClubeEmEdicao({ ...clubeEmEdicao, tags: [...tagsAtuais, novaTagVal] } as Clube);
                               }
                               setNovaTagInput('');
                           }}
                           className="bg-fifa-blue text-white px-3 py-2 rounded text-[10px] sm:text-xs font-black uppercase tracking-widest hover:bg-opacity-80 transition-colors"
                        >
                           Adicionar
                        </button>
                     </div>
                  </div>

                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-2 sm:p-4 flex-1">
                    <div className="flex px-2 sm:px-4 pb-2 text-[8px] sm:text-[17px] text-neutral-500 font-black uppercase tracking-widest border-b border-neutral-800 mb-2 sm:mb-4">
                      <div className="flex-3 sm:flex-5">Atleta</div>
                      <div className="flex-2 sm:flex-3 text-center">Setor</div>
                      <div className="flex-2 sm:flex-2 text-center">OVR</div>
                      <div className="hidden sm:block flex-1 sm:flex-2"></div>
                    </div>
                    <div className="space-y-2 sm:space-y-3 max-h-75 sm:max-h-125 overflow-y-auto custom-scrollbar pr-1 sm:pr-2">
                      {clubeEmEdicao.elenco.map((jogador, index) => (
                        <div key={jogador.id || index} className="flex gap-2 sm:gap-4 bg-neutral-900/50 p-2 sm:p-3 rounded-lg border border-neutral-800 items-center hover:border-neutral-700 transition-colors">
                          <div className="flex-3 sm:flex-5">
                            <input type="text" value={jogador.nome} onChange={(e) => handleEditJogador(jogador.id, 'nome', e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 p-2 sm:p-3 rounded-lg text-white text-[17px] sm:text-sm font-bold focus:border-fifa-blue outline-none transition-colors"/>
                          </div>
                          <div className="flex-2 sm:flex-3">
                            <select value={jogador.posicao} onChange={(e) => handleEditJogador(jogador.id, 'posicao', e.target.value as Posicao)} className="w-full bg-neutral-950 border border-neutral-800 p-2 sm:p-3 rounded-lg text-fifa-blue text-[17px] sm:text-sm font-black focus:border-fifa-blue outline-none transition-colors cursor-pointer text-center sm:text-left">
                              <option value="GOL">GOL</option><option value="DEF">DEF</option><option value="MEI">MEI</option><option value="ATA">ATA</option>
                            </select>
                          </div>
                          <div className="flex-2 sm:flex-2">
                            <input type="number" value={jogador.overall} onChange={(e) => handleEditJogador(jogador.id, 'overall', Number(e.target.value))} className="w-full bg-neutral-950 border border-neutral-800 p-2 sm:p-3 rounded-lg text-fifa-green font-black text-center text-[17px] sm:text-sm focus:border-fifa-blue outline-none transition-colors"/>
                          </div>
                          <div className="hidden sm:flex flex-1 sm:flex-2 items-center justify-center gap-2 sm:gap-3">
                            <span className={`text-xs sm:text-sm ${jogador.statusFisico?.lesionado ? 'text-red-500 drop-shadow-md' : 'text-neutral-700 opacity-20'}`} title="Risco de Lesão">🏥</span>
                            <span className={`text-xs sm:text-sm ${jogador.statusFisico?.suspenso ? 'text-orange-500 drop-shadow-md' : 'text-neutral-700 opacity-20'}`} title="Suspenso">🟥</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-64 sm:min-h-100 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-2xl p-6 sm:p-10 text-neutral-600 bg-neutral-900/30">
                  <span className="text-5xl sm:text-7xl mb-4 sm:mb-6 grayscale opacity-20">⚙️</span>
                  <p className="font-black text-xl sm:text-2xl uppercase tracking-tighter text-neutral-500 text-center">Inspetor de Elenco</p>
                  <p className="text-[17px] sm:text-sm font-bold text-neutral-600 mt-2 uppercase tracking-widest text-center">Aguardando importação.</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
