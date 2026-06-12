import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import type { Jogador } from "../types";

// Tipagem das formações
type Formacao = "4-3-3" | "4-4-2" | "4-3-2-1";

export default function Dashboard() {
  const { salaId } = useParams();
  const navigate = useNavigate();
  
  const [elenco, setElenco] = useState<Jogador[]>([]);
  const [titularesIds, setTitularesIds] = useState<string[]>([]);
  const [formacao, setFormacao] = useState<Formacao>("4-3-3");
  const [carregando, setCarregando] = useState(true);

  // 1. CARREGAR ELENCO
  useEffect(() => {
    const carregarElenco = async () => {
      if (!salaId || !auth.currentUser) return;
      try {
        const salaRef = doc(db, "drafts", salaId);
        const salaSnap = await getDoc(salaRef);
        if (salaSnap.exists()) {
          const dados = salaSnap.data();
          const meuElenco = dados.elencos?.[auth.currentUser.uid]?.jogadores || [];
          setElenco(meuElenco);
          const titularesGuardados = dados.elencos?.[auth.currentUser.uid]?.titulares || [];
          setTitularesIds(titularesGuardados.length > 0 ? titularesGuardados : meuElenco.slice(0, 11).map((j: Jogador) => j.id));
        }
      } catch (error) { console.error(error); } finally { setCarregando(false); }
    };
    carregarElenco();
  }, [salaId]);

  // 2. LÓGICA DE VALIDAÇÃO DE FORMAÇÃO
  const titulares = useMemo(() => elenco.filter(j => titularesIds.includes(j.id)), [elenco, titularesIds]);
  
  const validarFormacao = () => {
    const gols = titulares.filter(j => j.posicao === "GOL").length;
    const defs = titulares.filter(j => j.posicao === "DEF").length;
    const meis = titulares.filter(j => j.posicao === "MEI").length;
    const atas = titulares.filter(j => j.posicao === "ATA").length;

    if (gols !== 1) return false;
    
    switch (formacao) {
      case "4-3-3": return defs === 4 && meis === 3 && atas === 3;
      case "4-4-2": return defs === 4 && meis === 4 && atas === 2;
      case "4-3-2-1": return defs === 4 && meis === 5 && atas === 1; // 4-3-2-1 simplificado como 4-5-1
      default: return false;
    }
  };

  const isValido = validarFormacao();

  // 3. UI RENDERIZAÇÃO
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      {/* Seletor de Formação */}
      <div className="bg-slate-800 p-4 rounded-lg mb-6 flex items-center justify-between">
        <label className="font-bold">Escolha sua Tática:</label>
        <select 
          value={formacao} 
          onChange={(e) => setFormacao(e.target.value as Formacao)}
          className="bg-slate-900 p-2 rounded border border-slate-600"
        >
          <option value="4-3-3">4-3-3 (Ofensiva)</option>
          <option value="4-4-2">4-4-2 (Equilibrada)</option>
          <option value="4-3-2-1">4-3-2-1 (Controle)</option>
        </select>
        <button 
          onClick={async () => {
             await updateDoc(doc(db, "drafts", salaId!), { [`elencos.${auth.currentUser!.uid}.titulares`]: titularesIds });
             alert("Escalação salva!");
          }}
          disabled={!isValido}
          className={`px-6 py-2 rounded font-bold ${isValido ? 'bg-emerald-500' : 'bg-slate-600 cursor-not-allowed'}`}
        >
          Confirmar Escalação {isValido ? "✅" : "❌"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Titulares Agrupados */}
        <div className="bg-slate-800 p-4 rounded">
          <h2 className="text-emerald-400 font-bold mb-4">Titulares ({titulares.length}/11)</h2>
          {["GOL", "DEF", "MEI", "ATA"].map(pos => (
            <div key={pos} className="mb-4">
              <h3 className="text-xs uppercase text-slate-500 font-bold mb-2">{pos}</h3>
              {titulares.filter(j => j.posicao === pos).map(j => (
                <div key={j.id} onClick={() => setTitularesIds(titularesIds.filter(id => id !== j.id))} className="bg-slate-900 p-2 mb-1 rounded cursor-pointer hover:bg-slate-700">
                  {j.nome} (OVR {j.overall})
                </div>
              ))}
            </div>
          ))}
        </div>
        
        {/* Suplentes */}
        <div className="bg-slate-800 p-4 rounded">
          <h2 className="text-slate-300 font-bold mb-4">Banco</h2>
          {elenco.filter(j => !titularesIds.includes(j.id)).map(j => (
            <div key={j.id} onClick={() => titularesIds.length < 11 && setTitularesIds([...titularesIds, j.id])} className="bg-slate-900 p-2 mb-1 rounded cursor-pointer hover:bg-slate-700">
              {j.nome} - {j.posicao}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
