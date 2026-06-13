// src/services/matchEngine.ts
import { type Jogador } from '../types';

export type EventoPartida = {
  minuto: number;
  tipo: 'GOL' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'LESAO';
  time: 'CASA' | 'FORA';
  texto: string;
  jogadorId?: string;
};

// Distribuição de Poisson
function getPoisson(lambda: number): number {
  let L = Math.exp(-lambda);
  let p = 1.0;
  let k = 0;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Cálculo do Overall com a nova escala de Cansaço (1 a 5)
const getAdjustedOverall = (j: Jogador) => {
  const status = j.statusFisico || { cansaco: 1, lesionado: false, suspenso: false };
  if (status.lesionado || status.suspenso) return 0; // Não joga nada
  
  // Escala: 1=100%, 2=90%, 3=80%, 4=60%, 5=40%
  const penalidade = [1, 0.9, 0.8, 0.6, 0.4];
  const nivel = Math.max(1, Math.min(5, status.cansaco)) - 1;
  
  return j.overall * penalidade[nivel];
};

const calcSector = (team: Jogador[], pos: string) => {
  const players = team.filter(j => j.posicao === pos);
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, j) => acc + getAdjustedOverall(j), 0);
  return sum / players.length;
};

// Sorteia um jogador aleatório em campo para um evento
const sortearJogador = (team: Jogador[]) => {
  const aptos = team.filter(j => !(j.statusFisico?.lesionado || j.statusFisico?.suspenso));
  if (aptos.length === 0) return team[0];
  return aptos[Math.floor(Math.random() * aptos.length)];
};

export function simularPartida(teamA: Jogador[], teamB: Jogador[]) {
  const eventos: EventoPartida[] = [];

  // PUNIÇÃO: Escalaram jogadores inaptos?
  const inaptoA = teamA.filter(j => j.statusFisico?.lesionado || j.statusFisico?.suspenso).length;
  const inaptoB = teamB.filter(j => j.statusFisico?.lesionado || j.statusFisico?.suspenso).length;

  const defA = calcSector(teamA, 'DEF') + (calcSector(teamA, 'GOL') * 0.5);
  const meiA = calcSector(teamA, 'MEI');
  const ataA = calcSector(teamA, 'ATA');

  const defB = calcSector(teamB, 'DEF') + (calcSector(teamB, 'GOL') * 0.5);
  const meiB = calcSector(teamB, 'MEI');
  const ataB = calcSector(teamB, 'ATA');

  // Fator Casa (+5% de força para o mandante)
  let forceA = ((defA * 0.3) + (meiA * 0.35) + (ataA * 0.35)) * 1.05; 
  let forceB = (defB * 0.3) + (meiB * 0.35) + (ataB * 0.35);

  // Aplica a punição por inaptos em campo (Perde 30% da força por cada jogador inapto)
  forceA *= Math.pow(0.7, inaptoA);
  forceB *= Math.pow(0.7, inaptoB);

  const diff = forceA - forceB;
  const randomFactor = (Math.random() * 16) - 8; // Menos sorte louca, mais tática
  const diffFinal = diff + randomFactor;

  let expectedA = 1.0 + ((ataA - defB) / 15);
  let expectedB = 0.8 + ((ataB - defA) / 15); // Fora tem um xG base ligeiramente menor
  
  expectedA = Math.max(0.1, Math.min(4.0, expectedA));
  expectedB = Math.max(0.1, Math.min(4.0, expectedB));

  let golsA = getPoisson(expectedA);
  let golsB = getPoisson(expectedB);

  // Bias final
  if (diffFinal > 5 && Math.random() < 0.15) golsA++;
  if (diffFinal < -5 && Math.random() < 0.15) golsB++;

  // --- GERADOR DE EVENTOS MOMENTO A MOMENTO ---
  
  // Golos Casa
  for (let i = 0; i < golsA; i++) {
    const min = Math.floor(Math.random() * 90) + 1;
    const autor = sortearJogador(teamA);
    eventos.push({ minuto: min, tipo: 'GOL', time: 'CASA', texto: `GOL DO MANDANTE! ${autor.nome} balança a rede!`, jogadorId: autor.id });
  }
  
  // Golos Fora
  for (let i = 0; i < golsB; i++) {
    const min = Math.floor(Math.random() * 90) + 1;
    const autor = sortearJogador(teamB);
    eventos.push({ minuto: min, tipo: 'GOL', time: 'FORA', texto: `GOL DO VISITANTE! Bela finalização de ${autor.nome}!`, jogadorId: autor.id });
  }

  // Evolução Física e Eventos Disciplinares
  const processarPosJogo = (team: Jogador[], isCasa: boolean) => {
    return team.map(j => {
      let status = { ...(j.statusFisico || { cansaco: 1, lesionado: false, suspenso: false }) };
      
      // Limpa suspensões antigas
      status.suspenso = false; 
      
      // Se ele já estava lesionado e tentaram usá-lo, o estado dele piora (não cura)
      if (!status.lesionado) {
        // Aumenta o cansaço (50% de chance de subir 1 nível, 10% de subir 2 níveis)
        const chanceCansaco = Math.random();
        if (chanceCansaco > 0.9) status.cansaco += 2;
        else if (chanceCansaco > 0.4) status.cansaco += 1;
        status.cansaco = Math.min(5, Math.max(1, status.cansaco)); // Trava entre 1 e 5

        // Risco de Lesão dinâmico com base na fadiga (nível 5 = 15% de chance)
        const riscoLesao = [0.01, 0.03, 0.06, 0.10, 0.15];
        if (Math.random() < riscoLesao[status.cansaco - 1]) {
          status.lesionado = true;
          eventos.push({ minuto: Math.floor(Math.random() * 90) + 1, tipo: 'LESAO', time: isCasa ? 'CASA' : 'FORA', texto: `🏥 PREOCUPAÇÃO: ${j.nome} sentiu uma fisgada e caiu no gramado!`, jogadorId: j.id });
        }

        // Cartões
        const chanceCartao = Math.random();
        if (chanceCartao < 0.02) { // 2% de vermelho direto
          status.suspenso = true;
          eventos.push({ minuto: Math.floor(Math.random() * 90) + 1, tipo: 'CARTAO_VERMELHO', time: isCasa ? 'CASA' : 'FORA', texto: `🟥 RUA! ${j.nome} comete falta dura e é expulso!`, jogadorId: j.id });
        } else if (chanceCartao < 0.15) { // 13% de amarelo
          eventos.push({ minuto: Math.floor(Math.random() * 90) + 1, tipo: 'CARTAO_AMARELO', time: isCasa ? 'CASA' : 'FORA', texto: `🟨 Amarelo para ${j.nome} após reclamação.`, jogadorId: j.id });
        }
      }

      return { ...j, statusFisico: status };
    });
  };

  const homeTeamUpdated = processarPosJogo(teamA, true);
  const awayTeamUpdated = processarPosJogo(teamB, false);

  // Ordena a timeline cronologicamente
  eventos.sort((a, b) => a.minuto - b.minuto);

  return {
    golsCasa: golsA,
    golsFora: golsB,
    relatorio: eventos, // O relatório agora é uma timeline real de objetos
    homeTeamUpdated,
    awayTeamUpdated
  };
}
