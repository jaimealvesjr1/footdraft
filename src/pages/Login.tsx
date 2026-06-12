import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase"; // Importamos o auth que acabamos de configurar

export default function Login() {
  // Variáveis para guardar o que o usuário digita
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  
  // Variável para saber se a tela é de Login ou de Criar Conta (padrão é Login = true)
  const [isLogin, setIsLogin] = useState(true); 
  const [erro, setErro] = useState("");

  // Função disparada quando o botão "Entrar" ou "Cadastrar" for clicado
  const handleAutenticacao = async (e: React.FormEvent) => {
    e.preventDefault(); // Evita que a página recarregue ao enviar o formulário
    setErro(""); // Limpa as mensagens de erro antes de tentar novamente

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, senha);
        alert("Login efetuado com sucesso! Bem-vindo ao FootDraft.");
      } else {
        // Tenta criar uma nova conta no Firebase
        await createUserWithEmailAndPassword(auth, email, senha);
        alert("Conta criada com sucesso! Você já está logado.");
      }
    } catch (error: any) {
      // Se der erro (ex: senha errada, email já existe), mostramos na tela
      setErro("Erro na autenticação: Verifique seus dados.");
      console.error(error);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <div className="bg-slate-800 p-8 rounded-lg shadow-xl w-96 text-white border border-slate-700">
        <h2 className="text-2xl font-bold mb-6 text-center text-emerald-400">
          {isLogin ? "Entrar no FootDraft" : "Criar Nova Conta"}
        </h2>
        
        {/* Formulário */}
        <form onSubmit={handleAutenticacao} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Seu E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-emerald-400"
            required
          />
          <input
            type="password"
            placeholder="Sua Senha (mín. 6 caracteres)"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="p-3 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-emerald-400"
            required
          />
          
          {/* Se houver algum erro, exibe esta mensagem em vermelho */}
          {erro && <p className="text-red-400 text-sm">{erro}</p>}

          <button 
            type="submit" 
            className="bg-emerald-500 text-slate-900 font-bold px-6 py-3 rounded mt-2 hover:bg-emerald-400 transition"
          >
            {isLogin ? "Entrar na Sessão" : "Finalizar Cadastro"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isLogin ? "Ainda não tem conta? " : "Já possui um time? "}
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            className="text-emerald-400 hover:underline font-semibold"
          >
            {isLogin ? "Cadastre-se aqui" : "Faça Login"}
          </button>
        </p>
      </div>
    </div>
  );
}
