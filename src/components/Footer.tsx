export default function Footer() {
  return (
    <footer className="w-full border-t border-neutral-800 bg-neutral-950/80 py-6 mt-auto shrink-0 z-20 relative">
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Lado Esquerdo: Marca do Jogo */}
        <div className="flex items-center hover:cursor-pointer group">
          <span className="text-xl font-black text-white uppercase tracking-tighter opacity-50 group-hover:opacity-100 transition-opacity duration-300">
            Foot<span className="text-yellow-500">Draft26</span>
          </span>
        </div>
        
        {/* Lado Direito: Textos do rodapé */}
        <div className="flex flex-col items-center md:items-end text-center md:text-right">
          <p className="text-[11px] text-neutral-500 font-bold uppercase tracking-widest">
            &copy; {new Date().getFullYear()} FootDraft. Todos os direitos reservados.
          </p>
          <p className="text-[10px] text-cyan-400 font-black uppercase tracking-widest mt-1">
            Desenvolvido pra galera da B2X
          </p>
        </div>
      </div>
    </footer>
  );
}
