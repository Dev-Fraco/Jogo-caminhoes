/**
 * Clubes por divisão (temporada 2026), para a Etapa 3 do Novo Jogo (Escolha do Clube).
 * A chave é o divisionId de data/world.ts (único no mundo todo).
 *
 * Cada clube traz as cores (primaryColor/secondaryColor, usadas no escudo reserva) e um elenco jogável.
 * Os elencos são gerados de forma determinística: nomes fictícios, posições, idades e overall coerentes com a
 * reputação do clube e com o nível da divisão. Estádios, cidades, cores e orçamentos são aproximados (protótipo).
 */
import { generateSquad } from '../engine/squad';
import type { Player } from '../engine/types';
import { AR_NACIONAL, AR_PRIMERA, EN_CHAMPIONSHIP, EN_LEAGUE_ONE, EN_PREMIER, ES_LALIGA, ES_SEGUNDA, IT_SERIE_A, IT_SERIE_B } from './clubs_world';
import { DE_BUNDESLIGA, DE_BUNDESLIGA_2, FR_LIGUE_1, FR_LIGUE_2, PT_PRIMEIRA, PT_SEGUNDA } from './clubs_europe2';
import { buildEstadualClubs } from './br_estadual_core';
import { SERIE_D_EXTRA } from './br_serie_d';
import { BO_PRIMERA, CL_PRIMERA, CO_PRIMERA, EC_PRIMERA, PE_PRIMERA, PY_PRIMERA, UY_PRIMERA, VE_PRIMERA } from './clubs_sulamerica';

/** O que a diretoria espera da temporada. */
export type BoardExpectation = 'title' | 'top4' | 'mid' | 'survive';

export interface ClubData {
  id: string;
  name: string;
  shortName: string;
  /** Caminho do escudo. Os arquivos ainda não existem: a interface usa o escudo reserva (sigla + cores). */
  badge: string;
  /** Cores principais do time (hex). */
  primaryColor: string;
  secondaryColor: string;
  stadium: string;
  city: string;
  /** Orçamento em reais (R$). */
  budget: number;
  boardExpectation: BoardExpectation;
  /** 1 (pequeno) a 5 (gigante). */
  reputation: 1 | 2 | 3 | 4 | 5;
  /** Estado do clube (clubes que só jogam estadual e clubes criados pelo jogador). */
  uf?: string;
  /** Clube criado pelo jogador. */
  custom?: boolean;
  /** Plantel: 24 jogadores (3 goleiros, 8 defensores, 8 meias, 5 atacantes). `strength` é o overall (1–100). */
  squad: Player[];
}

type Rep = ClubData['reputation'];
const MI = 1_000_000;

/** Linha da tabela de dados: id, nome, sigla, cor 1, cor 2, estádio, cidade, orçamento (R$ mi), meta, reputação. */
type Row = [string, string, string, string, string, string, string, number, BoardExpectation, Rep];

/** Força-base do elenco por reputação; cada divisão abaixo da Série A desconta um pouco. */
const BASE_STRENGTH: Record<Rep, number> = { 5: 82, 4: 75, 3: 69, 2: 64, 1: 59 };
const SQUAD_SEED = 2026;

function build(rows: Row[], tierOffset: number): ClubData[] {
  return rows.map(([id, name, shortName, primaryColor, secondaryColor, stadium, city, budgetMi, boardExpectation, reputation]) => ({
    id, name, shortName, badge: `assets/badges/${id}.png`, primaryColor, secondaryColor, stadium, city,
    budget: Math.round(budgetMi * MI), boardExpectation, reputation,
    squad: generateSquad({ id, name, short: shortName, color: primaryColor, strength: BASE_STRENGTH[reputation] + tierOffset }, SQUAD_SEED),
  }));
}

