// src/pages/WaitingRoom.tsx
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function WaitingRoom() {
  const [nomeTime, setNomeTime] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [registroPronto, setRegistroPronto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  
  // ATUALIZAÇÃO: A lista agora guarda o ID do usuário para podermos compará-lo
  const [timesRegistrados, setTimesRegistrados] = useState<{id: string, nome: string, tecnico: string}[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists() && docSnap.data().nomeTime) {
          setNomeTime(docSnap.data().nomeTime); setNomeTecnico(docSnap.data().nomeTecnico); setRegistroPronto(true);
        }
      }
    });

    const unsubscribeUsers = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      const lista: {id: string, nome: string, tecnico: string}[] = [];
      snapshot.forEach(doc => {
        const dados = doc.data();
        if (dados.nomeTime) lista.push({ id: doc.id, nome: dados.nomeTime, tecnico: dados.nomeTecnico });
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
          nomeTime, nomeTecnico, elenco: [], elencoPronto: false, dataCriacao: new Date().toISOString()
        }, { merge: true });
        setRegistroPronto(true);
      }
    } catch (error) { setErro("Erro ao salvar os dados."); } finally { setSalvando(false); }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center p-4 md:p-8 font-sans">
      <div className="bg-neutral-900 p-8 rounded-xl shadow-2xl border border-neutral-800 w-full max-w-md mb-8">
        {!registroPronto ? (
          <div className="animate-fade-in">
            <h1 className="text-3xl font-black text-white mb-2 text-center uppercase tracking-tighter">Crie o seu Clube</h1>
            <p className="text-neutral-400 text-center mb-8 text-sm">A primeira etapa para dominar o campeonato.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-cyan-400 text-xs uppercase tracking-widest font-bold mb-2">Nome do Time</label>
                <input type="text" value={nomeTime} onChange={e => setNomeTime(e.target.value)} placeholder="Ex: Galáticos FC" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-500 transition-colors"/>
              </div>
              <div>
                <label className="block text-cyan-400 text-xs uppercase tracking-widest font-bold mb-2">Nome do Técnico</label>
                <input type="text" value={nomeTecnico} onChange={e => setNomeTecnico(e.target.value)} placeholder="Ex: Guardiola" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-500 transition-colors"/>
              </div>
            </div>
            {erro && <p className="text-orange-500 text-sm mt-4 text-center font-bold">{erro}</p>}
            <button onClick={confirmarRegistro} disabled={salvando} className="w-full mt-8 bg-yellow-500 hover:bg-yellow-400 text-neutral-950 uppercase tracking-widest font-black py-4 rounded-lg transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(250,204,21,0.2)]">
              {salvando ? "A REGISTRAR..." : "CONFIRMAR E ENTRAR NA FILA"}
            </button>
          </div>
        ) : (
          <div className="text-center animate-fade-in py-8">
            <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Clube {nomeTime}</h1>
            <p className="text-neutral-400 text-sm font-bold bg-neutral-950 p-2 rounded border border-neutral-800">Registrado com Sucesso!</p>
            <p className="text-neutral-500 text-xs mt-6 uppercase tracking-widest">Aguarde o Game Master organizar o sorteio e iniciar a Pré-Temporada...</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-md bg-neutral-900 p-6 rounded-xl border border-neutral-800">
        <h2 className="text-white font-black uppercase tracking-widest mb-4 flex justify-between items-center border-b border-neutral-800 pb-2">
          <span>Times na Sala</span>
          <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-1 rounded text-xs">{timesRegistrados.length} Conectados</span>
        </h2>
        <ul className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
          {timesRegistrados.map((time, idx) => {
            // ATUALIZAÇÃO: Verifica se esta linha pertence ao usuário logado
            const isMe = time.id === auth.currentUser?.uid;
            
            return (
              <li key={idx} className={`bg-neutral-950 p-3 rounded-lg border flex flex-col transition-all
                ${isMe ? 'border-yellow-500 bg-yellow-500/5' : 'border-neutral-800'}`}>
                <div className="flex justify-between items-center">
                  <span className={`font-black text-lg ${isMe ? 'text-yellow-400' : 'text-white'}`}>{time.nome}</span>
                  {isMe && (
                    <span className="text-[10px] bg-yellow-500 text-neutral-950 px-2 py-1 rounded font-black tracking-widest uppercase shadow-sm">
                      Você
                    </span>
                  )}
                </div>
                <span className="text-xs text-cyan-400 font-bold uppercase tracking-wider mt-1">Técnico {time.tecnico}</span>
              </li>
            );
          })}
          {timesRegistrados.length === 0 && <p className="text-neutral-500 text-center text-sm italic py-4">Nenhum time registrado ainda.</p>}
        </ul>
      </div>
    </div>
  );
}
