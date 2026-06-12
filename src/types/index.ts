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

export interface TimeDraft {
  uidJogador: string;
  emailJogador: string;
  jogadoresEscolhidos: Jogador[];
}