/* eslint-disable prettier/prettier */
const SERIE_A: Row[] = [
  ['flamengo', 'Sporting Navegantes', 'SNA', '#C52613', '#111111', 'Estádio Municipal do Futuro', 'Rio de Janeiro', 150, 'title', 5],
  ['palmeiras', 'Atlético Santa Aurora', 'AAU', '#006437', '#FFFFFF', 'Parque do Trabalhador', 'São Paulo', 140, 'title', 5],
  ['cruzeiro', 'Esporte Urutu', 'EUR', '#0033A0', '#FFFFFF', 'Estádio Cometa', 'Belo Horizonte', 85, 'top4', 4],
  ['mirassol', 'Gaúchos do Sul Futebol Clube', 'GAU', '#F2C200', '#00873E', 'Arena do Sol', 'Mirassol', 30, 'mid', 2],
  ['fluminense', 'Sport Cristal Azul', 'SAZ', '#8B1E3F', '#00843D', 'Arena das Américas', 'Rio de Janeiro', 70, 'mid', 4],
  ['bahia', 'Sport Ouro Negro', 'SON', '#005BAA', '#D2232A', 'Estádio do Povo', 'Salvador', 70, 'mid', 3],
  ['botafogo', 'Racing Mineradores', 'RAC', '#000000', '#FFFFFF', 'Parque Aurora', 'Rio de Janeiro', 90, 'top4', 4],
  ['sao-paulo', 'Savana Clube', 'SVA', '#E30613', '#FFFFFF', 'Complexo da Esperança', 'São Paulo', 95, 'top4', 4],
  ['bragantino', 'Popular Sabiá', 'PSA', '#D2232A', '#FFFFFF', 'Estádio Municipal Planalto', 'Bragança Paulista', 50, 'mid', 3],
  ['corinthians', 'União Juazeiro Novo', 'UJN', '#000000', '#FFFFFF', 'Parque Mirante', 'São Paulo', 100, 'top4', 4],
  ['gremio', 'Olímpico Araguaia', 'OAR', '#0D80BF', '#111111', 'Estádio Municipal da Serra', 'Porto Alegre', 70, 'top4', 4],
  ['vasco', 'Operário Colibri Azul', 'OCA', '#000000', '#FFFFFF', 'Complexo das Américas', 'Rio de Janeiro', 65, 'mid', 4],
  ['atletico-mg', 'Popular Cangaceiros', 'PCA', '#000000', '#FFFFFF', 'Complexo do Centenário', 'Belo Horizonte', 85, 'top4', 4],
  ['santos', 'Serranos Clube', 'SRR', '#FFFFFF', '#111111', 'Estádio Municipal da Serra', 'Santos', 60, 'mid', 4],
  ['athletico-pr', 'Operário Gavião-Real', 'OGR', '#C8102E', '#111111', 'Estádio do Trabalhador', 'Curitiba', 60, 'mid', 3],
  ['coritiba', 'Buriti FC', 'BUR', '#00553A', '#FFFFFF', 'Estádio Atlântico', 'Curitiba', 32, 'survive', 3],
  ['internacional', 'Vale Verde Futebol Clube', 'VVF', '#E30613', '#FFFFFF', 'Estádio Municipal da Esperança', 'Porto Alegre', 75, 'top4', 4],
  ['chapecoense', 'Arara Azul EC', 'AAE', '#00873E', '#FFFFFF', 'Parque da Juventude', 'Chapecó', 25, 'survive', 2],
  ['vitoria', 'Nacional Pitanga', 'NIO', '#D50000', '#111111', 'Estádio Municipal da Juventude', 'Salvador', 35, 'survive', 2],
  ['remo', 'Operário Urutu', 'OUR', '#0A2A66', '#FFFFFF', 'Complexo Panorama', 'Belém', 24, 'survive', 2],
];

