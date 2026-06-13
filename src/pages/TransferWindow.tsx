import { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { doc, onSnapshot, updateDoc, getDocs, collection } from 'firebase/firestore';
import { type GameState, type Jogador, type Clube } from '../types';

interface Usuario {
  id: string;
  nomeTime: string;
  elenco: Jogador[];
  trocasPermitidas: number;
  trocasRealizadas: number;
}

// O novo formato que liga quem sai com as suas opções de entrada
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
  
  // Controle de Etapas
  const [etapaTroca, setEtapaTroca] = useState<'SELECIONAR_SAIDA' | 'SELECIONAR_ENTRADAS'>('SELECIONAR_SAIDA');
  
  // 1. Mudamos para ARRAYS (Listas) em vez de um único jogador
  const [jogadoresParaSair, setJogadoresParaSair] = useState<Jogador[]>([]);
  const [substituicoes, setSubstituicoes] = useState<PacoteSubstituicao[]>([]);
  
  const [carregando, setCarregando] = useState(false);

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
    if (todosJogadoresBase.length === 0) return;
    const unsubUsuarios = onSnapshot(collection(db, "usuarios"), (snap) => {
      const idsOcupados = new Set<string>();
      snap.forEach(d => {
        const u = d.data() as Usuario;
        if (u.elenco) u.elenco.forEach((j: Jogador) => idsOcupados.add(j.id));
      });
      setJogadoresLivres(todosJogadoresBase.filter(j => !idsOcupados.has(j.id)));
    });
    return () => unsubUsuarios();
  }, [todosJogadoresBase]);

  const isMinhaVez = gameState?.draftTurnUid === uid;
  const trocasRestantes = meuTime ? (meuTime.trocasPermitidas - (meuTime.trocasRealizadas || 0)) : 0;

  // ==========================================
  // LÓGICA 1: SELECIONAR VÁRIOS PARA SAIR
  // ==========================================
  const toggleJogadorSaida = (jogador: Jogador) => {
    if (!isMinhaVez) return;
    
    // Se já estiver na lista, remove (desmarca)
    if (jogadoresParaSair.some(j => j.id === jogador.id)) {
      setJogadoresParaSair(prev => prev.filter(j => j.id !== jogador.id));
    } else {
      // Se tentar adicionar além do limite
      if (jogadoresParaSair.length >= trocasRestantes) {
        alert(`Atenção: Você só tem direito a mais ${trocasRestantes} trocas nesta janela.`);
        return;
      }
      // Adiciona (marca)
      setJogadoresParaSair(prev => [...prev, jogador]);
    }
  };

  // ==========================================
  // LÓGICA 2: TRAVAR E GERAR PACOTES DE OPÇÕES
  // ==========================================
  const travarSaidasEGerarOpcoes = () => {
    if (jogadoresParaSair.length === 0) return;

    // Criamos uma cópia dos agentes livres para ir removendo os que já foram sorteados
    // Isso impede que o mesmo agente livre apareça como opção para duas vagas diferentes!
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
        if (selecionados.length === 3) break; // Para quando tiver 3
      }

      // Remove os 3 sorteados do pool global para a próxima vaga não os repetir
      poolDisponivel = poolDisponivel.filter(l => !selecionados.some(s => s.id === l.id));

      novosPacotes.push({ saindo, opcoes: selecionados, selecionado: null });
    }

    setSubstituicoes(novosPacotes);
    setEtapaTroca('SELECIONAR_ENTRADAS');
  };

  // ==========================================
  // LÓGICA 3: MARCAR QUEM VAI ENTRAR
  // ==========================================
  const selecionarEntrada = (indexDoPacote: number, jogadorEscolhido: Jogador) => {
    setSubstituicoes(prev => {
      const novaLista = [...prev];
      novaLista[indexDoPacote].selecionado = jogadorEscolhido;
      return novaLista;
    });
  };

  // Verifica se o jogador já escolheu um substituto para CADA vaga que abriu
  const todasVagasPreenchidas = substituicoes.length > 0 && substituicoes.every(sub => 
    sub.opcoes.length === 0 || sub.selecionado !== null
  );

  // ==========================================
  // LÓGICA 4: CONFIRMAR E SALVAR TUDO
  // ==========================================
  const confirmarTrocasEmMassa = async () => {
    if (!meuTime || !gameState || !todasVagasPreenchidas) return;
    setCarregando(true);

    try {
      // Ignora os pacotes onde não houve contratação possível
      const substituicoesValidas = substituicoes.filter(sub => sub.selecionado !== null);

      const idsSaindo = substituicoesValidas.map(sub => sub.saindo.id);
      const jogadoresEntrando = substituicoesValidas.map(sub => sub.selecionado!);

      const elencoAtual = meuTime.elenco || [];
      
      // 1. Remove APENAS os jogadores que realmente foram substituídos
      const novoElenco = elencoAtual.filter(j => !idsSaindo.includes(j.id));
      
      // 2. Adiciona todo mundo que está a entrar
      novoElenco.push(...jogadoresEntrando);

      // 3. Atualiza o contador de trocas realizadas APENAS com as transações concretizadas
      const trocasFeitas = (meuTime.trocasRealizadas || 0) + substituicoesValidas.length;

      await updateDoc(doc(db, "usuarios", uid), {
        elenco: novoElenco,
        trocasRealizadas: trocasFeitas
      });

      // Passar a Vez
      const novaOrdem = [...(gameState.draftOrder || [])];
      novaOrdem.shift(); 

      if (novaOrdem.length > 0) {
        await updateDoc(doc(db, "game", "state"), { draftTurnUid: novaOrdem[0], draftOrder: novaOrdem });
      } else {
        await gerarProximaRodadaDeTransferencias();
      }

      // Limpar o estado visual
      setJogadoresParaSair([]);
      setSubstituicoes([]);
      setEtapaTroca('SELECIONAR_SAIDA');
      alert(`✅ ${substituicoes.length} transferência(s) concluída(s)!`);

    } catch (error) {
      console.error(error);
      alert("❌ Erro ao realizar trocas.");
    } finally {
      setCarregando(false);
    }
  };

  const gerarProximaRodadaDeTransferencias = async () => {
    if (!gameState || !gameState.standings) return;

    const usersSnap = await getDocs(collection(db, "usuarios"));
    const usuariosAtuais = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Usuario));
    const tabelaInvertida = [...gameState.standings].reverse();
    const novaFila: string[] = [];

    tabelaInvertida.forEach(timeDaTabela => {
      const user = usuariosAtuais.find(u => u.id === timeDaTabela.id);
      if (user && (user.trocasRealizadas || 0) < (user.trocasPermitidas || 0)) {
        novaFila.push(user.id);
      }
    });

    if (novaFila.length > 0) {
      await updateDoc(doc(db, "game", "state"), {
        draftTurnUid: novaFila[0], draftOrder: novaFila, currentRound: (gameState.currentRound || 1) + 1
      });
    } else {
      await updateDoc(doc(db, "game", "state"), { draftTurnUid: null, draftOrder: [] });
      alert("Janela de Transferências encerrada!");
    }
  };

  const encerrarMinhasTrocas = async () => {
    if (!window.confirm("Você abrirá mão das suas trocas restantes. Confirmar?")) return;
    
    await updateDoc(doc(db, "usuarios", uid), { trocasRealizadas: meuTime?.trocasPermitidas || 0 });

    const novaOrdem = [...(gameState?.draftOrder || [])];
    novaOrdem.shift();
    if (novaOrdem.length > 0) {
      await updateDoc(doc(db, "game", "state"), { draftTurnUid: novaOrdem[0], draftOrder: novaOrdem });
    } else {
      await gerarProximaRodadaDeTransferencias();
    }
  };

  if (gameState?.phase !== 'TRANSFER_WINDOW') {
    return <div className="text-white text-center mt-20">A Janela de Transferências está fechada.</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-8 text-white">
      <h1 className="text-3xl font-black uppercase text-purple-500 mb-2">Janela de Transferências</h1>
      <p className="text-neutral-400 mb-8 font-bold">
        Trocas Disponíveis: <span className="text-white text-xl">{trocasRestantes}</span>
      </p>

      {/* BANNER DE TURNO */}
      <div className={`p-4 rounded-xl font-black uppercase tracking-widest text-center mb-8 border-2 ${isMinhaVez ? 'bg-purple-900 border-purple-500 text-white animate-pulse' : 'bg-neutral-900 border-neutral-800 text-neutral-500'}`}>
        {isMinhaVez ? '⏱️ É A SUA VEZ! ESCOLHA QUEM ENTRA E QUEM SAI.' : 'Aguarde a sua vez...'}
      </div>

      {isMinhaVez && (
        <div className="flex flex-wrap gap-4 mb-8 justify-center">
          
          {etapaTroca === 'SELECIONAR_SAIDA' && (
            <button 
              disabled={jogadoresParaSair.length === 0}
              onClick={travarSaidasEGerarOpcoes}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 font-black uppercase tracking-widest rounded shadow-[0_0_15px_rgba(234,179,8,0.4)] transition-colors text-neutral-950"
            >
              Confirmar {jogadoresParaSair.length} Saída(s) e Ver Opções 🔒
            </button>
          )}

          {etapaTroca === 'SELECIONAR_ENTRADAS' && (
            <button 
              disabled={!todasVagasPreenchidas || carregando}
              onClick={confirmarTrocasEmMassa}
              className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-black uppercase tracking-widest rounded shadow-lg transition-colors"
            >
              {carregando ? 'A Processar...' : `Efetuar ${substituicoes.length} Transferência(s) ♻️`}
            </button>
          )}
          
          <button 
            onClick={encerrarMinhasTrocas}
            className="px-6 py-3 bg-red-950 hover:bg-red-900 border border-red-800 font-bold uppercase rounded transition-colors text-red-400"
          >
            Encerrar Minha Janela (Pular)
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
                  className={`p-3 rounded border cursor-pointer transition-all ${isSelecionado ? 'border-red-500 bg-red-950/40 shadow-[inset_0_0_10px_rgba(239,68,68,0.2)]' : 'border-neutral-800 bg-neutral-950 hover:border-red-500/50'}`}
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
              {/* Para CADA jogador que sai, criamos um bloco com 3 opções */}
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
                          onClick={() => isMinhaVez && selecionarEntrada(index, opcao)}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${pacote.selecionado?.id === opcao.id ? 'border-green-500 bg-green-950/40 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : 'border-neutral-800 bg-neutral-900 hover:border-green-500/50'}`}
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
