import { type Jogador } from '../types';

export type EventoPartida = {
  minuto: number;
  tipo: 'GOL' | 'CARTAO_AMARELO' | 'CARTAO_VERMELHO' | 'LESAO';
  time: 'CASA' | 'FORA';
  texto: string;
  jogadorId?: string;
};

interface SimConfig {
  isUserA: boolean;
  isUserB: boolean;
  rodada: number;
}

// ========================
// 1. INTELIGÊNCIA TÁTICA DOS BOTS
// ========================
export const escalarBot = (elenco: Jogador[]): (Jogador | null)[] => {
  const time = new Array(11).fill(null);
  if (!elenco || elenco.length === 0) return time;

  // Filtra apenas jogadores aptos e ordena do melhor para o pior
  const aptos = [...elenco]
    .filter(j => !j.statusFisico?.lesionado && !j.statusFisico?.suspenso)
    .sort((a, b) => b.overall - a.overall);

  const pegarMelhor = (pos: string) => {
    const idx = aptos.findIndex(j => j.posicao === pos);
    return idx !== -1 ? aptos.splice(idx, 1)[0] : (aptos.shift() || null);
  };

  // Preenche nas posições padrão: 1 GOL, 4 DEF, 3 MEI, 3 ATA
  time[10] = pegarMelhor('GOL');
  for (let i = 6; i <= 9; i++) time[i] = pegarMelhor('DEF');
  for (let i = 3; i <= 5; i++) time[i] = pegarMelhor('MEI');
  for (let i = 0; i <= 2; i++) time[i] = pegarMelhor('ATA');
  
  return time;
};

// ========================
// 2. GERADORES DE NARRATIVA
// ========================
const getTextoGol = (nome: string, forcaRelativa: number, semGoleiro: boolean) => {
  if (semGoleiro) return `GOL BIZARRO! Com a meta adversária vazia pela ausência de um goleiro de ofício, ${nome} chuta do meio-campo e marca!`;
  if (forcaRelativa > 1.5) return `MASSACRE! A defesa não consegue respirar e ${nome} guarda mais um com tranquilidade!`;
  if (forcaRelativa < 0.7) return `ZEBRA! Contra todas as estatísticas, ${nome} acha um espaço heróico no contra-ataque e marca!`;
  
  const padroes = [
    `GOLAÇO! ${nome} acerta um belo remate de fora da área e balança as redes!`,
    `GOL! ${nome} sobe mais alto após o cruzamento e cabeceia firme pro fundo da baliza!`,
    `É CAIXA! O guarda-redes dá ressalto e ${nome} confere na pequena área!`,
    `GOL! Jogada coletiva envolvente e ${nome} apenas empurra pro fundo do barbante!`
  ];
  return padroes[Math.floor(Math.random() * padroes.length)];
};

const getTextoCartaoAmarelo = (nome: string) => `Cartão amarelo para ${nome} por matar um contra-ataque promissor.`;
const getTextoCartaoVermelho = (nome: string, segundoAmarelo: boolean) => 
  segundoAmarelo ? `RUA! ${nome} comete falta imprudente, leva o segundo amarelo e é expulso!` : `VERMELHO DIRETO! Entrada criminosa de ${nome}!`;
const getTextoLesao = (nome: string) => `PREOCUPAÇÃO! ${nome} desaba sentindo dores musculares e vai precisar sair.`;

// ========================
// 3. MOTOR MATEMÁTICO: POSIÇÃO E FORÇA
// ========================
const getPosicaoEscalada = (index: number): string => {
  if (index === 10) return 'GOL';
  if (index >= 6) return 'DEF';
  if (index >= 3) return 'MEI';
  return 'ATA';
};

const calcularFatorP = (real: string, escalada: string) => {
  if (real === escalada) return 1.0;
  if (real === 'GOL' || escalada === 'GOL') return 0.10; // Improvisar no ou de goleiro = punição máxima
  
  // Calcula penalidade por distância entre setores usando índices
  const pesos: Record<string, number> = { 'DEF': 1, 'MEI': 2, 'ATA': 3 };
  const distancia = Math.abs(pesos[real] - pesos[escalada]);
  return distancia === 1 ? 0.85 : 0.60;
};

const calcularForcaEquipe = (team: (Jogador | null)[], expulsos: Set<string>, isUser: boolean, rodada: number) => {
  let forca = 0;
  let temGoleiro = false;

  team.slice(0, 11).forEach((j, i) => {
    if (j && !expulsos.has(j.id) && !j.statusFisico?.lesionado && !j.statusFisico?.suspenso) {
      const p = calcularFatorP(j.posicao, getPosicaoEscalada(i));
      const cansaco = Math.max(1, Math.min(5, j.statusFisico?.cansaco ?? 1));
      
      forca += j.overall * p * (1 - ((cansaco - 1) * 0.07));
      if (getPosicaoEscalada(i) === 'GOL' && j.posicao === 'GOL') temGoleiro = true;
    }
  });

  // PvE: Bot perde 0.5% de força acumulativa por rodada
  if (!isUser) forca *= Math.max(0.5, 1 - (rodada * 0.005));
  return { forca: Math.max(1, forca), temGoleiro };
};

// Sorteia um jogador com pesos, separando defensores (faltas) de atacantes (gols)
const sortearJogador = (team: (Jogador | null)[], expulsos: Set<string>, acao: 'ATAQUE' | 'DEFESA') => {
  const aptos = team.slice(0, 11).filter((j): j is Jogador => j !== null && !expulsos.has(j.id));
  if (!aptos.length) return null;

  const pesos = aptos.map(j => {
    if (acao === 'ATAQUE') return j.posicao === 'ATA' ? 5 : j.posicao === 'MEI' ? 3 : 1;
    return j.posicao === 'DEF' ? 4 : j.posicao === 'MEI' ? 3 : 1;
  });

  let rand = Math.random() * pesos.reduce((a, b) => a + b, 0);
  return aptos.find((_, i) => (rand -= pesos[i]) <= 0) || aptos[0];
};

