// src/pages/Championship.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../services/firebase";
// Correção: updateDoc foi adicionado aqui na importação
import { doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { simularPartida, type ResultadoPartida } from "../services/matchEngine";
import type { Jogador } from "../types";

interface LinhaTabela {
  id: string;
  nome: string;
  isUser: boolean;
  pontos: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golsPro: number;
  golsContra: number;
  saldo: number;
}

export default function Championship() {
  const navigate = useNavigate();
  
  // Correção: Adicionado elencoCompleto na interface do State para o TypeScript reconhecer
  const [meuTime, setMeuTime] = useState<{ id: string, nome: string, titulares: Jogador[], elencoCompleto: Jogador[] } | null>(null);
  const [bots, setBots] = useState<{ id: string, nome: string, titulares: Jogador[] }[]>([]);
  
  const [tabela, setTabela] = useState<LinhaTabela[]>([]);
  const [rodadaAtual, setRodadaAtual] = useState(1);
  const [resultadoUltimoJogo, setResultadoUltimoJogo] = useState<ResultadoPartida | null>(null);
  const [simulando, setSimulando] = useState(false);

  useEffect(() => {
    const carregarTudo = async () => {
      const user = auth.currentUser;
      if (!user) return navigate("/");

      let userTeamData = null;
      let botsData: any[] = [];

      const docSnap = await getDoc(doc(db, "usuarios", user.uid));
      if (docSnap.exists()) {
        const dados = docSnap.data();
        const elenco = dados.elenco as Jogador[];
        const titularesIds = dados.titularesIds || [];
        const titulares = elenco.filter(j => titularesIds.includes(j.id));
        // Correção: elencoCompleto sendo passado corretamente
        userTeamData = { id: user.uid, nome: dados.nomeTime, titulares, elencoCompleto: elenco };
        setMeuTime(userTeamData);
      }

      const clubesSnap = await getDocs(collection(db, "clubes"));
      clubesSnap.forEach(doc => {
        const clube = doc.data();
        if (clube.elenco && clube.elenco.length >= 11) {
          botsData.push({
            id: doc.id,
            nome: `${clube.nome} ${clube.ano}`,
            titulares: clube.elenco.slice(0, 11)
          });
        }
      });
      
      botsData = botsData.sort(() => Math.random() - 0.5).slice(0, 11);
      setBots(botsData);

      if (userTeamData) {
        const tabelaInicial: LinhaTabela[] = [userTeamData, ...botsData].map(time => ({
          id: time.id,
          nome: time.nome,
          isUser: time.id === user.uid,
          pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsContra: 0, saldo: 0
        }));
        setTabela(tabelaInicial);
      }
    };

    onAuthStateChanged(auth, (user) => { if (user) carregarTudo(); });
  }, [navigate]);

  const jogarRodada = () => {
    if (!meuTime || bots.length < 11) return alert("Faltam bots no banco para compor a liga de 12 times.");
    setSimulando(true);
    setResultadoUltimoJogo(null);

    setTimeout(async () => {
      let novaTabela = [...tabela];

      const registrarResultado = (idTime: string, golsFeitos: number, golsSofridos: number) => {
        const timeIndex = novaTabela.findIndex(t => t.id === idTime);
        if (timeIndex === -1) return;
        
        let time = { ...novaTabela[timeIndex] };
        time.jogos += 1;
        time.golsPro += golsFeitos;
        time.golsContra += golsSofridos;
        time.saldo = time.golsPro - time.golsContra;

        if (golsFeitos > golsSofridos) { time.pontos += 3; time.vitorias += 1; }
        else if (golsFeitos === golsSofridos) { time.pontos += 1; time.empates += 1; }
        else { time.derrotas += 1; }

        novaTabela[timeIndex] = time;
      };

      const adversarioUser = bots[rodadaAtual % bots.length];
      const resultadoUser = simularPartida(meuTime.titulares, adversarioUser.titulares);
      setResultadoUltimoJogo(resultadoUser);
      
      registrarResultado(meuTime.id, resultadoUser.golsCasa, resultadoUser.golsFora);
      registrarResultado(adversarioUser.id, resultadoUser.golsFora, resultadoUser.golsCasa);

      const outrosBots = bots.filter(b => b.id !== adversarioUser.id);
      for (let i = 0; i < outrosBots.length; i += 2) {
        if (outrosBots[i] && outrosBots[i+1]) {
          const resBot = simularPartida(outrosBots[i].titulares, outrosBots[i+1].titulares);
          registrarResultado(outrosBots[i].id, resBot.golsCasa, resBot.golsFora);
          registrarResultado(outrosBots[i+1].id, resBot.golsFora, resBot.golsCasa);
        }
      }

      novaTabela.sort((a, b) => {
        if (b.pontos !== a.pontos) return b.pontos - a.pontos;
        if (b.saldo !== a.saldo) return b.saldo - a.saldo;
        return b.golsPro - a.golsPro;
      });

      setTabela(novaTabela);
      setRodadaAtual(prev => prev + 1);

      // Atualiza o Cansaço, Lesões e Cartões do Jogador User
      const elencoGeralAtualizado = meuTime.elencoCompleto.map((jogador: Jogador) => {
        const jogadorQueJogou = resultadoUser.jogadoresCasaAtualizados.find(j => j.id === jogador.id);
        
        if (jogadorQueJogou) return jogadorQueJogou;
        
        if (jogador.statusFisico.cansaco > 0) {
          jogador.statusFisico.cansaco = Math.max(0, jogador.statusFisico.cansaco - 20);
        }
        if (jogador.statusFisico.suspenso && !meuTime.titulares.find(t => t.id === jogador.id)) {
           jogador.statusFisico.suspenso = false;
        }

        return jogador;
      });

      setMeuTime({ ...meuTime, elencoCompleto: elencoGeralAtualizado, titulares: resultadoUser.jogadoresCasaAtualizados });

      if (auth.currentUser) {
        try {
          await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
            elenco: elencoGeralAtualizado
          });
        } catch (error) {
          console.error("Erro ao gravar status físico:", error);
        }
      }

      setSimulando(false);
    }, 2000); 
  };

  if (!meuTime || tabela.length === 0) return <div className="h-screen bg-slate-900 flex items-center justify-center text-emerald-400 font-bold">Carregando o Campeonato Brasileiro...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8 flex flex-col items-center">
      
      <div className="max-w-6xl w-full flex justify-between items-center bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">Campeonato Brasileiro</h1>
          <p className="text-emerald-500 font-bold tracking-widest mt-1">RODADA {rodadaAtual} DE 38</p>
        </div>
        <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded transition-colors">
          Vestiário (Tática)
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full max-w-6xl">
        
        <div className="xl:col-span-2 space-y-8">
          <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl flex flex-col items-center text-center">
            <h2 className="text-xl font-bold text-slate-400 mb-6 uppercase tracking-widest">Painel de Jogo</h2>
            <div className="flex items-center justify-center gap-6 w-full mb-8">
              <div className="flex-1 text-right">
                <span className="font-black text-3xl text-emerald-400 block">{meuTime.nome}</span>
                <span className="text-xs text-slate-500 font-bold">SEU TIME</span>
              </div>
              <div className="text-3xl font-black text-slate-600">VS</div>
              <div className="flex-1 text-left">
                <span className="font-black text-3xl text-red-400 block">{bots[rodadaAtual % bots.length]?.nome || "Desconhecido"}</span>
                <span className="text-xs text-slate-500 font-bold">CPU</span>
              </div>
            </div>

            <button 
              onClick={jogarRodada} 
              disabled={simulando}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-2xl rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)] disabled:bg-slate-700 disabled:text-slate-500 transition-all"
            >
              {simulando ? 'SIMULANDO RODADA COMPLETA...' : 'APITAR O INÍCIO!'}
            </button>
          </div>

          <div className="bg-slate-900 border-4 border-slate-800 p-6 rounded-xl shadow-inner min-h-62.5 flex flex-col justify-center">
            <h3 className="text-slate-500 font-bold mb-4 uppercase text-sm border-b border-slate-800 pb-2">Placar da Sua Partida</h3>
            {resultadoUltimoJogo ? (
              <div className="animate-fade-in">
                <div className="flex justify-center items-center gap-4 text-5xl font-black text-white mb-6 bg-black/50 py-6 rounded-lg">
                  <span className={resultadoUltimoJogo.golsCasa > resultadoUltimoJogo.golsFora ? "text-emerald-400" : "text-slate-300"}>{resultadoUltimoJogo.golsCasa}</span>
                  <span className="text-slate-600 text-2xl">x</span>
                  <span className={resultadoUltimoJogo.golsFora > resultadoUltimoJogo.golsCasa ? "text-red-400" : "text-slate-300"}>{resultadoUltimoJogo.golsFora}</span>
                </div>
                <ul className="space-y-2">
                  {resultadoUltimoJogo.relatorio.map((linha, idx) => (
                    <li key={idx} className="text-sm text-slate-400 font-mono before:content-['>_'] before:text-emerald-500 before:mr-2">
                      {linha}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
               <div className="h-full flex items-center justify-center">
                 <p className="text-slate-700 font-black text-2xl italic">AGUARDANDO APITO INICIAL</p>
               </div>
            )}
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl flex flex-col h-full max-h-200">
          <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-widest border-b border-slate-600 pb-2">Classificação</h2>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-700">
                  <th className="pb-2 w-8 text-center">#</th>
                  <th className="pb-2">Clube</th>
                  <th className="pb-2 text-center" title="Pontos">PTS</th>
                  <th className="pb-2 text-center" title="Jogos">J</th>
                  <th className="pb-2 text-center" title="Vitórias">V</th>
                  <th className="pb-2 text-center" title="Saldo de Gols">SG</th>
                </tr>
              </thead>
              <tbody>
                {tabela.map((time, index) => (
                  <tr key={time.id} className={`text-sm border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors ${time.isUser ? 'bg-emerald-900/20' : ''}`}>
                    <td className={`py-3 text-center font-bold ${index < 4 ? 'text-blue-400' : index > 7 ? 'text-red-400' : 'text-slate-500'}`}>
                      {index + 1}
                    </td>
                    <td className={`py-3 font-bold truncate max-w-30 ${time.isUser ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {time.nome}
                    </td>
                    <td className="py-3 text-center font-black text-white">{time.pontos}</td>
                    <td className="py-3 text-center text-slate-400">{time.jogos}</td>
                    <td className="py-3 text-center text-slate-400">{time.vitorias}</td>
                    <td className="py-3 text-center text-slate-400">{time.saldo > 0 ? `+${time.saldo}` : time.saldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
