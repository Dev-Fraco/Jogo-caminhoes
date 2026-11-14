/**
 * Clubes por divisão, para a Etapa 3 do Novo Jogo (Escolha do Clube).
 * A chave é o divisionId de data/world.ts (único no mundo todo).
 * Valores aproximados e "plausíveis": ajuste à vontade, a interface só lê estes campos.
 */

/** O que a diretoria espera da temporada. */
export type BoardExpectation = 'title' | 'top4' | 'mid' | 'survive';

export interface ClubData {
  id: string;
  name: string;
  shortName: string;
  /** Caminho do escudo. Os arquivos ainda não existem: a interface precisa de um visual reserva. */
  badge: string;
  primaryColor: string;
  /** Tom de apoio legível em fundo escuro. Obrigatório na prática quando primaryColor é quase preto; usar no escudo reserva e em detalhes. */
  secondaryColor?: string;
  stadium: string;
  city: string;
  /** Orçamento em reais (R$). */
  budget: number;
  boardExpectation: BoardExpectation;
  /** 1 (pequeno) a 5 (gigante). */
  reputation: 1 | 2 | 3 | 4 | 5;
}

const MI = 1_000_000;

/** Brasileirão Série A — edição com Criciúma, Cuiabá e Atlético-GO (lista pedida para o protótipo). */
const SERIE_A: ClubData[] = [
  { id: 'flamengo', name: 'Flamengo', shortName: 'FLA', badge: 'assets/badges/flamengo.png', primaryColor: '#C52613', stadium: 'Maracanã', city: 'Rio de Janeiro', budget: 150 * MI, boardExpectation: 'title', reputation: 5 },
  { id: 'palmeiras', name: 'Palmeiras', shortName: 'PAL', badge: 'assets/badges/palmeiras.png', primaryColor: '#006437', stadium: 'Allianz Parque', city: 'São Paulo', budget: 140 * MI, boardExpectation: 'title', reputation: 5 },
  { id: 'corinthians', name: 'Corinthians', shortName: 'COR', badge: 'assets/badges/corinthians.png', primaryColor: '#000000', secondaryColor: '#D9D9D9', stadium: 'Neo Química Arena', city: 'São Paulo', budget: 100 * MI, boardExpectation: 'top4', reputation: 4 },
  { id: 'sao-paulo', name: 'São Paulo', shortName: 'SAO', badge: 'assets/badges/sao-paulo.png', primaryColor: '#E30613', stadium: 'Morumbis', city: 'São Paulo', budget: 95 * MI, boardExpectation: 'top4', reputation: 4 },
  { id: 'fluminense', name: 'Fluminense', shortName: 'FLU', badge: 'assets/badges/fluminense.png', primaryColor: '#8B1E3F', stadium: 'Maracanã', city: 'Rio de Janeiro', budget: 70 * MI, boardExpectation: 'mid', reputation: 4 },
  { id: 'botafogo', name: 'Botafogo', shortName: 'BOT', badge: 'assets/badges/botafogo.png', primaryColor: '#000000', secondaryColor: '#D9D9D9', stadium: 'Nilton Santos', city: 'Rio de Janeiro', budget: 90 * MI, boardExpectation: 'top4', reputation: 4 },
  { id: 'vasco', name: 'Vasco da Gama', shortName: 'VAS', badge: 'assets/badges/vasco.png', primaryColor: '#000000', secondaryColor: '#E8574F', stadium: 'São Januário', city: 'Rio de Janeiro', budget: 65 * MI, boardExpectation: 'mid', reputation: 4 },
  { id: 'gremio', name: 'Grêmio', shortName: 'GRE', badge: 'assets/badges/gremio.png', primaryColor: '#0D80BF', stadium: 'Arena do Grêmio', city: 'Porto Alegre', budget: 70 * MI, boardExpectation: 'top4', reputation: 4 },
  { id: 'internacional', name: 'Internacional', shortName: 'INT', badge: 'assets/badges/internacional.png', primaryColor: '#E30613', stadium: 'Beira-Rio', city: 'Porto Alegre', budget: 75 * MI, boardExpectation: 'top4', reputation: 4 },
  { id: 'cruzeiro', name: 'Cruzeiro', shortName: 'CRU', badge: 'assets/badges/cruzeiro.png', primaryColor: '#0033A0', stadium: 'Mineirão', city: 'Belo Horizonte', budget: 80 * MI, boardExpectation: 'top4', reputation: 4 },
  { id: 'atletico-mg', name: 'Atlético-MG', shortName: 'CAM', badge: 'assets/badges/atletico-mg.png', primaryColor: '#000000', secondaryColor: '#C9C9C9', stadium: 'Arena MRV', city: 'Belo Horizonte', budget: 85 * MI, boardExpectation: 'top4', reputation: 4 },
  { id: 'athletico-pr', name: 'Athletico-PR', shortName: 'CAP', badge: 'assets/badges/athletico-pr.png', primaryColor: '#C8102E', stadium: 'Ligga Arena', city: 'Curitiba', budget: 60 * MI, boardExpectation: 'mid', reputation: 3 },
  { id: 'bahia', name: 'Bahia', shortName: 'BAH', badge: 'assets/badges/bahia.png', primaryColor: '#005BAA', stadium: 'Arena Fonte Nova', city: 'Salvador', budget: 70 * MI, boardExpectation: 'mid', reputation: 3 },
  { id: 'fortaleza', name: 'Fortaleza', shortName: 'FOR', badge: 'assets/badges/fortaleza.png', primaryColor: '#003DA5', stadium: 'Arena Castelão', city: 'Fortaleza', budget: 55 * MI, boardExpectation: 'mid', reputation: 3 },
  { id: 'vitoria', name: 'Vitória', shortName: 'VIT', badge: 'assets/badges/vitoria.png', primaryColor: '#D50000', stadium: 'Barradão', city: 'Salvador', budget: 35 * MI, boardExpectation: 'survive', reputation: 2 },
  { id: 'juventude', name: 'Juventude', shortName: 'JUV', badge: 'assets/badges/juventude.png', primaryColor: '#00873E', stadium: 'Alfredo Jaconi', city: 'Caxias do Sul', budget: 25 * MI, boardExpectation: 'survive', reputation: 2 },
  { id: 'bragantino', name: 'Red Bull Bragantino', shortName: 'BRA', badge: 'assets/badges/bragantino.png', primaryColor: '#D2232A', stadium: 'Nabi Abi Chedid', city: 'Bragança Paulista', budget: 50 * MI, boardExpectation: 'mid', reputation: 3 },
  { id: 'criciuma', name: 'Criciúma', shortName: 'CRI', badge: 'assets/badges/criciuma.png', primaryColor: '#F2C200', stadium: 'Heriberto Hülse', city: 'Criciúma', budget: 22 * MI, boardExpectation: 'survive', reputation: 2 },
  { id: 'cuiaba', name: 'Cuiabá', shortName: 'CUI', badge: 'assets/badges/cuiaba.png', primaryColor: '#00874A', stadium: 'Arena Pantanal', city: 'Cuiabá', budget: 22 * MI, boardExpectation: 'survive', reputation: 2 },
  { id: 'atletico-go', name: 'Atlético-GO', shortName: 'CAG', badge: 'assets/badges/atletico-go.png', primaryColor: '#C8102E', stadium: 'Antônio Accioly', city: 'Goiânia', budget: 20 * MI, boardExpectation: 'survive', reputation: 1 },
];

export const CLUBS_DATA: Record<string, ClubData[]> = {
  'serie-a': SERIE_A,
  'serie-b': [], // TODO: popular com clubes reais
  'serie-c': [], // TODO: popular com clubes reais
  'serie-d': [], // TODO: popular com clubes reais
};

/** Clubes de uma divisão (lista vazia se ainda não houver dados). */
export const getClubs = (divisionId: string): ClubData[] => CLUBS_DATA[divisionId] ?? [];
export const getClub = (divisionId: string, clubId: string): ClubData | undefined =>
  getClubs(divisionId).find((c) => c.id === clubId);
