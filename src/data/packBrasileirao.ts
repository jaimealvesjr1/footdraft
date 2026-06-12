// src/data/packBrasileirao.ts

import type { Jogador } from "../types";

// Função ajudante para criar jogadores rapidamente com o status zerado
const criarJogador = (
  id: string, 
  nome: string, 
  posicao: "GOL" | "DEF" | "MEI" | "ATA", 
  overall: number, 
  clubeHistorico: string
): Jogador => ({
  id,
  nome,
  posicao,
  overall,
  clubeHistorico,
  statusFisico: { cansaco: 0, lesionado: false, suspenso: false },
  temporadasNoClube: 0
});

// O nosso Pack de MVP: Brasileirão (2000 - 2020)
// Nota: O overall está aqui, mas o ecrã de Draft vai ignorá-lo visualmente.
export const packBrasileirao: Jogador[] = [
    // ===== GOLEIROS =====
    criarJogador("g100", "Rogério Ceni", "GOL", 90, "São Paulo 2007"),
    criarJogador("g101", "Rogério Ceni", "GOL", 87, "São Paulo 2003"),
    criarJogador("g102", "Marcos", "GOL", 88, "Palmeiras 1999"),
    criarJogador("g103", "Dida", "GOL", 89, "Corinthians 1999"),
    criarJogador("g104", "Victor", "GOL", 87, "Atlético-MG 2013"),
    criarJogador("g105", "Fábio", "GOL", 86, "Cruzeiro 2014"),
    criarJogador("g106", "Cássio", "GOL", 86, "Corinthians 2012"),
    criarJogador("g107", "Weverton", "GOL", 85, "Palmeiras 2020"),
    criarJogador("g108", "Diego Alves", "GOL", 85, "Flamengo 2019"),
    criarJogador("g109", "Jefferson", "GOL", 86, "Botafogo 2013"),

    // ===== DEFENSORES =====
    criarJogador("d100", "Thiago Silva", "DEF", 91, "Fluminense 2008"),
    criarJogador("d101", "Thiago Silva", "DEF", 88, "Fluminense 2007"),
    criarJogador("d102", "Miranda", "DEF", 88, "São Paulo 2007"),
    criarJogador("d103", "Lugano", "DEF", 87, "São Paulo 2005"),
    criarJogador("d104", "Réver", "DEF", 86, "Atlético-MG 2013"),
    criarJogador("d105", "Geromel", "DEF", 86, "Grêmio 2017"),
    criarJogador("d106", "Juan", "DEF", 86, "Flamengo 2009"),
    criarJogador("d107", "Dedé", "DEF", 85, "Vasco 2011"),
    criarJogador("d108", "Filipe Luís", "DEF", 87, "Flamengo 2019"),
    criarJogador("d109", "Danilo", "DEF", 85, "Santos 2011"),
    criarJogador("d110", "Cafu", "DEF", 89, "São Paulo 2000"),
    criarJogador("d111", "Roberto Carlos", "DEF", 90, "Corinthians 2010"),
    criarJogador("d112", "Júnior", "DEF", 87, "Flamengo 2009"),
    criarJogador("d113", "Arana", "DEF", 85, "Atlético-MG 2021"),
    criarJogador("d114", "Fagner", "DEF", 83, "Corinthians 2017"),

    // ===== MEIAS =====
    criarJogador("m100", "Ronaldinho", "MEI", 94, "Atlético-MG 2013"),
    criarJogador("m101", "Ronaldinho", "MEI", 91, "Flamengo 2011"),
    criarJogador("m102", "Alex", "MEI", 92, "Cruzeiro 2003"),
    criarJogador("m103", "Alex", "MEI", 89, "Palmeiras 1999"),
    criarJogador("m104", "Kaká", "MEI", 93, "São Paulo 2002"),
    criarJogador("m105", "Kaká", "MEI", 88, "São Paulo 2001"),
    criarJogador("m106", "Zé Roberto", "MEI", 88, "Palmeiras 2015"),
    criarJogador("m107", "D'Alessandro", "MEI", 88, "Internacional 2010"),
    criarJogador("m108", "Hernanes", "MEI", 89, "São Paulo 2008"),
    criarJogador("m109", "Ganso", "MEI", 87, "Santos 2010"),
    criarJogador("m110", "Everton Ribeiro", "MEI", 86, "Cruzeiro 2014"),
    criarJogador("m111", "Arrascaeta", "MEI", 88, "Flamengo 2019"),
    criarJogador("m112", "Rincón", "MEI", 86, "Corinthians 2000"),
    criarJogador("m113", "Danilo", "MEI", 85, "Palmeiras 2020"),
    criarJogador("m114", "Elano", "MEI", 86, "Santos 2011"),

    // ===== ATACANTES =====
    criarJogador("a100", "Neymar", "ATA", 93, "Santos 2011"),
    criarJogador("a101", "Neymar", "ATA", 89, "Santos 2010"),
    criarJogador("a102", "Romário", "ATA", 91, "Vasco 2000"),
    criarJogador("a103", "Adriano", "ATA", 90, "Flamengo 2009"),
    criarJogador("a104", "Luis Fabiano", "ATA", 88, "São Paulo 2003"),
    criarJogador("a105", "Fred", "ATA", 86, "Fluminense 2012"),
    criarJogador("a106", "Gabigol", "ATA", 87, "Flamengo 2019"),
    criarJogador("a107", "Hulk", "ATA", 91, "Atlético-MG 2021"),
    criarJogador("a108", "Tardelli", "ATA", 88, "Atlético-MG 2013"),
    criarJogador("a109", "Guerrero", "ATA", 87, "Corinthians 2012"),
    criarJogador("a110", "Dagoberto", "ATA", 85, "São Paulo 2007"),
    criarJogador("a111", "Ricardo Oliveira", "ATA", 87, "Santos 2015"),
    criarJogador("a112", "Diego Souza", "ATA", 86, "Sport 2016"),
    criarJogador("a113", "Gabriel Jesus", "ATA", 89, "Palmeiras 2016"),
    criarJogador("a114", "Washington", "ATA", 86, "Fluminense 2008"),
];
