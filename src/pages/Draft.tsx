// src/pages/Draft.tsx
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { type Jogador, type GameState, type Clube } from '../types';

const LIMITES = { GOL: 3, DEF: 6, MEI: 6, ATA: 6 };
const ESCOLHAS_POR_RODADA = 3;
const TEMPO_LIMITE_MS = 3 * 60 * 1000;

export default function Draft() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [tempoRestante, setTempoRestante] = useState<number>(180); 
  
  const currentUserUid = auth.currentUser?.uid;
  const isMyTurn = gameState?.draftTurnUid === currentUserUid;

  const [clubesDisponiveis, setClubesDisponiveis] = useState<Clube[]>([]);
  const [jaRerolou, setJaRerolou] = useState(false);
  const [jogadoresIndisponiveis, setJogadoresIndisponiveis] = useState<Record<string, string>>({});
  const [mapaUsuarios, setMapaUsuarios] = useState<Record<string, string>>({});
  
  const [pacoteAtual, setPacoteAtual] = useState<Jogador[]>([]);
  const [escolhasDaRodada, setEscolhasDaRodada] = useState<Jogador[]>([]);
  const [meuElenco, setMeuElenco] = useState<Jogador[]>([]);
  const [nomeTime, setNomeTime] = useState("Meu Time");

  const [carregando, setCarregando] = useState(true);

  // ==========================================
  // FUNÇÕES AUXILIARES E DE REGRAS TÁTICAS
  // (Declaradas no topo para evitar erros de escopo/TypeScript)
  // ==========================================
  const getPosicoesNecessarias = () => {
    const todosEscolhidos = [...meuElenco, ...escolhasDaRodada];
    const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    todosEscolhidos.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
    return Object.keys(LIMITES).filter(pos => {
      const p = pos as keyof typeof LIMITES;
      return contagem[p] < LIMITES[p];
    });
  };

  const podeEscolherMais = (posicao: string) => {
    const todosEscolhidos = [...meuElenco, ...escolhasDaRodada];
    const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    todosEscolhidos.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
    return contagem[posicao as keyof typeof contagem] < LIMITES[posicao as keyof typeof LIMITES];
  };

  // Calcula exatamente quantos jogadores o técnico PODE escolher desta mesa específica
  const getMaxPickable = () => {
    const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    meuElenco.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
    let pickable = 0;
    
    pacoteAtual.forEach(j => {
      if (!jogadoresIndisponiveis[j.id] && contagem[j.posicao as keyof typeof contagem] < LIMITES[j.posicao as keyof typeof LIMITES]) {
        contagem[j.posicao as keyof typeof contagem]++;
        pickable++;
      }
    });
    return Math.min(ESCOLHAS_POR_RODADA, pickable);
  };

  // ==========================================
  // LÓGICA 1: OUVIR O SERVIDOR E DADOS INICIAIS
  // ==========================================
  useEffect(() => {
    const unsubscribeGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        setGameState(data);
        
        if (!data.currentPack || data.currentPack.length === 0) {
          // Quando a mesa zera, limpamos apenas o pacote da tela.
          setPacoteAtual([]);
        } else {
          // CORREÇÃO: O servidor tem cartas! Nós garantimos que elas sejam 
          // exibidas na tela, atualizando o pacote apenas se a tela estiver vazia
          // ou se for um novo pacote (ex: você apertou 'Rerolar Time').
          setPacoteAtual(prev => {
            if (prev.length === 0 || prev[0].id !== data.currentPack![0].id) {
              return data.currentPack || [];
            }
            return prev;
          });
        }
      }
    });

    const carregarBancoDeJogadores = async () => {
      const queryClubes = await getDocs(collection(db, "clubes"));
      let clubes: Clube[] = [];
      queryClubes.forEach(d => { 
        if (d.data().elenco) clubes.push({ id: d.id, ...d.data() } as Clube); 
      });
      setClubesDisponiveis(clubes);
    };

    const unsubscribeUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      let mapaIndisponiveis: Record<string, string> = {};
      let mapa: Record<string, string> = {};
      
      snapshot.forEach(documento => {
        const dados = documento.data();
        mapa[documento.id] = dados.nomeTime || "Desconhecido";

        if (dados.elenco) {
          dados.elenco.forEach((j: Jogador) => {
            mapaIndisponiveis[j.id] = dados.nomeTime || "Desconhecido";
          });
          if (documento.id === currentUserUid) {
            setMeuElenco(dados.elenco);
            setNomeTime(dados.nomeTime);
          }
        }
      });
      setMapaUsuarios(mapa);
      setJogadoresIndisponiveis(mapaIndisponiveis);
      setCarregando(false);
    });

    carregarBancoDeJogadores();
    return () => { unsubscribeGame(); unsubscribeUsuarios(); };
  }, [currentUserUid]);

  // ==========================================
  // LÓGICA 2: O RELÓGIO MESTRE E AUTO-PICK
  // ==========================================
  useEffect(() => {
    if (!gameState || !gameState.draftDeadline) return;
    const deadlineSeguro = gameState.draftDeadline;

    const intervalo = setInterval(() => {
      const agora = Date.now();
      const faltam = Math.max(0, Math.floor((deadlineSeguro - agora) / 1000));
      setTempoRestante(faltam);

      if (faltam === 0 && isMyTurn) {
        clearInterval(intervalo);
        fazerEscolhaAutomaticaEPassarTurno();
      }
    }, 1000);

    return () => clearInterval(intervalo);
  }, [gameState, isMyTurn]);

  // ==========================================
  // LÓGICA 3: GERAR PACOTE (PLANO A E PLANO B)
  // ==========================================
  useEffect(() => {
    const pacoteVazioNoServidor = !gameState?.currentPack || gameState.currentPack.length === 0;
    if (isMyTurn && pacoteAtual.length === 0 && clubesDisponiveis.length > 0 && pacoteVazioNoServidor) {
      gerarPacoteETramitir();
    }
  }, [isMyTurn, clubesDisponiveis, jogadoresIndisponiveis, gameState?.currentPack, pacoteAtual.length]);

  const gerarPacoteETramitir = async (clubeIgnorado?: string) => {
    const usersSnap = await getDocs(collection(db, "usuarios"));
    let idsBloqueados: string[] = [];
    usersSnap.forEach(doc => {
      const dados = doc.data();
      if (dados.elenco) {
        idsBloqueados.push(...dados.elenco.map((j: Jogador) => j.id));
      }
    });

    const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    meuElenco.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
    
    const posicoesFaltando = getPosicoesNecessarias();

    const vagas = {
      GOL: Math.max(0, LIMITES.GOL - contagem.GOL),
      DEF: Math.max(0, LIMITES.DEF - contagem.DEF),
      MEI: Math.max(0, LIMITES.MEI - contagem.MEI),
      ATA: Math.max(0, LIMITES.ATA - contagem.ATA),
    };

    const clubesAvaliados = clubesDisponiveis.map(clube => {
      const disponiveisClube = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
      clube.elenco.forEach((j: Jogador) => {
        if (!idsBloqueados.includes(j.id) && disponiveisClube[j.posicao as keyof typeof disponiveisClube] !== undefined) {
          disponiveisClube[j.posicao as keyof typeof disponiveisClube]++;
        }
      });

      const potencialReal = 
        Math.min(disponiveisClube.GOL, vagas.GOL) +
        Math.min(disponiveisClube.DEF, vagas.DEF) +
        Math.min(disponiveisClube.MEI, vagas.MEI) +
        Math.min(disponiveisClube.ATA, vagas.ATA);

      return { clube, potencialReal };
    });

    let clubesValidos = clubesAvaliados.filter(c => 
      c.potencialReal >= ESCOLHAS_POR_RODADA && (!clubeIgnorado || c.clube.nome !== clubeIgnorado)
    );

    let pacote: Jogador[] = [];
    const ordemPosicoes: Record<string, number> = { GOL: 1, DEF: 2, MEI: 3, ATA: 4 };

    if (clubesValidos.length > 0) {
      // PLANO A: Clube Fechado (Com Fartura)
      clubesValidos.sort((a, b) => b.potencialReal - a.potencialReal);
      const topClubes = clubesValidos.slice(0, 5);
      const clubeSorteado = topClubes[Math.floor(Math.random() * topClubes.length)].clube;

      pacote = clubeSorteado.elenco
        .sort((a: Jogador, b: Jogador) => (ordemPosicoes[a.posicao] || 5) - (ordemPosicoes[b.posicao] || 5));
    } else {
      // PLANO B: Mercado Livre (Mix de Clubes)
      let jogadoresAvulsos: Jogador[] = [];
      clubesDisponiveis.forEach(c => {
        c.elenco.forEach(j => {
          if (!idsBloqueados.includes(j.id) && posicoesFaltando.includes(j.posicao)) {
            jogadoresAvulsos.push(j);
          }
        });
      });

      pacote = jogadoresAvulsos
        .sort(() => Math.random() - 0.5)
        .slice(0, 6)
        .sort((a, b) => (ordemPosicoes[a.posicao] || 5) - (ordemPosicoes[b.posicao] || 5));
    }

    setPacoteAtual(pacote);
    setEscolhasDaRodada([]);
    await updateDoc(doc(db, "game", "state"), { currentPack: pacote });
  };

  const rerolarTime = () => {
    if (jaRerolou || pacoteAtual.length === 0) return;
    setJaRerolou(true);
    const clubeAtual = pacoteAtual[0].clubeHistorico; 
    gerarPacoteETramitir(clubeAtual); 
  };

  // ==========================================
  // LÓGICA 4: SELECIONAR JOGADOR E LIDERANÇA
  // ==========================================
  const toggleJogador = (jogador: Jogador) => {
    if (!isMyTurn) return; 
    setEscolhasDaRodada(prevEscolhas => {
      let novasEscolhas = [...prevEscolhas];
      if (novasEscolhas.some(j => j.id === jogador.id)) {
        return novasEscolhas.filter(j => j.id !== jogador.id);
      } else {
        if (novasEscolhas.length >= ESCOLHAS_POR_RODADA) return prevEscolhas; 
        const todosEscolhidos = [...meuElenco, ...novasEscolhas];
        const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
        todosEscolhidos.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
        const podeAdicionar = contagem[jogador.posicao as keyof typeof contagem] < LIMITES[jogador.posicao as keyof typeof LIMITES];
        if (podeAdicionar) novasEscolhas.push(jogador);
        return novasEscolhas;
      }
    });
  };

  const passarTurnoNoServidor = async (novoElencoMeu: Jogador[]) => {
    if (!gameState || !currentUserUid) return;

    setEscolhasDaRodada([]);
    setJaRerolou(false);

    await setDoc(doc(db, "usuarios", currentUserUid), {
      elenco: novoElencoMeu,
      elencoPronto: novoElencoMeu.length >= 21 
    }, { merge: true });

    const indexAtual = gameState.draftOrder?.indexOf(currentUserUid) || 0;
    let proximoIndex = indexAtual + 1;
    let novaRodada = gameState.currentRound;

    if (proximoIndex >= (gameState.draftOrder?.length || 1)) {
      proximoIndex = 0;
      novaRodada += 1;
    }

    if (novaRodada > 7) {
      await updateDoc(doc(db, "game", "state"), {
        phase: 'FIRST_HALF',
        draftTurnUid: null,
        currentPack: []
      });
      return;
    }

    const proximoUid = gameState.draftOrder![proximoIndex];

    await updateDoc(doc(db, "game", "state"), {
      draftTurnUid: proximoUid,
      currentRound: novaRodada,
      draftDeadline: Date.now() + TEMPO_LIMITE_MS,
      currentPack: [] 
    });

  };

  const confirmarRodadaManual = () => {
    const picksObrigatorios = getMaxPickable();
    if (escolhasDaRodada.length !== picksObrigatorios) return;
    const novoElenco = [...meuElenco, ...escolhasDaRodada];
    setMeuElenco(novoElenco);
    passarTurnoNoServidor(novoElenco);
  };

  const fazerEscolhaAutomaticaEPassarTurno = () => {
    let novasEscolhas = [...escolhasDaRodada];
    const podeAdicionarNaSimulacao = (posicao: string, simulacao: Jogador[]) => {
      const todos = [...meuElenco, ...simulacao];
      const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
      todos.forEach(j => contagem[j.posicao as keyof typeof contagem]++);
      return contagem[posicao as keyof typeof contagem] < LIMITES[posicao as keyof typeof LIMITES];
    };

    for (const jogador of pacoteAtual) {
      if (novasEscolhas.length >= ESCOLHAS_POR_RODADA) break;
      if (!jogadoresIndisponiveis[jogador.id] && !novasEscolhas.some(j => j.id === jogador.id) && podeAdicionarNaSimulacao(jogador.posicao, novasEscolhas)) {
        novasEscolhas.push(jogador);
      }
    }
    const novoElenco = [...meuElenco, ...novasEscolhas];
    setMeuElenco(novoElenco);
    passarTurnoNoServidor(novoElenco);
  };

  // ==========================================
  // RENDERIZAÇÃO E INTERFACE
  // ==========================================
  if (carregando) return <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans"><div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-yellow-400 font-black tracking-widest uppercase animate-pulse">Conectando ao Evento de Draft...</p></div>;

  const minutos = Math.floor(tempoRestante / 60).toString().padStart(2, '0');
  const segundos = (tempoRestante % 60).toString().padStart(2, '0');
  
  const picksObrigatorios = isMyTurn && pacoteAtual.length > 0 ? getMaxPickable() : ESCOLHAS_POR_RODADA;

  // ==========================================
  // NOVA LÓGICA: ORDENAÇÃO DO ELENCO LATERAL
  // ==========================================
  const ordemPosicoesLateral: Record<string, number> = { GOL: 1, DEF: 2, MEI: 3, ATA: 4 };
  
  const elencoOrganizado = [...meuElenco, ...(isMyTurn ? escolhasDaRodada : [])].sort((a, b) => {
    // 1º Critério: Ordem da Posição no Campo
    const pesoA = ordemPosicoesLateral[a.posicao] || 5;
    const pesoB = ordemPosicoesLateral[b.posicao] || 5;
    
    if (pesoA !== pesoB) {
      return pesoA - pesoB; // Quem tem o peso menor (ex: GOL=1) sobe na lista
    }
    
    // 2º Critério: Ordem Alfabética do Nome (se tiverem a mesma posição)
    return a.nome.localeCompare(b.nome);
  });

  const renderSequenciaDraft = () => (
    <div className="bg-black p-3 flex gap-4 overflow-x-auto border-b border-neutral-800 custom-scrollbar items-center">
      <span className="text-fifa-blue font-black text-xs uppercase whitespace-nowrap tracking-widest">Ordem do Draft:</span>
      {gameState?.draftOrder?.map((uid, idx) => {
        const isVezDeste = uid === gameState.draftTurnUid;
        const nomeClube = mapaUsuarios[uid] || "Desconhecido";
        return (
          <div key={uid} className={`flex items-center gap-2 px-3 py-1 rounded-full whitespace-nowrap text-sm font-bold border transition-all
            ${isVezDeste ? 'bg-fifa-green/20 border-fifa-green text-fifa-green shadow-[0_0_10px_rgba(60,172,59,0.3)]' : 
              uid === currentUserUid ? 'bg-neutral-800 border-neutral-600 text-neutral-300' : 
              'bg-neutral-900 border-neutral-800 text-neutral-500'}`}>
            <span>{idx + 1}º</span>
            <span>{nomeClube}</span>
            {isVezDeste && <span className="text-xs animate-pulse text-fifa-red">⏱</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col font-fifa">
      {renderSequenciaDraft()}

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 w-full p-4 md:p-8 flex-1 overflow-hidden">
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-neutral-800 pb-4 mb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
            <div>
              <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
                Rodada <span className="text-yellow-400">{Math.min(gameState?.currentRound || 1, 7)}</span> / 7
              </h1>
              {isMyTurn ? (
                <p className="text-cyan-400 font-bold uppercase text-sm tracking-widest mt-1">É a SUA VEZ! Escolha {picksObrigatorios} jogadores.</p>
              ) : (
                <p className="text-neutral-400 text-sm mt-1">
                  <strong className="text-yellow-400">{mapaUsuarios[gameState?.draftTurnUid || '']}</strong> está analisando as cartas...
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-6 bg-neutral-900 p-3 rounded-xl border border-neutral-800 shadow-xl">
              <div className="text-center px-4 border-r border-neutral-700">
                <span className="block text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Relógio</span>
                <span className={`text-2xl font-black font-mono ${tempoRestante < 30 ? 'text-orange-500 animate-pulse' : 'text-white'}`}>
                  {minutos}:{segundos}
                </span>
              </div>
              <div className="text-center px-2">
                <span className="block text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Selecionados</span>
                <span className="text-2xl font-black text-yellow-400">{escolhasDaRodada.length}/{picksObrigatorios}</span>
              </div>
            </div>
          </div>

          {pacoteAtual.length > 0 && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-4 text-center shadow-lg shrink-0">
              <h2 className="text-xl md:text-2xl font-black text-yellow-400 uppercase tracking-widest">
                {pacoteAtual.every(j => j.clubeHistorico === pacoteAtual[0].clubeHistorico) 
                  ? pacoteAtual[0].clubeHistorico 
                  : "MERCADO LIVRE (Agentes Livres)"}
              </h2>
              <p className="text-xs text-neutral-500 uppercase tracking-widest mt-1 font-bold">Elenco Disponível para Seleção</p>
            </div>
          )}

          <div className="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
            {pacoteAtual.length === 0 && !isMyTurn && (
              <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="italic font-bold uppercase tracking-widest text-sm">Aguardando pacote...</p>
              </div>
            )}
            
            {pacoteAtual.map((jogador) => {
              const timeDono = jogadoresIndisponiveis[jogador.id]; 
              const isIndisponivel = !!timeDono;
              const isSelecionado = escolhasDaRodada.some(j => j.id === jogador.id);
              const isDisabled = !isMyTurn || isIndisponivel || (!isSelecionado && (!podeEscolherMais(jogador.posicao) || escolhasDaRodada.length >= picksObrigatorios));

              let bgClass = 'bg-neutral-900 border-neutral-700 hover:border-fifa-blue hover:bg-neutral-800 shadow-xl cursor-pointer';
              if (isIndisponivel) bgClass = 'bg-neutral-950/80 border-neutral-900 opacity-60 cursor-not-allowed grayscale';
              else if (isSelecionado) bgClass = 'bg-fifa-green/20 border-fifa-green shadow-[0_0_15px_rgba(60,172,59,0.3)]';
              else if (isDisabled && isMyTurn) bgClass = 'bg-neutral-950 border-neutral-900 opacity-40 cursor-not-allowed grayscale';
              else if (!isMyTurn) bgClass = 'bg-neutral-900 border-neutral-800 cursor-default';

              return (
                <button
                  key={jogador.id}
                  onClick={() => toggleJogador(jogador)}
                  disabled={isDisabled}
                  className={`p-3 md:p-4 rounded-xl border-2 flex flex-row items-center justify-between transition-all relative overflow-hidden shrink-0 ${bgClass}`}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full ${isIndisponivel ? 'bg-fifa-red/50' : 'bg-neutral-800'}`}></div>

                  <div className="flex items-center gap-4 pl-2">
                    <span className={`w-12 text-center text-[10px] sm:text-xs px-2 py-2 rounded font-black tracking-widest ${isIndisponivel ? 'bg-neutral-900 text-neutral-600 border-neutral-800' : 'bg-fifa-blue text-white border-transparent'}`}>
                      {jogador.posicao}
                    </span>
                    <div className="text-left">
                      <p className={`font-black text-base sm:text-lg truncate ${isSelecionado ? 'text-fifa-green' : isIndisponivel ? 'text-neutral-500 line-through' : 'text-white'}`}>
                        {jogador.nome}
                      </p>
                      {isIndisponivel && (
                        <p className="text-[10px] text-red-500 uppercase font-bold tracking-widest mt-1">
                          No {timeDono}
                        </p>
                      )}
                      {/* Subtítulo utilitário apenas no Mercado Livre para identificar o time de origem */}
                      {(!pacoteAtual.every(j => j.clubeHistorico === pacoteAtual[0].clubeHistorico)) && !isIndisponivel && (
                        <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest mt-1">
                          De: {jogador.clubeHistorico}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    {isSelecionado && <span className="text-[10px] sm:text-xs bg-yellow-500 text-neutral-950 px-2 py-1 rounded font-black uppercase tracking-widest">Selecionado</span>}
                    {isIndisponivel && !isSelecionado && <span className="text-[10px] sm:text-xs bg-neutral-900 text-neutral-600 px-2 py-1 rounded font-black uppercase tracking-widest border border-neutral-800">Indisponível</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {isMyTurn && (
            <div className="mt-4 flex flex-col sm:flex-row gap-4 shrink-0">
              <button 
                onClick={rerolarTime}
                disabled={jaRerolou || escolhasDaRodada.length > 0}
                className="w-full sm:w-1/3 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700"
                title="Trocar este time por outro aleatório (Apenas 1 vez por fase)"
              >
                {jaRerolou ? 'Reroll Esgotado' : '🎲 Rerolar Time'}
              </button>
              
              <button 
                onClick={confirmarRodadaManual}
                disabled={escolhasDaRodada.length !== picksObrigatorios}
                className="w-full sm:w-2/3 py-4 rounded-xl font-black text-lg uppercase tracking-widest transition-all disabled:opacity-50 disabled:bg-neutral-900 disabled:text-neutral-600 bg-fifa-green text-white hover:bg-opacity-90 shadow-[0_0_15px_rgba(60,172,59,0.4)]"
              >
                {escolhasDaRodada.length === picksObrigatorios 
                  ? (picksObrigatorios === 0 ? `Pular Vez (Sem Opções)` : `Confirmar e Passar a Vez`)
                  : `Faltam ${picksObrigatorios - escolhasDaRodada.length}`}
              </button>
            </div>
          )}
        </div>

        <div className="w-full lg:w-80 bg-neutral-900 p-6 rounded-xl border border-neutral-800 h-150 shadow-2xl shrink-0 flex flex-col">
          <h3 className="font-black text-xl text-white border-b border-neutral-800 pb-4 mb-4 uppercase tracking-tighter shrink-0">
            Elenco <span className="text-yellow-400 block text-sm tracking-widest">{nomeTime}</span>
          </h3>
          <ul className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-2">
            {elencoOrganizado.map((j, i) => (
              <li key={i} className={`flex justify-between items-center p-3 rounded-lg border ${(isMyTurn && escolhasDaRodada.some(e => e.id === j.id)) ? 'bg-yellow-900/10 border-yellow-500/50' : 'bg-neutral-950 border-neutral-800'}`}>
                <span className="font-bold text-neutral-200 text-sm truncate w-32">{j.nome}</span>
                <span className="text-[10px] font-black text-cyan-400 bg-neutral-900 px-2 py-1 rounded border border-neutral-800">{j.posicao}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
}
