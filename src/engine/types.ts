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
  type: 'goal' | 'yellow' | 'red' | 'chance';
  side: 'home' | 'away';
  text: string;
}

export interface MatchResult {
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
}

export interface Fixture {
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

export interface GameState {
  version: 1;
  packId: string;
  packName: string;
  leagueName: string;
  clubs: Club[]; // cópia do pacote usado, para o save ser independente
  userClubId: string;
  seed: number;
  season: number;
  round: number; // próxima rodada a jogar (1-based); > totalRounds = temporada acabou
  totalRounds: number;
  teams: Record<string, TeamState>;
  fixtures: Fixture[];
  results: MatchResult[];
}
