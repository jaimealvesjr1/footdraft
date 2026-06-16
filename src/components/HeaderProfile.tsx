import { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
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
                }
            });
        }

        return () => {
            unsubGame();
            if (unsubUser) unsubUser();
        };
    }, []);

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
            await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
                nomeTime,
                nomeTecnico
            });
            toast.success("Identidade do clube atualizada!");
            setModalAberto(false);
        } catch (error) {
            toast.error("Erro ao salvar.");
        } finally {
            setSalvando(false);
        }
    };

    const titulos = historico.filter((h: any) => h.campeao).length;
    const artilharias = historico.filter((h: any) => h.teveArtilheiro).length;

    return (
        <>
            <button onClick={() => setModalAberto(true)} className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 p-2 rounded-lg border border-neutral-800 transition-colors shadow-sm">
                <span className="text-xl">🏛️</span>
                <div className="hidden sm:flex flex-col text-left leading-none">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">{nomeTime || "Perfil"}</span>
                    <span className="text-[8px] text-fifa-green font-bold uppercase tracking-widest">{titulos} Títulos</span>
                </div>
            </button>

            {modalAberto && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                  <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[90vh]">
                    
                    {/* CABEÇALHO DO MODAL */}
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex gap-4 border-b border-neutral-800 w-full pb-2">
                            <button 
                                onClick={() => setAbaAtiva('HISTORICO')} 
                                className={`uppercase font-black text-xs sm:text-sm tracking-widest transition-colors pb-2 -mb-2.25 border-b-2 ${abaAtiva === 'HISTORICO' ? 'text-yellow-500 border-yellow-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                            >
                                Sala de Troféus
                            </button>
                            <button 
                                onClick={() => setAbaAtiva('EDITAR')} 
                                className={`uppercase font-black text-xs sm:text-sm tracking-widest transition-colors pb-2 -mb-2.25 border-b-2 ${abaAtiva === 'EDITAR' ? 'text-fifa-blue border-fifa-blue' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                            >
                                Editar Carreira
                            </button>
                        </div>
                        <button onClick={() => setModalAberto(false)} className="text-neutral-500 hover:text-white font-black text-lg ml-4 mb-2">X</button>
                    </div>

                    {/* ABA DE HISTÓRICO */}
                    {abaAtiva === 'HISTORICO' && (
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-4">
                            
                            {/* Resumo da Franquia */}
                            <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex justify-around text-center mb-2 shadow-inner">
                                <div>
                                    <p className="text-3xl font-black text-yellow-500">{titulos}</p>
                                    <p className="text-[8px] uppercase tracking-widest text-neutral-400 font-bold mt-1">Troféus</p>
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-orange-500">{artilharias}</p>
                                    <p className="text-[8px] uppercase tracking-widest text-neutral-400 font-bold mt-1">Artilharias</p>
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-white">{historico.length}</p>
                                    <p className="text-[8px] uppercase tracking-widest text-neutral-400 font-bold mt-1">Temporadas</p>
                                </div>
                            </div>

                            {/* Lista de Temporadas */}
                            {historico.length === 0 ? (
                                <p className="text-center text-neutral-500 text-xs uppercase font-bold tracking-widest py-8">Você ainda não concluiu nenhuma temporada.</p>
                            ) : (
                                historico.map((campanha, idx) => (
                                    <div key={idx} className={`p-4 rounded-xl border flex flex-col gap-3 ${campanha.campeao ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-neutral-950 border-neutral-800'}`}>
                                        <div className="flex justify-between items-center border-b border-neutral-800/50 pb-2">
                                            
                                            {/* 🔥 O NOME DO CAMPEONATO APARECE AQUI 🔥 */}
                                            <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest truncate max-w-40">
                                                {campanha.nomeCampeonato || campanha.temporada}
                                            </span>

                                            <div className="flex gap-1.5 shrink-0">
                                                {campanha.campeao && <span className="text-[10px] bg-yellow-500 text-neutral-900 font-black px-2 py-0.5 rounded uppercase tracking-widest">🏆 CAMPEÃO</span>}
                                                {campanha.teveArtilheiro && <span className="text-[10px] bg-orange-500 text-neutral-900 font-black px-2 py-0.5 rounded uppercase tracking-widest" title="O Artilheiro da liga foi do seu time!">👞 ARTILHEIRO</span>}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <span className={`text-4xl font-black leading-none ${campanha.posicao === 1 ? 'text-yellow-500' : campanha.posicao <= 4 ? 'text-cyan-400' : 'text-white'}`}>
                                                    {campanha.posicao}º
                                                </span>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 ml-1">Lugar</span>
                                            </div>
                                            <div className="flex gap-4 text-right">
                                                <div>
                                                    <p className="text-lg font-black text-white leading-none">{campanha.pontos}</p>
                                                    <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">PTS</p>
                                                </div>
                                                <div>
                                                    <p className="text-lg font-black text-neutral-300 leading-none">{campanha.vitorias}</p>
                                                    <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">VIT</p>
                                                </div>
                                                <div>
                                                    <p className="text-lg font-black text-neutral-300 leading-none">{campanha.saldo > 0 ? `+${campanha.saldo}` : campanha.saldo}</p>
                                                    <p className="text-[8px] uppercase text-neutral-500 font-bold tracking-widest">SG</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )).reverse() // Inverte para mostrar as mais recentes primeiro
                            )}
                        </div>
                    )}

                    {/* ABA DE EDIÇÃO */}
                    {abaAtiva === 'EDITAR' && (
                        <div className="flex-1 flex flex-col h-full">
                            <div className="bg-fifa-blue/10 border border-fifa-blue/30 p-3 rounded-lg mb-6 text-center">
                                <p className="text-[10px] text-fifa-blue uppercase font-bold tracking-widest">As mudanças são refletidas em todo o sistema. Trocas só são permitidas fora de temporada.</p>
                            </div>
                            <div className="space-y-4 mb-auto">
                                <div>
                                    <label className="block text-fifa-blue text-[10px] uppercase font-bold tracking-widest mb-1">Nome do Clube</label>
                                    <input type="text" value={nomeTime} onChange={e => setNomeTime(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-fifa-blue font-black tracking-tighter uppercase"/>
                                </div>
                                <div>
                                    <label className="block text-cyan-400 text-[10px] uppercase font-bold tracking-widest mb-1">Treinador (Você)</label>
                                    <input type="text" value={nomeTecnico} onChange={e => setNomeTecnico(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-400 font-black tracking-tighter uppercase"/>
                                </div>
                            </div>
                            <button onClick={salvarPerfil} disabled={salvando} className="w-full mt-6 py-4 bg-fifa-green rounded-xl font-black text-white uppercase tracking-widest text-xs hover:bg-opacity-80 transition-colors shadow-lg">
                                {salvando ? 'Aguarde...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    )}

                  </div>
                </div>
            )}
        </>
    );
}
