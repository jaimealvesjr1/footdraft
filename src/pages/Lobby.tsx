import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../services/firebase";
import { signOut } from "firebase/auth";
// Adicionamos getDoc, doc, updateDoc e arrayUnion
import { collection, addDoc, serverTimestamp, getDoc, doc, updateDoc, arrayUnion } from "firebase/firestore"; 

export default function Lobby() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(false);
  
  // Novo estado para guardar o código que o utilizador vai digitar
  const [codigoSala, setCodigoSala] = useState("");

  const handleLogout = async () => {
    await signOut(auth);
  };

  const criarSala = async () => {
    setCarregando(true);
    try {
      const novaSalaRef = await addDoc(collection(db, "drafts"), {
        criadorId: auth.currentUser?.uid,
        criadorEmail: auth.currentUser?.email,
        status: "aguardando", 
        // Vamos guardar um objeto com os dados básicos de quem entra
        jogadores: [{
          uid: auth.currentUser?.uid,
          email: auth.currentUser?.email,
          pronto: false
        }],
        criadoEm: serverTimestamp()
      });
      navigate(`/draft/${novaSalaRef.id}`);
    } catch (erro) {
      console.error("Erro ao criar sala:", erro);
      alert("Houve um erro ao criar a sala.");
    } finally {
      setCarregando(false);
    }
  };

  // NOVA FUNÇÃO: Entrar numa sala existente
  const entrarSala = async () => {
    if (!codigoSala.trim()) {
      alert("Por favor, introduza o código da sala.");
      return;
    }

    setCarregando(true);
    try {
      // 1. Vai ao banco de dados verificar se o documento (sala) existe
      const salaRef = doc(db, "drafts", codigoSala);
      const salaSnap = await getDoc(salaRef);

      if (salaSnap.exists()) {
        // 2. Se existe, adiciona o utilizador atual à lista de jogadores da sala
        // O arrayUnion garante que adicionamos sem apagar os que já lá estão!
        await updateDoc(salaRef, {
          jogadores: arrayUnion({
            uid: auth.currentUser?.uid,
            email: auth.currentUser?.email,
            pronto: false
          })
        });
        
        // 3. Viaja para a sala
        navigate(`/draft/${codigoSala}`);
      } else {
        alert("Sala não encontrada! Verifique o código e tente novamente.");
      }
    } catch (erro) {
      console.error("Erro ao entrar na sala:", erro);
      alert("Houve um erro ao tentar entrar na sala.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold text-emerald-400 mb-2">Lobby Principal</h1>
      <p className="text-slate-400 mb-12">Jogador: {auth.currentUser?.email}</p>
      
      <div className="flex flex-col md:flex-row gap-8 items-center bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-2xl">
        
        {/* Lado Esquerdo: Criar Sala */}
        <div className="flex flex-col items-center border-b md:border-b-0 md:border-r border-slate-600 pb-8 md:pb-0 md:pr-8">
          <h2 className="text-xl mb-4 font-semibold text-slate-200">Sou o Host</h2>
          <button 
            onClick={criarSala}
            disabled={carregando}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold px-8 py-3 rounded shadow-lg transition disabled:opacity-50"
          >
            {carregando ? "A processar..." : "Criar Nova Sala"}
          </button>
        </div>

        {/* Lado Direito: Entrar numa Sala */}
        <div className="flex flex-col items-center md:pl-4">
          <h2 className="text-xl mb-4 font-semibold text-slate-200">Sou um Convidado</h2>
          <div className="flex flex-col gap-2">
            <input 
              type="text" 
              placeholder="Cole o código da sala..." 
              value={codigoSala}
              onChange={(e) => setCodigoSala(e.target.value)}
              className="p-3 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-emerald-400 text-center font-mono"
            />
            <button 
              onClick={entrarSala}
              disabled={carregando}
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-8 py-3 rounded shadow-lg border border-slate-600 transition disabled:opacity-50"
            >
              Entrar na Sala
            </button>
          </div>
        </div>

      </div>

      <button 
        onClick={handleLogout}
        className="mt-12 text-slate-500 hover:text-red-400 transition underline"
      >
        Sair da conta
      </button>
    </div>
  );
}
