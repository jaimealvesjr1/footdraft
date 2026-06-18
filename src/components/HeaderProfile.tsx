import { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot, getDocs, collection } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { type GameState } from '../types';
import toast from 'react-hot-toast';

export default function HeaderProfile() {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [modalAberto, setModalAberto] = useState(false);
    const [abaAtiva, setAbaAtiva] = useState<'EDITAR' | 'HISTORICO'>('HISTORICO');
    
    // Dados do Usuário
    const [nomeTime, setNomeTime] = useState("");
    const [nomeTecnico, setNomeTecnico] = useState("");
    const [historico, setHistorico] = useState<any[]>([]);
    const [xpTotal, setXpTotal] = useState(0);
    
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        // Escuta a fase do jogo
        const unsubGame = onSnapshot(doc(db, "game", "state"), (docSnap) => {
          if (docSnap.exists()) setGameState(docSnap.data() as GameState);
        });

        // Escuta os dados do usuário ao vivo
        let unsubUser: () => void;
        if (auth.currentUser) {
            unsubUser = onSnapshot(doc(db, "usuarios", auth.currentUser.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setNomeTime(data.nomeTime || "");
                    setNomeTecnico(data.nomeTecnico || "");
                    setHistorico(data.historicoCampanhas || []);
                    setXpTotal(data.xpTotal || 0);
                }
            });
        }

        return () => {
            unsubGame();
            if (unsubUser) unsubUser();
        };
    }, []);

    const validarNomesUnicos = async (novoTime: string, novoTecnico: string) => {
        const usersSnap = await getDocs(collection(db, "usuarios"));
        let conflito = false;
        
        usersSnap.forEach(userDoc => {
            if (userDoc.id === auth.currentUser?.uid) return; // Ignora a si mesmo
            const dados = userDoc.data();
            
            // Compara ignorando maiúsculas/minúsculas e espaços extras
            if (dados.nomeTime?.trim().toLowerCase() === novoTime.trim().toLowerCase()) {
                toast.error(`O nome de clube "${novoTime}" já pertence a outro jogador!`);
                conflito = true;
            }
            if (dados.nomeTecnico?.trim().toLowerCase() === novoTecnico.trim().toLowerCase()) {
                toast.error(`Já existe um técnico chamado "${novoTecnico}" na liga!`);
                conflito = true;
            }
        });
        
        return !conflito;
    };

    const salvarPerfil = async () => {
        if (!auth.currentUser) return;
        
        // Regra de segurança: Não pode mudar de nome no meio do campeonato!
        if (gameState?.phase !== 'SETUP' && gameState?.phase !== 'PRE_SEASON' && gameState?.phase !== 'FINISHED') {
            toast.error("Você não pode mudar a identidade do clube com o campeonato em andamento!");
            return;
        }

        if (nomeTime.length < 3 || nomeTecnico.length < 3) {
            toast.error("Nomes muito curtos!");
            return;
        }

        setSalvando(true);
        try {
            // Verifica duplicidade no banco
            const nomesLivres = await validarNomesUnicos(nomeTime, nomeTecnico);
            if (!nomesLivres) return;

            await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
                nomeTime: nomeTime.trim(),
                nomeTecnico: nomeTecnico.trim()
            });
            toast.success("Identidade do clube atualizada!");
            setModalAberto(false);
        } catch (error) {
            toast.error("Erro ao salvar.");
        } finally {
            setSalvando(false);
        }
    };

    // Estatísticas Derivadas do Histórico
    const titulos = historico.filter((h: any) => h.campeao).length;
    const artilharias = historico.filter((h: any) => h.teveArtilheiro).length;
    
    // Cálculo Global de Carreira
    const totalJogos = historico.reduce((acc, h) => acc + (h.jogos || (h.vitorias + h.empates + h.derrotas) || 0), 0) || 1; // || 1 evita divisão por zero
    const totalVitorias = historico.reduce((acc, h) => acc + (h.vitorias || 0), 0);
    const saldoGlobal = historico.reduce((acc, h) => acc + (h.saldo || 0), 0);
    const winRate = historico.length > 0 ? Math.round((totalVitorias / totalJogos) * 100) : 0;

    return (
        <>
            <button onClick={() => setModalAberto(true)} className="flex items-center gap-3 bg-neutral-900 hover:bg-neutral-800 p-2 sm:px-4 rounded-lg border border-neutral-800 transition-colors shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-fifa-green"></div>
                <div className="flex items-center justify-center bg-neutral-950 w-8 h-8 rounded-full border border-neutral-700 shrink-0">
                    <span className="text-sm font-black text-white">{Math.floor(xpTotal / 100) + 1}</span>
                </div>
                <div className="hidden sm:flex flex-col text-left leading-none">
                    <span className="text-xs font-black text-white uppercase tracking-tighter truncate max-w-32">{nomeTime || "Perfil"}</span>
                    <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest mt-0.5">{xpTotal} XP Global</span>
                </div>
            </button>

            {modalAberto && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                  <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                    
                    {/* CABEÇALHO DO MODAL (Estilo FIFA Card) */}
                    <div className="bg-linear-to-r from-neutral-950 to-neutral-900 p-6 border-b border-neutral-800 relative">
                        <button onClick={() => setModalAberto(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white font-black text-lg bg-neutral-800 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10">X</button>
                        <div className="flex items-center gap-4 relative z-0">
                            <div className="w-20 h-20 bg-neutral-950 border-2 border-fifa-green rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(60,172,59,0.3)]">
                                <span className="text-3xl font-black text-fifa-green">{Math.floor(xpTotal / 100) + 1}</span>
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">{nomeTime || "Sem Clube"}</h2>
                                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1 mb-2">Téc: {nomeTecnico || "Desconhecido"}</p>
                                <span className="text-[10px] bg-fifa-green/20 text-fifa-green px-2 py-1 rounded font-black tracking-widest uppercase border border-fifa-green/30">
                                    {xpTotal} XP Acumulado
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ABAS NAVEGAÇÃO */}
                    <div className="flex border-b border-neutral-800 px-6 pt-4 bg-neutral-900">
                        <button 
                            onClick={() => setAbaAtiva('HISTORICO')} 
                            className={`uppercase font-black text-xs sm:text-sm tracking-widest transition-colors pb-3 border-b-2 px-2 flex-1 ${abaAtiva === 'HISTORICO' ? 'text-yellow-500 border-yellow-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                        >
                            Histórico & Troféus
                        </button>
                        <button 
                            onClick={() => setAbaAtiva('EDITAR')} 
                            className={`uppercase font-black text-xs sm:text-sm tracking-widest transition-colors pb-3 border-b-2 px-2 flex-1 ${abaAtiva === 'EDITAR' ? 'text-fifa-blue border-fifa-blue' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                        >
                            Editar Identidade
                        </button>
                    </div>

                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                        {/* ABA DE HISTÓRICO */}
                        {abaAtiva === 'HISTORICO' && (
                            <div className="flex flex-col gap-6">
                                
                                {/* Resumo da Franquia */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                        <p className="text-2xl font-black text-yellow-500 leading-none">{titulos}</p>
                                        <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Taças Levantadas</p>
                                    </div>
                                    <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                        <p className="text-2xl font-black text-white leading-none">{winRate}%</p>
                                        <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Taxa de Vitórias</p>
                                    </div>
                                    <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                        <p className="text-2xl font-black text-orange-500 leading-none">{artilharias}</p>
                                        <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Chuteiras de Ouro</p>
                                    </div>
                                    <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center shadow-inner">
                                        <p className={`text-2xl font-black leading-none ${saldoGlobal > 0 ? 'text-fifa-green' : saldoGlobal < 0 ? 'text-fifa-red' : 'text-neutral-400'}`}>
                                            {saldoGlobal > 0 ? `+${saldoGlobal}` : saldoGlobal}
                                        </p>
                                        <p className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-1">Saldo Histórico</p>
                                    </div>
                                </div>

                                <div className="border-t border-neutral-800 pt-4">
                                    <h3 className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-3 text-center">Registro de Campanhas</h3>
                                    {/* Lista de Temporadas */}
                                    {historico.length === 0 ? (
                                        <p className="text-center text-neutral-600 text-xs uppercase font-bold tracking-widest py-6">O clube ainda não possui registros oficiais.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {historico.map((campanha, idx) => (
                                                <div key={idx} className={`p-3 rounded-xl border flex flex-col gap-3 ${campanha.campeao ? 'bg-yellow-900/10 border-yellow-500/30 shadow-[inset_0_0_15px_rgba(234,179,8,0.05)]' : 'bg-neutral-950 border-neutral-800'}`}>
                                                    <div className="flex justify-between items-center border-b border-neutral-800/50 pb-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] text-white uppercase font-black tracking-widest truncate max-w-48">
                                                                {campanha.nomeCampeonato || 'Campeonato Base'}
                                                            </span>
                                                            <span className="text-[8px] text-neutral-500 uppercase font-bold tracking-widest truncate max-w-40 mt-0.5">
                                                                Edição: {campanha.temporada}
                                                            </span>
                                                        </div>

                                                        <div className="flex flex-col gap-1 items-end shrink-0">
                                                            {campanha.campeao && <span className="text-[9px] bg-yellow-500 text-neutral-900 font-black px-1.5 py-0.5 rounded uppercase tracking-widest leading-none">🏆 Campeão</span>}
                                                            {campanha.teveArtilheiro && <span className="text-[9px] bg-orange-500 text-neutral-900 font-black px-1.5 py-0.5 rounded uppercase tracking-widest leading-none">👞 Artilheiro</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-lg border ${campanha.posicao === 1 ? 'bg-yellow-500 text-black border-yellow-400' : campanha.posicao <= 4 ? 'bg-cyan-900 text-cyan-400 border-cyan-700' : 'bg-neutral-900 text-white border-neutral-700'}`}>
                                                                {campanha.posicao}º
                                                            </div>
                                                            <span className="text-[9px] uppercase font-bold tracking-widest text-neutral-500 leading-tight">Posição<br/>Final</span>
                                                        </div>
                                                        <div className="flex gap-4 text-right">
                                                            <div>
                                                                <p className="text-base font-black text-white leading-none">{campanha.pontos}</p>
                                                                <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">PTS</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-base font-black text-neutral-300 leading-none">{campanha.vitorias}</p>
                                                                <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">VIT</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-base font-black text-neutral-300 leading-none">{campanha.saldo > 0 ? `+${campanha.saldo}` : campanha.saldo}</p>
                                                                <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">SG</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )).reverse()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ABA DE EDIÇÃO */}
                        {abaAtiva === 'EDITAR' && (
                            <div className="flex-1 flex flex-col">
                                <div className="bg-fifa-blue/10 border border-fifa-blue/30 p-3 rounded-lg mb-6 text-center shadow-inner">
                                    <p className="text-[10px] text-fifa-blue uppercase font-bold tracking-widest leading-relaxed">
                                        Os nomes escolhidos serão únicos no servidor.<br/>Trocas só são permitidas fora de temporada.
                                    </p>
                                </div>
                                <div className="space-y-4 mb-auto">
                                    <div>
                                        <label className="block text-fifa-blue text-[10px] uppercase font-black tracking-widest mb-1.5">Nome da Franquia (Clube)</label>
                                        <input type="text" value={nomeTime} onChange={e => setNomeTime(e.target.value)} placeholder="Ex: Galáticos FC" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 sm:p-4 text-white focus:outline-none focus:border-fifa-blue font-black tracking-tighter uppercase transition-colors"/>
                                    </div>
                                    <div>
                                        <label className="block text-cyan-400 text-[10px] uppercase font-black tracking-widest mb-1.5">Nome do Treinador (Você)</label>
                                        <input type="text" value={nomeTecnico} onChange={e => setNomeTecnico(e.target.value)} placeholder="Ex: Pep Guardiola" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 sm:p-4 text-white focus:outline-none focus:border-cyan-400 font-black tracking-tighter uppercase transition-colors"/>
                                    </div>
                                </div>
                                <button onClick={salvarPerfil} disabled={salvando} className="w-full mt-8 py-4 bg-fifa-green rounded-xl font-black text-white uppercase tracking-widest text-xs hover:bg-opacity-80 transition-all shadow-[0_0_15px_rgba(60,172,59,0.3)] disabled:opacity-50 disabled:cursor-not-allowed">
                                    {salvando ? 'Verificando Servidor...' : 'Assinar Contrato (Salvar)'}
                                </button>
                            </div>
                        )}
                    </div>
                  </div>
                </div>
            )}
        </>
    );
}
