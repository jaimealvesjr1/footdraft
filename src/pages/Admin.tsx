// src/pages/Admin.tsx
import { useState, useEffect } from 'react';
import { type Clube, type GamePhase, type GameState, type Posicao } from '../types'; 
import { doc, setDoc, deleteDoc, onSnapshot, getDocs, collection } from 'firebase/firestore';
import { db } from '../services/firebase'; 

export default function Admin() {
  // Estados do Jogo
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Estados do Gerenciador de Clubes
  const [clubesSalvos, setClubesSalvos] = useState<Clube[]>([]);
  const [termoBusca, setTermoBusca] = useState('');
  const [jsonImportado, setJsonImportado] = useState('');
  const [erroJson, setErroJson] = useState('');
  
  // Estado do EDITOR DE CLUBE
  const [clubeEmEdicao, setClubeEmEdicao] = useState<Clube | null>(null);
  const [salvando, setSalvando] = useState(false);

  // ==========================================
  // LÓGICA 1: OUVINTES DO FIREBASE
  // ==========================================
  useEffect(() => {
    // Ouvinte do Estado do Jogo
    const unsubGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) setGameState(docSnap.data() as GameState);
    });

    // Ouvinte dos Clubes Salvos no Banco
    const unsubClubes = onSnapshot(collection(db, "clubes"), (snapshot) => {
      const lista: Clube[] = [];
      snapshot.forEach(doc => lista.push(doc.data() as Clube));
      setClubesSalvos(lista);
    });

    return () => { unsubGame(); unsubClubes(); };
  }, []);

  // ==========================================
  // LÓGICA 2: CONTROLES DO GAME MASTER
  // ==========================================
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
  const promptParaIA = termoBusca ? `Gere um arquivo JSON com 15 jogadores do elenco do ${termoBusca}. Siga esta estrutura:\n{\n  "id": "${termoBusca.toLowerCase().replace(/\s+/g, '-')}",\n  "nome": "${termoBusca.replace(/\d+/g, '').trim()}",\n  "ano": ${termoBusca.replace(/\D/g, '') || 2000},\n  "elenco": [\n    { "id": "uuid-1", "nome": "Nome", "posicao": "GOL", "clubeHistorico": "${termoBusca}", "overall": 85, "statusFisico": { "cansaco": 0, "lesionado": false, "suspenso": false }, "temporadasNoClube": 0 }\n  ]\n}` : '';

  const carregarJson = () => {
    try {
      setErroJson(''); 
      const obj = JSON.parse(jsonImportado) as Clube;
      if (!obj.elenco) throw new Error('O JSON não possui a propriedade "elenco".');
      setClubeEmEdicao(obj); // Abre o editor com os dados importados!
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
      await setDoc(doc(db, "clubes", clubeEmEdicao.id), clubeEmEdicao);
      alert(`✅ O time ${clubeEmEdicao.nome} foi salvo no banco de dados!`);
      setClubeEmEdicao(null); setJsonImportado(''); setTermoBusca('');
    } catch (error) { alert("❌ Erro ao salvar."); } 
    finally { setSalvando(false); }
  };

  const excluirClube = async (idClube: string) => {
    if (window.confirm("ATENÇÃO! Excluir este time do banco de dados definitivamente?")) {
      await deleteDoc(doc(db, "clubes", idClube));
    }
  };

  // ==========================================
  // RENDERIZAÇÃO
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <h1 className="text-3xl font-black text-white">Painel do <span className="text-emerald-500">Game Master</span></h1>

        {/* CONTROLE MESTRE DE FASES */}
        <div className="bg-slate-800 p-6 rounded-xl border border-blue-500 shadow-xl shadow-blue-900/20">
          <h2 className="font-bold text-xl text-white mb-4">Controle do Campeonato (Multiplayer)</h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <button onClick={() => mudarFase('SETUP')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 font-bold rounded text-white transition-colors">
              1. Sala de Espera (Setup)
            </button>
            <button onClick={iniciarPreTemporada} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 font-bold rounded text-white transition-colors">
              2. Iniciar Pré-Temporada
            </button>
            <button onClick={() => mudarFase('FIRST_HALF')} className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 font-bold rounded text-white transition-colors">
              3. Iniciar 1º Turno
            </button>
            <button onClick={() => mudarFase('TRANSFER_WINDOW')} className="px-4 py-2 bg-purple-700 hover:bg-purple-600 font-bold rounded text-white transition-colors">
              4. Janela de Transferências
            </button>
          </div>
          <p className="text-sm text-slate-400">Fase Atual do Servidor: <strong className="text-blue-400">{gameState?.phase || 'CARREGANDO...'}</strong></p>
        </div>

        {/* GERENCIADOR DE CLUBES (DB e Importação) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LADO ESQUERDO: Importação e Lista */}
          <div className="space-y-8">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h2 className="font-bold text-lg text-white mb-4">Importar JSON (IA)</h2>
              <input type="text" placeholder="Prompt (Ex: Cruzeiro 2003)" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} className="w-full bg-slate-900 border border-slate-600 text-white p-2 rounded mb-2"/>
              {promptParaIA && <button onClick={() => navigator.clipboard.writeText(promptParaIA)} className="w-full mb-4 text-xs bg-blue-900/50 text-blue-400 py-1 rounded">Copiar Prompt</button>}
              <textarea placeholder='Cole o JSON...' value={jsonImportado} onChange={(e) => setJsonImportado(e.target.value)} className="w-full h-32 p-2 bg-slate-950 border border-slate-700 rounded text-xs text-emerald-400 font-mono mb-2"/>
              <button onClick={carregarJson} disabled={!jsonImportado} className="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-500 disabled:opacity-50">Analisar e Editar</button>
              {erroJson && <p className="text-red-400 text-xs mt-2">{erroJson}</p>}
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 max-h-96 overflow-y-auto custom-scrollbar">
              <h2 className="font-bold text-lg text-white mb-4">Clubes no Banco ({clubesSalvos.length})</h2>
              {clubesSalvos.map(clube => (
                <div key={clube.id} className="flex justify-between items-center bg-slate-900 p-3 mb-2 rounded border border-slate-700">
                  <div>
                    <p className="font-bold text-white">{clube.nome} {clube.ano}</p>
                    <p className="text-xs text-slate-400">{clube.elenco.length} Jogadores</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setClubeEmEdicao(clube)} className="text-xs bg-blue-600 px-2 py-1 rounded font-bold hover:bg-blue-500">✏️ Editar</button>
                    <button onClick={() => excluirClube(clube.id)} className="text-xs bg-red-600 px-2 py-1 rounded font-bold hover:bg-red-500">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LADO DIREITO: EDITOR DO CLUBE (Menu Sanduíche detalhado) */}
          <div className="lg:col-span-2">
            {clubeEmEdicao ? (
              <div className="bg-slate-800 p-6 rounded-xl border border-emerald-500 shadow-xl">
                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                  <h2 className="text-2xl font-black text-white">Editor de Elenco</h2>
                  <div className="flex gap-4">
                    <button onClick={() => setClubeEmEdicao(null)} className="px-4 py-2 bg-slate-700 rounded font-bold text-white hover:bg-slate-600">Cancelar</button>
                    <button onClick={salvarClube} disabled={salvando} className="px-4 py-2 bg-emerald-600 rounded font-bold text-white hover:bg-emerald-500 shadow-lg">{salvando ? 'Salvando...' : 'Salvar Alterações'}</button>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-400 mb-1">Nome do Clube</label>
                    <input type="text" value={clubeEmEdicao.nome} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, nome: e.target.value})} className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white font-bold"/>
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-bold text-slate-400 mb-1">Ano</label>
                    <input type="number" value={clubeEmEdicao.ano} onChange={(e) => setClubeEmEdicao({...clubeEmEdicao, ano: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white font-bold text-center"/>
                  </div>
                </div>

                <div className="space-y-2 max-h-150 overflow-y-auto custom-scrollbar pr-2">
                  {clubeEmEdicao.elenco.map((jogador, index) => (
                    <div key={jogador.id || index} className="grid grid-cols-12 gap-2 bg-slate-900 p-3 rounded-lg border border-slate-700 items-center">
                      
                      <div className="col-span-6 md:col-span-5">
                        <label className="block text-[10px] text-slate-500 mb-1">Nome do Jogador</label>
                        <input type="text" value={jogador.nome} onChange={(e) => handleEditJogador(jogador.id, 'nome', e.target.value)} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm focus:border-blue-500 outline-none"/>
                      </div>

                      <div className="col-span-3 md:col-span-3">
                        <label className="block text-[10px] text-slate-500 mb-1">Posição</label>
                        <select value={jogador.posicao} onChange={(e) => handleEditJogador(jogador.id, 'posicao', e.target.value as Posicao)} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm font-bold focus:border-blue-500 outline-none">
                          <option value="GOL">GOL</option>
                          <option value="DEF">DEF</option>
                          <option value="MEI">MEI</option>
                          <option value="ATA">ATA</option>
                        </select>
                      </div>

                      <div className="col-span-3 md:col-span-2">
                        <label className="block text-[10px] text-slate-500 mb-1">Overall</label>
                        <input type="number" value={jogador.overall} onChange={(e) => handleEditJogador(jogador.id, 'overall', Number(e.target.value))} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-yellow-500 font-black text-center text-sm focus:border-yellow-500 outline-none"/>
                      </div>

                      {/* Exibe ícones de status atual se existirem */}
                      <div className="hidden md:flex col-span-2 items-center justify-center gap-2 pt-4">
                        <span className={`text-xs ${jogador.statusFisico?.lesionado ? 'text-red-500' : 'text-slate-600 opacity-30'}`} title="Lesionado">🏥</span>
                        <span className={`text-xs ${jogador.statusFisico?.suspenso ? 'text-red-500' : 'text-slate-600 opacity-30'}`} title="Suspenso">🟥</span>
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl p-10 text-slate-500">
                <span className="text-6xl mb-4">⚙️</span>
                <p className="font-bold text-xl">Selecione um clube para editar</p>
                <p className="text-sm">Importe um JSON ou clique em "Editar" na lista ao lado.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
