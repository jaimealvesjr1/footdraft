export default function Footer() {
  return (
    <footer className="w-full border-t border-neutral-800 bg-neutral-950 py-6 mt-auto shrink-0 z-20 relative font-fifa">
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Lado Esquerdo: Logo Typográfico FIFA 26 */}
        <div className="flex items-center hover:cursor-pointer group gap-4">
          <img 
            src="/header.png" 
            alt="FootDraft Logo Oficial" 
            className="h-12 w-auto object-contain rounded-md grayscale group-hover:grayscale-0 transition-all duration-500" 
          />
        </div>

        {/* Lado Direito: Textos do rodapé */}
        <div className="flex flex-col items-center md:items-end text-center md:text-right">
          <p className="text-[11px] text-fifa-gray-light font-bold uppercase tracking-widest">
            &copy; {new Date().getFullYear()} FootDraft. Todos os direitos reservados.
          </p>
          <p className="text-[11px] text-gray-500 font-bold tracking-widest">
            Created by Ascentia
          </p>
        </div>
      </div>
    </footer>
  );
}
