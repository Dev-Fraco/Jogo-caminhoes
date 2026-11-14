import { clamp, hashString, makeRng, pick, type Rng } from './rng';
import { FORMATIONS, type Club, type FormationId, type Player, type Position, type TeamState } from './types';

const FIRST = ['João','Pedro','Lucas','Gabriel','Mateus','Rafael','Bruno','Thiago','Felipe','Gustavo','Diego','Caio','Vitor','Renan','Igor','Leandro','Marcelo','Fábio','Daniel','Henrique','Wesley','Everton','Murilo','Davi','Nathan','Kaique','Ricardo','André','Rodrigo','Luan'];
const LAST = ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ferreira','Almeida','Ribeiro','Carvalho','Gomes','Martins','Araújo','Barbosa','Rocha','Dias','Nunes','Moreira','Cardoso','Teixeira','Moura','Cavalcante','Freitas','Mendes','Batista','Correia','Pinto','Campos','Vieira'];

/** Composição do elenco gerado: 24 jogadores. */
const SQUAD_SHAPE: [Position, number][] = [['GK', 3], ['DEF', 8], ['MID', 8], ['ATT', 5]];

export function generateSquad(club: Club, seed: number): Player[] {
  const rng = makeRng(hashString(club.id) ^ seed);
  const players: Player[] = [];
  const used = new Set<string>();
  let n = 0;
  for (const [pos, count] of SQUAD_SHAPE) {
    for (let i = 0; i < count; i++) {
      let name = '';
      do name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
      while (used.has(name));
      used.add(name);
      // titulares (primeiros de cada posição) são mais fortes que reservas
      const starterBonus = i < (pos === 'GK' ? 1 : pos === 'DEF' ? 4 : pos === 'MID' ? 4 : 2) ? 3 : -6;
      const strength = clamp(Math.round(club.strength + starterBonus + (rng() - 0.5) * 14), 25, 97);
      const age = 17 + Math.floor(rng() * 20);
      players.push({ id: `${club.id}-${n++}`, name, pos, age, strength });
    }
  }
  return players;
}

/** Escolhe os melhores jogadores por posição para a formação. */
export function autoLineup(players: Player[], formation: FormationId): string[] {
  const f = FORMATIONS[formation];
  const need: Record<Position, number> = { GK: 1, DEF: f.DEF, MID: f.MID, ATT: f.ATT };
  const ids: string[] = [];
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
    players
      .filter((p) => p.pos === pos)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, need[pos])
      .forEach((p) => ids.push(p.id));
  }
  return ids;
}

export function buildTeam(club: Club, seed: number, formation: FormationId = '4-4-2'): TeamState {
  const players = club.players?.length ? club.players : generateSquad(club, seed);
  return { clubId: club.id, players, formation, lineup: autoLineup(players, formation) };
}

/** Time a partir de um elenco pronto (titulares escolhidos automaticamente). */
export function teamFromPlayers(clubId: string, players: Player[], formation: FormationId = '4-4-2'): TeamState {
  return { clubId, players, formation, lineup: autoLineup(players, formation) };
}

export interface Ratings { gk: number; def: number; mid: number; att: number; overall: number }

export function teamRatings(team: TeamState): Ratings {
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const avg = (pos: Position) => {
    const xs = team.lineup.map((id) => byId.get(id)!).filter((p) => p.pos === pos).map((p) => p.strength);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 30;
  };
  const gk = avg('GK'), def = avg('DEF'), mid = avg('MID'), att = avg('ATT');
  return { gk, def, mid, att, overall: Math.round((gk + def * 4 + mid * 4 + att * 2) / 11) };
}

export type { Rng };
