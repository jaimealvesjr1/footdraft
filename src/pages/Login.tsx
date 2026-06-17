import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  
  // NOVO: Controle de botão de carregamento
  const [loading, setLoading] = useState(false);

  const handleAutenticacao = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setLoading(true); // Bloqueia os botões e inputs

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, senha);
        toast.success("Acesso liberado! Bem-vindo ao Centro de Treinamento.");
      } else {
        await createUserWithEmailAndPassword(auth, email, senha);
        toast.success("Contrato assinado! Sua conta foi criada.");
      }
    } catch (error: any) {
      console.error(error);
      
      // NOVO: Tratamento de erros do Firebase traduzidos
      switch (error.code) {
        case 'auth/invalid-email':
          toast.error("Formato de e-mail inválido.");
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          toast.error("E-mail ou senha incorretos.");
          break;
        case 'auth/email-already-in-use':
          toast.error("Este e-mail já está sendo usado por outro técnico.");
          break;
        case 'auth/weak-password':
          toast.error("A senha é muito fraca (mínimo de 6 caracteres).");
          break;
        default:
          toast.error("Ocorreu um erro inesperado. Tente novamente.");
      }
    } finally {
      setLoading(false); // Libera os botões independentemente de dar erro ou sucesso
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 font-fifa p-4">
      {/* Ajuste nos Paddings: p-6 no mobile, sm:p-8 no desktop */}
      <div className="bg-neutral-900 p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-md border border-neutral-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-linear-to-r from-fifa-green via-fifa-blue to-fifa-red"></div>

        {/* Ajuste de Fonte: text-2xl no mobile, sm:text-3xl no desktop */}
        <h2 className="text-2xl sm:text-3xl font-black mb-1 sm:mb-2 text-center text-white uppercase tracking-tighter mt-2">
          Foot<span className="text-fifa-green">Draft26</span>
        </h2>
        <p className="text-center text-[10px] sm:text-xs text-neutral-500 uppercase tracking-widest font-bold mb-6 sm:mb-8">
          {isLogin ? "Acesso ao CT" : "Assine seu Contrato"}
        </p>
        
        {/* Ajuste de Gaps: gap-3 no mobile, sm:gap-4 no desktop */}
        <form onSubmit={handleAutenticacao} className="flex flex-col gap-3 sm:gap-4">
          <div>
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full p-3 sm:p-4 rounded-xl bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue text-white text-sm sm:text-base font-bold transition-all placeholder:text-neutral-600 disabled:opacity-50"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Senha (mín. 6 caracteres)"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={loading}
              className="w-full p-3 sm:p-4 rounded-xl bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue text-white text-sm sm:text-base font-bold transition-all placeholder:text-neutral-600 disabled:opacity-50"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full bg-fifa-blue text-white font-black uppercase tracking-widest px-6 py-3 sm:py-4 rounded-xl mt-2 sm:mt-4 transition-all shadow-[0_0_15px_rgba(42,57,141,0.4)] ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-opacity-90'}`}
          >
            {loading ? "Aguarde..." : (isLogin ? "Entrar na Conta" : "Finalizar Cadastro")}
          </button>
        </form>

        {/* Ajuste do rodapé */}
        <p className="mt-6 sm:mt-8 text-center text-[10px] sm:text-xs font-bold uppercase tracking-widest text-neutral-500 border-t border-neutral-800 pt-4 sm:pt-6">
          {isLogin ? "Ainda não tem um time? " : "Já possui um clube? "}
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)} 
            disabled={loading}
            className="text-fifa-green hover:text-opacity-80 transition-colors ml-1 disabled:opacity-50"
          >
            {isLogin ? "Criar Conta" : "Fazer Login"}
          </button>
        </p>
      </div>
    </div>
  );
}
