export type Posicao = 'GOL' | 'DEF' | 'MEI' | 'ATA';

export interface StatusFisico {
  cansaco: number;
  lesionado: boolean;
  suspenso: boolean;
}

export interface Jogador {
  id: string;
  nome: string;
  posicao: Posicao;
  clubeAtual?: string;      // Opcional (?) para manter compatibilidade
  clubeHistorico: string;   // Novo campo do seu pack
  overall: number;          // Novo campo do seu pack
  statusFisico: StatusFisico; // Novo campo
  temporadasNoClube: number;  // Novo campo
}

export interface Clube {
  id: string;
  nome: string;
  ano: number;
  elenco: Jogador[];
}

export const LIMITES_POSICAO: Record<Posicao, number> = {
  'GOL': 3,
  'DEF': 8, 
  'MEI': 5,
  'ATA': 5,
};

export const LIMITE_CORINGA = 2;

// ==========================================
// TIPOS DO ESTADO GLOBAL MULTIPLAYER
// ==========================================
export type GamePhase = 'SETUP' | 'PRE_SEASON' | 'FIRST_HALF' | 'TRANSFER_WINDOW' | 'SECOND_HALF' | 'FINISHED';

export interface JogoCamp {
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  relatorio: string[];
}

export interface GameState {
  phase: GamePhase;
  currentRound: number;
  draftTurnUid: string | null;      
  draftDeadline: number | null;     
  draftOrder: string[];             
  playersReady: string[];           
  currentPack?: Jogador[];          
  currentPicks?: Jogador[];
  
  // NOVOS CAMPOS PARA O CAMPEONATO
  teams?: { id: string, nome: string, isUser: boolean }[];
  standings?: { id: string, pts: number, j: number, v: number, e: number, d: number, gp: number, gc: number, sg: number }[];
  schedule?: JogoCamp[][]; // Ex: schedule[0] = Todos os jogos da Rodada 1
}

