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

  const ignorarDesfalques = elenco.length <= 11;

  const aptos = [...elenco]
    .filter(j => ignorarDesfalques || (!j.statusFisico?.lesionado && !j.statusFisico?.suspenso))
    .sort((a, b) => b.overall - a.overall);

  const pegarMelhor = (pos: string) => {
    const idx = aptos.findIndex(j => j.posicao.toUpperCase().includes(pos) || (pos === 'GOL' && j.posicao.toUpperCase() === 'GL'));
    return idx !== -1 ? aptos.splice(idx, 1)[0] : (aptos.shift() || null);
  };

  time[10] = pegarMelhor('GOL');
  for (let i = 6; i <= 9; i++) time[i] = pegarMelhor('DEF');
  for (let i = 3; i <= 5; i++) time[i] = pegarMelhor('MEI');
  for (let i = 0; i <= 2; i++) time[i] = pegarMelhor('ATA');
  
  return time;
};

// ========================
// 2. GERADORES DE NARRATIVA
// ========================
// -> NOVO PARÂMETRO ADICIONADO: isGolDeHonra
const getTextoGol = (nome: string, forcaRelativa: number, semGoleiro: boolean, isGolDeHonra: boolean) => {
  if (semGoleiro) return `GOL BIZARRO! Com a meta adversária vazia pela ausência de um goleiro, ${nome} chuta do meio-campo e marca!`;
  
  // Se a flag de gol de honra for verdadeira, exibe a mensagem específica
  if (isGolDeHonra) return `GOL DE HONRA! No finalzinho do jogo, ${nome} desconta e diminui o vexame para a sua equipe!`;
  
  if (forcaRelativa > 1.5) return `MASSACRE! A defesa não consegue respirar e ${nome} guarda mais um com tranquilidade!`;
  if (forcaRelativa < 0.7) return `ZEBRA! Contra todas as estatísticas, ${nome} acha um espaço heroico no contra-ataque e marca!`;
  
  const padroes = [
    `GOLAÇO! ${nome} acerta um belo chute de fora da área e balança as redes!`,
    `GOL! ${nome} sobe mais alto após o cruzamento e cabeceia firme pro fundo do gol!`,
    `É CAIXA! O goleiro dá rebote e ${nome} confere na pequena área!`,
    `GOL! Jogada coletiva envolvente e ${nome} apenas empurra pro fundo das redes!`,
    `INACREDITÁVEL! Um chute improvável de ${nome} cala a torcida adversária e morre no fundo do gol!`,
    `GOL! ${nome} ganha na velocidade da defesa e bate cruzado!`
  ];
  return padroes[Math.floor(Math.random() * padroes.length)];
};

const getTextoCartaoAmarelo = (nome: string) => `Cartão amarelo para ${nome} por matar um contra-ataque promissor.`;
const getTextoCartaoVermelho = (nome: string, segundoAmarelo: boolean) => 
  segundoAmarelo ? `RUA! ${nome} comete falta imprudente, leva o segundo amarelo e é expulso!` : `VERMELHO DIRETO! Entrada criminosa de ${nome}! O juiz manda direto pro chuveiro!`;
const getTextoLesao = (nome: string) => {
  const padroes = [
    `DM EM ALERTA! Puxada muscular de ${nome}, que desaba sentindo muitas dores!`,
    `PREOCUPAÇÃO! ${nome} torce o joelho sozinho no gramado e vai precisar sair.`,
    `FORA DE COMBATE! ${nome} cai no chão pedindo substituição após uma arrancada intensa.`
  ];
  return padroes[Math.floor(Math.random() * padroes.length)];
};

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
  const realUpper = real.toUpperCase();
  const isGoleiro = realUpper.includes('GOL') || realUpper === 'GL';

  if (isGoleiro && escalada === 'GOL') return 1.0;
  if (realUpper === escalada) return 1.0;
  if (isGoleiro || escalada === 'GOL') return 0.10; 
  
  const pesos: Record<string, number> = { 'DEF': 1, 'MEI': 2, 'ATA': 3 };
  const pesoReal = pesos[realUpper] || 2;
  const pesoEscalada = pesos[escalada] || 2;
  
  const distancia = Math.abs(pesoReal - pesoEscalada);
  return distancia === 1 ? 0.85 : 0.60;
};

const calcularForcaEquipe = (team: (Jogador | null)[], expulsos: Set<string>, isUser: boolean, rodada: number) => {
  let forca = 0;
  let temGoleiro = false;

  team.slice(0, 11).forEach((j, i) => {
    if (j && !expulsos.has(j.id)) {
      const isApto = !isUser || (!j.statusFisico?.lesionado && !j.statusFisico?.suspenso);
      
      if (isApto) {
        const p = calcularFatorP(j.posicao, getPosicaoEscalada(i));
        const cansaco = Math.max(1, Math.min(5, j.statusFisico?.cansaco ?? 1));
        
        forca += j.overall * p * (1 - ((cansaco - 1) * 0.07));
        
        const posUpper = j.posicao.toUpperCase();
        if (posUpper.includes('GOL') || posUpper === 'GL') temGoleiro = true;
      }
    }
  });

  if (!isUser) forca *= Math.max(0.5, 1 - (rodada * 0.005));
  return { forca: Math.max(1, forca), temGoleiro };
};

