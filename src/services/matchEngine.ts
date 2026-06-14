import { type Jogador } from '../types';

export type EventoPartida = {
  minuto: number;
  tipo: 'GOL' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'LESAO';
  time: 'CASA' | 'FORA';
  texto: string;
  jogadorId?: string;
};

// ========================
// UTILIDADES
// ========================

const getAdjustedOverall = (j: Jogador) => {
  if (!j) return 0;

  const status = j.statusFisico ?? { cansaco: 1, lesionado: false, suspenso: false };
  if (status.lesionado || status.suspenso) return 0;

  const penalidade = [1, 0.9, 0.8, 0.7, 0.5];
  const nivel = Math.max(1, Math.min(5, status.cansaco)) - 1;

  return j.overall * penalidade[nivel];
};

const calcSector = (team: Jogador[], pos: string) => {
  const players = team.filter(j => j && j.posicao === pos);
  if (players.length === 0) return 0;

  const sum = players.reduce((acc, j) => acc + getAdjustedOverall(j), 0);
  return sum / players.length;
};

const pickWeightedPlayer = (team: Jogador[], expulsos?: Set<string>) => {
  // Filtra removendo os jogadores que já foram expulsos NESTA partida
  const aptos = team.filter(j => j && !(j.statusFisico?.lesionado || j.statusFisico?.suspenso) && (!expulsos || !expulsos.has(j.id)));
  const listaSorteio = aptos.length > 0 ? aptos : team.filter(j => j && (!expulsos || !expulsos.has(j.id)));
  if (listaSorteio.length === 0) return team[0] || null;

  const pesos = listaSorteio.map(j => {
    if (j.posicao === 'ATA') return 0.6;
    if (j.posicao === 'MEI') return 0.3;
    return 0.1;
  });

  const total = pesos.reduce((a, b) => a + b, 0);
  const rand = Math.random() * total;

  let acc = 0;
  for (let i = 0; i < listaSorteio.length; i++) {
    acc += pesos[i];
    if (rand <= acc) return listaSorteio[i];
  }

  return listaSorteio[0];
};

const randomNormal = () => {
  return (Math.random() + Math.random() + Math.random()) / 3;
};

// ========================
// MATCH ENGINE V2
// ========================

