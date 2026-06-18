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
  tags?: string[]; // NOVO: Mapeado para o nosso sistema inteligente de buscas no Admin
  elenco: Jogador[];
}

// CORREÇÃO: Unimos as duas declarações de TimeTabela em uma só, limpa e completa!
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
  xpGanho?: number;
  grupo?: string | null; 
}

// CORREÇÃO: Dicionário atualizado com os novos eventos da nossa transmissão
export type EventoPartida = {
  minuto: number;
  tipo: 'GOL' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'LESAO' | 'PENALTIS' | 'INFO';
  time: 'CASA' | 'FORA';
  texto: string;
  jogadorId?: string;
  jogadorNome?: string;
};

export interface JogoCamp {
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  relatorio: EventoPartida[]; 
  pressao?: { minuto: number; valor: number }[];
  grupoBadge?: string; 
}

export type GamePhase = 'SETUP' | 'PRE_SEASON' | 'TRANSFER_WINDOW' | 'FIRST_HALF' | 'SECOND_HALF' | 'CHAMPIONSHIP' | 'FINISHED';

export type TipoEventoCalendario = 'LIGA' | 'COPA' | 'TRANSFERENCIAS' | 'LIGA_GRUPOS' | 'SORTEIO_MATA_MATA';

export interface RodadaCalendario {
  tipo: TipoEventoCalendario;
  titulo: string; 
  jogos: JogoCamp[];
  decidirCopa?: boolean;
}

export interface GameState {
  phase: GamePhase;
  currentRound: number; 
  draftRound?: number; // NOVO: Independência de rodada para a tela do Draft
  draftOrder?: string[];
  draftTurnUid?: string | null;
  draftDeadline?: number | null;
  playersReady: string[];
  playersInLive?: string[]; // NOVO: Controle de quem já chegou no estádio para a Transmissão
  currentPack?: Jogador[];
  currentPicks?: Jogador[];
  teams?: { id: string; nome: string; isUser: boolean; }[];
  standings?: TimeTabela[];
  schedule?: RodadaCalendario[]; 
  nomeCampeonato?: string;
  totalTeams?: number;
  regrasClassificacao?: any;
}
