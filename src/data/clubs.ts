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
  ['flamengo', 'Flamengo', 'FLA', '#C52613', '#111111', 'Maracanã', 'Rio de Janeiro', 150, 'title', 5],
  ['palmeiras', 'Palmeiras', 'PAL', '#006437', '#FFFFFF', 'Allianz Parque', 'São Paulo', 140, 'title', 5],
  ['cruzeiro', 'Cruzeiro', 'CRU', '#0033A0', '#FFFFFF', 'Mineirão', 'Belo Horizonte', 85, 'top4', 4],
  ['mirassol', 'Mirassol', 'MIR', '#F2C200', '#00873E', 'Maião', 'Mirassol', 30, 'mid', 2],
  ['fluminense', 'Fluminense', 'FLU', '#8B1E3F', '#00843D', 'Maracanã', 'Rio de Janeiro', 70, 'mid', 4],
  ['bahia', 'Bahia', 'BAH', '#005BAA', '#D2232A', 'Arena Fonte Nova', 'Salvador', 70, 'mid', 3],
  ['botafogo', 'Botafogo', 'BOT', '#000000', '#FFFFFF', 'Nilton Santos', 'Rio de Janeiro', 90, 'top4', 4],
  ['sao-paulo', 'São Paulo', 'SAO', '#E30613', '#FFFFFF', 'Morumbis', 'São Paulo', 95, 'top4', 4],
  ['bragantino', 'Red Bull Bragantino', 'RBB', '#D2232A', '#FFFFFF', 'Nabi Abi Chedid', 'Bragança Paulista', 50, 'mid', 3],
  ['corinthians', 'Corinthians', 'COR', '#000000', '#FFFFFF', 'Neo Química Arena', 'São Paulo', 100, 'top4', 4],
  ['gremio', 'Grêmio', 'GRE', '#0D80BF', '#111111', 'Arena do Grêmio', 'Porto Alegre', 70, 'top4', 4],
  ['vasco', 'Vasco da Gama', 'VAS', '#000000', '#FFFFFF', 'São Januário', 'Rio de Janeiro', 65, 'mid', 4],
  ['atletico-mg', 'Atlético-MG', 'CAM', '#000000', '#FFFFFF', 'Arena MRV', 'Belo Horizonte', 85, 'top4', 4],
  ['santos', 'Santos', 'SAN', '#FFFFFF', '#111111', 'Vila Belmiro', 'Santos', 60, 'mid', 4],
  ['athletico-pr', 'Athletico-PR', 'CAP', '#C8102E', '#111111', 'Ligga Arena', 'Curitiba', 60, 'mid', 3],
  ['coritiba', 'Coritiba', 'CFC', '#00553A', '#FFFFFF', 'Couto Pereira', 'Curitiba', 32, 'survive', 3],
  ['internacional', 'Internacional', 'INT', '#E30613', '#FFFFFF', 'Beira-Rio', 'Porto Alegre', 75, 'top4', 4],
  ['chapecoense', 'Chapecoense', 'CHA', '#00873E', '#FFFFFF', 'Arena Condá', 'Chapecó', 25, 'survive', 2],
  ['vitoria', 'Vitória', 'VIT', '#D50000', '#111111', 'Barradão', 'Salvador', 35, 'survive', 2],
  ['remo', 'Remo', 'REM', '#0A2A66', '#FFFFFF', 'Baenão', 'Belém', 24, 'survive', 2],
];

