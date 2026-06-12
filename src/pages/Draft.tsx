import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";

import { packBrasileirao } from "../data/packBrasileirao";
import { type Jogador } from "../types";

export default function Draft() {
  const { salaId } = useParams();
  const navigate = useNavigate();
  
  const [sala, setSala] = useState<any>(null);
  const [opcoesRodada, setOpcoesRodada] = useState<Jogador[]>([]);
  const [minhasEscolhas, setMinhasEscolhas] = useState<Jogador[]>([]);

  useEffect(() => {
    if (!salaId) return;
    const salaRef = doc(db, "drafts", salaId);
    
    const unsubscribe = onSnapshot(salaRef, (docSnap) => {
      if (docSnap.exists()) {
        setSala(docSnap.data());
      } else {
        alert("Esta sala foi encerrada.");
        navigate("/lobby");
      }
    });

    return () => unsubscribe();
  }, [salaId, navigate]);

  useEffect(() => {
    if (sala?.status === "em_andamento") {
      const jogadorDaVez = sala.ordemDraft[sala.turnoAtualIndex];
      const eAMinhaVez = jogadorDaVez.uid === auth.currentUser?.uid;
      const meuElenco = sala.elencos?.[auth.currentUser!.uid]?.jogadores || [];

      // Impede geração de cartas se o jogador já estiver com o time cheio
      if (eAMinhaVez && opcoesRodada.length === 0 && meuElenco.length < 23) {
        const disponiveis = packBrasileirao.filter(
          (p) => !sala.jogadoresSelecionadosIds?.includes(p.id)
        );
        
        const sorteados = [...disponiveis].sort(() => Math.random() - 0.5).slice(0, 10);
        setOpcoesRodada(sorteados);
        setMinhasEscolhas([]); 
      } else if (!eAMinhaVez) {
        setOpcoesRodada([]);
        setMinhasEscolhas([]);
      }
    }
  }, [sala?.turnoAtualIndex, sala?.status]);

  const iniciarDraft = async () => {
    if (!salaId || !sala.jogadores) return;
    const ordemSorteada = [...sala.jogadores].sort(() => Math.random() - 0.5);
    
    const elencosIniciais: any = {};
    sala.jogadores.forEach((j: any) => {
      elencosIniciais[j.uid] = { jogadores: [] };
    });

    try {
      const salaRef = doc(db, "drafts", salaId);
      await updateDoc(salaRef, {
        status: "em_andamento",
        ordemDraft: ordemSorteada,
        turnoAtualIndex: 0,
        rodadaAtual: 1,
        jogadoresSelecionadosIds: [],
        elencos: elencosIniciais
      });
    } catch (erro) {
      console.error(erro);
    }
  };

  const selecionarCarta = (jogador: Jogador, limiteAtual: number) => {
    if (minhasEscolhas.find((j) => j.id === jogador.id)) {
      setMinhasEscolhas(minhasEscolhas.filter((j) => j.id !== jogador.id));
    } else if (minhasEscolhas.length < limiteAtual) {
      setMinhasEscolhas([...minhasEscolhas, jogador]);
    }
  };

  const confirmarEscolhas = async (limiteAtual: number) => {
    if (minhasEscolhas.length !== limiteAtual) return;

    const salaRef = doc(db, "drafts", salaId!);
    const meusNovosIds = minhasEscolhas.map(j => j.id);
    const meuUid = auth.currentUser!.uid;

    let proximoIndex = sala.turnoAtualIndex + 1;
    let novaRodada = sala.rodadaAtual;

    if (proximoIndex >= sala.ordemDraft.length) {
      proximoIndex = 0;
      novaRodada++;
    }

    // Projeta o novo tamanho do elenco
    const tamanhoAtualizado = (sala.elencos[meuUid]?.jogadores.length || 0) + minhasEscolhas.length;

    try {
      await updateDoc(salaRef, {
        jogadoresSelecionadosIds: arrayUnion(...meusNovosIds),
        [`elencos.${meuUid}.jogadores`]: arrayUnion(...minhasEscolhas),
        turnoAtualIndex: proximoIndex,
        rodadaAtual: novaRodada
      });

      // Verificação de fim de draft: se o próximo a jogar já tiver 23, o draft acabou
      // (Isso assume que todos terminam na mesma rodada)
      const proximoUid = sala.ordemDraft[proximoIndex].uid;
      const elencoDoProximo = sala.elencos[proximoUid]?.jogadores.length || 0;
      
      if (tamanhoAtualizado === 23 && elencoDoProximo === 23) {
         await updateDoc(salaRef, { status: "finalizado" });
      }

    } catch (erro) {
      console.error(erro);
    }
  };

  if (!sala) return <div className="h-screen bg-slate-900 text-white flex justify-center items-center">A carregar...</div>;

  // VISÃO 3: DRAFT FINALIZADO
  if (sala.status === "finalizado") {
    return (
        <div className="h-screen bg-slate-900 text-white flex flex-col justify-center items-center">
            <h1 className="text-4xl font-bold text-emerald-400 mb-4">Draft Finalizado!</h1>
            <p className="text-xl text-slate-300 mb-8">Todos os times estão completos.</p>
            <button 
                onClick={() => navigate(`/dashboard/${salaId}`)} // <-- Adicionamos o ${salaId} aqui
                className="bg-emerald-500 text-slate-900 font-bold px-8 py-4 rounded shadow-lg transition"
            >
            Ir para a Escalação
            </button>
        </div>
    );
  }

  // VISÃO 1: JOGO EM ANDAMENTO
  if (sala.status === "em_andamento") {
    const jogadorDaVez = sala.ordemDraft[sala.turnoAtualIndex];
    const eAMinhaVez = jogadorDaVez.uid === auth.currentUser?.uid;
    const meuElenco = sala.elencos?.[auth.currentUser!.uid]?.jogadores || [];
    
    // Calcula quantos faltam, garantindo que não exija 3 se faltarem apenas 2 ou 1
    const vagasRestantes = Math.max(0, 23 - meuElenco.length);
    const limiteEscolhasDaRodada = Math.min(3, vagasRestantes);

    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
        <div className="w-full max-w-7xl bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl mb-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400">Rodada {sala.rodadaAtual}</h1>
            <p className="text-slate-400">Ocupação do Elenco: <span className="text-emerald-300 font-bold">{meuElenco.length} / 23</span></p>
          </div>
          <div className={`px-8 py-3 rounded-lg border-2 ${eAMinhaVez ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
            <h2 className="font-bold text-xl uppercase">
              {eAMinhaVez ? "🔥 TUA VEZ DE ESCOLHER!" : `Vez de: ${jogadorDaVez.email.split('@')[0]}`}
            </h2>
          </div>
        </div>

        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* LADO ESQUERDO: ORDEM E MEU ELENCO */}
          <div className="flex flex-col gap-4">
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <h3 className="font-bold mb-3 text-slate-200 border-b border-slate-700 pb-2">Ordem de Escolha</h3>
              <ul className="space-y-2">
                {sala.ordemDraft.map((j: any, idx: number) => (
                  <li key={idx} className={`p-2 rounded flex items-center gap-2 ${idx === sala.turnoAtualIndex ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-300' : 'text-slate-400'}`}>
                    <span className="font-bold">{idx + 1}º</span>
                    <span className="truncate">{j.email.split('@')[0]}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* MEU ELENCO (DASHBOARD ESTRATÉGICO) */}
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex-1 overflow-y-auto max-h-125">
              <h3 className="font-bold mb-3 text-slate-200 border-b border-slate-700 pb-2 flex justify-between">
                Meu Elenco 
                <span className="text-emerald-400">{meuElenco.length}</span>
              </h3>
              {meuElenco.length === 0 ? (
                <p className="text-sm text-slate-500 text-center mt-10">Nenhum jogador selecionado.</p>
              ) : (
                <ul className="space-y-2">
                  {meuElenco.map((j: Jogador, idx: number) => (
                    <li key={idx} className="bg-slate-900 p-2 rounded flex justify-between items-center border border-slate-700">
                      <div>
                        <span className="text-xs bg-slate-700 px-1 rounded mr-2">{j.posicao}</span>
                        <span className="text-sm font-semibold">{j.nome}</span>
                      </div>
                      <span className="text-emerald-400 font-bold text-sm bg-emerald-900/30 px-2 rounded">OVR {j.overall}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* MESA DE CARTAS (DIREITA) */}
          <div className="lg:col-span-3 bg-slate-800 p-6 rounded-xl border border-slate-700 min-h-125 flex flex-col">
            {!eAMinhaVez ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                <span className="text-6xl mb-4">⏳</span>
                <p className="text-xl">Aguardando a escolha de {jogadorDaVez.email.split('@')[0]}...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-end mb-6 border-b border-slate-700 pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-200">Jogadores Disponíveis</h2>
                    <p className="text-slate-400">Escolha exatamente <span className="font-bold text-emerald-400">{limiteEscolhasDaRodada}</span> jogador(es).</p>
                  </div>
                  <span className={`font-bold ${minhasEscolhas.length === limiteEscolhasDaRodada ? 'text-emerald-400' : 'text-yellow-400'}`}>
                    {minhasEscolhas.length} / {limiteEscolhasDaRodada} Selecionados
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                  {opcoesRodada.map((jogador) => {
                    const selecionado = minhasEscolhas.some(j => j.id === jogador.id);
                    return (
                      <div 
                        key={jogador.id}
                        onClick={() => selecionarCarta(jogador, limiteEscolhasDaRodada)}
                        className={`relative cursor-pointer transition-transform hover:scale-105 p-3 rounded-lg border-2 flex flex-col items-center text-center bg-slate-900
                          ${selecionado ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-slate-600 hover:border-slate-400'}
                        `}
                      >
                        <span className="absolute top-2 left-2 text-xs font-bold bg-slate-800 px-2 py-1 rounded">
                          {jogador.posicao}
                        </span>
                        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center mb-3 mt-4">
                          <span className="font-bold text-xl text-slate-500">??</span>
                        </div>
                        <h3 className="font-bold text-sm leading-tight mb-1">{jogador.nome}</h3>
                        <p className="text-xs text-slate-400">{jogador.clubeHistorico}</p>
                        {selecionado && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-slate-900 font-bold text-xs">
                            ✓
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-auto flex justify-end">
                  <button 
                    onClick={() => confirmarEscolhas(limiteEscolhasDaRodada)}
                    disabled={minhasEscolhas.length !== limiteEscolhasDaRodada}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 disabled:text-slate-400 text-slate-900 font-bold px-8 py-3 rounded shadow-lg transition"
                  >
                    Confirmar e Passar Vez
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VISÃO 2: SALA DE ESPERA (Aguardando)
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center">
      <div className="bg-slate-800 w-full max-w-4xl p-6 rounded-xl border border-slate-700 shadow-xl mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-emerald-400 mb-2">Sala de Draft</h1>
          <p className="text-slate-400 text-sm">
            Código para convite: <span className="font-mono bg-slate-900 px-2 py-1 rounded text-emerald-300 select-all">{salaId}</span>
          </p>
        </div>
      </div>
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-xl font-bold mb-4">Jogadores ({sala.jogadores?.length || 0})</h2>
          <ul className="space-y-3">
            {sala.jogadores?.map((j: any, i: number) => (
              <li key={i} className="bg-slate-900 p-3 rounded">{j.email}</li>
            ))}
          </ul>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col justify-center items-center">
          {auth.currentUser?.uid === sala.criadorId ? (
            <button onClick={iniciarDraft} className="bg-emerald-500 text-slate-900 font-bold px-8 py-4 rounded-lg">Iniciar Draft</button>
          ) : (
            <p>A aguardar o Host...</p>
          )}
        </div>
      </div>
    </div>
  );
}
