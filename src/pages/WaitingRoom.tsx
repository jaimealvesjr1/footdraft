import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import toast from "react-hot-toast";

export default function WaitingRoom() {
  const [nomeTime, setNomeTime] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [registroPronto, setRegistroPronto] = useState(false);
  const [inscrito, setInscrito] = useState(false); // NOVO: Controle de Inscrição
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  
  const [timesRegistrados, setTimesRegistrados] = useState<{id: string, nome: string, tecnico: string, inscrito: boolean}[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists() && docSnap.data().nomeTime) {
          setNomeTime(docSnap.data().nomeTime); 
          setNomeTecnico(docSnap.data().nomeTecnico); 
          setInscrito(docSnap.data().inscrito || false);
          setRegistroPronto(true);
        }
      }
    });

    const unsubscribeUsers = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      const lista: {id: string, nome: string, tecnico: string, inscrito: boolean}[] = [];
      snapshot.forEach(doc => {
        const dados = doc.data();
        // Só mostra na lista quem optou por se inscrever na temporada
        if (dados.nomeTime && dados.inscrito) {
            lista.push({ id: doc.id, nome: dados.nomeTime, tecnico: dados.nomeTecnico, inscrito: dados.inscrito });
        }
      });
      setTimesRegistrados(lista);
    });

    return () => { unsubscribeAuth(); unsubscribeUsers(); };
  }, []);

  const confirmarRegistro = async () => {
    if (nomeTime.length < 3 || nomeTecnico.length < 3) { setErro("Os nomes devem ter pelo menos 3 letras."); return; }
    setSalvando(true);
    try {
      if (auth.currentUser) {
        await setDoc(doc(db, "usuarios", auth.currentUser.uid), {
          nomeTime, nomeTecnico, elenco: [], elencoPronto: false, inscrito: true, dataCriacao: new Date().toISOString()
        }, { merge: true });
        setInscrito(true);
        setRegistroPronto(true);
        toast.success("Clube criado e inscrito com sucesso!");
      }
    } catch (error) { setErro("Erro ao salvar os dados."); } finally { setSalvando(false); }
  };

  const toggleInscricao = async () => {
    if (!auth.currentUser) return;
    setSalvando(true);
    try {
        const novoStatus = !inscrito;
        await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { inscrito: novoStatus });
        setInscrito(novoStatus);
        toast.success(novoStatus ? "Você entrou na próxima temporada!" : "Você saiu da lista da próxima temporada.");
    } catch (error) {
        toast.error("Erro ao alterar inscrição.");
    } finally {
        setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center p-4 md:p-8 font-fifa">
      <div className="bg-neutral-900 p-8 rounded-xl shadow-2xl border border-neutral-800 w-full max-w-md mb-8">
        {!registroPronto ? (
          <div className="animate-fade-in">
            <h1 className="text-3xl font-black text-white mb-2 text-center uppercase tracking-tighter">Crie o seu Clube</h1>
            <p className="text-neutral-400 text-center mb-8 text-sm">A primeira etapa para dominar o campeonato.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-fifa-blue text-xs uppercase tracking-widest font-bold mb-2">Nome do Time</label>
                <input type="text" value={nomeTime} onChange={e => setNomeTime(e.target.value)} placeholder="Ex: Galáticos FC" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-fifa-blue transition-colors"/>
              </div>
              <div>
                <label className="block text-cyan-400 text-xs uppercase tracking-widest font-bold mb-2">Nome do Técnico</label>
                <input type="text" value={nomeTecnico} onChange={e => setNomeTecnico(e.target.value)} placeholder="Ex: Guardiola" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-500 transition-colors"/>
              </div>
            </div>
            {erro && <p className="text-orange-500 text-sm mt-4 text-center font-bold">{erro}</p>}
            <button onClick={confirmarRegistro} disabled={salvando} className="w-full mt-8 bg-fifa-blue hover:bg-opacity-90 text-white uppercase tracking-widest font-black py-4 rounded-lg transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(42,57,141,0.4)]">
              {salvando ? "A REGISTRAR..." : "CONFIRMAR E ENTRAR NA FILA"}
            </button>
          </div>
        ) : (
          <div className="text-center animate-fade-in py-4">
            <div className={`w-16 h-16 border-4 ${inscrito ? 'border-fifa-green' : 'border-neutral-700'} border-t-transparent rounded-full animate-spin mx-auto mb-6`}></div>
            <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Clube {nomeTime}</h1>
            
            {/* PAINEL DE INSCRIÇÃO PARA QUEM JÁ TEM CONTA */}
            <div className={`mt-6 p-4 rounded-xl border ${inscrito ? 'bg-fifa-green/10 border-fifa-green/30' : 'bg-neutral-950 border-neutral-800'}`}>
                <p className={`text-sm font-bold uppercase tracking-widest mb-4 ${inscrito ? 'text-fifa-green' : 'text-neutral-500'}`}>
                    {inscrito ? '✅ INSCRITO NA PRÓXIMA TEMPORADA' : '❌ FORA DA PRÓXIMA TEMPORADA'}
                </p>
                <button onClick={toggleInscricao} disabled={salvando} className={`w-full py-3 rounded-lg font-black uppercase tracking-widest transition-colors ${inscrito ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'bg-fifa-green text-white hover:bg-opacity-80 shadow-[0_0_15px_rgba(60,172,59,0.4)]'}`}>
                    {salvando ? 'Aguarde...' : (inscrito ? 'Desistir e Sair' : 'Quero Participar')}
                </button>
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-md bg-neutral-900 p-6 rounded-xl border border-neutral-800">
        <h2 className="text-white font-black uppercase tracking-widest mb-4 flex justify-between items-center border-b border-neutral-800 pb-2">
          <span>Inscritos p/ Temporada</span>
          <span className="bg-fifa-blue/20 text-fifa-blue border border-fifa-blue px-2 py-1 rounded text-xs font-bold">{timesRegistrados.length} Confirmados</span>
        </h2>
        <ul className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
          {timesRegistrados.map((time, idx) => {
            const isMe = time.id === auth.currentUser?.uid;
            return (
              <li key={idx} className={`bg-neutral-950 p-3 rounded-lg border flex flex-col transition-all ${isMe ? 'border-fifa-green bg-fifa-green/5' : 'border-neutral-800'}`}>
                <div className="flex justify-between items-center">
                  <span className={`font-black text-lg ${isMe ? 'text-fifa-green' : 'text-white'}`}>{time.nome}</span>
                  {isMe && <span className="text-[10px] bg-fifa-green text-white px-2 py-1 rounded font-black tracking-widest uppercase shadow-sm">Você</span>}
                </div>
                <span className="text-xs text-fifa-gray-light font-bold uppercase tracking-wider mt-1">Técnico {time.tecnico}</span>
              </li>
            );
          })}
          {timesRegistrados.length === 0 && <p className="text-neutral-500 text-center text-sm italic py-4">Nenhum time inscrito ainda.</p>}
        </ul>
      </div>
    </div>
  );
}
