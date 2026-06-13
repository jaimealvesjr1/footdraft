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

export interface GameState {
  phase: GamePhase;
  currentRound: number;
  draftTurnUid: string | null;      
  draftDeadline: number | null;     
  draftOrder: string[];             
  playersReady: string[];           
  currentPack?: Jogador[];          // O pacote de 9 cartas gerado pelo jogador atual
  currentPicks?: Jogador[];         // As cartas que ele já clicou
}
