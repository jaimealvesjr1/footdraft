import { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { doc, onSnapshot, updateDoc, getDocs, collection, arrayUnion } from 'firebase/firestore';
import { type GameState, type Jogador, type Clube } from '../types';
import toast from 'react-hot-toast';

interface Usuario {
  id: string;
  nomeTime: string;
  elenco: Jogador[];
  trocasPermitidas: number;
  trocasRealizadas: number;
}

interface PacoteSubstituicao {
  saindo: Jogador;
  opcoes: Jogador[];
  selecionado: Jogador | null;
}

export default function TransferWindow({ uid }: { uid: string }) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [meuTime, setMeuTime] = useState<Usuario | null>(null);
  
  const [todosJogadoresBase, setTodosJogadoresBase] = useState<Jogador[]>([]);
  const [jogadoresLivres, setJogadoresLivres] = useState<Jogador[]>([]);
  
  const [etapaTroca, setEtapaTroca] = useState<'SELECIONAR_SAIDA' | 'SELECIONAR_ENTRADAS'>('SELECIONAR_SAIDA');
  
  const [jogadoresParaSair, setJogadoresParaSair] = useState<Jogador[]>([]);
  const [substituicoes, setSubstituicoes] = useState<PacoteSubstituicao[]>([]);
  
  const [carregando, setCarregando] = useState(false);
  const [tempoRestante, setTempoRestante] = useState<number>(180);

  useEffect(() => {
    const unsubGame = onSnapshot(doc(db, "game", "state"), (snap) => {
      if (snap.exists()) setGameState(snap.data() as GameState);
    });
    const unsubUser = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      if (snap.exists()) setMeuTime({ id: snap.id, ...snap.data() } as Usuario);
    });
    return () => { unsubGame(); unsubUser(); };
  }, [uid]);

  useEffect(() => {
    const fetchClubes = async () => {
      const snap = await getDocs(collection(db, "clubes"));
      const lista: Jogador[] = [];
      snap.forEach(d => {
        const c = d.data() as Clube;
        if (c.elenco) lista.push(...c.elenco);
      });
      setTodosJogadoresBase(lista);
    };
    fetchClubes();
  }, []);

  useEffect(() => {
    const unsubUsuarios = onSnapshot(collection(db, "usuarios"), (snap) => {
      const idsOcupados = new Set<string>();
      
      snap.forEach(d => {
        const u = { id: d.id, ...d.data() } as Usuario;
        if (u.elenco) u.elenco.forEach((j: Jogador) => idsOcupados.add(j.id));
      });
      
      if (todosJogadoresBase.length > 0) {
        setJogadoresLivres(todosJogadoresBase.filter(j => !idsOcupados.has(j.id)));
      }
    });
    return () => unsubUsuarios();
  }, [todosJogadoresBase]);

  const jaPronto = gameState?.playersReady?.includes(uid);
  const bloqueado = jaPronto || carregando;
  const trocasRestantes = meuTime ? (meuTime.trocasPermitidas - (meuTime.trocasRealizadas || 0)) : 0;

  // CRONÔMETRO E AUTO-AVANÇO
  useEffect(() => {
    if (!gameState || !gameState.draftDeadline) return;
    const deadline = gameState.draftDeadline;
    const intervalo = setInterval(() => {
      const agora = Date.now();
      const faltam = Math.max(0, Math.floor((deadline - agora) / 1000));
      setTempoRestante(faltam);
      if (faltam === 0) {
        clearInterval(intervalo);
        if (!jaPronto) encerrarMinhasTrocas(false); // Acabou o tempo, encerra forçado
      }
    }, 1000);
    return () => clearInterval(intervalo);
  }, [gameState, jaPronto]);

  // SERVIDOR MESTRE: Avança a fase quando todos estiverem prontos
  useEffect(() => {
    if (!gameState || !gameState.draftOrder) return;
    const totalHumanos = gameState.draftOrder.length;
    const prontos = gameState.playersReady?.length || 0;
    const souOMestre = gameState.draftOrder[0] === uid;

    if (prontos >= totalHumanos && totalHumanos > 0 && souOMestre) {
      updateDoc(doc(db, "game", "state"), {
        phase: 'SECOND_HALF',
        draftTurnUid: null,
        draftOrder: [],
        playersReady: []
      });
    }
  }, [gameState?.playersReady]);

  const toggleJogadorSaida = (jogador: Jogador) => {
    if (bloqueado) return;
    
    if (jogadoresParaSair.some(j => j.id === jogador.id)) {
      setJogadoresParaSair(prev => prev.filter(j => j.id !== jogador.id));
    } else {
      if (jogadoresParaSair.length >= trocasRestantes) {
        toast.error(`Você só tem direito a mais ${trocasRestantes} trocas nesta janela.`);
        return;
      }
      setJogadoresParaSair(prev => [...prev, jogador]);
    }
  };

  const travarSaidasEGerarOpcoes = () => {
    if (jogadoresParaSair.length === 0 || bloqueado) return;

    let poolDisponivel = [...jogadoresLivres];
    const novosPacotes: PacoteSubstituicao[] = [];

    for (const saindo of jogadoresParaSair) {
      const candidatos = poolDisponivel.filter(j => j.posicao === saindo.posicao);
      const embaralhados = candidatos.sort(() => Math.random() - 0.5);
      
      const selecionados: Jogador[] = [];
      const clubesUsados = new Set<string>();

      for (const j of embaralhados) {
        if (!clubesUsados.has(j.clubeHistorico)) {
          selecionados.push(j);
          clubesUsados.add(j.clubeHistorico);
        }
        if (selecionados.length === 3) break;
      }
      poolDisponivel = poolDisponivel.filter(l => !selecionados.some(s => s.id === l.id));
      novosPacotes.push({ saindo, opcoes: selecionados, selecionado: null });
    }

    setSubstituicoes(novosPacotes);
    setEtapaTroca('SELECIONAR_ENTRADAS');
  };

  const selecionarEntrada = (indexDoPacote: number, jogadorEscolhido: Jogador) => {
    if (bloqueado) return;
    setSubstituicoes(prev => {
      const novaLista = [...prev];
      novaLista[indexDoPacote].selecionado = jogadorEscolhido;
      return novaLista;
    });
  };

  const todasVagasPreenchidas = substituicoes.length > 0 && substituicoes.every(sub => 
    sub.opcoes.length === 0 || sub.selecionado !== null
  );

  const confirmarTrocasEmMassa = async () => {
    if (!meuTime || !gameState || !todasVagasPreenchidas || bloqueado) return;
    setCarregando(true);

    try {
      const substituicoesValidas = substituicoes.filter(sub => sub.selecionado !== null);
      const idsSaindo = substituicoesValidas.map(sub => sub.saindo.id);
      const jogadoresEntrando = substituicoesValidas.map(sub => sub.selecionado!);

      const elencoAtual = meuTime.elenco || [];
      const novoElenco = elencoAtual.filter(j => !idsSaindo.includes(j.id));
      novoElenco.push(...jogadoresEntrando);

      const trocasFeitas = (meuTime.trocasRealizadas || 0) + substituicoesValidas.length;

      await updateDoc(doc(db, "usuarios", uid), {
        elenco: novoElenco,
        trocasRealizadas: trocasFeitas
      });

      await updateDoc(doc(db, "game", "state"), { playersReady: arrayUnion(uid) });
      toast.success(`${substituicoes.length} transferência(s) concluída(s)!`);
    } catch (error) {
      toast.error("Erro ao realizar trocas.");
    } finally {
      setCarregando(false);
    }
  };

  const encerrarMinhasTrocas = async (pedirConfirmacao = true) => {
    if (bloqueado) return;
    if (pedirConfirmacao && !window.confirm("Você abrirá mão das suas trocas restantes. Confirmar?")) return;
    
    setCarregando(true);
    try {
      await updateDoc(doc(db, "usuarios", uid), { trocasRealizadas: meuTime?.trocasPermitidas || 0 });
      await updateDoc(doc(db, "game", "state"), { playersReady: arrayUnion(uid) });
      if(pedirConfirmacao) toast.success("Você encerrou suas participações nesta janela!");
    } catch (e) {
      toast.error("Erro ao pular janela.");
    } finally {
      setCarregando(false);
    }
  };

  if (gameState?.phase !== 'TRANSFER_WINDOW') {
    return <div className="text-white text-center mt-20">A Janela de Transferências está fechada.</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-8 text-white font-fifa">
      <h1 className="text-3xl font-black uppercase text-fifa-blue mb-2">Janela de Transferências</h1>
      <p className="text-neutral-400 mb-8 font-bold">
        Trocas Disponíveis: <span className="text-white text-xl">{trocasRestantes}</span>
      </p>

      {/* STATUS GLOBAL DA SALA E CRONÔMETRO */}
      <div className="bg-black p-4 flex flex-col md:flex-row justify-between items-center rounded-xl mb-6 border border-neutral-800 shadow-xl gap-4">
        <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-fifa-gray-light">
          Técnicos Prontos: <span className="text-fifa-green font-black">{gameState?.playersReady?.length || 0} / {gameState?.draftOrder?.length || 0}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center px-4 border-r border-neutral-700">
            <span className="block text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Cronômetro</span>
            <span className={`text-2xl font-black font-mono ${tempoRestante < 30 ? 'text-fifa-red animate-pulse' : 'text-white'}`}>
              {Math.floor(tempoRestante / 60).toString().padStart(2, '0')}:{(tempoRestante % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-fifa-blue rounded-full animate-pulse"></span>
            <span className="text-fifa-blue font-black uppercase tracking-widest text-sm">Mercado Simultâneo</span>
          </div>
        </div>
      </div>

      {/* BANNER DE TURNO */}
      <div className={`p-4 rounded-xl font-black uppercase tracking-widest text-center mb-8 border-2 transition-all ${jaPronto ? 'bg-neutral-900 border-neutral-800 text-neutral-500' : 'bg-fifa-green/20 border-fifa-green text-fifa-green shadow-[0_0_15px_rgba(60,172,59,0.2)]'}`}>
        {jaPronto ? '✅ MERCADO ENCERRADO PARA VOCÊ. AGUARDANDO ADVERSÁRIOS.' : '⏱️ MERCADO ABERTO! ESCOLHA QUEM ENTRA E QUEM SAI.'}
      </div>

      {!jaPronto && (
        <div className="flex flex-wrap gap-4 mb-8 justify-center">
          
          {etapaTroca === 'SELECIONAR_SAIDA' && (
            <button 
              disabled={jogadoresParaSair.length === 0}
              onClick={travarSaidasEGerarOpcoes}
              className="px-6 py-3 bg-fifa-blue hover:bg-opacity-80 disabled:opacity-50 font-black uppercase tracking-widest rounded shadow-[0_0_15px_rgba(42,57,141,0.4)] transition-colors text-white"
            >
              Confirmar {jogadoresParaSair.length} Saída(s) e Ver Opções 🔒
            </button>
          )}

          {etapaTroca === 'SELECIONAR_ENTRADAS' && (
            <button 
              disabled={!todasVagasPreenchidas || carregando}
              onClick={confirmarTrocasEmMassa}
              className="px-6 py-3 bg-fifa-green hover:bg-opacity-80 disabled:opacity-50 font-black uppercase tracking-widest rounded shadow-[0_0_15px_rgba(60,172,59,0.4)] transition-colors text-white"
            >
              {carregando ? 'Processando...' : `Efetuar ${substituicoes.length} Transferência(s) ♻️`}
            </button>
          )}
          
          <button 
            onClick={() => { encerrarMinhasTrocas(true) }}
            className="px-6 py-3 bg-neutral-900 hover:bg-fifa-red/20 border border-neutral-800 hover:border-fifa-red/50 font-bold uppercase rounded transition-colors text-fifa-red"
          >
            Encerrar Minha Janela (Pular)
          </button>
        </div>
      )}

      {/* BANNER DE TURNO */}
      <div className={`p-4 rounded-xl font-black uppercase tracking-widest text-center mb-8 border-2 transition-all ${jaPronto ? 'bg-neutral-900 border-neutral-800 text-neutral-500' : 'bg-fifa-green/20 border-fifa-green text-fifa-green shadow-[0_0_15px_rgba(60,172,59,0.2)]'}`}>
        {jaPronto ? '✅ MERCADO ENCERRADO PARA VOCÊ. AGUARDANDO ADVERSÁRIOS.' : '⏱️ MERCADO ABERTO! ESCOLHA QUEM ENTRA E QUEM SAI.'}
      </div>

      {!jaPronto && (
        <div className="flex flex-wrap gap-4 mb-8 justify-center">
          
          {etapaTroca === 'SELECIONAR_SAIDA' && (
            <button 
              disabled={jogadoresParaSair.length === 0}
              onClick={travarSaidasEGerarOpcoes}
              className="px-6 py-3 bg-fifa-blue hover:bg-opacity-80 disabled:opacity-50 font-black uppercase tracking-widest rounded shadow-[0_0_15px_rgba(42,57,141,0.4)] transition-colors text-white"
            >
              Confirmar {jogadoresParaSair.length} Saída(s) e Ver Opções 🔒
            </button>
          )}

          {etapaTroca === 'SELECIONAR_ENTRADAS' && (
            <button 
              disabled={!todasVagasPreenchidas || carregando}
              onClick={confirmarTrocasEmMassa}
              className="px-6 py-3 bg-fifa-green hover:bg-opacity-80 disabled:opacity-50 font-black uppercase tracking-widest rounded shadow-[0_0_15px_rgba(60,172,59,0.4)] transition-colors text-white"
            >
              {carregando ? 'Processando...' : `Efetuar ${substituicoes.length} Transferência(s) ♻️`}
            </button>
          )}
          
          <button 
            onClick={() => encerrarMinhasTrocas(true)}
            className="px-6 py-3 bg-neutral-900 hover:bg-fifa-red/20 border border-neutral-800 hover:border-fifa-red/50 font-bold uppercase rounded-xl transition-colors text-fifa-red"
          >
            Encerrar Minhas Trocas (Finalizar)
          </button>
        </div>
      )}

      {/* ÁREA DE SELEÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LADO ESQUERDO: MEU ELENCO (Ocupa 4 colunas) */}
        <div className={`col-span-1 lg:col-span-4 bg-neutral-900 p-6 rounded-xl border border-neutral-800 transition-all ${etapaTroca === 'SELECIONAR_ENTRADAS' ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
          <h2 className="text-xl font-bold mb-2">1. Dispensas ({jogadoresParaSair.length}/{trocasRestantes})</h2>
          <p className="text-xs text-neutral-400 mb-4">Clique nos jogadores que deseja liberar do seu time.</p>
          
          <div className="space-y-2 max-h-150 overflow-y-auto pr-2 custom-scrollbar">
            {(meuTime?.elenco || []).map(jogador => {
              const isSelecionado = jogadoresParaSair.some(j => j.id === jogador.id);
              return (
                <div 
                  key={jogador.id} 
                  onClick={() => toggleJogadorSaida(jogador)}
                  className={`p-3 rounded border cursor-pointer transition-all ${isSelecionado ? 'border-fifa-red bg-fifa-red/20 shadow-[inset_0_0_10px_rgba(230,29,37,0.2)]' : 'border-neutral-800 bg-neutral-950 hover:border-fifa-red/50'}`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-bold">{jogador.nome}</p>
                    {isSelecionado && <span className="text-red-500 text-xs">Saída ❌</span>}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 uppercase font-black tracking-widest">{jogador.posicao} - OVR {jogador.overall}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* LADO DIREITO: AGENTES LIVRES (Ocupa 8 colunas) */}
        <div className="col-span-1 lg:col-span-8 bg-neutral-900 p-6 rounded-xl border border-neutral-800">
          <h2 className="text-xl font-bold mb-4">2. Contratações</h2>
          
          {etapaTroca === 'SELECIONAR_SAIDA' ? (
            <div className="h-full min-h-75 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-xl text-neutral-600 bg-neutral-950/50">
              <span className="text-4xl mb-4 grayscale opacity-50">👥</span>
              <p className="text-sm font-bold uppercase tracking-widest">Marque os jogadores à esquerda e trave.</p>
            </div>
          ) : (
            <div className="space-y-6 max-h-150 overflow-y-auto pr-2 custom-scrollbar">
              {substituicoes.map((pacote, index) => (
                <div key={pacote.saindo.id} className="bg-neutral-950 p-5 rounded-xl border border-neutral-800">
                  <h3 className="font-black text-yellow-500 mb-3 border-b border-neutral-800 pb-2 flex items-center gap-2">
                    <span className="bg-neutral-800 px-2 py-1 rounded text-xs">Vaga de</span>
                    {pacote.saindo.nome} 
                    <span className="text-xs text-neutral-500 uppercase">({pacote.saindo.posicao})</span>
                  </h3>
                  
                  {pacote.opcoes.length === 0 ? (
                    <div className="bg-red-950/30 border border-red-900 p-3 rounded">
                      <p className="text-red-500 text-xs uppercase font-bold">Estoque vazio para esta posição.</p>
                      <p className="text-neutral-400 text-[10px] uppercase tracking-widest mt-1">A troca foi cancelada e o jogador continuará no seu elenco. Esta ação não consumirá sua cota de transferências.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {pacote.opcoes.map(opcao => (
                        <div 
                          key={opcao.id}
                          onClick={() => !bloqueado && selecionarEntrada(index, opcao)}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${pacote.selecionado?.id === opcao.id ? 'border-fifa-green bg-fifa-green/20 shadow-[0_0_15px_rgba(60,172,59,0.2)]' : 'border-neutral-800 bg-neutral-900 hover:border-fifa-green/50'}`}
                        >
                          <p className="font-black text-lg">{opcao.nome}</p>
                          <p className="text-[10px] text-cyan-400 uppercase font-black tracking-widest mb-2">{opcao.posicao}</p>
                          <p className="text-[10px] text-yellow-500/80 uppercase font-bold truncate">{opcao.clubeHistorico}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
