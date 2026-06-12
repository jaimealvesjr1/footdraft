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
    <div className="p-6 bg-slate-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-6">Rodada {rodadaAtual}</h1>
      <button onClick={simularRodada} className="bg-emerald-500 p-4 rounded text-black font-bold mb-6">
        Simular Todos os Jogos da Rodada
      </button>

      <div className="grid gap-4">
        {sala.historicoRodadas?.[rodadaAtual - 1]?.map((jogo: any, i: number) => (
          <div key={i} className="bg-slate-800 p-4 rounded flex justify-between">
            <span>{sala.jogadores.find((j:any) => j.uid === jogo.timeA)?.email}</span>
            <span className="font-bold text-xl">{jogo.golsA} x {jogo.golsB}</span>
            <span>{sala.jogadores.find((j:any) => j.uid === jogo.timeB)?.email}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
