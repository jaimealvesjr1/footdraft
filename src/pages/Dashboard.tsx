import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import type { Jogador } from "../types";

type Formacao = "4-3-3" | "4-4-2" | "3-5-2" | "4-5-1";
const REGRAS_FORMACAO: Record<Formacao, { DEF: number; MEI: number; ATA: number }> = {
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 },
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 },
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 },
  "4-5-1": { DEF: 4, MEI: 5, ATA: 1 },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [elenco, setElenco] = useState<Jogador[]>([]);
  const [titularesIds, setTitularesIds] = useState<string[]>([]);
  const [formacao, setFormacao] = useState<Formacao>("4-3-3");
  const [nomeTime, setNomeTime] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [carregando, setCarregando] = useState(true);

  // Estados do Popup (Modal)
  const [modalAberto, setModalAberto] = useState(false);
  const [posicaoModal, setPosicaoModal] = useState<string>('');
  const [jogadorSendoSubstituido, setJogadorSendoSubstituido] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists()) {
          const dados = docSnap.data();
          setElenco(dados.elenco || []);
          setNomeTime(dados.nomeTime || "Time Desconhecido");
          setNomeTecnico(dados.nomeTecnico || "Técnico");
          setFormacao(dados.formacao || "4-3-3");
          setTitularesIds(dados.titularesIds || []);
        }
        setCarregando(false);
      } else navigate("/");
    });
    return () => unsubscribe();
  }, [navigate]);

  const titulares = useMemo(() => elenco.filter(j => titularesIds.includes(j.id)), [elenco, titularesIds]);
  const reservas = useMemo(() => elenco.filter(j => !titularesIds.includes(j.id)), [elenco, titularesIds]);
  const regraAtual = REGRAS_FORMACAO[formacao];
  const isValido = titulares.length === 11;

  const salvarEscalacao = async () => {
    if (!isValido || !auth.currentUser) return;
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { titularesIds, formacao });
    navigate('/championship'); // AVANÇA DIRETO PARA O CAMPEONATO!
  };

  // Abre o Modal para escolher jogador
  const abrirModal = (posicao: string, idAtual: string | null = null) => {
    setPosicaoModal(posicao);
    setJogadorSendoSubstituido(idAtual);
    setModalAberto(true);
  };

  // Confirma a troca no Modal
  const confirmarTroca = (idNovo: string) => {
    let novaLista = [...titularesIds];
    if (jogadorSendoSubstituido) {
      novaLista = novaLista.filter(id => id !== jogadorSendoSubstituido);
    }
    novaLista.push(idNovo);
    setTitularesIds(novaLista);
    setModalAberto(false);
  };

  const removerDoTime = (id: string) => {
    setTitularesIds(prev => prev.filter(tid => tid !== id));
    setModalAberto(false);
  };

  // Função para desenhar a linha do campo
  const renderLinhaCampo = (posicao: string, quantidade: number) => {
    const jogadoresNestaPosicao = titulares.filter(j => j.posicao === posicao);
    const slots = Array.from({ length: quantidade });

    return (
      <div className="flex justify-center gap-2 sm:gap-6 w-full mb-4 z-10 relative">
        {slots.map((_, i) => {
          const jogador = jogadoresNestaPosicao[i];
          return (
            <div 
              key={i} 
              onClick={() => abrirModal(posicao, jogador?.id || null)}
              className={`w-20 h-24 sm:w-24 sm:h-28 rounded-lg cursor-pointer flex flex-col items-center justify-center p-1 text-center transition-all shadow-lg border-2
                ${jogador ? 'bg-slate-800 border-emerald-500 hover:bg-slate-700' : 'bg-black/40 border-white/30 border-dashed hover:border-white/80'}`}
            >
              {jogador ? (
                <>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm mb-1 border ${jogador.overall >= 85 ? 'bg-yellow-500 text-yellow-950 border-yellow-300' : 'bg-slate-600 text-white border-slate-400'}`}>
                    {jogador.overall}
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold text-white truncate w-full">{jogador.nome}</span>
                  <span className="text-[9px] text-slate-400">{jogador.posicao}</span>
                  {jogador.statusFisico?.cansaco > 50 && <span className="text-[10px] mt-1">🔋</span>}
                </>
              ) : (
                <span className="text-white/50 text-xl font-bold">+</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (carregando) return <div className="h-screen bg-slate-900 flex items-center justify-center text-emerald-400 font-bold">Carregando o gramado...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-8 flex flex-col">
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">{nomeTime}</h1>
            <p className="text-emerald-500 font-bold">Técnico {nomeTecnico}</p>
          </div>
          <div className="flex gap-4 mt-4 md:mt-0 items-center">
            <select value={formacao} onChange={(e) => { setFormacao(e.target.value as Formacao); setTitularesIds([]); }} className="bg-slate-900 text-white p-2 rounded border border-slate-600 outline-none">
              <option value="4-3-3">4-3-3</option>
              <option value="4-4-2">4-4-2</option>
              <option value="3-5-2">3-5-2</option>
              <option value="4-5-1">4-5-1</option>
            </select>
            <button onClick={salvarEscalacao} disabled={!isValido} className={`px-6 py-2 rounded font-black transition-all ${isValido ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
              IR PARA O JOGO
            </button>
          </div>
        </div>

        {/* O CAMPO DE FUTEBOL VISUAL */}
        <div className="relative w-full max-w-3xl mx-auto h-150 bg-green-700 rounded-xl border-4 border-white/20 overflow-hidden flex flex-col justify-between py-8 shadow-2xl">
          {/* Linhas do Campo (Pintura CSS) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 border-b-4 border-x-4 border-white/30 rounded-b-xl"></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-24 border-t-4 border-x-4 border-white/30 rounded-t-xl"></div>
          <div className="absolute top-1/2 left-0 w-full border-t-4 border-white/30"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-4 border-white/30 rounded-full"></div>

          {/* Renderização das Posições */}
          {renderLinhaCampo('ATA', regraAtual.ATA)}
          {renderLinhaCampo('MEI', regraAtual.MEI)}
          {renderLinhaCampo('DEF', regraAtual.DEF)}
          {renderLinhaCampo('GOL', 1)}
        </div>
      </div>

      {/* POPUP (MODAL) DE ESCOLHA DE JOGADORES */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-md p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
              <h2 className="text-xl font-black text-white">Escolher {posicaoModal}</h2>
              <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-white font-bold text-xl">X</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {reservas.filter(j => j.posicao === posicaoModal).length === 0 && (
                <p className="text-slate-500 text-center py-4 text-sm">Nenhum jogador desta posição no banco.</p>
              )}
              {reservas.filter(j => j.posicao === posicaoModal).map(j => (
                <button key={j.id} onClick={() => confirmarTroca(j.id)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg flex justify-between items-center hover:border-emerald-500 transition-all text-left">
                  <div>
                    <p className="font-bold text-slate-200">{j.nome}</p>
                    <p className="text-xs text-slate-500">{j.clubeHistorico}</p>
                  </div>
                  <span className={`text-sm px-2 py-1 rounded font-black border ${j.overall >= 85 ? 'bg-yellow-900/30 text-yellow-500 border-yellow-700/50' : 'bg-slate-800 text-white border-slate-600'}`}>{j.overall}</span>
                </button>
              ))}
            </div>

            {jogadorSendoSubstituido && (
              <button onClick={() => removerDoTime(jogadorSendoSubstituido)} className="mt-4 w-full bg-red-900/50 hover:bg-red-900 text-red-400 font-bold py-3 rounded border border-red-800 transition-all">
                Remover para o Banco
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