const SERIE_B: Row[] = [
  ['america-mg', 'Ipê Amarelo SC', 'IAS', '#1B7F3B', '#FFFFFF', 'Parque Mirante', 'Belo Horizonte', 28, 'title', 3],
  ['athletic', 'Vanguarda Rio Claro Novo', 'VRC', '#111111', '#FFFFFF', 'Arena Mirante', 'São João del-Rei', 8, 'survive', 1],
  ['atletico-go', 'Sporting Ilhéus do Norte', 'SID', '#C8102E', '#111111', 'Arena das Américas', 'Goiânia', 20, 'top4', 2],
  ['avai', 'Independente Tempestade', 'ITE', '#0A4FA3', '#FFFFFF', 'Estádio Aurora', 'Florianópolis', 14, 'top4', 2],
  ['botafogo-sp', 'Sport Lagoa Dourada', 'SLD', '#D2232A', '#FFFFFF', 'Parque do Vale', 'Ribeirão Preto', 12, 'mid', 2],
  ['ceara', 'Real Araucária', 'RAR', '#111111', '#FFFFFF', 'Complexo do Povo', 'Fortaleza', 30, 'title', 3],
  ['crb', 'Social Curió', 'SOC', '#D71920', '#FFFFFF', 'Estádio Planalto', 'Maceió', 14, 'mid', 2],
  ['criciuma', 'Independente Canarinho', 'IDE', '#F2C200', '#111111', 'Arena Panorama', 'Criciúma', 16, 'mid', 2],
  ['cuiaba', 'Babaçu Clube', 'BCL', '#00874A', '#F2C200', 'Arena dos Sonhos', 'Cuiabá', 18, 'top4', 2],
  ['fortaleza', 'Sucupira FC', 'SUP', '#003DA5', '#D2232A', 'Complexo Planalto', 'Fortaleza', 35, 'title', 3],
  ['goias', 'União Jacarandá', 'UAO', '#00843D', '#FFFFFF', 'Arena Panorama', 'Goiânia', 20, 'top4', 3],
  ['juventude', 'Boa Vista do Sul AC', 'BOA', '#00873E', '#FFFFFF', 'Estádio Municipal da Cidadela', 'Caxias do Sul', 14, 'mid', 2],
  ['londrina', 'Tropeiros AC', 'TPE', '#1E88E5', '#FFFFFF', 'Complexo da Aliança', 'Londrina', 8, 'survive', 1],
  ['nautico', 'Independente Bem-Te-Vi', 'IBT', '#D71920', '#FFFFFF', 'Complexo Horizonte', 'Recife', 18, 'top4', 3],
  ['novorizontino', 'União Planície', 'UPL', '#F2C200', '#111111', 'Estádio Municipal dos Sonhos', 'Novo Horizonte', 12, 'survive', 1],
  ['operario-pr', 'Safira AC', 'SFI', '#111111', '#FFFFFF', 'Estádio do Vale', 'Ponta Grossa', 9, 'mid', 1],
  ['ponte-preta', 'Sporting Sertão', 'SSE', '#111111', '#FFFFFF', 'Estádio Municipal da Aliança', 'Campinas', 14, 'mid', 2],
  ['sao-bernardo', 'Industrial Tropeiros', 'ITR', '#F2C200', '#111111', 'Estádio da Amizade', 'São Bernardo do Campo', 10, 'survive', 1],
  ['sport', 'Beira-Mar SC', 'BMS', '#D71920', '#111111', 'Complexo Aurora', 'Recife', 28, 'title', 3],
  ['vila-nova', 'Independente Seringueiros', 'IEN', '#D71920', '#FFFFFF', 'Complexo Aurora', 'Goiânia', 14, 'top4', 2],
];

const SERIE_C: Row[] = [
  ['amazonas', 'Independente Campos Altos', 'ICA', '#F2C200', '#111111', 'Estádio Municipal dos Pioneiros', 'Manaus', 6, 'mid', 2],
  ['anapolis', 'Estrela Pitanga', 'EST', '#0057B8', '#FFFFFF', 'Estádio do Grande Rio', 'Anápolis', 3, 'survive', 1],
  ['barra', 'Vanguarda Ouro Negro', 'VON', '#C8102E', '#111111', 'Estádio Municipal dos Pioneiros', 'Balneário Camboriú', 3, 'survive', 1],
  ['botafogo-pb', 'Ouro Negro SC', 'ONS', '#111111', '#FFFFFF', 'Estádio da Juventude', 'João Pessoa', 6, 'top4', 2],
  ['brusque', 'Tamanduá SC', 'TAM', '#F2C200', '#0A3D91', 'Complexo Panorama', 'Brusque', 5, 'mid', 2],
  ['caxias', 'Sporting Ipê Amarelo', 'SIA', '#7A1230', '#FFFFFF', 'Parque da Glória', 'Caxias do Sul', 5, 'mid', 1],
  ['confianca', 'Popular Mandacaru', 'PMA', '#1565C0', '#FFFFFF', 'Complexo da Nova Era', 'Aracaju', 5, 'top4', 1],
  ['ferroviaria', 'Operário Serra Azul', 'OSA', '#7A1230', '#FFFFFF', 'Complexo das Américas', 'Araraquara', 5, 'top4', 1],
  ['figueirense', 'Municipal Ventania', 'MVE', '#111111', '#FFFFFF', 'Estádio Municipal da Nova Era', 'Florianópolis', 7, 'top4', 2],
  ['floresta', 'Brasa Viva AC', 'BVA', '#1B7F3B', '#FFFFFF', 'Complexo Cometa', 'Fortaleza', 4, 'mid', 1],
  ['guarani', 'Racing Angico', 'RAN', '#0A7D37', '#FFFFFF', 'Parque da Glória', 'Campinas', 9, 'title', 3],
  ['inter-de-limeira', 'Beija-Flor Atlético Clube', 'BFA', '#111111', '#FFFFFF', 'Arena da Juventude', 'Limeira', 5, 'mid', 1],
  ['itabaiana', 'Canarinho AC', 'CNA', '#0057B8', '#FFFFFF', 'Estádio do Trabalhador', 'Itabaiana', 3, 'survive', 1],
  ['ituano', 'Social Garimpeiros', 'SGA', '#D71920', '#111111', 'Estádio da Glória', 'Itu', 8, 'top4', 2],
  ['maranhao', 'Atlético Caatinga', 'AET', '#C8102E', '#111111', 'Complexo da Esperança', 'São Luís', 4, 'survive', 1],
  ['maringa', 'Estrela Araucária', 'EEL', '#F2C200', '#111111', 'Arena da Lua', 'Maringá', 4, 'mid', 1],
  ['paysandu', 'Planície AC', 'PNI', '#0057B8', '#FFFFFF', 'Parque Horizonte', 'Belém', 12, 'title', 3],
  ['santa-cruz', 'Aliança Tempestade', 'ATE', '#D71920', '#111111', 'Parque Esmeralda', 'Recife', 10, 'title', 3],
  ['volta-redonda', 'Municipal Xique-Xique', 'MXX', '#F2C200', '#FFFFFF', 'Estádio Panorama', 'Volta Redonda', 5, 'top4', 1],
  ['ypiranga', 'Aliança Sucupira', 'ASU', '#00874A', '#F2C200', 'Complexo do Centenário', 'Erechim', 4, 'survive', 1],
];

