import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../services/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { simularPartida } from "../services/matchEngine";

export default function Matches() {
  const { salaId } = useParams();
  const [sala, setSala] = useState<any>(null);
  const [rodadaAtual, setRodadaAtual] = useState(1);

  useEffect(() => {
    const carregarSala = async () => {
      const snap = await getDoc(doc(db, "drafts", salaId!));
      if (snap.exists()) setSala(snap.data());
    };
    carregarSala();
  }, [salaId]);

  const simularRodada = async () => {
    const jogadoresIds = Object.keys(sala.elencos);
    const resultados: any[] = [];

    // Lógica simples de emparelhamento (Jogador 1 vs Jogador 2, etc.)
    for (let i = 0; i < jogadoresIds.length; i += 2) {
      if (i + 1 < jogadoresIds.length) {
        const idA = jogadoresIds[i];
        const idB = jogadoresIds[i+1];
        
        const titularesA = sala.elencos[idA].jogadores.filter((j: any) => sala.elencos[idA].titulares.includes(j.id));
        const titularesB = sala.elencos[idB].jogadores.filter((j: any) => sala.elencos[idB].titulares.includes(j.id));
        
        const resultado = simularPartida(titularesA, titularesB);
        resultados.push({ timeA: idA, timeB: idB, ...resultado });
      }
    }

    // Gravar no Firebase
    await updateDoc(doc(db, "drafts", salaId!), {
      [`historicoRodadas.${rodadaAtual}`]: resultados,
      rodadaAtual: rodadaAtual + 1
    });
    
    setRodadaAtual(prev => prev + 1);
    alert("Rodada simulada!");
  };

  if (!sala) return <div>Carregando...</div>;

  return (
    <div className="p-8 bg-neutral-950 min-h-screen text-neutral-200 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-8 border-b border-neutral-800 pb-4">
          Histórico - <span className="text-yellow-500">Rodada {rodadaAtual}</span>
        </h1>
        
        <button onClick={simularRodada} className="w-full bg-cyan-600 hover:bg-cyan-500 p-4 rounded-xl text-white font-black uppercase tracking-widest mb-8 transition-colors shadow-lg">
          Simular Todos os Jogos da Rodada
        </button>

        <div className="grid gap-4">
          {sala.historicoRodadas?.[rodadaAtual - 1]?.map((jogo: any, i: number) => (
            <div key={i} className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 flex justify-between items-center shadow-lg">
              <span className="font-bold text-neutral-400 uppercase tracking-widest flex-1 text-right">
                {sala.jogadores.find((j:any) => j.uid === jogo.timeA)?.email}
              </span>
              <div className="px-8 flex items-center gap-3">
                <span className="font-black text-3xl text-white">{jogo.golsA}</span>
                <span className="text-neutral-600 font-black">X</span>
                <span className="font-black text-3xl text-white">{jogo.golsB}</span>
              </div>
              <span className="font-bold text-neutral-400 uppercase tracking-widest flex-1 text-left">
                {sala.jogadores.find((j:any) => j.uid === jogo.timeB)?.email}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
