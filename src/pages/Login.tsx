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
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <div className="bg-slate-800 p-8 rounded-lg shadow-xl w-96 text-white border border-slate-700">
        <h2 className="text-2xl font-bold mb-6 text-center text-emerald-400">
          {isLogin ? "Entrar no FootDraft" : "Criar Nova Conta"}
        </h2>
        
        <form onSubmit={handleAutenticacao} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-emerald-400 text-white"
            required
          />
          <input
            type="password"
            placeholder="Senha (mín. 6 caracteres)"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="p-3 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-emerald-400 text-white"
            required
          />
          
          {erro && <p className="text-red-400 text-sm">{erro}</p>}

          <button 
            type="submit" 
            className="bg-emerald-500 text-slate-900 font-bold px-6 py-3 rounded mt-2 hover:bg-emerald-400 transition"
          >
            {isLogin ? "Entrar" : "Finalizar Cadastro"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isLogin ? "Não tem conta? " : "Já possui conta? "}
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)} 
            className="text-emerald-400 hover:underline font-semibold"
          >
            {isLogin ? "Cadastre-se" : "Faça Login"}
          </button>
        </p>
      </div>
    </div>
  );
}