const SERIE_B: Row[] = [
  ['america-mg', 'América-MG', 'AME', '#1B7F3B', '#FFFFFF', 'Independência', 'Belo Horizonte', 28, 'title', 3],
  ['athletic', 'Athletic', 'ATH', '#111111', '#FFFFFF', 'Joaquim Portugal', 'São João del-Rei', 8, 'survive', 1],
  ['atletico-go', 'Atlético-GO', 'CAG', '#C8102E', '#111111', 'Antônio Accioly', 'Goiânia', 20, 'top4', 2],
  ['avai', 'Avaí', 'AVA', '#0A4FA3', '#FFFFFF', 'Ressacada', 'Florianópolis', 14, 'top4', 2],
  ['botafogo-sp', 'Botafogo-SP', 'BSP', '#D2232A', '#FFFFFF', 'Santa Cruz', 'Ribeirão Preto', 12, 'mid', 2],
  ['ceara', 'Ceará', 'CEA', '#111111', '#FFFFFF', 'Arena Castelão', 'Fortaleza', 30, 'title', 3],
  ['crb', 'CRB', 'CRB', '#D71920', '#FFFFFF', 'Rei Pelé', 'Maceió', 14, 'mid', 2],
  ['criciuma', 'Criciúma', 'CRI', '#F2C200', '#111111', 'Heriberto Hülse', 'Criciúma', 16, 'mid', 2],
  ['cuiaba', 'Cuiabá', 'CUI', '#00874A', '#F2C200', 'Arena Pantanal', 'Cuiabá', 18, 'top4', 2],
  ['fortaleza', 'Fortaleza', 'FOR', '#003DA5', '#D2232A', 'Arena Castelão', 'Fortaleza', 35, 'title', 3],
  ['goias', 'Goiás', 'GOI', '#00843D', '#FFFFFF', 'Serrinha', 'Goiânia', 20, 'top4', 3],
  ['juventude', 'Juventude', 'JUV', '#00873E', '#FFFFFF', 'Alfredo Jaconi', 'Caxias do Sul', 14, 'mid', 2],
  ['londrina', 'Londrina', 'LON', '#1E88E5', '#FFFFFF', 'Estádio do Café', 'Londrina', 8, 'survive', 1],
  ['nautico', 'Náutico', 'NAU', '#D71920', '#FFFFFF', 'Aflitos', 'Recife', 18, 'top4', 3],
  ['novorizontino', 'Novorizontino', 'NOV', '#F2C200', '#111111', 'Jorge Ismael de Biasi', 'Novo Horizonte', 12, 'survive', 1],
  ['operario-pr', 'Operário-PR', 'OPE', '#111111', '#FFFFFF', 'Germano Krüger', 'Ponta Grossa', 9, 'mid', 1],
  ['ponte-preta', 'Ponte Preta', 'PON', '#111111', '#FFFFFF', 'Moisés Lucarelli', 'Campinas', 14, 'mid', 2],
  ['sao-bernardo', 'São Bernardo', 'SBE', '#F2C200', '#111111', 'Primeiro de Maio', 'São Bernardo do Campo', 10, 'survive', 1],
  ['sport', 'Sport', 'SPO', '#D71920', '#111111', 'Ilha do Retiro', 'Recife', 28, 'title', 3],
  ['vila-nova', 'Vila Nova', 'VNO', '#D71920', '#FFFFFF', 'Onésio Brasileiro Alvarenga', 'Goiânia', 14, 'top4', 2],
];

const SERIE_C: Row[] = [
  ['amazonas', 'Amazonas', 'AMA', '#F2C200', '#111111', 'Arena da Amazônia', 'Manaus', 6, 'mid', 2],
  ['anapolis', 'Anápolis', 'ANA', '#0057B8', '#FFFFFF', 'Jonas Duarte', 'Anápolis', 3, 'survive', 1],
  ['barra', 'Barra', 'BAR', '#C8102E', '#111111', 'Estádio Municipal de Balneário Camboriú', 'Balneário Camboriú', 3, 'survive', 1],
  ['botafogo-pb', 'Botafogo-PB', 'BPB', '#111111', '#FFFFFF', 'Almeidão', 'João Pessoa', 6, 'top4', 2],
  ['brusque', 'Brusque', 'BRU', '#F2C200', '#0A3D91', 'Augusto Bauer', 'Brusque', 5, 'mid', 2],
  ['caxias', 'Caxias', 'CAX', '#7A1230', '#FFFFFF', 'Centenário', 'Caxias do Sul', 5, 'mid', 1],
  ['confianca', 'Confiança', 'CON', '#1565C0', '#FFFFFF', 'Batistão', 'Aracaju', 5, 'top4', 1],
  ['ferroviaria', 'Ferroviária', 'FER', '#7A1230', '#FFFFFF', 'Fonte Luminosa', 'Araraquara', 5, 'top4', 1],
  ['figueirense', 'Figueirense', 'FIG', '#111111', '#FFFFFF', 'Orlando Scarpelli', 'Florianópolis', 7, 'top4', 2],
  ['floresta', 'Floresta', 'FLO', '#1B7F3B', '#FFFFFF', 'Alencarzão', 'Fortaleza', 4, 'mid', 1],
  ['guarani', 'Guarani', 'GUA', '#0A7D37', '#FFFFFF', 'Brinco de Ouro da Princesa', 'Campinas', 9, 'title', 3],
  ['inter-de-limeira', 'Inter de Limeira', 'INL', '#111111', '#FFFFFF', 'Limeirão', 'Limeira', 5, 'mid', 1],
  ['itabaiana', 'Itabaiana', 'ITA', '#0057B8', '#FFFFFF', 'Presidente Médici', 'Itabaiana', 3, 'survive', 1],
  ['ituano', 'Ituano', 'ITU', '#D71920', '#111111', 'Novelli Júnior', 'Itu', 8, 'top4', 2],
  ['maranhao', 'Maranhão', 'MAR', '#C8102E', '#111111', 'Nhozinho Santos', 'São Luís', 4, 'survive', 1],
  ['maringa', 'Maringá', 'MGA', '#F2C200', '#111111', 'Willie Davids', 'Maringá', 4, 'mid', 1],
  ['paysandu', 'Paysandu', 'PAY', '#0057B8', '#FFFFFF', 'Mangueirão', 'Belém', 12, 'title', 3],
  ['santa-cruz', 'Santa Cruz', 'SCR', '#D71920', '#111111', 'Arruda', 'Recife', 10, 'title', 3],
  ['volta-redonda', 'Volta Redonda', 'VRE', '#F2C200', '#FFFFFF', 'Raulino de Oliveira', 'Volta Redonda', 5, 'top4', 1],
  ['ypiranga', 'Ypiranga', 'YPI', '#00874A', '#F2C200', 'Colosso da Lagoa', 'Erechim', 4, 'survive', 1],
];

