import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [erro, setErro] = useState("");

  const handleAutenticacao = async (e: React.FormEvent) => {
    e.preventDefault(); // Evita que a página recarregue
    setErro(""); // Limpa os erros

    try {
      if (isLogin) {
        // Tenta fazer o login
        await signInWithEmailAndPassword(auth, email, senha);
        alert("Login efetuado com sucesso!");
      } else {
        // Tenta criar conta nova
        await createUserWithEmailAndPassword(auth, email, senha);
        alert("Conta criada com sucesso!");
      }
    } catch (error: any) {
      setErro("Erro na autenticação. Verifique os dados.");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 font-fifa p-4">
      <div className="bg-neutral-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-neutral-800 relative overflow-hidden">
        {/* Detalhe visual de topo */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-linear-to-r from-fifa-green via-fifa-blue to-fifa-red"></div>

        <h2 className="text-3xl font-black mb-2 text-center text-white uppercase tracking-tighter mt-2">
          Foot<span className="text-fifa-green">Draft26</span>
        </h2>
        <p className="text-center text-xs text-neutral-500 uppercase tracking-widest font-bold mb-8">
          {isLogin ? "Acesso ao Vestiário" : "Inicie sua Jornada"}
        </p>
        
        <form onSubmit={handleAutenticacao} className="flex flex-col gap-4">
          <div>
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 rounded-xl bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue text-white font-bold transition-all placeholder:text-neutral-600"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Senha (mín. 6 caracteres)"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full p-4 rounded-xl bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-fifa-blue focus:ring-1 focus:ring-fifa-blue text-white font-bold transition-all placeholder:text-neutral-600"
              required
            />
          </div>
          
          {erro && <p className="text-orange-500 text-xs font-bold uppercase tracking-widest text-center mt-2">{erro}</p>}

          <button 
            type="submit" 
            className="w-full bg-fifa-blue text-white font-black uppercase tracking-widest px-6 py-4 rounded-xl mt-4 hover:bg-opacity-90 transition-all shadow-[0_0_15px_rgba(42,57,141,0.4)]"
          >
            {isLogin ? "Entrar na Conta" : "Finalizar Cadastro"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs font-bold uppercase tracking-widest text-neutral-500 border-t border-neutral-800 pt-6">
          {isLogin ? "Ainda não tem um time? " : "Já possui um clube? "}
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)} 
            className="text-fifa-green hover:text-opacity-80 transition-colors ml-1"
          >
            {isLogin ? "Criar Conta" : "Fazer Login"}
          </button>
        </p>
      </div>
    </div>
  );
}