// Série D: estes 20 + 76 de br_serie_d.ts = 96 clubes (16 grupos de 6).
const SERIE_D: Row[] = [
  ['abc', 'Babaçu EC', 'BAB', '#111111', '#FFFFFF', 'Parque da Amizade', 'Natal', 4, 'title', 1],
  ['america-rn', 'Industrial Pantaneiros', 'IND', '#D71920', '#FFFFFF', 'Estádio da Glória', 'Natal', 3, 'top4', 1],
  ['bangu', 'Estrela Carcará', 'ECA', '#C8102E', '#FFFFFF', 'Estádio Municipal do Sol', 'Rio de Janeiro', 2, 'mid', 1],
  ['campinense', 'Boa Vista do Sul EC', 'BVD', '#D71920', '#111111', 'Estádio da Serra', 'Campina Grande', 3, 'top4', 1],
  ['central', 'Atlético Esmeralda', 'ATL', '#0057B8', '#FFFFFF', 'Parque da Amizade', 'Caruaru', 2, 'mid', 1],
  ['csa', 'Sport Praianos', 'SPO', '#0057B8', '#FFFFFF', 'Parque do Vale', 'Maceió', 4, 'title', 1],
  ['joinville', 'Juventude Navegantes', 'JNA', '#C8102E', '#111111', 'Complexo dos Pioneiros', 'Joinville', 3, 'top4', 1],
  ['madureira', 'Sporting Planície', 'STI', '#F2C200', '#0057B8', 'Complexo da Cidadela', 'Rio de Janeiro', 2, 'mid', 1],
  ['mixto', 'Operário Bem-Te-Vi', 'OBT', '#111111', '#FFFFFF', 'Arena da Serra', 'Cuiabá', 2, 'survive', 1],
  ['moto-club', 'Jacarandá AC', 'JCA', '#C8102E', '#FFFFFF', 'Estádio Municipal Horizonte', 'São Luís', 2, 'mid', 1],
  ['nova-iguacu', 'Social Sucupira', 'SSU', '#F28C00', '#111111', 'Estádio Municipal da Vitória', 'Nova Iguaçu', 2, 'survive', 1],
  ['sampaio-correa', 'Aliança Pioneiros', 'API', '#00874A', '#F2C200', 'Estádio dos Campeões', 'São Luís', 4, 'title', 1],
  ['tombense', 'Xique-Xique Futebol Clube', 'XXF', '#D71920', '#FFFFFF', 'Complexo Mirante', 'Tombos', 3, 'top4', 1],
  ['treze', 'Athletic Beira-Mar', 'ABM', '#111111', '#FFFFFF', 'Estádio Municipal do Centenário', 'Campina Grande', 2, 'survive', 1],
  ['aguia-de-maraba', 'Operário Caiçaras', 'OPE', '#F2C200', '#111111', 'Complexo do Trabalhador', 'Marabá', 2, 'mid', 1],
  ['altos', 'Gaúchos do Sul FC', 'GDS', '#F2C200', '#111111', 'Estádio do Sol', 'Altos', 2, 'top4', 1],
  ['aparecidense', 'Juventude Jangadeiros', 'JUV', '#D71920', '#FFFFFF', 'Estádio da Aliança', 'Aparecida de Goiânia', 1, 'survive', 1],
  ['gama', 'Industrial Juazeiro Novo', 'IJN', '#1B7F3B', '#FFFFFF', 'Complexo da Esperança', 'Gama', 2, 'mid', 1],
  ['portuguesa', 'União Imbuia', 'UIM', '#C8102E', '#00874A', 'Parque Planalto', 'São Paulo', 3, 'top4', 1],
  ['rio-branco-ac', 'Guará Futebol Clube', 'GUA', '#111111', '#FFFFFF', 'Complexo da Cidadela', 'Rio Branco', 1, 'survive', 1],
];
/* eslint-enable prettier/prettier */