export function simularPartidaV2(
  teamA: Jogador[],
  teamB: Jogador[]
) {
  const eventos: EventoPartida[] = [];
  const pressao: { minuto: number, valor: number }[] = []; 

  // Guardas de punição interna para cartões dentro dos 90 minutos
  const amarelosNaPartida = new Set<string>();
  const expulsosNaPartida = new Set<string>();

  const defA = (calcSector(teamA, 'DEF') * 0.7) + (calcSector(teamA, 'GOL') * 0.3);
  const meiA = calcSector(teamA, 'MEI');
  const ataA = calcSector(teamA, 'ATA');
  const golA = calcSector(teamA, 'GOL');

  const defB = (calcSector(teamB, 'DEF') * 0.7) + (calcSector(teamB, 'GOL') * 0.3);
  const meiB = calcSector(teamB, 'MEI');
  const ataB = calcSector(teamB, 'ATA');
  const golB = calcSector(teamB, 'GOL');

  let golsA = 0;
  let golsB = 0;

  for (let minuto = 1; minuto <= 90; minuto += 5) {
    const desgaste = minuto / 90;

    const ataA_eff = ataA * (1 - desgaste * 0.2);
    const ataB_eff = ataB * (1 - desgaste * 0.2);

    const meiA_eff = meiA * (1 - desgaste * 0.15);
    const meiB_eff = meiB * (1 - desgaste * 0.15);

    const construcaoA = meiA_eff * 0.6 + defA * 0.4;
    const construcaoB = meiB_eff * 0.6 + defB * 0.4;

    const finalizacaoA = ataA_eff * 0.7 + meiA_eff * 0.3;
    const finalizacaoB = ataB_eff * 0.7 + meiB_eff * 0.3;

    const forceA = construcaoA + finalizacaoA;
    const forceB = construcaoB + finalizacaoB;

    const forceTotal = forceA + forceB;
    const dominanciaA = forceTotal > 0 ? forceA / forceTotal : 0.5;

    let valorPressao = Math.round((dominanciaA - 0.5) * 400); 
    valorPressao = Math.max(-100, Math.min(100, valorPressao));
    pressao.push({ minuto, valor: valorPressao });

    const chanceCriacaoA = dominanciaA * 0.6;
    const chanceCriacaoB = (1 - dominanciaA) * 0.6;

    // TIME A ATACA
    if (Math.random() < chanceCriacaoA) {
      // NOVA LÓGICA DE BALANCEAMENTO: Compara Finalização vs Goleiro diretamente
      const diferencaForca = finalizacaoA - golB;
      
      // Base de 15% de chance de gol por ataque, +1% para cada ponto de vantagem. Limitado entre 2% e 40% máximo.
      let chanceGol = 0.15 + (diferencaForca * 0.01);
      chanceGol = Math.max(0.02, Math.min(0.40, chanceGol));

      // EVENTOS RAROS: Pênalti (3%) ou Gol Contra reduzido (1%) para evitar excessos
      const isPenalti = Math.random() < 0.03;
      const isGolContra = Math.random() < (0.01 * dominanciaA); 

      if (isPenalti) {
        const cobrador = pickWeightedPlayer(teamA, expulsosNaPartida);
        if (cobrador && Math.random() < 0.78) {
          golsA++;
          eventos.push({ minuto, tipo: 'GOL', time: 'CASA', texto: `PÊNALTI! ${cobrador.nome} bate no cantinho e converte!`, jogadorId: cobrador.id });
        }
      } else if (isGolContra) {
        const azarado = pickWeightedPlayer(teamB, expulsosNaPartida);
        if (azarado) {
          golsA++;
          eventos.push({ minuto, tipo: 'GOL', time: 'CASA', texto: `GOL CONTRA! Sob muita pressão, ${azarado.nome} tenta cortar e manda para a própria rede!`, jogadorId: azarado.id });
        }
      } else if (Math.random() < chanceGol) {
        const autor = pickWeightedPlayer(teamA, expulsosNaPartida);
        if (autor) {
          golsA++;
          eventos.push({ minuto, tipo: 'GOL', time: 'CASA', texto: `Gol do mandante! ${autor.nome} finaliza com precisão!`, jogadorId: autor.id });
        }
      }
    }

    // TIME B ATACA
    if (Math.random() < chanceCriacaoB) {
      const diferencaForca = finalizacaoB - golA;
      let chanceGol = 0.15 + (diferencaForca * 0.01);
      chanceGol = Math.max(0.02, Math.min(0.40, chanceGol));

      const isPenalti = Math.random() < 0.03;
      const isGolContra = Math.random() < (0.01 * (1 - dominanciaA)); 

      if (isPenalti) {
        const cobrador = pickWeightedPlayer(teamB, expulsosNaPartida);
        if (cobrador && Math.random() < 0.78) {
          golsB++;
          eventos.push({ minuto, tipo: 'GOL', time: 'FORA', texto: `PÊNALTI! ${cobrador.nome} cobra com frieza e balança a rede!`, jogadorId: cobrador.id });
        }
      } else if (isGolContra) {
        const azarado = pickWeightedPlayer(teamA, expulsosNaPartida);
        if (azarado) {
          golsB++;
          eventos.push({ minuto, tipo: 'GOL', time: 'FORA', texto: `GOL CONTRA! No sufoco, ${azarado.nome} desvia mal e marca contra o próprio patrimônio!`, jogadorId: azarado.id });
        }
      } else if (Math.random() < chanceGol) {
        const autor = pickWeightedPlayer(teamB, expulsosNaPartida);
        if (autor) {
          golsB++;
          eventos.push({ minuto, tipo: 'GOL', time: 'FORA', texto: `Gol do visitante! ${autor.nome} marca!`, jogadorId: autor.id });
        }
      }
    }

    const intensidade = Math.abs(dominanciaA - 0.5) * 2;

    // LÓGICA REFORMULADA DE CARTÕES (EXPULSÃO POR DUPLO AMARELO)
    if (Math.random() < 0.15 + intensidade * 0.1) {
      const isA = Math.random() < 0.5;
      const jogador = pickWeightedPlayer(isA ? teamA : teamB, expulsosNaPartida);
      
      if (jogador) {
        const fadiga = jogador.statusFisico?.cansaco ?? 1;
        const vulnerabilidadeCartao = (fadiga - 1) * 0.25; 
        
        if (Math.random() < vulnerabilidadeCartao) {
          if (amarelosNaPartida.has(jogador.id)) {
            // 🚨 SEGUNDO AMARELO! Transforma em expulsão na súmula na hora!
            expulsosNaPartida.add(jogador.id);
            eventos.push({
              minuto,
              tipo: 'CARTAO_VERMELHO',
              time: isA ? 'CASA' : 'FORA',
              texto: `CARTÃO VERMELHO! ${jogador.nome} comete falta tática, leva o segundo amarelo e está expulso da partida!`,
              jogadorId: jogador.id
            });
          } else {
            const isVermelhoDireto = Math.random() < 0.04; // Pequena chance de agressão / vermelho direto
            
            if (isVermelhoDireto) {
              expulsosNaPartida.add(jogador.id);
            } else {
              amarelosNaPartida.add(jogador.id);
            }

            eventos.push({
              minuto,
              tipo: isVermelhoDireto ? 'CARTAO_VERMELHO' : 'CARTAO_AMARELO',
              time: isA ? 'CASA' : 'FORA',
              texto: isVermelhoDireto 
                ? `VERMELHO DIRETO! FALTA VIOLENTA de ${jogador.nome}, que vai direto para o chuveiro!` 
                : `Cartão amarelo para ${jogador.nome} por parar o contra-ataque com falta.`,
              jogadorId: jogador.id
            });
          }
        }
      }
    }

    // Lesões
    if (Math.random() < desgaste * 0.15) {
      const isA = Math.random() < 0.5;
      const jogador = pickWeightedPlayer(isA ? teamA : teamB, expulsosNaPartida);
      if (jogador) {
        const fadiga = jogador.statusFisico?.cansaco ?? 1;
        const riscoLesao = (fadiga - 1) * 0.20;
        
        if (Math.random() < riscoLesao) {
          eventos.push({
            minuto,
            tipo: 'LESAO',
            time: isA ? 'CASA' : 'FORA',
            texto: `DM EM ALERTA! Puxada muscular de ${jogador.nome}, que desaba no gramado sentindo muitas dores!`,
            jogadorId: jogador.id
          });
        }
      }
    }
  }

  eventos.sort((a, b) => a.minuto - b.minuto);
  return { golsCasa: golsA, golsFora: golsB, relatorio: eventos, pressao };
}
