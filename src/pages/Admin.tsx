// src/pages/Admin.tsx
import { useState, useEffect } from 'react';
import { type Clube, type GamePhase, type GameState } from '../types'; 
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase'; 

export default function Admin() {
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Estados antigos do gerador de times (mantidos para você continuar adicionando times base)
  const [termoBusca, setTermoBusca] = useState('');
  const [jsonImportado, setJsonImportado] = useState('');
  const [timeEncontrado, setTimeEncontrado] = useState<Clube | null>(null);
  const [erroJson, setErroJson] = useState('');
  const [salvando, setSalvando] = useState(false);

  // ==========================================
  // LÓGICA 1: OUVIR O ESTADO GLOBAL DO JOGO
  // ==========================================
  useEffect(() => {
    // Escuta o documento mestre do jogo em tempo real
    const unsubscribe = onSnapshot(doc(db, "game", "state"), (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data() as GameState);
      } else {
        // Se não existir, cria o estado inicial
        setDoc(doc(db, "game", "state"), {
          phase: 'SETUP',
          currentRound: 1,
          draftTurnUid: null,
          draftDeadline: null,
          playersReady: []
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Função para mudar a fase do jogo para todos os usuários
  const mudarFase = async (novaFase: GamePhase) => {
    if (window.confirm(`Tem certeza que deseja mudar o jogo para a fase: ${novaFase}? Todos os jogadores serão redirecionados.`)) {
      await setDoc(doc(db, "game", "state"), { phase: novaFase }, { merge: true });
    }
  };

  // ==========================================
  // LÓGICA 2: GERADOR DE JSON (MANTIDO)
  // ==========================================
  const promptParaIA = termoBusca ? `Atue como um especialista em futebol e estatísticas. Gere um arquivo JSON com os 15 jogadores do elenco do ${termoBusca} sendo: 3 Estrelas (OVR 88-95), 5 Titulares (OVR 80-87), e 7 Reservas (OVR 65-79). Siga esta estrutura:\n\n{\n  "id": "${termoBusca.toLowerCase().replace(/\s+/g, '-')}",\n  "nome": "${termoBusca.replace(/\d+/g, '').trim()}",\n  "ano": ${termoBusca.replace(/\D/g, '') || 2000},\n  "elenco": [\n    { "id": "uuid-1", "nome": "Nome", "posicao": "GOL", "clubeHistorico": "${termoBusca}", "overall": 85, "statusFisico": { "cansaco": 0, "lesionado": false, "suspenso": false }, "temporadasNoClube": 0 }\n  ]\n}` : '';

  const carregarJson = () => {
    try {
      setErroJson(''); 
      const obj = JSON.parse(jsonImportado) as Clube;
      if (!obj.elenco || !Array.isArray(obj.elenco)) throw new Error('O JSON não possui um array de "elenco" válido.');
      setTimeEncontrado(obj);
    } catch (error) {
      setErroJson('Erro ao ler o JSON. Detalhes: ' + (error as Error).message);
      setTimeEncontrado(null);
    }
  };

  const salvarTimeNoBanco = async () => {
    if (!timeEncontrado) return;
    try {
      setSalvando(true);
      await setDoc(doc(db, "clubes", timeEncontrado.id), timeEncontrado);
      alert(`✅ O time ${timeEncontrado.nome} foi salvo com sucesso!`);
      setTimeEncontrado(null); setJsonImportado(''); setTermoBusca('');
    } catch (error) {
      console.error(error); alert("❌ Erro ao salvar o time.");
    } finally { setSalvando(false); }
  };

  // ==========================================
  // RENDERIZAÇÃO
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="border-b border-slate-700 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-white mb-2">Painel do <span className="text-emerald-500">Game Master</span></h1>
            <p className="text-slate-400">Controle as fases do campeonato e adicione times base.</p>
          </div>
        </div>

        {/* ========================================== */}
        {/* NOVO: CONTROLE MESTRE DE FASES             */}
        {/* ========================================== */}
        <div className="bg-slate-800 p-6 rounded-xl border border-blue-500 shadow-xl shadow-blue-900/20">
          <h2 className="font-bold text-xl text-white mb-4">Controle do Campeonato (Multiplayer)</h2>
          <div className="flex items-center gap-4 mb-6">
            <span className="text-slate-400 font-bold">Fase Atual do Servidor:</span>
            <span className="px-4 py-1 bg-blue-900 text-blue-400 font-black rounded border border-blue-700">
              {gameState?.phase || 'CARREGANDO...'}
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => mudarFase('SETUP')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 font-bold rounded text-white transition-colors">
              1. Sala de Espera (Setup)
            </button>
            <button onClick={() => mudarFase('PRE_SEASON')} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 font-bold rounded text-white transition-colors">
              2. Iniciar Pré-Temporada (Draft)
            </button>
            <button onClick={() => mudarFase('FIRST_HALF')} className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 font-bold rounded text-white transition-colors">
              3. Iniciar 1º Turno
            </button>
            <button onClick={() => mudarFase('TRANSFER_WINDOW')} className="px-4 py-2 bg-purple-700 hover:bg-purple-600 font-bold rounded text-white transition-colors">
              4. Janela de Transferências
            </button>
            <button onClick={() => mudarFase('SECOND_HALF')} className="px-4 py-2 bg-red-700 hover:bg-red-600 font-bold rounded text-white transition-colors">
              5. Iniciar 2º Turno
            </button>
          </div>
        </div>

        {/* O Resto da tela de Admin (Gerador de Times) continua igual aqui embaixo... */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="font-bold text-xl text-white mb-4">Gerador de Times Base (IA)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col">
              <input type="text" placeholder="Ex: Cruzeiro 2003" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} className="bg-slate-900 border border-slate-600 text-white p-3 rounded-lg mb-4"/>
              {promptParaIA && (
                <>
                  <textarea readOnly value={promptParaIA} className="w-full h-32 p-4 bg-slate-950 border border-slate-700 rounded-lg text-xs text-blue-400 font-mono resize-none"/>
                  <button onClick={() => navigator.clipboard.writeText(promptParaIA)} className="mt-2 text-sm text-blue-400 font-bold hover:text-blue-300">Copiar Prompt</button>
                </>
              )}
            </div>
            <div className="flex flex-col">
              <textarea placeholder='Cole o JSON aqui...' value={jsonImportado} onChange={(e) => setJsonImportado(e.target.value)} className="w-full h-32 p-4 bg-slate-950 border border-slate-700 rounded-lg text-xs text-emerald-400 font-mono resize-none mb-4"/>
              <button onClick={carregarJson} disabled={!jsonImportado} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-500 disabled:opacity-50">Analisar JSON</button>
              {erroJson && <p className="text-red-400 text-sm mt-4">{erroJson}</p>}
            </div>
          </div>

          {timeEncontrado && (
            <div className="mt-8 p-6 bg-slate-900 rounded-xl border border-emerald-500/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-white">{timeEncontrado.nome} {timeEncontrado.ano}</h3>
                <p className="text-slate-400 text-sm">{timeEncontrado.elenco.length} Jogadores</p>
              </div>
              <button onClick={salvarTimeNoBanco} disabled={salvando} className="bg-emerald-500 text-slate-900 px-6 py-3 rounded-lg font-black hover:bg-emerald-400">
                {salvando ? 'Salvando...' : 'Salvar no Banco de Dados'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
