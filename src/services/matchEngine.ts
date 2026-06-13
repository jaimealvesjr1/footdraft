// src/services/matchEngine.ts
import type { Jogador } from "../types";

export interface ResultadoPartida {
  golsCasa: number;
  golsFora: number;
  relatorio: string[];
  // Nova propriedade: Devolvemos os times com cansaço, lesões e cartões aplicados
  jogadoresCasaAtualizados: Jogador[];
  jogadoresForaAtualizados: Jogador[];
}

// ==========================================
// FUNÇÕES AUXILIARES DO MOTOR
// ==========================================

// Calcula Força + Entrosamento + Penalidades
const avaliarTime = (titulares: Jogador[]) => {
  let forcaBase = 0;
  const contagemClubes: Record<string, number> = {};

  titulares.forEach(j => {
    // 1. Penalidade por Cansaço
    const penalidadeCansaco = (j.statusFisico?.cansaco || 0) > 50 ? ((j.statusFisico.cansaco - 50) / 100) * 15 : 0;
    forcaBase += (j.overall - penalidadeCansaco);

    // 2. Mapeamento para Entrosamento
    if (j.clubeHistorico) {
      contagemClubes[j.clubeHistorico] = (contagemClubes[j.clubeHistorico] || 0) + 1;
    }
  });

  // 3. Calcula Bônus de Entrosamento (Ex: 3 jogadores do "Santos 2011" = +3 pontos na média do time)
  let bonusEntrosamento = 0;
  Object.values(contagemClubes).forEach(qtd => {
    if (qtd >= 2) bonusEntrosamento += qtd; // Ex: 2 jogadores = +2, 4 jogadores = +4
  });

  return (forcaBase / 11) + bonusEntrosamento;
};

// Sorteia um autor para os eventos (Gols, Cartões) priorizando posições adequadas
const escolherAutor = (titulares: Jogador[], prioridadeOfensiva = false) => {
  let candidatos = titulares;
  if (prioridadeOfensiva) {
    candidatos = titulares.filter(j => j.posicao === 'ATA' || j.posicao === 'MEI');
    if (candidatos.length === 0) candidatos = titulares; // Fallback
  }
  return candidatos[Math.floor(Math.random() * candidatos.length)];
};

// ==========================================
// O SIMULADOR PRINCIPAL
// ==========================================
export const simularPartida = (titularesCasa: Jogador[], titularesFora: Jogador[]): ResultadoPartida => {
  const relatorio: string[] = [];
  
  // Clona os arrays para não alterar a interface original diretamente antes da hora
  const timeCasa = JSON.parse(JSON.stringify(titularesCasa)) as Jogador[];
  const timeFora = JSON.parse(JSON.stringify(titularesFora)) as Jogador[];

  let forcaCasa = avaliarTime(timeCasa) + 2; // +2 Fator Casa
  let forcaFora = avaliarTime(timeFora);

  relatorio.push(`Força Inicial: Casa (${forcaCasa.toFixed(1)}) vs Fora (${forcaFora.toFixed(1)})`);

  // Sorte do jogo
  const totalCasa = forcaCasa + Math.floor(Math.random() * 15);
  const totalFora = forcaFora + Math.floor(Math.random() * 15);

  let golsCasa = 0;
  let golsFora = 0;
  const diferenca = totalCasa - totalFora;

  // Define Placar Base
  if (diferenca > 15) { golsCasa = Math.floor(Math.random() * 3) + 2; golsFora = Math.floor(Math.random() * 2); }
  else if (diferenca > 5) { golsCasa = Math.floor(Math.random() * 2) + 1; golsFora = Math.floor(Math.random() * 2); }
  else if (diferenca < -15) { golsCasa = Math.floor(Math.random() * 2); golsFora = Math.floor(Math.random() * 3) + 2; }
  else if (diferenca < -5) { golsCasa = Math.floor(Math.random() * 2); golsFora = Math.floor(Math.random() * 2) + 1; }
  else { golsCasa = Math.floor(Math.random() * 2); golsFora = Math.floor(Math.random() * 2); }

  // ==========================================
  // GERAÇÃO DE EVENTOS DE JOGO (GOLS, LESÕES, CARTÕES)
  // ==========================================
  
  // Gols do Time da Casa
  for (let i = 0; i < golsCasa; i++) {
    const autor = escolherAutor(timeCasa, true);
    relatorio.push(`⚽ GOL DA CASA! ${autor.nome} (${autor.clubeHistorico}) balança a rede!`);
  }

  // Gols do Time de Fora
  for (let i = 0; i < golsFora; i++) {
    const autor = escolherAutor(timeFora, true);
    relatorio.push(`⚽ GOL VISITANTE! ${autor.nome} anota para os forasteiros!`);
  }

  // Eventos Físicos e Disciplinares
  const aplicarEventos = (time: Jogador[]) => {
    time.forEach(j => {
      j.statusFisico.cansaco = Math.min(100, j.statusFisico.cansaco + (Math.floor(Math.random() * 11) + 10));
      if (Math.random() < 0.03) {
        j.statusFisico.lesionado = true;
        relatorio.push(`🏥 LESÃO! ${j.nome} sentiu um fisgão e precisou de atendimento.`);
      }
      if (Math.random() < 0.02) {
        j.statusFisico.suspenso = true;
        relatorio.push(`🟥 EXPULSO! Cartão vermelho direto para ${j.nome}!`);
      }
    });
  };

  aplicarEventos(timeCasa);
  aplicarEventos(timeFora);

  relatorio.push(`Fim de jogo: Casa ${golsCasa} x ${golsFora} Fora`);

  return {
    golsCasa,
    golsFora,
    relatorio,
    jogadoresCasaAtualizados: timeCasa,
    jogadoresForaAtualizados: timeFora
  };
};