export const CLUBS_DATA: Record<string, ClubData[]> = {
  'serie-a': build(SERIE_A, 0),
  'serie-b': build(SERIE_B, -5),
  'serie-c': build(SERIE_C, -10),
  'serie-d': build([...SERIE_D, ...SERIE_D_EXTRA], -15),
  // Ligas estrangeiras (clubes e elencos fictícios). Divisões menores descontam a força do elenco.
  'ar-primera': build(AR_PRIMERA, -4),
  'ar-nacional': build(AR_NACIONAL, -12),
  premier: build(EN_PREMIER, 3),
  championship: build(EN_CHAMPIONSHIP, -4),
  'league-one': build(EN_LEAGUE_ONE, -10),
  'it-serie-a': build(IT_SERIE_A, 1),
  'it-serie-b': build(IT_SERIE_B, -6),
  'es-primera': build(ES_LALIGA, 1),
  'es-segunda': build(ES_SEGUNDA, -6),
  bundesliga: build(DE_BUNDESLIGA, 1),
  'bundesliga-2': build(DE_BUNDESLIGA_2, -6),
  'ligue-1': build(FR_LIGUE_1, 1),
  'ligue-2': build(FR_LIGUE_2, -6),
  'pt-primeira': build(PT_PRIMEIRA, -2),
  'pt-segunda': build(PT_SEGUNDA, -9),
  'bo-primera': build(BO_PRIMERA, -9),
  'cl-primera': build(CL_PRIMERA, -6),
  'co-primera': build(CO_PRIMERA, -5),
  'ec-primera': build(EC_PRIMERA, -7),
  'py-primera': build(PY_PRIMERA, -7),
  'pe-primera': build(PE_PRIMERA, -9),
  'uy-primera': build(UY_PRIMERA, -6),
  've-primera': build(VE_PRIMERA, -10),
};

/** Clubes que só jogam estadual (191): vêm da lista de estaduais; o elenco é gerado a partir da força fixa de cada um. */
const ESTADUAL_ONLY: ClubData[] = [...buildEstadualClubs(['serie-a', 'serie-b', 'serie-c', 'serie-d'].flatMap((d) => CLUBS_DATA[d])).byId.values()]
  .filter((c) => !c.inGame)
  .map((c) => ({
    id: c.id, name: c.name, shortName: c.shortName, badge: `assets/badges/${c.id}.png`, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor,
    stadium: 'Estádio Municipal', city: c.city, budget: (1 + (c.id.length % 3)) * MI, boardExpectation: 'mid' as BoardExpectation, reputation: 1 as Rep, uf: c.uf,
    squad: generateSquad({ id: c.id, name: c.name, short: c.shortName, color: c.primaryColor, strength: c.rating }, SQUAD_SEED),
  }));
CLUBS_DATA['br-estaduais'] = ESTADUAL_ONLY;

/** Clubes de uma divisão (lista vazia se ainda não houver dados). */
export const getClubs = (divisionId: string): ClubData[] => CLUBS_DATA[divisionId] ?? [];
export const getClub = (divisionId: string, clubId: string): ClubData | undefined =>
  getClubs(divisionId).find((c) => c.id === clubId);

/** Cópia da lista em ordem alfabética pelo nome exibido (pt-BR, sem diferenciar acentos/maiúsculas). */
export const sortByName = (clubs: ClubData[]): ClubData[] =>
  [...clubs].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
