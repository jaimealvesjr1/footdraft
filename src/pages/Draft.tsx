// src/pages/Draft.tsx
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../services/firebase';
import { type Jogador } from '../types';

// ==========================================
// REGRAS DE NEGÓCIO LOCAIS
// ==========================================
const LIMITES = { GOL: 3, DEF: 6, MEI: 5, ATA: 5 };
const CORINGAS = 2; 
const ESCOLHAS_POR_RODADA = 3;
const JOGADORES_POR_PACOTE = 9;
const TOTAL_RODADAS = 7; 

export default function Draft() {
  const navigate = useNavigate();

  const [fase, setFase] = useState<'SETUP' | 'DRAFT' | 'SAVING'>('SETUP');
  const [nomeTime, setNomeTime] = useState('');
  const [nomeTecnico, setNomeTecnico] = useState('');
  const [erroSetup, setErroSetup] = useState('');

  const [piscinaJogadores, setPiscinaJogadores] = useState<Jogador[]>([]);
  const [jogadoresSorteadosNoPassado, setJogadoresSorteadosNoPassado] = useState<string[]>([]);
  
  const [pacoteAtual, setPacoteAtual] = useState<Jogador[]>([]);
  const [escolhasDaRodada, setEscolhasDaRodada] = useState<Jogador[]>([]);
  const [meuElenco, setMeuElenco] = useState<Jogador[]>([]);
  
  const [turnoAtual, setTurnoAtual] = useState<number>(1);
  const [carregandoDados, setCarregandoDados] = useState(true);

  // ==========================================
  // LÓGICA 1: BUSCAR JOGADORES NO FIREBASE
  // ==========================================
  useEffect(() => {
    const buscarJogadores = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "clubes"));
        let todosOsJogadores: Jogador[] = [];
        querySnapshot.forEach((doc) => {
          const clube = doc.data();
          if (clube.elenco) todosOsJogadores = [...todosOsJogadores, ...clube.elenco];
        });
        setPiscinaJogadores(todosOsJogadores);
      } catch (error) {
        console.error("Erro:", error);
      } finally {
        setCarregandoDados(false);
      }
    };
    buscarJogadores();
  }, []);

  const iniciarDraft = () => {
    if (nomeTime.length < 3 || nomeTecnico.length < 3) {
      setErroSetup('O nome do time e do técnico devem ter pelo menos 3 caracteres.');
      return;
    }
    setFase('DRAFT');
    gerarPacote(piscinaJogadores, []); // Passa um array vazio pois o elenco ainda está vazio
  };

  // ==========================================
  // LÓGICA 2: VALIDAÇÃO DE POSIÇÕES E DEADLOCK
  // ==========================================
  // Nota: Adicionamos o parâmetro 'simulacaoEscolhas' para a função prever o futuro sem mexer no estado real
  const podeEscolherMais = (posicao: string, simulacaoEscolhas: Jogador[] = escolhasDaRodada) => {
    const todosEscolhidos = [...meuElenco, ...simulacaoEscolhas];
    
    const contagem = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    todosEscolhidos.forEach(j => contagem[j.posicao as keyof typeof contagem]++);

    let coringasGastos = 0;
    Object.keys(LIMITES).forEach(pos => {
      const p = pos as keyof typeof LIMITES;
      if (contagem[p] > LIMITES[p]) {
        coringasGastos += (contagem[p] - LIMITES[p]);
      }
    });

    const qtdAtual = contagem[posicao as keyof typeof contagem];
    const limiteBase = LIMITES[posicao as keyof typeof LIMITES];

    if (qtdAtual < limiteBase) return true; 
    if (coringasGastos < CORINGAS) return true; 

    return false; 
  };

  // ==========================================
  // LÓGICA 3: GERAR PACOTE INTELIGENTE E BALANCEADO
  // ==========================================
  const gerarPacote = (piscina: Jogador[], elencoAtualSimulado: Jogador[] = meuElenco) => {
    // 1. Descobrimos quais posições o jogador AINDA PODE escolher
    // Isso evita o "Deadlock" na última rodada!
    const posicoesValidas = ['GOL', 'DEF', 'MEI', 'ATA'].filter(pos => podeEscolherMais(pos, []));
    
    // Fallback de segurança caso algo dê muito errado
    const posicoesParaGerar = posicoesValidas.length > 0 ? posicoesValidas : ['GOL', 'DEF', 'MEI', 'ATA'];

    const disponiveis = piscina.filter(j => !jogadoresSorteadosNoPassado.includes(j.id));
    const pacoteGerado: Jogador[] = [];

    // Função interna para puxar apenas 1 jogador, aplicar o Nerf e adicionar ao pacote
    const pescarUmComNerf = (posicao: string, minOvr: number, maxOvr: number) => {
      let filtro = disponiveis.filter(j => j.posicao === posicao && !pacoteGerado.some(p => p.id === j.id));
      if (filtro.length === 0) filtro = disponiveis.filter(j => !pacoteGerado.some(p => p.id === j.id)); // Fallback geral

      if (filtro.length > 0) {
        const escolhido = filtro.sort(() => Math.random() - 0.5)[0];
        const novoOverall = Math.floor(Math.random() * (maxOvr - minOvr + 1)) + minOvr;
        pacoteGerado.push({ ...escolhido, overall: novoOverall });
      }
    };

    // 2. Definimos os "Tiers" de força invisível para garantir o balanceamento do campeonato
    const tiers = [
      { min: 88, max: 95 }, { min: 88, max: 95 }, { min: 88, max: 95 }, // 3 Estrelas
      { min: 80, max: 87 }, { min: 80, max: 87 }, { min: 80, max: 87 }, // 3 Bons
      { min: 70, max: 79 }, { min: 70, max: 79 }, { min: 70, max: 79 }, // 3 Comuns/Bagres
    ];

    // 3. Distribuímos os Tiers uniformemente apenas entre as posições que o jogador precisa
    tiers.forEach((tier, index) => {
      const pos = posicoesParaGerar[index % posicoesParaGerar.length];
      pescarUmComNerf(pos, tier.min, tier.max);
    });

    const idsSorteados = pacoteGerado.map(j => j.id);
    setJogadoresSorteadosNoPassado(prev => [...prev, ...idsSorteados]);
    setPacoteAtual(pacoteGerado.sort(() => Math.random() - 0.5)); // Embaralha para o usuário não perceber o padrão de Tiers
    setEscolhasDaRodada([]); 
  };

  // ==========================================
  // LÓGICA 4: CLICAR NUMA CARTA
  // ==========================================
  const toggleJogador = (jogador: Jogador) => {
    const jaEstaSelecionado = escolhasDaRodada.some(j => j.id === jogador.id);

    if (jaEstaSelecionado) {
      setEscolhasDaRodada(prev => prev.filter(j => j.id !== jogador.id));
    } else {
      if (escolhasDaRodada.length >= ESCOLHAS_POR_RODADA) return; 
      if (podeEscolherMais(jogador.posicao)) {
        setEscolhasDaRodada(prev => [...prev, jogador]);
      }
    }
  };

  // ==========================================
  // LÓGICA 5: CONFIRMAR RODADA E SALVAR
  // ==========================================
  const confirmarRodada = async () => {
    const novoElenco = [...meuElenco, ...escolhasDaRodada];
    setMeuElenco(novoElenco);

    if (turnoAtual < TOTAL_RODADAS) {
      setTurnoAtual(turnoAtual + 1);
      gerarPacote(piscinaJogadores, novoElenco); // Gera o próximo pacote já considerando o novo elenco
    } else {
      setFase('SAVING');
      try {
        const usuarioAtual = auth.currentUser;
        if (!usuarioAtual) throw new Error("Usuário não autenticado.");

        const docRef = doc(db, "usuarios", usuarioAtual.uid);
        await setDoc(docRef, {
          elencoPronto: true,
          nomeTime: nomeTime,
          nomeTecnico: nomeTecnico,
          elenco: novoElenco,
          dataCriacao: new Date().toISOString()
        }, { merge: true });

        navigate('/dashboard');
      } catch (error) {
        console.error("Erro ao salvar o elenco:", error);
        alert("Erro ao salvar. Verifique o console.");
        setFase('DRAFT');
      }
    }
  };

  // ==========================================
  // RENDERIZAÇÃO
  // ==========================================
  if (carregandoDados) return <div className="h-screen bg-slate-900 flex items-center justify-center text-emerald-400 font-bold">Preparando o Draft...</div>;
  if (piscinaJogadores.length < 21) return <div className="h-screen bg-slate-900 text-white flex items-center justify-center">O banco de dados precisa de pelo menos 21 jogadores. Use o Admin.</div>;
  if (fase === 'SAVING') return <div className="h-screen bg-slate-900 flex flex-col items-center justify-center text-emerald-400 font-bold text-2xl animate-pulse">Criando a franquia {nomeTime}... ⚽</div>;

  if (fase === 'SETUP') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
          <h1 className="text-3xl font-black text-white mb-2 text-center">Crie o seu Clube</h1>
          <p className="text-slate-400 text-center mb-8 text-sm">Defina a identidade do seu time antes de iniciar o Draft.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-bold mb-2">Nome do Time</label>
              <input type="text" value={nomeTime} onChange={e => setNomeTime(e.target.value)} placeholder="Ex: Galáticos FC" className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:outline-none focus:border-emerald-500"/>
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-bold mb-2">Nome do Técnico</label>
              <input type="text" value={nomeTecnico} onChange={e => setNomeTecnico(e.target.value)} placeholder="Ex: Guardiola" className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:outline-none focus:border-emerald-500"/>
            </div>
          </div>
          
          {erroSetup && <p className="text-red-400 text-sm mt-4 text-center">{erroSetup}</p>}
          
          <button onClick={iniciarDraft} className="w-full mt-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded transition-colors shadow-lg shadow-emerald-900/50">
            Iniciar Draft (21 Jogadores)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
        
        <div className="flex-1 flex flex-col">
          <div className="border-b border-slate-700 pb-4 mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black text-white">Rodada <span className="text-emerald-500">{turnoAtual}</span> / {TOTAL_RODADAS}</h1>
              <p className="text-slate-400">Escolha 3 jogadores para o <strong className="text-white">{nomeTime}</strong></p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-400">{escolhasDaRodada.length}/3</span>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Selecionados</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
            {pacoteAtual.map((jogador) => {
              const isSelecionado = escolhasDaRodada.some(j => j.id === jogador.id);
              const isDisabled = !isSelecionado && (!podeEscolherMais(jogador.posicao) || escolhasDaRodada.length >= ESCOLHAS_POR_RODADA);

              return (
                <button
                  key={jogador.id}
                  onClick={() => toggleJogador(jogador)}
                  disabled={isDisabled}
                  className={`p-4 rounded-xl border-2 text-left transition-all group relative overflow-hidden flex flex-col justify-center h-32
                    ${isSelecionado ? 'bg-emerald-900/40 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 
                      isDisabled ? 'bg-slate-900 border-slate-800 opacity-40 cursor-not-allowed grayscale' : 
                      'bg-slate-800 border-slate-700 hover:border-slate-500 cursor-pointer shadow-lg'}
                  `}
                >
                  {/* Design simplificado: Apenas Nome, Posição e Clube Histórico. Overall Ocultado! */}
                  <div className="flex justify-between items-start w-full">
                    <span className="text-xs bg-slate-950 px-2 py-1 rounded font-bold text-slate-300 border border-slate-700 mb-2">
                      {jogador.posicao}
                    </span>
                  </div>
                  <div>
                    <p className={`font-black text-xl truncate ${isSelecionado ? 'text-emerald-400' : 'text-white'}`}>{jogador.nome}</p>
                    <p className="text-xs text-slate-400 truncate mt-1">{jogador.clubeHistorico}</p>
                  </div>
                  
                  {isSelecionado && <div className="absolute top-4 right-4 bg-emerald-500 w-3 h-3 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]"></div>}
                </button>
              );
            })}
          </div>

          <button 
            onClick={confirmarRodada}
            disabled={escolhasDaRodada.length !== ESCOLHAS_POR_RODADA}
            className="mt-6 w-full py-4 rounded-xl font-black text-lg transition-all disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg"
          >
            {escolhasDaRodada.length === ESCOLHAS_POR_RODADA ? `Confirmar Rodada ${turnoAtual}` : `Selecione mais ${ESCOLHAS_POR_RODADA - escolhasDaRodada.length} jogadores`}
          </button>
        </div>

        <div className="w-full lg:w-80 bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit sticky top-8 flex flex-col gap-6">
          <div>
            <h3 className="font-black text-xl text-white">Técnico {nomeTecnico}</h3>
            <p className="text-xs text-emerald-500 uppercase tracking-widest font-bold">Resumo do Elenco</p>
          </div>

          <div className="space-y-3 bg-slate-900 p-4 rounded-lg border border-slate-700">
            {Object.entries(LIMITES).map(([pos, max]) => {
              const atual = [...meuElenco, ...escolhasDaRodada].filter(j => j.posicao === pos).length;
              const extra = atual > max ? atual - max : 0;
              const base = atual > max ? max : atual;
              
              return (
                <div key={pos}>
                  <div className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                    <span>{pos} {extra > 0 && <span className="text-yellow-500">(+{extra} C)</span>}</span>
                    <span>{atual} / {max}</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 flex">
                    <div className="bg-blue-500 h-1.5 rounded-l-full" style={{ width: `${(base / max) * 100}%` }}></div>
                    {extra > 0 && <div className="bg-yellow-500 h-1.5 rounded-r-full" style={{ width: `${(extra / CORINGAS) * 100}%` }}></div>}
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-slate-700 mt-2">
              <div className="flex justify-between text-xs font-bold text-yellow-500">
                <span>CORINGAS USADOS</span>
                <span>
                  {Object.entries(LIMITES).reduce((acc, [pos, max]) => {
                    const count = [...meuElenco, ...escolhasDaRodada].filter(j => j.posicao === pos).length;
                    return acc + (count > max ? count - max : 0);
                  }, 0)} / {CORINGAS}
                </span>
              </div>
            </div>
          </div>

          <ul className="space-y-2 overflow-y-auto max-h-60 custom-scrollbar pr-2">
            {[...meuElenco, ...escolhasDaRodada].map((j, i) => (
              <li key={i} className={`flex justify-between items-center p-2 rounded border ${escolhasDaRodada.some(e => e.id === j.id) ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-slate-900 border-slate-700'}`}>
                <span className="font-bold text-slate-200 text-sm truncate w-32">{j.nome}</span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1 rounded">{j.posicao}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
}