const sortearJogador = (team: (Jogador | null)[], expulsos: Set<string>, acao: 'ATAQUE' | 'DEFESA') => {
  const aptos = team.slice(0, 11).filter((j): j is Jogador => j !== null && !expulsos.has(j.id));
  if (!aptos.length) return null;

  const pesos = aptos.map((j): number => {
    const posUpper = j.posicao.toUpperCase();
    const isGoleiro = posUpper.includes('GOL') || posUpper === 'GL';
    const isAtacante = posUpper === 'ATA';
    const isDefesa = posUpper === 'DEF';
    const isMeio = posUpper === 'MEI';
    
    // REGRA DE OURO: Goleiro NUNCA participa do sorteio para fazer gol.
    if (acao === 'ATAQUE') {
      if (isGoleiro) return 0; 
      return isAtacante ? 5 : isMeio ? 3 : 1;
    }
    
    // Na Defesa (Faltas/Lesões), o Goleiro tem peso 1 (pode se machucar ou fazer falta)
    return isDefesa ? 4 : isMeio ? 3 : 1;
  });

  const totalPesos = pesos.reduce((a, b) => a + b, 0);
  if (totalPesos === 0) return null; // Trava de segurança

  let rand = Math.random() * totalPesos;
  return aptos.find((_, i) => (rand -= pesos[i]) <= 0) || aptos[0];
};

// ========================
// 4. O SIMULADOR DE RODADA
// ========================
export function simularPartidaV2(teamA: (Jogador | null)[], teamB: (Jogador | null)[], config: SimConfig = { isUserA: true, isUserB: true, rodada: 1 }) {
  const eventos: EventoPartida[] = [];
  const pressao: { minuto: number, valor: number }[] = []; 
  
  const amarelos = new Set<string>();
  const expulsos = new Set<string>();

  let golsA = 0; let golsB = 0;
  
  const statsA = calcularForcaEquipe(teamA, expulsos, config.isUserA, config.rodada);
  const statsB = calcularForcaEquipe(teamB, expulsos, config.isUserB, config.rodada);

  const isPvP = config.isUserA && config.isUserB;
  const forcaA = statsA.forca * (isPvP ? 1.0 : (0.85 + Math.random() * 0.30));
  const forcaB = statsB.forca * (isPvP ? 1.0 : (0.85 + Math.random() * 0.30));
  
  const probABase = forcaA / (forcaA + forcaB);

  const CHANCE_GOL = (!statsA.temGoleiro || !statsB.temGoleiro) ? 0.15 : 0.055; 
  const CHANCE_ACIDENTE = 0.035; 

  for (let minuto = 2; minuto <= 90; minuto += 2) {
    const dado = Math.random();

    // VARIÁVEIS DINÂMICAS PARA ESTE LANCE ESPECÍFICO
    let probAtaqueAtual = probABase;
    let buscandoGolDeHonraA = false;
    let buscandoGolDeHonraB = false;

    // A MÁGICA DO GOL DE HONRA: Acontece no terço final do jogo (após 70 min)
    if (minuto >= 70) {
      const diferenca = golsA - golsB;
      if (diferenca >= 3 && golsB === 0) {
        // Time A está goleando e o B está zerado. Time A tira o pé, Time B se desespera.
        probAtaqueAtual -= 0.20; // Transfere 20% da chance de ataque para o Time B
        buscandoGolDeHonraB = true;
      } else if (diferenca <= -3 && golsA === 0) {
        // Time B está goleando e o A está zerado.
        probAtaqueAtual += 0.20; // Transfere 20% da chance de ataque para o Time A
        buscandoGolDeHonraA = true;
      }
    }
    
    // Trava de segurança para a probabilidade não ficar fora de controle (entre 10% e 90%)
    probAtaqueAtual = Math.max(0.10, Math.min(0.90, probAtaqueAtual));

    // -- PRESSÃO DA PARTIDA --
    if (minuto % 5 === 0 || minuto % 5 === 1) { 
      const basePressao = (probAtaqueAtual - 0.5) * 120; // Baseado na prob atual (inclui o desespero)
      const variancia = (Math.random() - 0.5) * 80; 
      let valor = basePressao + variancia;
      
      if (golsA > golsB) valor += 15;
      if (golsB > golsA) valor -= 15;

      pressao.push({ minuto, valor: Math.max(-100, Math.min(100, Math.round(valor))) });
    }

    // 1. TENTATIVA DE GOL
    if (dado < CHANCE_GOL) {
      const isAtaqueA = Math.random() < probAtaqueAtual; 
      
      const golsFeitos = isAtaqueA ? golsA : golsB;
      const isTentativaGolDeHonra = isAtaqueA ? buscandoGolDeHonraA : buscandoGolDeHonraB;
      
      // O Soft-Cap reduz a chance do chute entrar se o time já goleou (>= 3 gols).
      // Porém, se for uma tentativa de gol de honra (o time tem 0 gols), ignoramos o Soft-Cap!
      const chanceChuteEntrar = isTentativaGolDeHonra ? 1.0 : (golsFeitos >= 3 ? 0.4 : 1.0);

      if (Math.random() < chanceChuteEntrar) { 
        
        const autor = sortearJogador(isAtaqueA ? teamA : teamB, expulsos, 'ATAQUE');
        if (autor) {
          if (isAtaqueA) golsA++; else golsB++;
          const forcaRelativa = isAtaqueA ? (forcaA / forcaB) : (forcaB / forcaA);
          
          eventos.push({
            minuto, tipo: 'GOL', time: isAtaqueA ? 'CASA' : 'FORA', jogadorId: autor.id,
            // Passamos a flag `isTentativaGolDeHonra` para a função de texto gerar a narração correta!
            texto: getTextoGol(autor.nome, forcaRelativa, isAtaqueA ? !statsB.temGoleiro : !statsA.temGoleiro, isTentativaGolDeHonra)
          });
          
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

  return { golsCasa: golsA, golsFora: golsB, relatorio: eventos, pressao };
}
