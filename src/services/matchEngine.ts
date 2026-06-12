import type { Jogador } from "../types";

export const simularPartida = (titularesTimeA: Jogador[], titularesTimeB: Jogador[]) => {
  const mediaA = titularesTimeA.reduce((acc, j) => acc + j.overall, 0) / 11;
  const mediaB = titularesTimeB.reduce((acc, j) => acc + j.overall, 0) / 11;
  
  // Fator Sorte: Um número entre -10 e +10 que altera a performance
  const sorteA = (Math.random() * 20) - 10;
  const sorteB = (Math.random() * 20) - 10;
  
  const scoreA = mediaA + sorteA;
  const scoreB = mediaB + sorteB;
  
  // Cálculo de Gols: Baseado na diferença de força + aleatoriedade
  const golsA = Math.max(0, Math.floor((scoreA - mediaB) / 8) + Math.floor(Math.random() * 3));
  const golsB = Math.max(0, Math.floor((scoreB - mediaA) / 8) + Math.floor(Math.random() * 3));
  
  return { golsA, golsB };
};
