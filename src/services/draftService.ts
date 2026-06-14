export interface Jogador {
  id: string;
  nome: string;
  posicao: "GOL" | "DEF" | "MEI" | "ATA";
  overall: number; 
  clubeHistorico: string; 
  statusFisico: {
    cansaco: number; 
    lesionado: boolean;
    suspenso: boolean;
  };
  temporadasNoClube: number; 
}

// Define o que é o Elenco de um utilizador na sala
export interface TimeDraft {
  uidJogador: string; 
  emailJogador: string;
  jogadoresEscolhidos: Jogador[]; 
}

// NOVO: Define o estado atual da Sala de Draft (Corrige o erro do draftService)
export interface DraftState {
  status: "aguardando" | "em_andamento" | "finalizado";
  ordemDraft: any[];
  turnoAtualIndex: number;
  rodadaAtual: number;
  jogadores: any[];
}
