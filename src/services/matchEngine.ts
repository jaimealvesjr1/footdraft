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
const getAdjustedOverall = (j: Jogador, isImprovisado: boolean) => {
  // CORREÇÃO: Construímos o objeto de forma explícita para o TypeScript parar de reclamar
  const status = {
    cansaco: j.statusFisico?.cansaco ?? 1,
    lesionado: j.statusFisico?.lesionado ?? false,
    suspenso: j.statusFisico?.suspenso ?? false,
    amarelos: (j.statusFisico as any)?.amarelos ?? 0
  };
  
  if (status.lesionado || status.suspenso) return 0; 
  
  // DEIXAMOS O CANSAÇO MAIS PUNITIVO: 100%, 85%, 70%, 50%, 30%
  const penalidade = [1, 0.85, 0.70, 0.50, 0.30];
  const nivel = Math.max(1, Math.min(5, status.cansaco)) - 1;
  
  const baseOverall = isImprovisado ? (j.overall * 0.85) : j.overall;
  
  return baseOverall * penalidade[nivel];
};

const calcSector = (team: Jogador[], pos: string) => {
  const players = team.filter(j => {
    return j.posicao === pos;
  });
  
  if (players.length === 0) return 0;
  
  const sum = players.reduce((acc, j) => {
    return acc + getAdjustedOverall(j, false);
  }, 0);
  
  return sum / players.length;
};

const sortearJogador = (team: Jogador[]) => {
  const aptos = team.filter(j => !(j.statusFisico?.lesionado || j.statusFisico?.suspenso));
  if (aptos.length === 0) return team[0];
  return aptos[Math.floor(Math.random() * aptos.length)];
};

