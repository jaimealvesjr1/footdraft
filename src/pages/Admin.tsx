import { useState, useEffect } from 'react';
import { type Clube, type GamePhase, type GameState, type Posicao, type Jogador } from '../types'; 
import { doc, setDoc, deleteDoc, onSnapshot, getDocs, collection, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase'; 
import { simularPartidaV2 } from '../services/matchEngine';

export default function Admin() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [clubesSalvos, setClubesSalvos] = useState<Clube[]>([]);
  const [termoBusca, setTermoBusca] = useState('');
  const [jsonImportado, setJsonImportado] = useState('');
  const [erroJson, setErroJson] = useState('');
  
  const [clubeEmEdicao, setClubeEmEdicao] = useState<Clube | null>(null);
  const [salvando, setSalvando] = useState(false);

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
    if (window.confirm(`Mudar o jogo para a fase: ${novaFase}?`)) {
      await setDoc(doc(db, "game", "state"), { phase: novaFase }, { merge: true });
    }
  };

  const iniciarPreTemporada = async () => {
    if (!window.confirm("Iniciar a Pré-Temporada? O sistema sorteará a ordem.")) return;
    try {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      let uidsRegistrados: string[] = [];
      usersSnap.forEach(doc => { if (doc.data().nomeTime) uidsRegistrados.push(doc.id); });

      if (uidsRegistrados.length === 0) return alert("Nenhum jogador na Sala de Espera!");

      const ordemSorteada = uidsRegistrados.sort(() => Math.random() - 0.5);
      await setDoc(doc(db, "game", "state"), {
        phase: 'PRE_SEASON', currentRound: 1, draftOrder: ordemSorteada,
        draftTurnUid: ordemSorteada[0], draftDeadline: Date.now() + (3 * 60 * 1000), playersReady: []
      }, { merge: true });

      alert(`✅ Pré-Temporada iniciada com ${ordemSorteada.length} jogadores!`);
    } catch (error) { console.error(error); alert("❌ Erro ao iniciar."); }
  };

  const promptParaIA = termoBusca ? `Gere um arquivo JSON com os 11 jogadores titulares do elenco do ${termoBusca}. ATENÇÃO: O 'id' de cada jogador deve ser único e no formato 'nome-time-ano-nome-jogador' (ex: 'cruzeiro-2003-gomes'). REGRAS OBRIGATÓRIAS: A propriedade 'posicao' DEVE conter EXATAMENTE E APENAS uma destas 4 opções: "GOL", "DEF", "MEI" ou "ATA". É estritamente proibido usar ZAG, VOL, LD, LE, SA, etc. Classifique os defesas todos como "DEF" e médios como "MEI". Siga esta estrutura:\n{\n  "id": "${termoBusca.toLowerCase().replace(/\s+/g, '-')}",\n  "nome": "${termoBusca.replace(/\d+/g, '').trim()}",\n  "ano": ${termoBusca.replace(/\D/g, '') || 2000},\n  "elenco": [\n    { "id": "cruzeiro-2003-gomes", "nome": "Gomes", "posicao": "GOL", "clubeHistorico": "${termoBusca}", "overall": 85, "statusFisico": { "cansaco": 1, "lesionado": false, "suspenso": false }, "temporadasNoClube": 0 }\n  ]\n}` : '';

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
    setSalvando(true);
    try {
      const nomeCompletoClube = `${clubeEmEdicao.nome} ${clubeEmEdicao.ano}`.trim();
      const clubeSanitizado = {
        ...clubeEmEdicao,
        elenco: clubeEmEdicao.elenco.map(jogador => ({
          ...jogador, clubeHistorico: nomeCompletoClube, statusFisico: { cansaco: 1, lesionado: false, suspenso: false }
        }))
      };
      await setDoc(doc(db, "clubes", clubeSanitizado.id), clubeSanitizado);
      alert(`✅ O time ${clubeSanitizado.nome} foi salvo!`);
      setClubeEmEdicao(null); setJsonImportado(''); setTermoBusca('');
    } catch (error) { alert("❌ Erro ao salvar."); } finally { setSalvando(false); }
  };

  const excluirClube = async (idClube: string) => {
    if (window.confirm("ATENÇÃO! Excluir este time do banco de dados definitivamente?")) await deleteDoc(doc(db, "clubes", idClube));
  };

  const gerarCampeonato = async () => {
    try {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const times: { id: string; nome: string; isUser: boolean }[] = [];
      usersSnap.forEach((docSnap) => {
        const dados = docSnap.data();
        if (dados.nomeTime) times.push({ id: docSnap.id, nome: String(dados.nomeTime), isUser: true });
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

      const TOTAL_TIMES = 20;
      while (times.length < TOTAL_TIMES && clubesBots.length > 0) times.push(clubesBots.pop()!);

      if (times.length < TOTAL_TIMES) {
        alert(`Atenção: Tem apenas ${times.length} times disponíveis. Precisa de 20. Adicione mais clubes no banco de dados!`);
        return; 
      }

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
        currentRound: 1, phase: 'FIRST_HALF' 
      });

      alert("🏆 Campeonato Gerado com Sucesso! Foram criadas 38 rodadas (Ida e Volta).");
    } catch (error) { console.error(error); alert("Erro ao gerar tabela."); }
  };

  // ==================================================
  // MOTOR PROTEGIDO COM TRY...CATCH PARA EVITAR TRAVAMENTOS
  // ==================================================
  const simularRodadaAtual = async () => {
    if (!gameState || !gameState.schedule || !gameState.standings) return;
    
    // Inicia o estado de salvamento (desativa o botão)
    setSalvando(true);

    try {
      const rodadaIndex = gameState.currentRound - 1;
      const rodadaAtualData = gameState.schedule[rodadaIndex];
      
      if (!rodadaAtualData) {
        throw new Error("Rodada não encontrada. O Campeonato já terminou?");
      }
      
      const jogos = rodadaAtualData.jogos;
      let novosStandings = [...gameState.standings];

      for (let jogo of jogos) {
        const isHomeUser = (gameState.teams || []).find(t => t.id === jogo.homeId)?.isUser || false;
        const isAwayUser = (gameState.teams || []).find(t => t.id === jogo.awayId)?.isUser || false;
        
        const homeDoc = await getDoc(doc(db, isHomeUser ? "usuarios" : "clubes", jogo.homeId));
        const awayDoc = await getDoc(doc(db, isAwayUser ? "usuarios" : "clubes", jogo.awayId));
        
        const homeElenco = homeDoc.data()?.elenco as Jogador[] || [];
        const awayElenco = awayDoc.data()?.elenco as Jogador[] || [];

        const homeTitularesIds = homeDoc.data()?.titularesIds || [];
        const awayTitularesIds = awayDoc.data()?.titularesIds || [];

        // Garante a ordem dos slots para o Fator P funcionar e não embaralhar a escalação
        const homeTitulares = isHomeUser 
          ? homeTitularesIds.map((id: string) => homeElenco.find(j => j.id === id)).filter(Boolean) as Jogador[]
          : homeElenco.slice(0, 11);

        const awayTitulares = isAwayUser 
          ? awayTitularesIds.map((id: string) => awayElenco.find(j => j.id === id)).filter(Boolean) as Jogador[]
          : awayElenco.slice(0, 11);

        // 🚨 TRAVA DE SEGURANÇA QUE IMPEDE O BOTÃO DE CONGELAR
        if (homeTitulares.length === 0) {
          throw new Error(`O time mandante (ID: ${jogo.homeId}) não tem jogadores escalados! Se for um jogador real, peça para ele abrir o Vestiário e salvar a escalação.`);
        }
        if (awayTitulares.length === 0) {
          throw new Error(`O time visitante (ID: ${jogo.awayId}) não tem jogadores escalados! Se for um jogador real, peça para ele abrir o Vestiário e salvar a escalação.`);
        }

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
          if (!jogador) return jogador; // 🚨 TRAVA: Se o banco tiver um jogador nulo/corrompido, ignora.

          let status = {
            cansaco: jogador.statusFisico?.cansaco ?? 1,
              lesionado: jogador.statusFisico?.lesionado ?? false,
              suspenso: jogador.statusFisico?.suspenso ?? false, 
              amarelos: (jogador.statusFisico as any)?.amarelos ?? 0
            };

            const isTitular = titularesIdsValidos.length > 0 
              ? titularesIdsValidos.includes(jogador.id) 
              : elencoCompleto.indexOf(jogador) < 11;
              
            const eventosDesteJogador = resultado.relatorio.filter((e: any) => e.jogadorId === jogador.id && e.time === (isCasa ? 'CASA' : 'FORA'));
            
            if (!isTitular && status.suspenso) status.suspenso = false;

            if (isTitular) {
              if (!status.lesionado) status.cansaco = resetarCansaco ? 1 : Math.min(5, status.cansaco + 1);
              if (eventosDesteJogador.some((e: any) => e.tipo === 'LESAO')) status.lesionado = true;
              
              const amarelosNaPartida = eventosDesteJogador.filter((e: any) => e.tipo === 'CARTAO_AMARELO').length;
              const vermelhoNaPartida = eventosDesteJogador.some((e: any) => e.tipo === 'CARTAO_VERMELHO');

              if (vermelhoNaPartida) { 
                status.suspenso = true; 
                status.amarelos = 0; 
              }
              else if (amarelosNaPartida > 0) {
                status.amarelos += amarelosNaPartida;
                if (status.amarelos >= 2) { 
                  status.suspenso = true; 
                  status.amarelos = 0; 
                }
              }
            } else {
              if (status.lesionado) {
                status.cansaco = Math.max(1, status.cansaco - 1);
                if (status.cansaco === 1) {
                  status.lesionado = false;
                }
              } else {
                if (status.cansaco > 1) status.cansaco = Math.max(1, status.cansaco - 2);
              }
              if (resetarCansaco) {
                 status.cansaco = 1;
                 status.lesionado = false;
              }
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
      let mensagemAlert = "⚽ Rodada Simulada com Sucesso!";

      if (gameState.currentRound === 19) {
        mensagemAlert = "🏁 FIM DO 1º TURNO! Abra a janela de transferências antes de prosseguir.";
      } else if (gameState.currentRound === 38) {
        proximaFase = 'FINISHED'; 
        mensagemAlert = "🏆 CAMPEONATO ENCERRADO! A rodada final foi simulada.";
      }

      await updateDoc(doc(db, "game", "state"), {
        schedule: updatedSchedule, standings: novosStandings, currentRound: gameState.currentRound + 1,
        phase: proximaFase, playersReady: []
      });

      // Se tudo correu bem, emite o alerta de sucesso
      alert(mensagemAlert);

    } catch (error) {
      // 🚨 CASO ACONTEÇA UM ERRO NO CÓDIGO (COMO TIME SEM JOGADORES), ELE CAI AQUI!
      console.error("Erro na Simulação:", error);
      alert(`❌ Erro Crítico na Simulação: ${(error as Error).message}`);
      
    } finally {
      // O FINALLY sempre executa. É a garantia de que o botão vai ser destravado!
      setSalvando(false);
    }
  };

  const iniciarJanelaTransferencias = async () => {
    if (!gameState || !gameState.standings || !gameState.teams) return;
    if (!window.confirm("📢 Abrir Janela de Transferências?")) return;
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
      alert("✅ Janela de Transferências aberta!");
    } catch (error) { alert("❌ Erro ao processar as transferências."); } finally { setSalvando(false); }
  };

  const iniciarReturno = async () => {
    if (!window.confirm("▶️ Iniciar o Returno?")) return;
    setSalvando(true);
    try { await updateDoc(doc(db, "game", "state"), { phase: 'SECOND_HALF', draftTurnUid: null, draftOrder: [] }); alert("✅ Returno iniciado! (Fase definida como SECOND_HALF)"); } 
    catch (error) { alert("❌ Erro."); } finally { setSalvando(false); }
  };

  const resetarPreTemporada = async () => {
    if (!window.confirm("🚨 ATENÇÃO! Apagar elencos dos usuários, restaurar a saúde dos bots e voltar à Sala de Espera?")) return;
    setSalvando(true);
    try {
      // 1. Zera os elencos dos jogadores humanos
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const promessasUsuarios = usersSnap.docs.map(docSnap => updateDoc(doc(db, "usuarios", docSnap.id), { elenco: [], elencoPronto: false, titularesIds: [] }));
      
      // 2. Restaura 100% da saúde, cartões e energia de todos os times Bots (clubes base)
      const clubesSnap = await getDocs(collection(db, "clubes"));
      const promessasClubes = clubesSnap.docs.map(docSnap => {
        const clubeData = docSnap.data() as Clube;
        const elencoCurado = clubeData.elenco.map(j => ({
          ...j,
          statusFisico: { cansaco: 1, lesionado: false, suspenso: false, amarelos: 0 }
        }));
        return updateDoc(doc(db, "clubes", docSnap.id), { elenco: elencoCurado });
      });

      // Executa as duas limpezas simultaneamente
      await Promise.all([...promessasUsuarios, ...promessasClubes]);
      
      // 3. Reseta o status geral do campeonato
      await setDoc(doc(db, "game", "state"), { phase: 'SETUP', currentRound: 1, draftOrder: [], draftTurnUid: null, playersReady: [], teams: [], standings: [], schedule: [] });
      alert("♻️ Reset concluído! O DM de todos os clubes foi esvaziado e os cartões zerados.");
    } catch (error) { alert("❌ Erro ao resetar o servidor."); } finally { setSalvando(false); }
  };

  // Calcula OVR médio de um clube (Top 11 jogadores)
  const getClubeOvr = (elenco: Jogador[]) => {
    if (!elenco || elenco.length < 11) return 0;
    const sorted = [...elenco].sort((a, b) => b.overall - a.overall).slice(0, 11);
    const sum = sorted.reduce((acc, j) => acc + j.overall, 0);
    return Math.round(sum / 11);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 font-fifa">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* CABEÇALHO COM INFOS DA SALA E BARRA DE PROGRESSO */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-xl gap-6">
          <div className="flex-1 w-full">
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Painel do <span className="text-fifa-blue">Game Master</span></h1>
            <p className="text-sm text-neutral-400 mt-2 font-bold tracking-widest uppercase">
              Fase Atual: <span className="text-fifa-green">{gameState?.phase || '...'}</span> | Rodada: <span className="text-fifa-blue">{gameState?.currentRound || 0}</span>/38
            </p>
            {/* Barra de Progresso */}
            <div className="mt-4 w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
              <div className="bg-linear-to-r from-fifa-green via-fifa-blue to-fifa-red h-full transition-all duration-1000" style={{ width: `${Math.min(100, ((gameState?.currentRound || 0) / 38) * 100)}%` }}></div>
            </div>
          </div>
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 text-center shrink-0 min-w-40">
            <p className="text-xs text-neutral-500 uppercase font-black">Jogadores Prontos</p>
            <p className="text-3xl font-black text-fifa-green">{gameState?.playersReady?.length || 0}</p>
          </div>
        </div>

        {/* NOVA ÁREA DE BOTÕES ORGANIZADOS POR GRUPOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900 p-5 rounded-xl border border-neutral-800 flex flex-col gap-3">
            <h3 className="text-xs text-neutral-500 font-black uppercase tracking-widest border-b border-neutral-800 pb-2">1. Preparação</h3>
            <button onClick={() => mudarFase('SETUP')} className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 font-bold rounded text-white shadow transition-all text-sm">Sala de Espera</button>
            <button onClick={iniciarPreTemporada} className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-fifa-gray-light font-bold rounded shadow transition-all text-sm">Iniciar Pré-Temporada</button>
          </div>

          <div className="bg-neutral-900 p-5 rounded-xl border-t-4 border-t-fifa-blue flex flex-col gap-3 shadow-lg">
            <h3 className="text-xs text-fifa-blue font-black uppercase tracking-widest border-b border-neutral-800 pb-2">2. Campeonato</h3>
            <button onClick={gerarCampeonato} className="w-full py-2 bg-fifa-blue/20 hover:bg-fifa-blue/30 border border-fifa-blue/50 text-fifa-blue font-bold rounded shadow transition-all text-sm uppercase tracking-widest">Gerar Tabela (38 RDs)</button>
            <button onClick={simularRodadaAtual} disabled={salvando} className="w-full py-3 bg-fifa-blue hover:bg-opacity-80 font-black rounded text-white shadow-lg transition-all uppercase tracking-widest mt-auto">
              {salvando ? 'A Processar...' : `Simular Rodada ${Math.min(38, gameState?.currentRound || 1)}`}
            </button>
          </div>

          <div className="bg-neutral-900 p-5 rounded-xl border-t-4 border-t-fifa-green flex flex-col gap-3 shadow-lg">
            <h3 className="text-xs text-fifa-green font-black uppercase tracking-widest border-b border-neutral-800 pb-2">3. Meio de Temporada</h3>
            <button onClick={iniciarJanelaTransferencias} className="w-full py-2 bg-fifa-green/20 hover:bg-fifa-green/30 border border-fifa-green/50 text-fifa-green font-bold rounded shadow transition-all text-sm">Abrir Janela de Transf.</button>
            <button onClick={iniciarReturno} className="w-full py-2 bg-fifa-green hover:bg-opacity-80 text-white font-bold rounded shadow transition-all text-sm mt-auto">Iniciar Returno ▶️</button>
          </div>

          <div className="bg-fifa-red/10 p-5 rounded-xl border border-fifa-red/30 flex flex-col justify-end">
            <button onClick={resetarPreTemporada} disabled={salvando} className="w-full py-3 bg-fifa-red/20 hover:bg-fifa-red/40 border border-fifa-red/50 text-fifa-red font-black tracking-widest uppercase rounded shadow transition-all">🚨 Resetar Servidor</button>
          </div>
        </div>

        {/* GERENCIADOR DE CLUBES */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8 border-t border-neutral-900">
          <div className="space-y-8">
            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-xl">
              <h2 className="font-black text-lg text-white mb-4 uppercase tracking-widest flex items-center gap-2"><span className="text-fifa-blue">🤖</span> Importar JSON</h2>
              <input type="text" placeholder="Prompt (Ex: Cruzeiro 2003)" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 text-white p-3 rounded-xl mb-3 focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue outline-none transition-all placeholder:text-neutral-600 font-bold"/>
              {promptParaIA && <button onClick={() => navigator.clipboard.writeText(promptParaIA)} className="w-full mb-4 text-xs bg-fifa-blue/20 border border-fifa-blue/50 text-fifa-blue py-3 rounded-lg font-black uppercase tracking-widest hover:bg-fifa-blue/30 transition-colors">Copiar Prompt Gerado</button>}
              <textarea placeholder='Cole o JSON retornado pela IA aqui...' value={jsonImportado} onChange={(e) => setJsonImportado(e.target.value)} className="w-full h-32 p-4 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-fifa-green font-mono mb-4 focus:border-fifa-blue outline-none placeholder:text-neutral-700"/>
              <button onClick={carregarJson} disabled={!jsonImportado} className="w-full bg-fifa-blue text-white py-3 rounded-xl font-black uppercase tracking-widest hover:bg-opacity-80 disabled:opacity-50 transition-colors shadow-lg">Analisar e Editar JSON</button>
              {erroJson && <p className="text-orange-500 text-xs mt-3 font-bold bg-orange-950/30 p-2 rounded">{erroJson}</p>}
            </div>

            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-xl max-h-125 overflow-y-auto custom-scrollbar">
              <h2 className="font-black text-lg text-white mb-4 uppercase tracking-widest flex items-center justify-between">Banco de Clubes <span className="bg-neutral-800 text-neutral-400 text-xs py-1 px-3 rounded-full">{clubesSalvos.length}</span></h2>
              <div className="space-y-3">
                {clubesSalvos.map(clube => (
                  <div key={clube.id} className="flex justify-between items-center bg-neutral-950 p-4 rounded-xl border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/50 transition-all group">
                    <div>
                      <p className="font-black text-white uppercase tracking-tight">{clube.nome} <span className="text-fifa-green">{clube.ano}</span></p>
                      <p className="text-[10px] text-fifa-blue font-black uppercase tracking-widest mt-1">{clube.elenco.length} Atletas • OVR: {getClubeOvr(clube.elenco)}</p>
                    </div>
                    <div className="flex gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setClubeEmEdicao(clube)} className="text-xs bg-neutral-800 px-4 py-2 rounded-lg font-black text-white hover:bg-neutral-700 hover:text-fifa-blue transition-colors shadow-sm">Editar</button>
                      <button onClick={() => excluirClube(clube.id)} className="text-xs bg-fifa-red/20 text-fifa-red px-3 py-2 rounded-lg font-black hover:bg-fifa-red hover:text-white transition-colors">X</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {clubeEmEdicao ? (
              <div className="bg-neutral-900 p-6 rounded-xl border border-fifa-green/50 shadow-[0_0_30px_rgba(60,172,59,0.05)] flex flex-col h-full">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-neutral-800 pb-6 gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Inspetor de Elenco</h2>
                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">Ajuste OVR e posições antes de injetar na base.</p>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={() => setClubeEmEdicao(null)} className="flex-1 md:flex-none px-6 py-3 bg-neutral-800 rounded-xl font-black uppercase tracking-widest text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors">Descartar</button>
                    <button onClick={salvarClube} disabled={salvando} className="flex-1 md:flex-none px-6 py-3 bg-fifa-green rounded-xl font-black uppercase tracking-widest text-white hover:bg-opacity-80 shadow-[0_0_15px_rgba(60,172,59,0.3)] transition-colors">{salvando ? 'A Processar...' : 'Injetar na Base'}</button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-8">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-fifa-blue uppercase tracking-widest mb-2">Designação do Clube</label>
                    <input type="text" value={clubeEmEdicao.nome} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, nome: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 p-4 rounded-xl text-white font-black uppercase focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue outline-none transition-all"/>
                  </div>
                  <div className="w-full md:w-40">
                    <label className="block text-[10px] font-black text-fifa-blue uppercase tracking-widest mb-2">Temporada</label>
                    <input type="number" value={clubeEmEdicao.ano} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, ano: Number(e.target.value)})} className="w-full bg-neutral-950 border border-neutral-800 p-4 rounded-xl text-fifa-green font-black text-center focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue outline-none transition-all"/>
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex-1">
                  <div className="grid grid-cols-12 gap-4 px-4 pb-2 text-[10px] text-neutral-500 font-black uppercase tracking-widest border-b border-neutral-800 mb-4">
                    <div className="col-span-6 md:col-span-5">Atleta</div>
                    <div className="col-span-3 md:col-span-3">Setor</div>
                    <div className="col-span-3 md:col-span-2 text-center">OVR</div>
                  </div>
                  <div className="space-y-3 max-h-125 overflow-y-auto custom-scrollbar pr-2">
                    {clubeEmEdicao.elenco.map((jogador, index) => (
                      <div key={jogador.id || index} className="grid grid-cols-12 gap-4 bg-neutral-900/50 p-3 rounded-lg border border-neutral-800 items-center hover:border-neutral-700 transition-colors focus-within:border-fifa-blue/50">
                        <div className="col-span-6 md:col-span-5">
                          <input type="text" value={jogador.nome} onChange={(e) => handleEditJogador(jogador.id, 'nome', e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-lg text-white text-sm font-bold focus:border-fifa-blue outline-none transition-colors"/>
                        </div>
                        <div className="col-span-3 md:col-span-3">
                          <select value={jogador.posicao} onChange={(e) => handleEditJogador(jogador.id, 'posicao', e.target.value as Posicao)} className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-lg text-fifa-blue text-sm font-black focus:border-fifa-blue outline-none transition-colors cursor-pointer">
                            <option value="GOL">GOL</option><option value="DEF">DEF</option><option value="MEI">MEI</option><option value="ATA">ATA</option>
                          </select>
                        </div>
                        <div className="col-span-3 md:col-span-2">
                          <input type="number" value={jogador.overall} onChange={(e) => handleEditJogador(jogador.id, 'overall', Number(e.target.value))} className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-lg text-fifa-green font-black text-center text-sm focus:border-fifa-blue outline-none transition-colors"/>
                        </div>
                        <div className="hidden md:flex col-span-2 items-center justify-center gap-3">
                          <span className={`text-sm ${jogador.statusFisico?.lesionado ? 'text-red-500 drop-shadow-md' : 'text-neutral-700 opacity-20'}`} title="Risco de Lesão">🏥</span>
                          <span className={`text-sm ${jogador.statusFisico?.suspenso ? 'text-orange-500 drop-shadow-md' : 'text-neutral-700 opacity-20'}`} title="Suspenso">🟥</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-100 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-2xl p-10 text-neutral-600 bg-neutral-900/30">
                <span className="text-7xl mb-6 grayscale opacity-20">⚙️</span>
                <p className="font-black text-2xl uppercase tracking-tighter text-neutral-500">Inspetor de Elenco</p>
                <p className="text-sm font-bold text-neutral-600 mt-2 uppercase tracking-widest">Aguardando importação ou seleção.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
