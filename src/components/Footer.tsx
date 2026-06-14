export default function Footer() {
  return (
    <footer className="w-full border-t border-neutral-800 bg-neutral-950 py-6 mt-auto shrink-0 z-20 relative font-fifa">
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Lado Esquerdo: Logo Typográfico FIFA 26 */}
        <div className="flex items-center hover:cursor-pointer group gap-4">
          <div className="flex flex-col leading-none font-black tracking-tighter select-none">
            <span className="text-xl text-white">FI<span className="text-fifa-blue">FA</span></span>
            <span className="text-2xl text-fifa-green -mt-1">2<span className="text-fifa-red">6</span></span>
          </div>
          <div className="w-px h-8 bg-neutral-800 hidden md:block"></div>
          <span className="text-sm font-black text-fifa-gray-dark uppercase tracking-tighter opacity-50 group-hover:opacity-100 transition-opacity duration-300">
            FootDraft
          </span>
        </div>

        {/* Lado Direito: Textos do rodapé */}
        <div className="flex flex-col items-center md:items-end text-center md:text-right">
          <p className="text-[11px] text-fifa-gray-light font-bold uppercase tracking-widest">
            &copy; {new Date().getFullYear()} FootDraft. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