// Série D: estes 20 + 76 de br_serie_d.ts = 96 clubes (16 grupos de 6).
const SERIE_D: Row[] = [
  ['abc', 'ABC', 'ABC', '#111111', '#FFFFFF', 'Frasqueirão', 'Natal', 4, 'title', 1],
  ['america-rn', 'América-RN', 'ARN', '#D71920', '#FFFFFF', 'Arena das Dunas', 'Natal', 3, 'top4', 1],
  ['bangu', 'Bangu', 'BAN', '#C8102E', '#FFFFFF', 'Moça Bonita', 'Rio de Janeiro', 2, 'mid', 1],
  ['campinense', 'Campinense', 'CPN', '#D71920', '#111111', 'Amigão', 'Campina Grande', 3, 'top4', 1],
  ['central', 'Central', 'CEN', '#0057B8', '#FFFFFF', 'Lacerdão', 'Caruaru', 2, 'mid', 1],
  ['csa', 'CSA', 'CSA', '#0057B8', '#FFFFFF', 'Rei Pelé', 'Maceió', 4, 'title', 1],
  ['joinville', 'Joinville', 'JOI', '#C8102E', '#111111', 'Arena Joinville', 'Joinville', 3, 'top4', 1],
  ['madureira', 'Madureira', 'MAD', '#F2C200', '#0057B8', 'Conselheiro Galvão', 'Rio de Janeiro', 2, 'mid', 1],
  ['mixto', 'Mixto', 'MIX', '#111111', '#FFFFFF', 'Dutrinha', 'Cuiabá', 2, 'survive', 1],
  ['moto-club', 'Moto Club', 'MOT', '#C8102E', '#FFFFFF', 'Nhozinho Santos', 'São Luís', 2, 'mid', 1],
  ['nova-iguacu', 'Nova Iguaçu', 'NIG', '#F28C00', '#111111', 'Laranjão', 'Nova Iguaçu', 2, 'survive', 1],
  ['sampaio-correa', 'Sampaio Corrêa', 'SAM', '#00874A', '#F2C200', 'Castelão', 'São Luís', 4, 'title', 1],
  ['tombense', 'Tombense', 'TOM', '#D71920', '#FFFFFF', 'Soares de Azevedo', 'Tombos', 3, 'top4', 1],
  ['treze', 'Treze', 'TRE', '#111111', '#FFFFFF', 'Amigão', 'Campina Grande', 2, 'survive', 1],
  ['aguia-de-maraba', 'Águia de Marabá', 'AGM', '#F2C200', '#111111', 'Zinho Oliveira', 'Marabá', 2, 'mid', 1],
  ['altos', 'Altos', 'ALT', '#F2C200', '#111111', 'Felipão', 'Altos', 2, 'top4', 1],
  ['aparecidense', 'Aparecidense', 'APA', '#D71920', '#FFFFFF', 'Annibal Batista de Toledo', 'Aparecida de Goiânia', 1, 'survive', 1],
  ['gama', 'Gama', 'GAM', '#1B7F3B', '#FFFFFF', 'Bezerrão', 'Gama', 2, 'mid', 1],
  ['portuguesa', 'Portuguesa', 'POR', '#C8102E', '#00874A', 'Canindé', 'São Paulo', 3, 'top4', 1],
  ['rio-branco-ac', 'Rio Branco-AC', 'RBR', '#111111', '#FFFFFF', 'Arena da Floresta', 'Rio Branco', 1, 'survive', 1],
];
/* eslint-enable prettier/prettier */

export const CLUBS_DATA: Record<string, ClubData[]> = {
  'serie-a': build(SERIE_A, 0),
  'serie-b': build(SERIE_B, -5),
  'serie-c': build(SERIE_C, -10),
  'serie-d': build([...SERIE_D, ...SERIE_D_EXTRA], -15),
  // Ligas estrangeiras (clubes reais; elencos fictícios). Divisões menores descontam a força do elenco.
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
    stadium: 'Estádio Municipal', city: c.city, budget: (1 + (c.name.length % 3)) * MI, boardExpectation: 'mid' as BoardExpectation, reputation: 1 as Rep, uf: c.uf,
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