// ========================
// 4. O SIMULADOR DE RODADA
// ========================
export function simularPartidaV2(teamA: (Jogador | null)[], teamB: (Jogador | null)[], config: SimConfig = { isUserA: true, isUserB: true, rodada: 1 }) {
  const eventos: EventoPartida[] = [];
  
  // Voltamos a colocar a propriedade pressao que o UI precisa!
  const pressao: { minuto: number, valor: number }[] = []; 
  
  const amarelos = new Set<string>();
  const expulsos = new Set<string>();

  let golsA = 0; let golsB = 0;
  
  const statsA = calcularForcaEquipe(teamA, expulsos, config.isUserA, config.rodada);
  const statsB = calcularForcaEquipe(teamB, expulsos, config.isUserB, config.rodada);

  const isPvP = config.isUserA && config.isUserB;
  const forcaA = statsA.forca * (isPvP ? 1.0 : (0.85 + Math.random() * 0.30));
  const forcaB = statsB.forca * (isPvP ? 1.0 : (0.85 + Math.random() * 0.30));
  
  const probA = forcaA / (forcaA + forcaB);

  const CHANCE_GOL = (!statsA.temGoleiro || !statsB.temGoleiro) ? 0.15 : 0.055; 
  const CHANCE_ACIDENTE = 0.035; 

  for (let minuto = 2; minuto <= 90; minuto += 2) {
    const dado = Math.random();

    // -- INÍCIO CÁLCULO DE PRESSÃO DA PARTIDA --
    // Aciona nos minutos 6, 10, 16, 20... gerando exatamente 18 pontos de dados para a UI
    if (minuto % 5 === 0 || minuto % 5 === 1) { 
      const basePressao = (probA - 0.5) * 120; // O time melhor costuma empurrar mais o adversário
      const variancia = (Math.random() - 0.5) * 80; // Aleatoriedade do "Momentum" do futebol
      let valor = basePressao + variancia;
      
      // Intensifica o domínio se uma das equipas estiver a golear
      if (golsA > golsB) valor += 15;
      if (golsB > golsA) valor -= 15;

      // Limita o valor entre -100 e 100 para o gráfico não quebrar
      pressao.push({ minuto, valor: Math.max(-100, Math.min(100, Math.round(valor))) });
    }
    // -- FIM CÁLCULO DE PRESSÃO --

    // 1. TENTATIVA DE GOL
    if (dado < CHANCE_GOL) {
      const isAtaqueA = Math.random() < probA; 
      
      const golsFeitos = isAtaqueA ? golsA : golsB;
      if (Math.random() < (golsFeitos >= 3 ? 0.4 : 1.0)) { 
        
        const autor = sortearJogador(isAtaqueA ? teamA : teamB, expulsos, 'ATAQUE');
        if (autor) {
          if (isAtaqueA) golsA++; else golsB++;
          const forcaRelativa = isAtaqueA ? (forcaA / forcaB) : (forcaB / forcaA);
          
          eventos.push({
            minuto, tipo: 'GOL', time: isAtaqueA ? 'CASA' : 'FORA', jogadorId: autor.id,
            texto: getTextoGol(autor.nome, forcaRelativa, isAtaqueA ? !statsB.temGoleiro : !statsA.temGoleiro)
          });
          
          // Se saiu golo, o pico de pressão desse instante vai ao máximo (100 ou -100)
          if (pressao.length > 0) {
            pressao[pressao.length - 1].valor = isAtaqueA ? 100 : -100;
          }
        }
      }
    } 
    // 2. TENTATIVA DE CARTÃO OU LESÃO
    else if (dado >= CHANCE_GOL && dado < CHANCE_GOL + CHANCE_ACIDENTE) {
      const isCasa = Math.random() < 0.5;
      const vitima = sortearJogador(isCasa ? teamA : teamB, expulsos, 'DEFESA');
      
      if (vitima) {
        const cansaco = Math.max(1, Math.min(5, vitima.statusFisico?.cansaco ?? 1));
        
        if (Math.random() < (cansaco - 1) * 0.15) {
          vitima.statusFisico = { cansaco, suspenso: false, lesionado: true };
          eventos.push({ minuto, tipo: 'LESAO', time: isCasa ? 'CASA' : 'FORA', jogadorId: vitima.id, texto: getTextoLesao(vitima.nome) });
        } else {
          if (amarelos.has(vitima.id)) {
            expulsos.add(vitima.id);
            eventos.push({ minuto, tipo: 'CARTAO_VERMELHO', time: isCasa ? 'CASA' : 'FORA', jogadorId: vitima.id, texto: getTextoCartaoVermelho(vitima.nome, true) });
          } else if (Math.random() < 0.10) { 
            expulsos.add(vitima.id);
            eventos.push({ minuto, tipo: 'CARTAO_VERMELHO', time: isCasa ? 'CASA' : 'FORA', jogadorId: vitima.id, texto: getTextoCartaoVermelho(vitima.nome, false) });
          } else {
            amarelos.add(vitima.id);
            eventos.push({ minuto, tipo: 'CARTAO_AMARELO', time: isCasa ? 'CASA' : 'FORA', jogadorId: vitima.id, texto: getTextoCartaoAmarelo(vitima.nome) });
          }
        }
      }
    }
  }

  // Devolvemos o objeto incluindo a propriedade `pressao` corrigindo assim o erro do TypeScript
  return { golsCasa: golsA, golsFora: golsB, relatorio: eventos, pressao };
}