export function simularPartida(teamA: Jogador[], teamB: Jogador[], bancoA: Jogador[] = [], bancoB: Jogador[] = []) {
  const eventos: EventoPartida[] = [];

  const inaptoA = teamA.filter(j => j.statusFisico?.lesionado || j.statusFisico?.suspenso).length;
  const inaptoB = teamB.filter(j => j.statusFisico?.lesionado || j.statusFisico?.suspenso).length;

  const defA = (calcSector(teamA, 'DEF') * 0.7) + (calcSector(teamA, 'GOL') * 0.3);
  const meiA = calcSector(teamA, 'MEI');
  const ataA = calcSector(teamA, 'ATA');

  const defB = (calcSector(teamB, 'DEF') * 0.7) + (calcSector(teamB, 'GOL') * 0.3);
  const meiB = calcSector(teamB, 'MEI');
  const ataB = calcSector(teamB, 'ATA');

  // AUMENTAMOS O FATOR CASA (de 5% para 10% de vantagem)
  let forceA = ((defA * 0.3) + (meiA * 0.35) + (ataA * 0.35)) * 1.10; 
  let forceB = (defB * 0.3) + (meiB * 0.35) + (ataB * 0.35);

  forceA *= Math.pow(0.7, inaptoA);
  forceB *= Math.pow(0.7, inaptoB);

  const diff = forceA - forceB;
  // FATOR ZEBRA MAIOR: A sorte agora oscila de -10 a +10 (Simula o ritmo de jogo/moral)
  const randomFactor = (Math.random() * 20) - 10; 
  const diffFinal = diff + randomFactor;

  // ACHATAMENTO DA CURVA: Divisor subiu de 25 para 35, aproximando os times
  let expectedA = 1.1 + ((ataA - defB) / 35);
  let expectedB = 0.9 + ((ataB - defA) / 35); 

  // FATOR RETRANCA: Se um time é MUITO mais forte, o fraco "estaciona o ônibus" na defesa
  if (forceA > forceB * 1.15) {
    expectedA -= 0.3; // Favorito tem mais dificuldade de furar o bloqueio
    expectedB += 0.2; // Azarão tem chance de contra-ataque mortal
  } else if (forceB > forceA * 1.15) {
    expectedB -= 0.3;
    expectedA += 0.2;
  }
  
  // TETO MAIS REALISTA: Máximo de 3.0 gols esperados base
  expectedA = Math.max(0.1, Math.min(3.0, expectedA));
  expectedB = Math.max(0.1, Math.min(3.0, expectedB));

  let golsA = getPoisson(expectedA);
  let golsB = getPoisson(expectedB);

  // Goleadas raras dependem de muita diferença E muita sorte
  if (diffFinal > 15 && Math.random() < 0.1) golsA++;
  if (diffFinal < -15 && Math.random() < 0.1) golsB++;

  for (let i = 0; i < golsA; i++) {
    const min = Math.floor(Math.random() * 90) + 1;
    const autor = sortearJogador(teamA);
    eventos.push({ minuto: min, tipo: 'GOL', time: 'CASA', texto: `GOL DO MANDANTE! ${autor.nome} balança a rede!`, jogadorId: autor.id });
  }
  for (let i = 0; i < golsB; i++) {
    const min = Math.floor(Math.random() * 90) + 1;
    const autor = sortearJogador(teamB);
    eventos.push({ minuto: min, tipo: 'GOL', time: 'FORA', texto: `GOL DO VISITANTE! Bela finalização de ${autor.nome}!`, jogadorId: autor.id });
  }

  const processarPosJogo = (titulares: Jogador[], banco: Jogador[], isCasa: boolean) => {
    const titularesAtualizados = titulares.map(j => {
      // CORREÇÃO: Criação explícita contornando o erro de Tipagem
      let status = { 
        cansaco: j.statusFisico?.cansaco ?? 1, 
        lesionado: j.statusFisico?.lesionado ?? false, 
        suspenso: j.statusFisico?.suspenso ?? false,
        amarelos: (j.statusFisico as any)?.amarelos ?? 0
      };
      
      status.suspenso = false; 
      
      if (!status.lesionado) {
        const chanceCansaco = Math.random();
        if (chanceCansaco > 0.8) status.cansaco += 2;
        else if (chanceCansaco > 0.3) status.cansaco += 1;
        status.cansaco = Math.min(5, Math.max(1, status.cansaco)); 

        const riscoLesao = [0.01, 0.03, 0.06, 0.10, 0.15];
        if (Math.random() < riscoLesao[status.cansaco - 1]) {
          status.lesionado = true;
          eventos.push({ minuto: Math.floor(Math.random() * 90) + 1, tipo: 'LESAO', time: isCasa ? 'CASA' : 'FORA', texto: `PREOCUPAÇÃO: ${j.nome} sentiu uma fisgada e caiu no gramado!`, jogadorId: j.id });
        }

        const chanceCartao = Math.random();
        if (chanceCartao < 0.01) {
          status.suspenso = true;
          status.amarelos = 0; // Zera pendurados se tomar vermelho direto
          eventos.push({ minuto: Math.floor(Math.random() * 90) + 1, tipo: 'CARTAO_VERMELHO', time: isCasa ? 'CASA' : 'FORA', texto: `RUA! ${j.nome} comete falta dura e é expulso!`, jogadorId: j.id });
        } else if (chanceCartao < 0.15) { 
          // O jogador recebe o primeiro amarelo do jogo
          status.amarelos += 1;
          const minAmarelo = Math.floor(Math.random() * 80) + 1;
          eventos.push({ minuto: minAmarelo, tipo: 'CARTAO_AMARELO', time: isCasa ? 'CASA' : 'FORA', texto: `Amarelo para ${j.nome} após falta dura.`, jogadorId: j.id });
          
          // Chance de 5% de tomar o SEGUNDO amarelo no mesmo jogo
          if (Math.random() < 0.05) {
            status.suspenso = true;
            status.amarelos = 0; // Zera a contagem para a volta da suspensão
            const minSegundo = minAmarelo + Math.floor(Math.random() * (90 - minAmarelo)) + 1;
            eventos.push({ minuto: minSegundo, tipo: 'CARTAO_AMARELO', time: isCasa ? 'CASA' : 'FORA', texto: `Segundo amarelo! ${j.nome} chega atrasado...`, jogadorId: j.id });
            eventos.push({ minuto: minSegundo + 1, tipo: 'CARTAO_VERMELHO', time: isCasa ? 'CASA' : 'FORA', texto: `RUA! ${j.nome} recebe o segundo amarelo e é expulso!`, jogadorId: j.id });
          } else if (status.amarelos >= 3) {
            // Regra oficial: 3 cartões amarelos acumulados = suspensão no próximo jogo
            status.suspenso = true;
            status.amarelos = 0;
            eventos.push({ minuto: 90, tipo: 'CARTAO_AMARELO', time: isCasa ? 'CASA' : 'FORA', texto: `AVISO: ${j.nome} estava pendurado e não joga a próxima partida!`, jogadorId: j.id });
          }
        }
      }
      return { ...j, statusFisico: status };
    });

    const bancoAtualizado = banco.map(j => {
      // CORREÇÃO TAMBÉM NO BANCO DE RESERVAS
      let status = { 
        cansaco: j.statusFisico?.cansaco ?? 1, 
        lesionado: j.statusFisico?.lesionado ?? false, 
        suspenso: j.statusFisico?.suspenso ?? false,
        amarelos: (j.statusFisico as any)?.amarelos ?? 0
      };
      
      status.suspenso = false;

      if (status.cansaco > 1) {
        status.cansaco -= 2;
        status.cansaco = Math.max(1, status.cansaco);
      }

      if (status.lesionado && Math.random() < 0.35) {
        status.lesionado = false;
      }

      return { ...j, statusFisico: status };
    });

    return [...titularesAtualizados, ...bancoAtualizado];
  };

  const homeTeamUpdated = processarPosJogo(teamA, bancoA, true);
  const awayTeamUpdated = processarPosJogo(teamB, bancoB, false);

  eventos.sort((a, b) => a.minuto - b.minuto);

  return {
    golsCasa: golsA,
    golsFora: golsB,
    relatorio: eventos, 
    homeTeamUpdated,
    awayTeamUpdated
  };
}
