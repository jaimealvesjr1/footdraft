// src/pages/Admin.tsx
import { useState, useEffect } from 'react';
import { type Clube, type GamePhase, type GameState, type Posicao, type Jogador } from '../types'; 
import { doc, setDoc, deleteDoc, onSnapshot, getDocs, collection, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase'; 
import { simularPartida } from '../services/matchEngine';

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

  // ==========================================
  // LÓGICA 3: IMPORTAÇÃO E EDIÇÃO
  // ==========================================
  const promptParaIA = termoBusca ? `Gere um arquivo JSON com os 11 jogadores titulares do elenco do ${termoBusca}. ATENÇÃO: O 'id' de cada jogador deve ser único e no formato 'nome-time-ano-nome-jogador' (ex: 'cruzeiro-2003-gomes'). REGRAS OBRIGATÓRIAS: A propriedade 'posicao' DEVE conter EXATAMENTE E APENAS uma destas 4 opções: "GOL", "DEF", "MEI" ou "ATA". É estritamente proibido usar ZAG, VOL, LD, LE, SA, etc. Classifique os defesas todos como "DEF" e médios como "MEI". Siga esta estrutura:\n{\n  "id": "${termoBusca.toLowerCase().replace(/\s+/g, '-')}",\n  "nome": "${termoBusca.replace(/\d+/g, '').trim()}",\n  "ano": ${termoBusca.replace(/\D/g, '') || 2000},\n  "elenco": [\n    { "id": "cruzeiro-2003-gomes", "nome": "Gomes", "posicao": "GOL", "clubeHistorico": "${termoBusca}", "overall": 85, "statusFisico": { "cansaco": 0, "lesionado": false, "suspenso": false }, "temporadasNoClube": 0 }\n  ]\n}` : '';

  const carregarJson = () => {
    try {
      setErroJson(''); 
      const obj = JSON.parse(jsonImportado) as Clube;
      if (!obj.elenco) throw new Error('O JSON não possui a propriedade "elenco".');
      setClubeEmEdicao(obj); 
    } catch (error) {
      setErroJson('Erro ao ler o JSON: ' + (error as Error).message);
    }
  };

  const handleEditJogador = (idJogador: string, campo: string, valor: any) => {
    setClubeEmEdicao(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        elenco: prev.elenco.map(j => j.id === idJogador ? { ...j, [campo]: valor } : j)
      };
    });
  };

  const salvarClube = async () => {
    if (!clubeEmEdicao) return;
    setSalvando(true);
    
    try {
      // 1. Criamos o nome formatado (Ex: "Cruzeiro 2003")
      const nomeCompletoClube = `${clubeEmEdicao.nome} ${clubeEmEdicao.ano}`.trim();

      // 2. Sanitização: Limpamos o elenco antes de salvar
      const clubeSanitizado = {
        ...clubeEmEdicao,
        elenco: clubeEmEdicao.elenco.map(jogador => ({
          ...jogador,
          clubeHistorico: nomeCompletoClube, // Atualiza o nome que aparece na carta
          statusFisico: { 
            cansaco: 0, 
            lesionado: false, 
            suspenso: false 
          } // Cura todo mundo e tira os cartões
        }))
      };

      // 3. Salvamos o clube já higienizado no banco de dados
      await setDoc(doc(db, "clubes", clubeSanitizado.id), clubeSanitizado);
      
      alert(`✅ O time ${clubeSanitizado.nome} foi salvo! Todos os jogadores estão a 100% e com o nome corrigido.`);
      
      // Limpa os campos do formulário
      setClubeEmEdicao(null); 
      setJsonImportado(''); 
      setTermoBusca('');
      
    } catch (error) { 
      alert("❌ Erro ao salvar."); 
    } finally { 
      setSalvando(false); 
    }
  };

  const excluirClube = async (idClube: string) => {
    if (window.confirm("ATENÇÃO! Excluir este time do banco de dados definitivamente?")) {
      await deleteDoc(doc(db, "clubes", idClube));
    }
  };

  // ==========================================
  // MOTOR DE CAMPEONATO: SIMULAR RODADA SÍNCRONA
  // ==========================================
  const simularRodadaAtual = async () => {
    if (!gameState || !gameState.schedule || !gameState.standings) return;
    setSalvando(true);

    const rodadaIndex = gameState.currentRound - 1;
    const rodadaAtualData = gameState.schedule[rodadaIndex];
    if (!rodadaAtualData) { setSalvando(false); return; }
    
    const jogos = rodadaAtualData.jogos;
    let novosStandings = [...gameState.standings];

    for (let jogo of jogos) {
      const isHomeUser = gameState.teams?.find(t => t.id === jogo.homeId)?.isUser || false;
      const isAwayUser = gameState.teams?.find(t => t.id === jogo.awayId)?.isUser || false;
      
      const homeDoc = await getDoc(doc(db, isHomeUser ? "usuarios" : "clubes", jogo.homeId));
      const awayDoc = await getDoc(doc(db, isAwayUser ? "usuarios" : "clubes", jogo.awayId));
      
      const homeElencoCompleto = homeDoc.data()?.elenco as Jogador[] || [];
      const awayElencoCompleto = awayDoc.data()?.elenco as Jogador[] || [];

      const homeTitulares = isHomeUser ? homeElencoCompleto.filter(j => homeDoc.data()?.titularesIds?.includes(j.id)) : homeElencoCompleto.slice(0, 11);
      const awayTitulares = isAwayUser ? awayElencoCompleto.filter(j => awayDoc.data()?.titularesIds?.includes(j.id)) : awayElencoCompleto.slice(0, 11);

      const resultado = simularPartida(homeTitulares, awayTitulares);
      jogo.homeScore = resultado.golsCasa;
      jogo.awayScore = resultado.golsFora;
      jogo.relatorio = resultado.relatorio;

      const mergeRoster = (elencoInteiro: Jogador[], titularesCansados: Jogador[]) => {
        return elencoInteiro.map(j => {
          const jogou = titularesCansados.find(s => s.id === j.id);
          if (jogou) return jogou; 
          
          let status = { ...(j.statusFisico || { cansaco: 0, lesionado: false, suspenso: false }) };
          status.cansaco = Math.max(0, status.cansaco - 15);
          status.suspenso = false; 
          return { ...j, statusFisico: status };
        });
      };

      const novoHomeElenco = mergeRoster(homeElencoCompleto, resultado.homeTeamUpdated);
      const novoAwayElenco = mergeRoster(awayElencoCompleto, resultado.awayTeamUpdated);

      await updateDoc(doc(db, isHomeUser ? "usuarios" : "clubes", jogo.homeId), { elenco: novoHomeElenco });
      await updateDoc(doc(db, isAwayUser ? "usuarios" : "clubes", jogo.awayId), { elenco: novoAwayElenco });

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

    let updatedSchedule = gameState.schedule.map((rodada, index) => {
      if (index === rodadaIndex) {
        return { jogos: jogos }; 
      }
      return rodada; 
    });

    await updateDoc(doc(db, "game", "state"), {
      schedule: updatedSchedule,
      standings: novosStandings,
      currentRound: gameState.currentRound + 1,
      playersReady: []
    });

    setSalvando(false);
    alert("⚽ Rodada Simulada com Sucesso! Os jogadores já podem ver os resultados e o Cansaço das equipas.");
  };

  // ==========================================
  // MOTOR DE ADMINISTRAÇÃO: BOTÃO NUCLEAR (RESET)
  // ==========================================
  const resetarPreTemporada = async () => {
    if (!window.confirm("🚨 ATENÇÃO LÍDER! Isso vai APAGAR o elenco de todos os jogadores reais e voltar o jogo para a Sala de Espera. Tem certeza absoluta?")) return;

    setSalvando(true);
    try {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const promessasDeLimpeza: Promise<void>[] = [];

      usersSnap.forEach(documento => {
        const atualizarUser = updateDoc(doc(db, "usuarios", documento.id), {
          elenco: [],
          elencoPronto: false,
          titularesIds: []
        });
        promessasDeLimpeza.push(atualizarUser);
      });

      await Promise.all(promessasDeLimpeza);

      await setDoc(doc(db, "game", "state"), {
        phase: 'SETUP',
        currentRound: 1,
        draftOrder: [],
        draftTurnUid: null,
        draftDeadline: null,
        playersReady: [],
        currentPack: [],
        currentPicks: [],
        teams: [],
        standings: [],
        schedule: []
      });

      alert("♻️ Reset concluído com sucesso! Todos os elencos foram apagados e o jogo voltou para a Sala de Espera.");
    } catch (error) {
      console.error(error);
      alert("❌ Erro ao resetar os elencos.");
    } finally {
      setSalvando(false);
    }
  };

  // ==========================================
  // O MOTOR QUE GERA A TABELA DO CAMPEONATO
  // ==========================================
  const gerarCampeonato = async () => {
    try {
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const times: { id: string; nome: string; isUser: boolean }[] = [];

      usersSnap.forEach((docSnap) => {
        const dados = docSnap.data();
        if (dados.nomeTime) {
          times.push({ id: docSnap.id, nome: String(dados.nomeTime), isUser: true });
        }
      });

      const botsSnap = await getDocs(collection(db, "clubes"));
      const clubesBots: { id: string; nome: string; isUser: boolean }[] = [];
      
      botsSnap.forEach(d => {
        const dados = d.data();
        if (dados.elenco && Array.isArray(dados.elenco) && dados.elenco.length >= 11) {
          const nomeClube = dados.nome ? String(dados.nome) : "Clube Desconhecido";
          const anoClube = dados.ano ? String(dados.ano) : "";
          
          clubesBots.push({ 
            id: d.id, 
            nome: `${nomeClube} ${anoClube}`.trim(), 
            isUser: false 
          });
        }
      });
      
      clubesBots.sort(() => Math.random() - 0.5);

      const TOTAL_TIMES = 12;
      while (times.length < TOTAL_TIMES && clubesBots.length > 0) {
        const bot = clubesBots.pop();
        if (bot) times.push(bot);
      }

      if (times.length < TOTAL_TIMES) {
        alert(`Atenção: Tem apenas ${times.length} times disponíveis (Usuários + Clubes). Precisa de 12 para iniciar a Liga. Importe mais times no Admin!`);
        return; 
      }

      const standings = times.map(t => ({
        id: t.id, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0   
      }));

      const numRodadas = TOTAL_TIMES - 1;
      const metade = TOTAL_TIMES / 2;
      const schedule: { jogos: any[] }[] = []; 
      
      let idsRotacao = times.map(t => t.id);

      for (let rodada = 0; rodada < numRodadas; rodada++) {
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
        
        schedule.push({ jogos: jogosDaRodada }); 

        const ultimoId = idsRotacao.pop();
        if (ultimoId) idsRotacao.splice(1, 0, ultimoId);
      }

      await updateDoc(doc(db, "game", "state"), {
        teams: times,
        standings: standings,
        schedule: schedule,
        currentRound: 1, 
        phase: 'CHAMPIONSHIP' 
      });

      alert("🏆 Campeonato Gerado com Sucesso! Foram criadas 11 rodadas para 12 equipas.");

    } catch (error) {
      console.error("Erro ao gerar campeonato:", error);
      alert("Ocorreu um erro ao gerar a tabela. Verifique a consola para mais detalhes.");
    }
  };

  // ==========================================
  // RENDERIZAÇÃO E INTERFACE
  // ==========================================
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Painel do <span className="text-yellow-500">Game Master</span></h1>

        <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 shadow-xl shadow-yellow-900/10">
          <h2 className="font-black text-xl text-yellow-400 mb-4 uppercase tracking-widest">Controle do Campeonato (Multiplayer)</h2>
          
          <div className="flex flex-wrap gap-3 mb-4">
            <button onClick={() => mudarFase('SETUP')} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 font-bold rounded text-white shadow-lg transition-all">1. Sala de Espera</button>
            <button onClick={iniciarPreTemporada} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-yellow-500/50 text-yellow-500 font-bold rounded shadow-lg transition-all">2. Iniciar Pré-Temporada</button>
            <button 
              onClick={gerarCampeonato}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg mt-4"
            >
              🏆 Iniciar Campeonato (Gerar Tabela de Jogos)
            </button>
            <button onClick={simularRodadaAtual} disabled={salvando} className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 font-black tracking-widest uppercase rounded text-white shadow-lg transition-all">
               {salvando ? 'A Simular...' : 'Simular Rodada Atual ⚽'}
            </button>
            <button onClick={() => mudarFase('TRANSFER_WINDOW')} className="px-4 py-2 bg-purple-900 hover:bg-purple-800 text-purple-300 font-bold rounded shadow-lg transition-all">Janela de Transf.</button>
            
            <button onClick={resetarPreTemporada} disabled={salvando} className="px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-700 text-red-500 font-black tracking-widest uppercase rounded shadow-lg transition-all ml-auto">
              {salvando ? 'LIMPANDO...' : '🚨 Resetar Tudo'}
            </button>
          </div>
          
          <p className="text-sm text-neutral-400 font-bold uppercase tracking-widest">Fase: <strong className="text-yellow-400">{gameState?.phase || '...'}</strong> | Rodada: <strong className="text-cyan-400">{gameState?.currentRound}</strong></p>
          <p className="text-sm text-neutral-400 mt-2">Jogadores Prontos para a rodada: <strong className="text-white">{gameState?.playersReady?.length || 0}</strong></p>
        </div>

        {/* GERENCIADOR DE CLUBES (DB e Importação) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="space-y-8">
            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
              <h2 className="font-bold text-lg text-white mb-4 uppercase tracking-widest">Importar JSON (IA)</h2>
              <input type="text" placeholder="Prompt (Ex: Cruzeiro 2003)" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 rounded mb-2 focus:border-yellow-500 outline-none"/>
              {promptParaIA && <button onClick={() => navigator.clipboard.writeText(promptParaIA)} className="w-full mb-4 text-xs bg-cyan-900/30 text-cyan-400 py-2 rounded font-bold uppercase tracking-widest hover:bg-cyan-900/50 transition-colors">Copiar Prompt</button>}
              <textarea placeholder='Cole o JSON...' value={jsonImportado} onChange={(e) => setJsonImportado(e.target.value)} className="w-full h-32 p-2 bg-neutral-950 border border-neutral-800 rounded text-xs text-yellow-500 font-mono mb-2 focus:border-yellow-500 outline-none"/>
              <button onClick={carregarJson} disabled={!jsonImportado} className="w-full bg-yellow-500 text-neutral-950 py-2 rounded font-black uppercase tracking-widest hover:bg-yellow-400 disabled:opacity-50 transition-colors">Analisar e Editar</button>
              {erroJson && <p className="text-orange-500 text-xs mt-2 font-bold">{erroJson}</p>}
            </div>

            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 max-h-96 overflow-y-auto custom-scrollbar">
              <h2 className="font-bold text-lg text-white mb-4 uppercase tracking-widest">Clubes no Banco ({clubesSalvos.length})</h2>
              {clubesSalvos.map(clube => (
                <div key={clube.id} className="flex justify-between items-center bg-neutral-950 p-3 mb-2 rounded border border-neutral-800 hover:border-neutral-700 transition-colors">
                  <div>
                    <p className="font-black text-white uppercase">{clube.nome} <span className="text-yellow-500">{clube.ano}</span></p>
                    <p className="text-xs text-cyan-400 font-bold tracking-widest">{clube.elenco.length} Jogadores</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setClubeEmEdicao(clube)} className="text-xs bg-neutral-800 px-3 py-2 rounded font-bold text-white hover:bg-neutral-700 hover:text-yellow-400 transition-colors">✏️ Editar</button>
                    <button onClick={() => excluirClube(clube.id)} className="text-xs bg-red-950/50 px-3 py-2 rounded font-bold hover:bg-red-900 transition-colors">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LADO DIREITO: EDITOR DO CLUBE */}
          <div className="lg:col-span-2">
            {clubeEmEdicao ? (
              <div className="bg-neutral-900 p-6 rounded-xl border border-yellow-500 shadow-[0_0_20px_rgba(250,204,21,0.1)]">
                <div className="flex justify-between items-center mb-6 border-b border-neutral-800 pb-4">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">Editor de Elenco</h2>
                  <div className="flex gap-4">
                    <button onClick={() => setClubeEmEdicao(null)} className="px-4 py-2 bg-neutral-800 rounded font-bold text-white hover:bg-neutral-700 transition-colors">Cancelar</button>
                    <button onClick={salvarClube} disabled={salvando} className="px-4 py-2 bg-yellow-500 rounded font-black uppercase tracking-widest text-neutral-950 hover:bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)] transition-colors">{salvando ? 'Salvando...' : 'Salvar Alterações'}</button>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-cyan-400 uppercase tracking-widest mb-1">Nome do Clube</label>
                    <input type="text" value={clubeEmEdicao.nome} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, nome: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded text-white font-black uppercase focus:border-yellow-500 outline-none transition-colors"/>
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-bold text-cyan-400 uppercase tracking-widest mb-1">Ano</label>
                    <input type="number" value={clubeEmEdicao.ano} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, ano: Number(e.target.value)})} className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded text-yellow-500 font-black text-center focus:border-yellow-500 outline-none transition-colors"/>
                  </div>
                </div>

                <div className="space-y-2 max-h-150 overflow-y-auto custom-scrollbar pr-2">
                  {clubeEmEdicao.elenco.map((jogador, index) => (
                    <div key={jogador.id || index} className="grid grid-cols-12 gap-2 bg-neutral-950 p-3 rounded-lg border border-neutral-800 items-center hover:border-neutral-600 transition-colors">
                      
                      <div className="col-span-6 md:col-span-5">
                        <label className="block text-[10px] text-neutral-500 uppercase font-bold mb-1 tracking-widest">Jogador</label>
                        <input type="text" value={jogador.nome} onChange={(e) => handleEditJogador(jogador.id, 'nome', e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded text-white text-sm font-bold focus:border-yellow-500 outline-none transition-colors"/>
                      </div>

                      <div className="col-span-3 md:col-span-3">
                        <label className="block text-[10px] text-neutral-500 uppercase font-bold mb-1 tracking-widest">Posição</label>
                        <select value={jogador.posicao} onChange={(e) => handleEditJogador(jogador.id, 'posicao', e.target.value as Posicao)} className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded text-cyan-400 text-sm font-black focus:border-yellow-500 outline-none transition-colors">
                          <option value="GOL">GOL</option>
                          <option value="DEF">DEF</option>
                          <option value="MEI">MEI</option>
                          <option value="ATA">ATA</option>
                        </select>
                      </div>

                      <div className="col-span-3 md:col-span-2">
                        <label className="block text-[10px] text-neutral-500 uppercase font-bold mb-1 tracking-widest">OVR</label>
                        <input type="number" value={jogador.overall} onChange={(e) => handleEditJogador(jogador.id, 'overall', Number(e.target.value))} className="w-full bg-neutral-900 border border-neutral-800 p-2 rounded text-yellow-500 font-black text-center text-sm focus:border-yellow-500 outline-none transition-colors"/>
                      </div>

                      <div className="hidden md:flex col-span-2 items-center justify-center gap-2 pt-4">
                        <span className={`text-xs ${jogador.statusFisico?.lesionado ? 'text-red-500' : 'text-neutral-700 opacity-30'}`} title="Lesionado">🏥</span>
                        <span className={`text-xs ${jogador.statusFisico?.suspenso ? 'text-orange-500' : 'text-neutral-700 opacity-30'}`} title="Suspenso">🟥</span>
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-xl p-10 text-neutral-600 bg-neutral-900/50">
                <span className="text-6xl mb-4 grayscale opacity-50">⚙️</span>
                <p className="font-black text-xl uppercase tracking-widest text-neutral-500">Editor de Elenco</p>
                <p className="text-sm font-bold text-neutral-600 mt-2">Importe um JSON ou clique em "Editar" na lista ao lado.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
