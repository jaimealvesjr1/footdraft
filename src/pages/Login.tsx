import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../services/firebase";

export default function Login() {
  const handleLogin = async () => {
    await signInWithPopup(auth, provider);
  };

  return (
    <div className="h-screen flex items-center justify-center">
      <button
        onClick={handleLogin}
        className="bg-blue-500 text-white px-6 py-3 rounded"
      >
        Entrar com Email e Senha
      </button>
    </div>
  );
}
