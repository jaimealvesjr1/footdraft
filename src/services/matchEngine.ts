// src/services/matchEngine.ts
import { type Jogador } from '../types';

// ==========================================
// FUNÇÕES AUXILIARES MATEMÁTICAS
// ==========================================

// Distribuição de Poisson para gerar os Gols
function getPoisson(lambda: number): number {
  let L = Math.exp(-lambda);
  let p = 1.0;
  let k = 0;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

// Cálculo do Overall com base no Estado Físico
const getAdjustedOverall = (j: Jogador) => {
  const status = j.statusFisico || { cansaco: 0, lesionado: false, suspenso: false };
  if (status.lesionado || status.suspenso) return 0; // Inapto para jogar
  const cansaco = Math.min(status.cansaco, 100);
  return j.overall * (1 - (cansaco / 200));
};

// Cálculo do Setor
const calcSector = (team: Jogador[], pos: string) => {
  const players = team.filter(j => j.posicao === pos);
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, j) => acc + getAdjustedOverall(j), 0);
  return sum / players.length;
};

// Aplicação dos Eventos Pós-Jogo
const applyPostMatch = (team: Jogador[]) => {
  return team.map(j => {
    let status = { ...(j.statusFisico || { cansaco: 0, lesionado: false, suspenso: false }) };
    
    // Limpa lesões/suspensões passadas para reavaliar a nova rodada
    status.lesionado = false;
    status.suspenso = false;

    // Cansaço: +5 a 15
    status.cansaco += Math.floor(Math.random() * 11) + 5; 
    status.cansaco = Math.min(100, status.cansaco);

    // Risco de Lesão
    const pLesao = 0.02 + (status.cansaco / 500);
    if (Math.random() < pLesao) status.lesionado = true;

    // Risco de Suspensão (Cartão)
    if (Math.random() < 0.01) status.suspenso = true;

    return { ...j, statusFisico: status };
  });
};

// ==========================================
// SIMULADOR PRINCIPAL
// ==========================================
export function simularPartida(teamA: Jogador[], teamB: Jogador[]) {
  // 4. Força por Setor
  const defA = calcSector(teamA, 'DEF') + (calcSector(teamA, 'GOL') * 0.5);
  const meiA = calcSector(teamA, 'MEI');
  const ataA = calcSector(teamA, 'ATA');

  const defB = calcSector(teamB, 'DEF') + (calcSector(teamB, 'GOL') * 0.5);
  const meiB = calcSector(teamB, 'MEI');
  const ataB = calcSector(teamB, 'ATA');

  // 5. Força Total do Time
  const forceA = (defA * 0.3) + (meiA * 0.35) + (ataA * 0.35);
  const forceB = (defB * 0.3) + (meiB * 0.35) + (ataB * 0.35);

  // 6 & 7. Confronto e Fator Aleatório
  const diff = forceA - forceB;
  const randomFactor = (Math.random() * 20) - 10; // Fator Sorte ∈ [-10, +10]
  const diffFinal = diff + randomFactor;

  // 9. Intensidade Ofensiva (Expected Goals - xG)
  let expectedA = 1.2 + ((ataA - defB) / 20);
  expectedA = Math.max(0.2, Math.min(3.5, expectedA));

  let expectedB = 1.2 + ((ataB - defA) / 20);
  expectedB = Math.max(0.2, Math.min(3.5, expectedB));

  // Gera os gols
  let golsA = getPoisson(expectedA);
  let golsB = getPoisson(expectedB);

  // 10. Ajuste Final de Viés (Bias)
  if (diffFinal > 0 && Math.random() < 0.10) golsA++;
  if (diffFinal < 0 && Math.random() < 0.10) golsB++;

  // 11. Consequências Físicas Pós-Jogo
  const homeTeamUpdated = applyPostMatch(teamA);
  const awayTeamUpdated = applyPostMatch(teamB);

  // Gera Relatório Visual
  const relatorio = [
    `=== ESTATÍSTICAS DA PARTIDA ===`,
    `[CASA] Força: ${forceA.toFixed(1)} | xG: ${expectedA.toFixed(2)}`,
    `[FORA] Força: ${forceB.toFixed(1)} | xG: ${expectedB.toFixed(2)}`,
    `> Pressão na Defesa: ${(ataA - defB).toFixed(1)} vs ${(ataB - defA).toFixed(1)}`,
    `> Fator "Zebras/Sorte": ${randomFactor > 0 ? '+' : ''}${randomFactor.toFixed(1)}`,
    `===============================`,
    `⚽ FIM DE JOGO: Casa ${golsA} x ${golsB} Fora`
  ];

  return {
    golsCasa: golsA,
    golsFora: golsB,
    relatorio,
    homeTeamUpdated,
    awayTeamUpdated
  };
}
