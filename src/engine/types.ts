export type Position = 'GK' | 'DEF' | 'MID' | 'ATT';
export type FormationId = '4-4-2' | '4-3-3' | '3-5-2' | '4-5-1' | '5-3-2';

export const FORMATIONS: Record<FormationId, { DEF: number; MID: number; ATT: number }> = {
  '4-4-2': { DEF: 4, MID: 4, ATT: 2 },
  '4-3-3': { DEF: 4, MID: 3, ATT: 3 },
  '3-5-2': { DEF: 3, MID: 5, ATT: 2 },
  '4-5-1': { DEF: 4, MID: 5, ATT: 1 },
  '5-3-2': { DEF: 5, MID: 3, ATT: 2 },
};

export interface Player {
  id: string;
  name: string;
  pos: Position;
  age: number;
  strength: number; // 1..100
}

export interface Club {
  id: string;
  name: string;
  short: string;
  color: string; // cor principal (sem escudos no MVP)
  strength: number; // 1..100, usado para gerar elenco quando o pacote não traz jogadores
  players?: Player[]; // opcional: pacotes de dados podem trazer elenco pronto
}

/** Formato do "pacote de dados" (liga + clubes). O jogo base é genérico; pacotes trazem os nomes. */
export interface DataPack {
  format: 'caminhoes-pack-v1';
  id: string;
  name: string;
  author?: string;
  league: { name: string; clubs: Club[] };
}

export interface TeamState {
  clubId: string;
  players: Player[];
  formation: FormationId;
  lineup: string[]; // 11 ids de jogadores
}

export interface MatchEvent {
  minute: number;
  type: 'kickoff' | 'goal' | 'yellow' | 'red' | 'foul' | 'save' | 'miss' | 'corner' | 'halftime' | 'fulltime';
  side: 'home' | 'away' | 'none';
  text: string;
  /** Jogador principal do lance (autor do gol, da falta, do chute...). */
  player?: string;
  /** Placar [casa, fora] depois do lance (gols, intervalo e fim de jogo). */
  score?: [number, number];
}

export interface MatchResult {
  divisionId: string;
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** Lances da partida. Só são guardados nos jogos do clube do jogador (nos demais fica vazio, para o save não crescer). */
  events: MatchEvent[];
}

export interface Fixture {
  divisionId: string;
  round: number;
  homeId: string;
  awayId: string;
}

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

/** Dados de exibição de um clube, copiados para o save (nomes, cores, estádio). */
export interface ClubInfo {
  id: string;
  name: string;
  shortName: string;
  badge: string;
  primaryColor: string;
  secondaryColor: string;
  stadium: string;
  city: string;
  reputation: number;
  /** Meta da diretoria (title | top4 | mid | survive), usada no humor dos dirigentes. */
  boardExpectation: 'title' | 'top4' | 'mid' | 'survive';
}

/** Uma divisão da pirâmide, da principal (índice 0) para as inferiores. */
export interface DivisionState {
  id: string;
  name: string;
  clubIds: string[];
}

/** Notícia do mercado e dos clubes (movimentos da IA, investimentos, crises). */
export interface NewsItem {
  season: number;
  round: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

/** Resumo de uma temporada encerrada. */
export interface SeasonSummary {
  season: number;
  userDivisionId: string;
  userPosition: number;
  divisions: { id: string; championId: string; promoted: string[]; relegated: string[] }[];
  /** Sorteio do investimento dos clubes promovidos (strong = investimento forte). */
  promotion?: { clubId: string; strong: boolean; bonus: number }[];
}

/** Registro de uma contratação (o jogador passa de um clube para outro). */
export interface Transfer {
  /** buy = contratação, sale = venda, loan = empréstimo cedido, release = dispensa (toClubId vazio) */
  kind: 'buy' | 'sale' | 'loan' | 'release';
  season: number;
  round: number;
  playerId: string;
  playerName: string;
  pos: Position;
  strength: number;
  fromClubId: string;
  toClubId: string;
  fee: number; // R$
}

/** Humor (0–100) da equipe, dos dirigentes e da torcida. */
export interface Morale { team: number; board: number; fans: number }

/** Proposta de outro clube por um jogador da lista de transferência (buy) ou de empréstimo (loan). */
export interface Offer {
  id: string;
  kind: 'buy' | 'loan';
  playerId: string;
  clubId: string; // clube que fez a proposta
  fee: number; // R$ pagos ao seu clube
  season: number;
  expiresRound: number; // a proposta vale até o fim desta rodada
}

/** Jogador seu emprestado: volta no fim da temporada. */
export interface Loan { playerId: string; hostClubId: string; season: number }

export interface GameState {
  version: 5;
  saveName: string;
  coach: { name: string; nationality: string; reputation: string };
  difficulty: string;
  mode: string;
  userClubId: string;
  seed: number;
  season: number;
  round: number; // próxima rodada a jogar (1-based); > totalRounds = temporada acabou
  totalRounds: number;
  clubs: Record<string, ClubInfo>;
  budgets: Record<string, number>; // saldo de cada clube em R$ (usado nas transferências)
  transfers: Transfer[]; // histórico de contratações, vendas, empréstimos e dispensas
  morale: Morale;
  transferList: string[]; // jogadores do seu clube à venda
  loanList: string[]; // jogadores do seu clube disponíveis para empréstimo
  offers: Offer[]; // propostas recebidas
  loans: Loan[]; // jogadores seus emprestados
  news: NewsItem[]; // últimas notícias (mais recente primeiro)
  divisions: DivisionState[]; // ordem: Série A, B, C, D
  teams: Record<string, TeamState>; // todos os clubes
  fixtures: Fixture[]; // da temporada atual, todas as divisões
  results: MatchResult[]; // da temporada atual
  history: SeasonSummary[];
}
