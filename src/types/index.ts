// src/types/index.ts

export type Posicao = 'GOL' | 'DEF' | 'MEI' | 'ATA';

export interface StatusFisico {
  cansaco: number; // Agora de 1 a 5
  lesionado: boolean;
  suspenso: boolean;
}

export interface Jogador {
  id: string;
  nome: string;
  posicao: Posicao;
  clubeHistorico: string;
  overall: number;
  statusFisico?: StatusFisico;
  temporadasNoClube?: number;
}

export interface Clube {
  id: string;
  nome: string;
  ano: number;
  elenco: Jogador[];
}

export interface TimeTabela {
  id: string;
  pts: number;
  j: number;
  v: number;
  e: number;
  d: number;
  gp: number;
  gc: number;
  sg: number;
}

// NOVO: Define a estrutura de um evento narrativo da partida
export type EventoPartida = {
  minuto: number;
  tipo: 'GOL' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'LESAO';
  time: 'CASA' | 'FORA';
  texto: string;
  jogadorId?: string;
};

export interface JogoCamp {
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  relatorio: EventoPartida[]; // AQUI FOI ALTERADO DE string[] PARA EventoPartida[]
}

export type GamePhase = 'SETUP' | 'PRE_SEASON' | 'CHAMPIONSHIP' | 'FIRST_HALF' | 'TRANSFER_WINDOW' | 'SECOND_HALF' | 'FINISHED';

export interface GameState {
  phase: GamePhase;
  currentRound: number;
  draftOrder?: string[];
  draftTurnUid?: string | null;
  draftDeadline?: number | null;
  playersReady: string[];
  currentPack?: Jogador[];
  currentPicks?: Jogador[];
  teams?: { id: string; nome: string; isUser: boolean; }[];
  standings?: TimeTabela[];
  schedule?: { jogos: JogoCamp[] }[];
}
