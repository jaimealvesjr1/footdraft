import { useState, useEffect } from 'react';
import { type Clube, type GamePhase, type GameState, type Posicao, type Jogador } from '../types'; 
import { doc, setDoc, deleteDoc, onSnapshot, getDocs, collection, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase'; 
import { simularPartidaV2, escalarBot, getMentalidade } from '../services/matchEngine';
import toast from 'react-hot-toast';

type Formacao = "4-3-3" | "4-4-2" | "3-5-2" | "4-5-1";
const REGRAS_FORMACAO: Record<Formacao, { DEF: number; MEI: number; ATA: number }> = {
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 },
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 },
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 },
  "4-5-1": { DEF: 4, MEI: 5, ATA: 1 },
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
  const [tamanhoCampeonato, setTamanhoCampeonato] = useState<number>(20);
  const [nomeCampeonato, setNomeCampeonato] = useState<string>('');
  
  const [jogadorDesistenteUid, setJogadorDesistenteUid] = useState<string>('');

  useEffect(() => {
    const unsubGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) setGameState(docSnap.data() as GameState);
    });
    const unsubClubes = onSnapshot(collection(db, "clubes"), (snapshot) => {
      const lista: Clube[] = [];
      snapshot.forEach(doc => lista.push(doc.data() as Clube));
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

  const iniciarPreTemporada = async () => {
    const confirmado = await confirmarAcao("Iniciar a Pré-Temporada? O sistema sorteará a ordem.");
    if (!confirmado) return;
    try {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      let uidsRegistrados: string[] = [];
      usersSnap.forEach(doc => { 
          if (doc.data().nomeTime && doc.data().inscrito) uidsRegistrados.push(doc.id); 
      });
      if (uidsRegistrados.length === 0) { toast.error("Nenhum jogador na Sala de Espera!"); return; }

      const ordemSorteada = uidsRegistrados.sort(() => Math.random() - 0.5);
      await setDoc(doc(db, "game", "state"), {
        phase: 'PRE_SEASON', currentRound: 1, draftOrder: ordemSorteada,
        draftTurnUid: ordemSorteada[0], draftDeadline: Date.now() + (3 * 60 * 1000), playersReady: []
      }, { merge: true });

      toast.success(`Pré-Temporada iniciada com ${ordemSorteada.length} jogadores inscritos!`);
    } catch (error) { toast.error("Erro ao iniciar a Pré-Temporada."); }
  };

  const termoLimpo = termoBusca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
  const nomeLimpo = termoBusca.replace(/\d+/g, '').trim();
  const anoLimpo = termoBusca.replace(/\D/g, '') || new Date().getFullYear();

  const promptParaIA = termoBusca ? `Você é um gerador de dados estrito. Retorne APENAS um objeto JSON válido. É EXTREMAMENTE PROIBIDO o uso de blocos de código markdown (como \`\`\`json). Não escreva introduções, retorne o JSON cru.
Gere um elenco completo (18 a 22 jogadores) do time: "${termoBusca}".
REGRAS:
1) A propriedade 'posicao' DEVE conter EXATAMENTE E APENAS uma destas 4 opções: "GOL", "DEF", "MEI" ou "ATA". Converta laterais e zagueiros para "DEF", e volantes para "MEI".
2) OBRIGATÓRIO incluir pelo menos 2 jogadores com a posição "GOL" (goleiros).
3) O 'overall' deve ser realista (entre 60 e 95).
Siga ESTRITAMENTE esta estrutura:
{
  "id": "${termoLimpo}",
  "nome": "${nomeLimpo}",
  "ano": ${anoLimpo},
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
    
    // TRAVA DE SEGURANÇA: Verifica integridade mínima do elenco
    const temGoleiro = clubeEmEdicao.elenco.some(j => j.posicao === 'GOL');
    if (clubeEmEdicao.elenco.length < 11 || !temGoleiro) {
      toast.error("O time precisa ter pelo menos 11 jogadores e 1 Goleiro para não quebrar o motor do jogo!");
      return;
    }

    // AVISO INTELIGENTE: Verifica se o time editado já está no campeonato rodando
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

  const gerarCampeonato = async () => {
    try {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const times: { id: string; nome: string; isUser: boolean }[] = [];
      usersSnap.forEach((docSnap) => {
        const dados = docSnap.data();
        if (dados.nomeTime && dados.inscrito) times.push({ id: docSnap.id, nome: String(dados.nomeTime), isUser: true });
      });

      const botsSnap = await getDocs(collection(db, "clubes"));
      const clubesBots: { id: string; nome: string; isUser: boolean }[] = [];
      botsSnap.forEach(d => {
        const dados = d.data();
        if (dados.elenco && Array.isArray(dados.elenco) && dados.elenco.length >= 11) {
          clubesBots.push({ id: d.id, nome: `${dados.nome || ''} ${dados.ano || ''}`.trim(), isUser: false });
        }
      });
      clubesBots.sort(() => Math.random() - 0.5);

      const TOTAL_TIMES = tamanhoCampeonato;
      while (times.length < TOTAL_TIMES && clubesBots.length > 0) times.push(clubesBots.pop()!);

      if (times.length < TOTAL_TIMES) {
        toast.error(`Tem apenas ${times.length} times disponíveis. Precisa de ${TOTAL_TIMES}. Adicione mais clubes!`);
        return; 
      }

      times.sort(() => Math.random() - 0.5);

      const standings = times.map(t => ({ id: t.id, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 }));
      const numRodadasIda = TOTAL_TIMES - 1;
      const metade = TOTAL_TIMES / 2;
      const scheduleIda: { jogos: any[] }[] = []; 
      let idsRotacao = times.map(t => t.id);

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
        scheduleIda.push({ jogos: jogosDaRodada }); 
        const ultimoId = idsRotacao.pop();
        if (ultimoId) idsRotacao.splice(1, 0, ultimoId);
      }

      const scheduleVolta = scheduleIda.map(rodada => {
        return {
          jogos: rodada.jogos.map(jogo => ({
            homeId: jogo.awayId, awayId: jogo.homeId, homeScore: null, awayScore: null, relatorio: []
          }))
        }
      });

      const scheduleCompleto = [...scheduleIda, ...scheduleVolta];

      await updateDoc(doc(db, "game", "state"), {
        teams: times, standings: standings, schedule: scheduleCompleto,
        currentRound: 1, phase: 'FIRST_HALF',
        totalTeams: TOTAL_TIMES,
        nomeCampeonato: nomeCampeonato || `Temporada ${new Date().getFullYear()}`
      });

      toast.success(`Campeonato Gerado com Sucesso! (${(TOTAL_TIMES - 1) * 2} rodadas)`);
    } catch (error) { toast.error("Erro ao gerar tabela."); }
  };

  const simularRodadaAtual = async () => {
    if (!gameState || !gameState.schedule || !gameState.standings) return;
    setSalvando(true);

    try {
      const rodadaIndex = gameState.schedule.findIndex((r: any) => r.jogos[0]?.homeScore == null);
      if (rodadaIndex === -1) throw new Error("Campeonato já terminou!");
      
      const rodadaAtualData = gameState.schedule[rodadaIndex];
      const rodadaVerdadeira = rodadaIndex + 1;
      
      const jogos = rodadaAtualData.jogos;
      let novosStandings = [...gameState.standings];

      const validarTitularesHumanos = (titularesIds: string[], elenco: Jogador[], nomeTime: string) => {
        const idsParaValidar = titularesIds.length > 0 ? titularesIds : elenco.slice(0, 11).map(j => j.id);
        const time = idsParaValidar.map(id => elenco.find(j => j.id === id)).filter(Boolean) as Jogador[];
        if (time.length < 11) throw new Error(`O time ${nomeTime} não possui 11 jogadores escalados!`);
        const irregulares = time.filter(j => j.statusFisico?.suspenso || j.statusFisico?.lesionado);
        if (irregulares.length > 0) {
          const nomes = irregulares.map(j => j.nome).join(", ");
          throw new Error(`O time ${nomeTime} escalou jogadores irregulares: ${nomes}. Dê uma bronca no técnico!`);
        }
        const temGoleiro = time.some(j => j.posicao.toUpperCase().includes('GOL') || j.posicao.toUpperCase() === 'GL');
        if (!temGoleiro) throw new Error(`O time ${nomeTime} tentou entrar em campo sem um goleiro titular!`);
        return time;
      };

      const totalTeams = (gameState as any).totalTeams || 20;
      const midSeason = totalTeams - 1;
      const endSeason = (totalTeams - 1) * 2;
      const resetarCansaco = rodadaVerdadeira === midSeason;

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
              if (!status.lesionado) status.cansaco = resetarCansaco ? 1 : Math.min(5, status.cansaco + 1);
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

            if (resetarCansaco) { status.cansaco = 1; status.lesionado = false; }
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
      let mensagemAlert = "Rodada Simulada com Sucesso!";

      if (rodadaVerdadeira === midSeason) {
        mensagemAlert = "FIM DO 1º TURNO! Após a TV, clique no botão 'Janela de Transf.'";
      } else if (rodadaVerdadeira === endSeason) {
        mensagemAlert = "ÚLTIMA RODADA SIMULADA! Após a TV, o histórico estará salvo.";

        const dataAtual = new Date().toLocaleDateString('pt-BR');
        const promessasHistorico = novosStandings.map((timeDaTabela, index) => {
             const isHumano = (gameState.teams || []).find((t:any) => t.id === timeDaTabela.id)?.isUser;
             if (isHumano) {
                 const historicoData = {
                     temporada: dataAtual,
                     posicao: index + 1,
                     pontos: timeDaTabela.pts,
                     vitorias: timeDaTabela.v,
                     saldo: timeDaTabela.sg,
                     campeao: index === 0
                 };
                 return updateDoc(doc(db, "usuarios", timeDaTabela.id), {
                     historicoCampanhas: arrayUnion(historicoData),
                     inscrito: false 
                 });
             }
             return Promise.resolve();
        });
        await Promise.all(promessasHistorico);
      }

      await updateDoc(doc(db, "game", "state"), {
        schedule: updatedSchedule, standings: novosStandings, currentRound: rodadaVerdadeira + 1,
        phase: proximaFase, playersReady: [], playersInLive: []
      });

      toast.success(mensagemAlert);
    } catch (error) {
      console.error("Erro na Simulação:", error);
      toast.error(`SIMULAÇÃO ABORTADA: ${(error as Error).message}`);
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

  // ==========================================
  // NOVA FUNÇÃO: DEVOLVER JOGADOR À FILA (AFK)
  // ==========================================
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
      // Adiciona o jogador ao final da fila existente
      const novaFila = [...filaAtual, jogadorDesistenteUid];
      const updates: any = { draftOrder: novaFila };

      // Se a fila estava vazia (ninguém jogando e a fase paralisada), ele se torna o dono do turno atual
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

  const iniciarJanelaTransferencias = async () => {
    if (!gameState || !gameState.standings || !gameState.teams) return;
    const confirmado = await confirmarAcao("📢 Abrir Janela de Transferências?");
    if (!confirmado) return;
    setSalvando(true);
    try {
      const usuariosNoJogo = gameState.teams.filter(t => t.isUser).map(t => t.id);
      const tabela = [...gameState.standings];
      const promessasDeAtualizacao = tabela.map((time, index) => {
        if (!usuariosNoJogo.includes(time.id)) return Promise.resolve();
        let totalTrocas = index <= 3 ? 6 : index <= 7 ? 4 : 2;
        return updateDoc(doc(db, "usuarios", time.id), { trocasPermitidas: totalTrocas, trocasRealizadas: 0, jogadoresDispensados: [] });
      });
      await Promise.all(promessasDeAtualizacao);
      const ordemDeEscolha = [...tabela].reverse().filter(time => usuariosNoJogo.includes(time.id)).map(time => time.id);
      await updateDoc(doc(db, "game", "state"), { phase: 'TRANSFER_WINDOW', draftOrder: ordemDeEscolha, draftTurnUid: ordemDeEscolha[0], playersReady: [] });
      toast.success("Janela de Transferências aberta!");
    } catch (error) { toast.error("Erro ao processar as transferências."); } finally { setSalvando(false); }
  };

  const iniciarReturno = async () => {
    const confirmado = await confirmarAcao("▶️ Iniciar (ou Sincronizar) o Returno?");
    if (!confirmado) return;
    setSalvando(true);
    try { 
      const indexNaoSimulada = gameState?.schedule?.findIndex((r: any) => r.jogos[0]?.homeScore == null);
      const midSeason = ((gameState as any)?.totalTeams || 20) - 1;
      const rodadaCorreta = (indexNaoSimulada !== undefined && indexNaoSimulada !== -1) ? indexNaoSimulada + 1 : (midSeason + 1);

      await updateDoc(doc(db, "game", "state"), { 
        phase: 'SECOND_HALF', draftTurnUid: null, draftOrder: [], currentRound: rodadaCorreta
      }); 
      toast.success(`Returno sincronizado! O jogo voltou para a Rodada ${rodadaCorreta}`); 
    } catch (error) { toast.error("Erro ao iniciar returno."); } finally { setSalvando(false); }
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
        
        {/* CABEÇALHO */}
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
              <p className="text-[10px] text-neutral-500 uppercase font-black">Escalações Prontas</p>
              <p className="text-xl sm:text-2xl font-black text-fifa-green leading-none my-1">{timesProntos.length} <span className="text-sm text-neutral-600">/ {totalHumanos}</span></p>
              <div className="flex flex-wrap gap-1 justify-center mt-1">
                {timesProntos.map(t => <span key={t.id} className="text-[8px] bg-fifa-green/10 text-fifa-green px-1.5 py-0.5 rounded border border-fifa-green/30">{t.nome}</span>)}
              </div>
            </div>

            <div className={`bg-neutral-950 p-4 rounded-lg border text-center flex-1 md:min-w-40 transition-all flex flex-col justify-center ${podeDarApito ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'border-neutral-800'}`}>
              <p className="text-[10px] text-neutral-500 uppercase font-black">Na TV (Estádio)</p>
              <p className={`text-xl sm:text-2xl font-black leading-none my-1 ${podeDarApito ? 'text-yellow-500 animate-pulse' : 'text-neutral-400'}`}>
                {timesNaTv.length} <span className="text-sm text-neutral-600">/ {totalHumanos}</span>
              </p>
              <div className="flex flex-wrap gap-1 justify-center mt-1">
                {timesNaTv.map(t => <span key={t.id} className="text-[8px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/30">{t.nome}</span>)}
              </div>
            </div>
          </div>
        </div>

        {/* ÁREA DE BOTÕES - LINHA 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border border-neutral-800 flex flex-col gap-2 sm:gap-3">
            <h3 className="text-[10px] sm:text-xs text-neutral-500 font-black uppercase tracking-widest border-b border-neutral-800 pb-2">1. Preparação</h3>
            <button onClick={() => mudarFase('SETUP')} className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 font-bold rounded text-white shadow transition-all text-xs sm:text-sm">Sala de Espera</button>
            <button onClick={iniciarPreTemporada} className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-fifa-gray-light font-bold rounded shadow transition-all text-xs sm:text-sm">Iniciar Pré-Temporada</button>
          </div>

          <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border-t-4 border-t-fifa-blue flex flex-col gap-2 sm:gap-3 shadow-lg">
            <h3 className="text-[10px] sm:text-xs text-fifa-blue font-black uppercase tracking-widest border-b border-neutral-800 pb-2">2. Campeonato</h3>
            <input type="text" placeholder="Nome da Temporada" value={nomeCampeonato} onChange={(e) => setNomeCampeonato(e.target.value)} className="w-full bg-neutral-950 text-white p-2 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-fifa-blue text-[10px] sm:text-xs" />
            <div className="flex gap-2 w-full">
              <select value={tamanhoCampeonato} onChange={(e) => setTamanhoCampeonato(Number(e.target.value))} className="bg-neutral-950 text-white p-2 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-fifa-blue text-[10px] sm:text-xs">
                <option value={4}>4 Times</option>
                <option value={10}>10 Times</option>
                <option value={14}>14 Times</option>
                <option value={20}>20 Times</option>
              </select>
              <button onClick={gerarCampeonato} className="flex-1 py-2 bg-fifa-blue/20 hover:bg-fifa-blue/30 border border-fifa-blue/50 text-fifa-blue font-bold rounded shadow transition-all text-[10px] sm:text-xs uppercase tracking-widest">Gerar Tabela</button>
            </div>
            <button onClick={simularRodadaAtual} disabled={salvando} className={`w-full py-2 sm:py-3 hover:bg-opacity-80 font-black rounded text-white shadow-lg transition-all text-xs sm:text-sm uppercase tracking-widest mt-auto ${podeDarApito ? 'bg-yellow-500 text-neutral-900 shadow-[0_0_20px_rgba(234,179,8,0.5)] animate-bounce' : 'bg-fifa-blue'}`}>
              {salvando ? 'Processando...' : `Simular Rodada ${Math.min(((gameState as any)?.totalTeams ? ((gameState as any).totalTeams - 1) * 2 : 38), gameState?.currentRound || 1)}`}
            </button>
          </div>

          <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border-t-4 border-t-fifa-green flex flex-col gap-2 sm:gap-3 shadow-lg">
            <h3 className="text-[10px] sm:text-xs text-fifa-green font-black uppercase tracking-widest border-b border-neutral-800 pb-2">3. Meio de Temporada</h3>
            <button onClick={iniciarJanelaTransferencias} className="w-full py-2 bg-fifa-green/20 hover:bg-fifa-green/30 border border-fifa-green/50 text-fifa-green font-bold rounded shadow transition-all text-[10px] sm:text-sm">Janela de Transf.</button>
            <button onClick={iniciarReturno} className="w-full py-2 bg-fifa-green hover:bg-opacity-80 text-white font-bold rounded shadow transition-all text-[10px] sm:text-sm mt-auto">Iniciar Returno ▶️</button>
          </div>

          <div className="bg-neutral-900 p-4 sm:p-5 rounded-xl border-t-4 border-t-orange-500 flex flex-col gap-2 sm:gap-3 shadow-lg">
            <h3 className="text-[10px] sm:text-xs text-orange-500 font-black uppercase tracking-widest border-b border-neutral-800 pb-2">4. Intervenções (AFK)</h3>
            
            <select 
              value={jogadorDesistenteUid} 
              onChange={(e) => setJogadorDesistenteUid(e.target.value)} 
              className="w-full bg-neutral-950 text-white p-2 rounded-lg border border-neutral-700 outline-none font-bold uppercase focus:border-orange-500 text-[10px] sm:text-xs"
            >
              <option value="">Selecione o Técnico...</option>
              {gameState?.teams?.filter(t => t.isUser).map(t => (
                 <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
            <button 
              onClick={() => autoEscalarJogador(jogadorDesistenteUid)} 
              disabled={!jogadorDesistenteUid || salvando} 
              className="w-full py-2 bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 text-orange-500 font-bold rounded shadow transition-all text-[10px] sm:text-xs uppercase tracking-widest disabled:opacity-50"
            >
              Auto-Escalar Time
            </button>

            <div className="flex gap-2 w-full mt-auto">
              <button 
                onClick={pularTurnoAtual} 
                disabled={salvando || !jogadorDesistenteUid || !gameState?.draftOrder || gameState.draftOrder.length === 0} 
                className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold rounded shadow transition-all text-[10px] sm:text-[10px] uppercase tracking-widest disabled:opacity-50"
                title="Remove o jogador selecionado da fila atual"
              >
                ⏭️ Pular
              </button>
              <button 
                onClick={retornarJogadorAFK} 
                disabled={salvando || !jogadorDesistenteUid} 
                className="flex-1 py-2 bg-fifa-green/20 hover:bg-fifa-green/40 border border-fifa-green/50 text-fifa-green font-bold rounded shadow transition-all text-[10px] sm:text-[10px] uppercase tracking-widest disabled:opacity-50"
                title="Devolve o jogador para o final da fila"
              >
                ↩️ Devolver
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end pt-2">
            <button onClick={resetarPreTemporada} disabled={salvando} className="py-2 px-6 bg-fifa-red/10 hover:bg-fifa-red/30 border border-fifa-red/30 hover:border-fifa-red/60 text-fifa-red font-black text-[10px] sm:text-xs tracking-widest uppercase rounded-lg shadow transition-all">🚨 Resetar Servidor Profundo</button>
        </div>

        {/* GERENCIADOR DE CLUBES */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 pt-6 sm:pt-8 border-t border-neutral-900">
          <div className="space-y-6 sm:space-y-8">
            <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl">
              <h2 className="font-black text-base sm:text-lg text-white mb-4 uppercase tracking-widest flex items-center gap-2"><span className="text-fifa-blue">🤖</span> Importar JSON</h2>
              <input type="text" placeholder="Prompt (Ex: Cruzeiro 2003)" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 sm:p-3 rounded-xl mb-3 text-sm focus:border-fifa-blue outline-none transition-all placeholder:text-neutral-600 font-bold"/>
              {promptParaIA && <button onClick={() => { navigator.clipboard.writeText(promptParaIA); toast.success("Prompt copiado!"); }} className="w-full mb-3 sm:mb-4 text-[10px] sm:text-xs bg-fifa-blue/20 border border-fifa-blue/50 text-fifa-blue py-2 sm:py-3 rounded-lg font-black uppercase tracking-widest hover:bg-fifa-blue/30 transition-colors">Copiar Prompt Gerado</button>}
              <textarea placeholder='Cole o JSON retornado pela IA aqui...' value={jsonImportado} onChange={(e) => setJsonImportado(e.target.value)} className="w-full h-24 sm:h-32 p-3 sm:p-4 bg-neutral-950 border border-neutral-800 rounded-xl text-[10px] sm:text-xs text-fifa-green font-mono mb-3 sm:mb-4 focus:border-fifa-blue outline-none placeholder:text-neutral-700"/>
              <button onClick={carregarJson} disabled={!jsonImportado} className="w-full bg-fifa-blue text-white py-2 sm:py-3 text-xs sm:text-sm rounded-xl font-black uppercase tracking-widest hover:bg-opacity-80 disabled:opacity-50 transition-colors shadow-lg">Analisar JSON</button>
              {erroJson && <p className="text-orange-500 text-[10px] sm:text-xs mt-3 font-bold bg-orange-950/30 p-2 rounded">{erroJson}</p>}
            </div>
            <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-neutral-800 shadow-xl max-h-96 sm:max-h-125 overflow-y-auto custom-scrollbar">
              <h2 className="font-black text-base sm:text-lg text-white mb-4 uppercase tracking-widest flex items-center justify-between">Banco <span className="bg-neutral-800 text-neutral-400 text-[10px] sm:text-xs py-1 px-3 rounded-full">{clubesSalvos.length}</span></h2>
              <div className="space-y-2 sm:space-y-3">
                {clubesSalvos.map(clube => (
                  <div key={clube.id} className="flex justify-between items-center bg-neutral-950 p-3 sm:p-4 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-all group">
                    <div className="truncate pr-2">
                      <p className="font-black text-white text-xs sm:text-sm uppercase tracking-tight truncate">{clube.nome} <span className="text-fifa-green">{clube.ano}</span></p>
                      <p className="text-[8px] sm:text-[10px] text-fifa-blue font-black uppercase tracking-widest mt-0.5 sm:mt-1">{clube.elenco.length} Atletas • OVR: {getClubeOvr(clube.elenco)}</p>
                    </div>
                    <div className="flex gap-1 sm:gap-2 shrink-0">
                      <button onClick={() => setClubeEmEdicao(clube)} className="text-[10px] sm:text-xs bg-neutral-800 px-2 sm:px-4 py-1 sm:py-2 rounded-lg font-black text-white hover:bg-neutral-700 hover:text-fifa-blue transition-colors">Edit</button>
                      <button onClick={() => excluirClube(clube.id)} className="text-[10px] sm:text-xs bg-fifa-red/20 text-fifa-red px-2 sm:px-3 py-1 sm:py-2 rounded-lg font-black hover:bg-fifa-red hover:text-white transition-colors">X</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            {clubeEmEdicao ? (
              <div className="bg-neutral-900 p-4 sm:p-6 rounded-xl border border-fifa-green/50 shadow-[0_0_30px_rgba(60,172,59,0.05)] flex flex-col h-full">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-6 border-b border-neutral-800 pb-4 sm:pb-6 gap-3 sm:gap-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter">Inspetor de Elenco</h2>
                    <p className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">Ajuste OVR e posições.</p>
                  </div>
                  <div className="flex gap-2 sm:gap-3 w-full md:w-auto">
                    <button onClick={() => setClubeEmEdicao(null)} className="flex-1 md:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-neutral-800 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors">Descartar</button>
                    <button onClick={salvarClube} disabled={salvando} className="flex-1 md:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-fifa-green rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest text-white hover:bg-opacity-80 transition-colors">{salvando ? 'Salvando...' : 'Injetar'}</button>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-3 sm:gap-4 mb-4 sm:mb-8">
                  <div className="flex-1">
                    <label className="block text-[8px] sm:text-[10px] font-black text-fifa-blue uppercase tracking-widest mb-1 sm:mb-2">Designação</label>
                    <input type="text" value={clubeEmEdicao.nome} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, nome: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 p-3 sm:p-4 rounded-xl text-white text-sm font-black uppercase focus:border-fifa-blue outline-none transition-all"/>
                  </div>
                  <div className="w-full md:w-32 sm:w-40">
                    <label className="block text-[8px] sm:text-[10px] font-black text-fifa-blue uppercase tracking-widest mb-1 sm:mb-2">Temporada</label>
                    <input type="number" value={clubeEmEdicao.ano} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, ano: Number(e.target.value)})} className="w-full bg-neutral-950 border border-neutral-800 p-3 sm:p-4 rounded-xl text-fifa-green text-sm font-black text-center focus:border-fifa-blue outline-none transition-all"/>
                  </div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-2 sm:p-4 flex-1">
                  <div className="flex px-2 sm:px-4 pb-2 text-[8px] sm:text-[10px] text-neutral-500 font-black uppercase tracking-widest border-b border-neutral-800 mb-2 sm:mb-4">
                    <div className="flex-3 sm:flex-5">Atleta</div>
                    <div className="flex-2 sm:flex-3 text-center">Setor</div>
                    <div className="flex-2 sm:flex-2 text-center">OVR</div>
                    <div className="hidden sm:block flex-1 sm:flex-2"></div>
                  </div>
                  <div className="space-y-2 sm:space-y-3 max-h-75 sm:max-h-125 overflow-y-auto custom-scrollbar pr-1 sm:pr-2">
                    {clubeEmEdicao.elenco.map((jogador, index) => (
                      <div key={jogador.id || index} className="flex gap-2 sm:gap-4 bg-neutral-900/50 p-2 sm:p-3 rounded-lg border border-neutral-800 items-center hover:border-neutral-700 transition-colors">
                        <div className="flex-3 sm:flex-5">
                          <input type="text" value={jogador.nome} onChange={(e) => handleEditJogador(jogador.id, 'nome', e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 p-2 sm:p-3 rounded-lg text-white text-[10px] sm:text-sm font-bold focus:border-fifa-blue outline-none transition-colors"/>
                        </div>
                        <div className="flex-2 sm:flex-3">
                          <select value={jogador.posicao} onChange={(e) => handleEditJogador(jogador.id, 'posicao', e.target.value as Posicao)} className="w-full bg-neutral-950 border border-neutral-800 p-2 sm:p-3 rounded-lg text-fifa-blue text-[10px] sm:text-sm font-black focus:border-fifa-blue outline-none transition-colors cursor-pointer text-center sm:text-left">
                            <option value="GOL">GOL</option><option value="DEF">DEF</option><option value="MEI">MEI</option><option value="ATA">ATA</option>
                          </select>
                        </div>
                        <div className="flex-2 sm:flex-2">
                          <input type="number" value={jogador.overall} onChange={(e) => handleEditJogador(jogador.id, 'overall', Number(e.target.value))} className="w-full bg-neutral-950 border border-neutral-800 p-2 sm:p-3 rounded-lg text-fifa-green font-black text-center text-[10px] sm:text-sm focus:border-fifa-blue outline-none transition-colors"/>
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
                <p className="text-[10px] sm:text-sm font-bold text-neutral-600 mt-2 uppercase tracking-widest text-center">Aguardando importação.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
