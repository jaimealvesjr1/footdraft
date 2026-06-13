// src/pages/Draft.tsx
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { type Jogador, type GameState } from '../types';

const LIMITES = { GOL: 3, DEF: 6, MEI: 5, ATA: 5 };
const CORINGAS = 2;
const ESCOLHAS_POR_RODADA = 3;
const TEMPO_LIMITE_MS = 3 * 60 * 1000;

export default function Draft() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [tempoRestante, setTempoRestante] = useState<number>(180); 
  
  const currentUserUid = auth.currentUser?.uid;
  const isMyTurn = gameState?.draftTurnUid === currentUserUid;

  const [piscinaJogadores, setPiscinaJogadores] = useState<Jogador[]>([]);
  const [jogadoresIndisponiveis, setJogadoresIndisponiveis] = useState<string[]>([]);
  const [mapaUsuarios, setMapaUsuarios] = useState<Record<string, string>>({});
  
  const [pacoteAtual, setPacoteAtual] = useState<Jogador[]>([]);
  const [escolhasDaRodada, setEscolhasDaRodada] = useState<Jogador[]>([]);
  const [meuElenco, setMeuElenco] = useState<Jogador[]>([]);
  const [nomeTime, setNomeTime] = useState("Meu Time");

  const [carregando, setCarregando] = useState(true);

  // ==========================================
  // LÓGICA 1: OUVIR O SERVIDOR (Sincronização Absoluta)
  // ==========================================
  useEffect(() => {
    // 1. Escuta o estado global do jogo
    const unsubscribeGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        setGameState(data);
        
        // A MÁGICA DA CORREÇÃO: Todos (inclusive o jogador ativo) carregam o pacote que está no servidor.
        // Se o jogador ativo recarregar a página, ele recupera as cartas instantaneamente!
        setPacoteAtual(data.currentPack || []);

        // VASSOURA DE SEGURANÇA: Se a mesa estiver vazia (turno mudou) OU se não for a sua vez, limpe seus cliques!
        if (!data.currentPack || data.currentPack.length === 0 || data.draftTurnUid !== currentUserUid) {
          setEscolhasDaRodada([]);
        }
      }
    });

    // 2. Carrega a base de dados de clubes
    const carregarBancoDeJogadores = async () => {
      const queryClubes = await getDocs(collection(db, "clubes"));
      let todos: Jogador[] = [];
      queryClubes.forEach(d => { if (d.data().elenco) todos = [...todos, ...d.data().elenco]; });
      setPiscinaJogadores(todos);
    };

    // 3. Ouvinte em tempo real para Exclusividade de Jogadores
    const unsubscribeUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      let IDsJaEscolhidos: string[] = [];
      let mapa: Record<string, string> = {};
      
      snapshot.forEach(documento => {
        const dados = documento.data();
        mapa[documento.id] = dados.nomeTime || "Desconhecido";

        if (dados.elenco) {
          IDsJaEscolhidos = [...IDsJaEscolhidos, ...dados.elenco.map((j: Jogador) => j.id)];
          if (documento.id === currentUserUid) {
            setMeuElenco(dados.elenco);
            setNomeTime(dados.nomeTime);
          }
        }
      });
      setMapaUsuarios(mapa);
      setJogadoresIndisponiveis(IDsJaEscolhidos);
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
  // LÓGICA 3: GERAR O PACOTE NO SERVIDOR
  // ==========================================
  useEffect(() => {
    // Só o dono da vez tem o poder de gerar. Ele gera SE a mesa do servidor estiver vazia!
    const pacoteVazioNoServidor = !gameState?.currentPack || gameState.currentPack.length === 0;

    if (isMyTurn && piscinaJogadores.length > 0 && pacoteVazioNoServidor) {
      gerarPacoteETramitir();
    }
  }, [isMyTurn, piscinaJogadores, jogadoresIndisponiveis, gameState?.currentPack]);

  const gerarPacoteETramitir = async () => {
    const disponiveis = piscinaJogadores.filter(j => !jogadoresIndisponiveis.includes(j.id));
    
    const pescarComNerf = (quantidade: number, posicao: string, minOvr: number, maxOvr: number): Jogador[] => {
      let filtro = disponiveis.filter(j => j.posicao === posicao);
      if (filtro.length === 0) filtro = disponiveis; 
      const sorteados = filtro.sort(() => Math.random() - 0.5).slice(0, quantidade);
      return sorteados.map(j => ({ ...j, overall: Math.floor(Math.random() * (maxOvr - minOvr + 1)) + minOvr }));
    };

    const pacote: Jogador[] = [
      ...pescarComNerf(1, 'GOL', 85, 92), ...pescarComNerf(1, 'GOL', 70, 78),
      ...pescarComNerf(1, 'DEF', 88, 94), ...pescarComNerf(1, 'DEF', 80, 85), ...pescarComNerf(1, 'DEF', 70, 79),
      ...pescarComNerf(1, 'MEI', 88, 95), ...pescarComNerf(1, 'MEI', 75, 82),
      ...pescarComNerf(1, 'ATA', 88, 95), ...pescarComNerf(1, 'ATA', 75, 82),
    ].sort(() => Math.random() - 0.5);

    // Envia o pacote imediatamente para o servidor. O nosso LÓGICA 1 vai escutar e preencher a tela para todos.
    await updateDoc(doc(db, "game", "state"), { currentPack: pacote });
  };

  // ==========================================
  // LÓGICA 4: SELECIONAR JOGADOR E REGRAS TÁTICAS
  // ==========================================
  const podeEscolherMais = (posicao: string) => {
    const todosEscolhidos = [...meuElenco, ...escolhasDaRodada];
    const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    todosEscolhidos.forEach(j => contagem[j.posicao as keyof typeof contagem]++);

    let coringas = 0;
    Object.keys(LIMITES).forEach(pos => {
      const p = pos as keyof typeof LIMITES;
      if (contagem[p] > LIMITES[p]) coringas += (contagem[p] - LIMITES[p]);
    });

    if (contagem[posicao as keyof typeof contagem] < LIMITES[posicao as keyof typeof LIMITES]) return true;
    if (coringas < CORINGAS) return true;
    return false;
  };

  const toggleJogador = (jogador: Jogador) => {
    if (!isMyTurn) return; 

    let novasEscolhas = [...escolhasDaRodada];
    if (novasEscolhas.some(j => j.id === jogador.id)) {
      novasEscolhas = novasEscolhas.filter(j => j.id !== jogador.id);
    } else {
      if (novasEscolhas.length >= ESCOLHAS_POR_RODADA) return; 
      if (podeEscolherMais(jogador.posicao)) novasEscolhas.push(jogador);
    }

    setEscolhasDaRodada(novasEscolhas);
  };

  // ==========================================
  // LÓGICA 5: PASSAR O TURNO E LIDERANÇA
  // ==========================================
  const passarTurnoNoServidor = async (novoElencoMeu: Jogador[]) => {
    if (!gameState || !currentUserUid) return;

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

    const proximoUid = gameState.draftOrder![proximoIndex];

    // O pulo do gato: Esvaziar o pacote aqui garante que o LÓGICA 1 limpe as telas de todos imediatamente.
    await updateDoc(doc(db, "game", "state"), {
      draftTurnUid: proximoUid,
      currentRound: novaRodada,
      draftDeadline: Date.now() + TEMPO_LIMITE_MS,
      currentPack: [] 
    });
  };

  const confirmarRodadaManual = () => {
    if (escolhasDaRodada.length !== ESCOLHAS_POR_RODADA) return;
    const novoElenco = [...meuElenco, ...escolhasDaRodada];
    setMeuElenco(novoElenco);
    passarTurnoNoServidor(novoElenco);
  };

  const fazerEscolhaAutomaticaEPassarTurno = () => {
    const autoEscolhidos = pacoteAtual.slice(0, 3);
    const novoElenco = [...meuElenco, ...autoEscolhidos];
    setMeuElenco(novoElenco);
    passarTurnoNoServidor(novoElenco);
  };

  // ==========================================
  // RENDERIZAÇÃO E INTERFACE (FUT PREMIUM)
  // ==========================================
  if (carregando) return <div className="h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans"><div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-yellow-400 font-black tracking-widest uppercase animate-pulse">Conectando ao Evento de Draft...</p></div>;

  const minutos = Math.floor(tempoRestante / 60).toString().padStart(2, '0');
  const segundos = (tempoRestante % 60).toString().padStart(2, '0');
  
  const renderSequenciaDraft = () => (
    <div className="bg-black p-3 flex gap-4 overflow-x-auto border-b border-neutral-800 custom-scrollbar items-center">
      <span className="text-yellow-500 font-black text-xs uppercase whitespace-nowrap tracking-widest">Ordem do Draft:</span>
      {gameState?.draftOrder?.map((uid, idx) => {
        const isVezDeste = uid === gameState.draftTurnUid;
        const nomeClube = mapaUsuarios[uid] || "Desconhecido";
        return (
          <div key={uid} className={`flex items-center gap-2 px-3 py-1 rounded-full whitespace-nowrap text-sm font-bold border transition-all
            ${isVezDeste ? 'bg-yellow-500/20 border-yellow-400 text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.2)]' : 
              uid === currentUserUid ? 'bg-neutral-800 border-neutral-600 text-neutral-300' : 
              'bg-neutral-900 border-neutral-800 text-neutral-500'}`}>
            <span>{idx + 1}º</span>
            <span>{nomeClube}</span>
            {isVezDeste && <span className="text-xs animate-pulse">⏱</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col font-sans">
      {renderSequenciaDraft()}

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 w-full p-4 md:p-8 flex-1">
        
        {/* PAINEL CENTRAL */}
        <div className="flex-1 flex flex-col">
          <div className="border-b border-neutral-800 pb-4 mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
                Rodada <span className="text-yellow-400">{Math.ceil((gameState?.currentRound || 1) / (gameState?.draftOrder?.length || 1))}</span>
              </h1>
              {isMyTurn ? (
                <p className="text-cyan-400 font-bold uppercase text-sm tracking-widest mt-1">É a SUA VEZ! Escolha 3 jogadores.</p>
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
                <span className="text-2xl font-black text-yellow-400">{escolhasDaRodada.length}/3</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
            {pacoteAtual.length === 0 && (
              <div className="col-span-full h-full flex flex-col items-center justify-center text-neutral-600">
                <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="italic font-bold uppercase tracking-widest text-sm">Gerando pacote da mesa...</p>
              </div>
            )}
            
            {pacoteAtual.map((jogador) => {
              const isSelecionado = escolhasDaRodada.some(j => j.id === jogador.id);
              const isDisabled = !isMyTurn || (!isSelecionado && (!podeEscolherMais(jogador.posicao) || escolhasDaRodada.length >= ESCOLHAS_POR_RODADA));

              return (
                <button
                  key={jogador.id}
                  onClick={() => toggleJogador(jogador)}
                  disabled={isDisabled}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden h-36 flex flex-col justify-between
                    ${isSelecionado ? 'bg-yellow-900/20 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.15)]' : 
                      isDisabled && isMyTurn ? 'bg-neutral-950 border-neutral-900 opacity-30 cursor-not-allowed grayscale' : 
                      !isMyTurn ? 'bg-neutral-900 border-neutral-800 cursor-default shadow-md' :
                      'bg-neutral-900 border-neutral-700 hover:border-yellow-500 hover:bg-neutral-800 shadow-xl cursor-pointer'}
                  `}
                >
                  <div className={`absolute top-0 left-0 w-full h-1 ${isMyTurn && jogador.overall >= 88 ? 'bg-linear-to-r from-yellow-600 to-yellow-300' : 'bg-neutral-800'}`}></div>

                  <div className="mt-2">
                    <p className={`font-black text-lg sm:text-xl truncate ${isSelecionado ? 'text-yellow-400' : 'text-white'}`}>{jogador.nome}</p>
                    <p className="text-[10px] sm:text-xs text-neutral-400 truncate mt-1 uppercase font-bold">{jogador.clubeHistorico}</p>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] sm:text-xs bg-neutral-950 px-2 py-1 rounded font-black text-cyan-400 border border-neutral-800 tracking-wider">
                      {jogador.posicao}
                    </span>
                    
                    {isMyTurn ? (
                      <span className={`text-sm sm:text-base px-2 py-1 rounded font-black ${jogador.overall >= 88 ? 'text-yellow-400' : 'text-neutral-300'}`}>
                        OVR {jogador.overall}
                      </span>
                    ) : (
                      <span className="text-sm sm:text-base px-2 py-1 rounded font-black text-neutral-600">
                        OVR ??
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {isMyTurn && (
            <button 
              onClick={confirmarRodadaManual}
              disabled={escolhasDaRodada.length !== ESCOLHAS_POR_RODADA}
              className="mt-6 w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest transition-all disabled:opacity-50 disabled:bg-neutral-900 disabled:text-neutral-600 bg-yellow-500 text-neutral-950 hover:bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.2)]"
            >
              {escolhasDaRodada.length === ESCOLHAS_POR_RODADA ? `Confirmar e Passar a Vez` : `Faltam ${ESCOLHAS_POR_RODADA - escolhasDaRodada.length} Jogadores`}
            </button>
          )}
        </div>

        {/* BARRA LATERAL */}
        <div className="w-full lg:w-80 bg-neutral-900 p-6 rounded-xl border border-neutral-800 h-fit shadow-2xl">
          <h3 className="font-black text-xl text-white border-b border-neutral-800 pb-4 mb-4 uppercase tracking-tighter">
            Elenco <span className="text-yellow-400 block text-sm tracking-widest">{nomeTime}</span>
          </h3>
          <ul className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-2">
            {[...meuElenco, ...(isMyTurn ? escolhasDaRodada : [])].map((j, i) => (
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
