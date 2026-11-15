import { clamp, hashString, makeRng, pick, type Rng } from './rng';
import { FORMATION_SLOTS, SPOT_LINE, type Club, type FormationId, type Player, type Position, type Spot, type TeamState } from './types';

const FIRST = ['João','Pedro','Lucas','Gabriel','Mateus','Rafael','Bruno','Thiago','Felipe','Gustavo','Diego','Caio','Vitor','Renan','Igor','Leandro','Marcelo','Fábio','Daniel','Henrique','Wesley','Everton','Murilo','Davi','Nathan','Kaique','Ricardo','André','Rodrigo','Luan'];
const LAST = ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ferreira','Almeida','Ribeiro','Carvalho','Gomes','Martins','Araújo','Barbosa','Rocha','Dias','Nunes','Moreira','Cardoso','Teixeira','Moura','Cavalcante','Freitas','Mendes','Batista','Correia','Pinto','Campos','Vieira'];

/** Nome fictício que ainda não está em `used`. */
export function randomName(rng: Rng, used: Set<string>): string {
  let name = '';
  do name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
  while (used.has(name));
  used.add(name);
  return name;
}

/** Composição do elenco gerado: 24 jogadores. */
const SQUAD_SHAPE: [Position, number][] = [['GK', 3], ['DEF', 8], ['MID', 8], ['ATT', 5]];
/** Função de cada jogador gerado, na ordem da posição (os primeiros são os titulares): laterais, zagueiros, meias abertos, pontas e centroavantes. */
const SPOT_PATTERN: Record<Position, Spot[]> = {
  GK: ['GK', 'GK', 'GK'],
  DEF: ['LD', 'ZAG', 'ZAG', 'LE', 'ZAG', 'LD', 'LE', 'ZAG'],
  MID: ['MC', 'MC', 'MD', 'ME', 'MC', 'MD', 'ME', 'MC'],
  ATT: ['CA', 'CA', 'PD', 'PE', 'CA'],
};

const SPOTS_BY_LINE: Record<Position, Spot[]> = { GK: ['GK'], DEF: ['ZAG', 'LD', 'LE'], MID: ['MC', 'MD', 'ME'], ATT: ['CA', 'PD', 'PE'] };
const SPOT_WEIGHT: Record<Spot, number> = { GK: 1, ZAG: 5, LD: 2, LE: 2, MC: 4, MD: 2, ME: 2, CA: 3, PD: 1.5, PE: 1.5 };

/** Função do jogador: a guardada nele ou, se não tiver (save/pacote antigo), uma função fixa deduzida do id (sempre a mesma). */
export function spotOf(p: Pick<Player, 'id' | 'pos' | 'spot'>): Spot {
  if (p.spot && SPOT_LINE[p.spot] === p.pos) return p.spot;
  const opts = SPOTS_BY_LINE[p.pos];
  if (opts.length === 1) return opts[0];
  let h = hashString(p.id) % 100;
  const total = opts.reduce((t, o) => t + SPOT_WEIGHT[o], 0);
  h = (h / 100) * total;
  for (const o of opts) { h -= SPOT_WEIGHT[o]; if (h < 0) return o; }
  return opts[0];
}

/** Escolhe a função de um jogador novo (base, contratação sem função): a que mais falta no elenco, segundo a formação 4-4-2/4-3-3. */
export function pickSpot(players: Player[], pos: Position): Spot {
  const want: Record<Spot, number> = { GK: 3, ZAG: 4, LD: 2, LE: 2, MC: 4, MD: 2, ME: 2, CA: 3, PD: 1, PE: 1 };
  const have = (sp: Spot) => players.filter((p) => p.pos === pos && spotOf(p) === sp).length;
  return [...SPOTS_BY_LINE[pos]].sort((a, b) => (have(a) - want[a]) - (have(b) - want[b]))[0];
}

/**
 * Dá função aos jogadores que ainda não têm (saves antigos): por linha, na ordem do elenco, escolhendo sempre a função que mais falta
 * (assim o time antigo também ganha lateral direito e esquerdo, meias abertos, pontas e centroavantes). Quem já tem função não muda.
 */
export function withSpots(players: Player[]): Player[] {
  if (players.every((p) => p.spot)) return players;
  const out: Player[] = [];
  for (const p of players) out.push(p);
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      if (p.pos !== pos || p.spot) continue;
      out[i] = { ...p, spot: pickSpot(out.filter((x, k) => k !== i && x.spot), pos) };
    }
  }
  return out;
}

/** Quanto do rendimento o jogador mantém numa vaga que não é a sua função (laterais trocam de lado, meias e pontas abertos, etc.). */
export function spotFit(from: Spot, slot: Spot): number {
  if (from === slot) return 1;
  if (SPOT_LINE[from] !== SPOT_LINE[slot]) return 0.7;
  const pair = (a: Spot, b: Spot) => (from === a && slot === b) || (from === b && slot === a);
  if (pair('LD', 'LE') || pair('MD', 'ME') || pair('PD', 'PE')) return 0.92; // do lado oposto
  if (from === 'ZAG') return 0.9; // zagueiro improvisado de lateral
  if (slot === 'ZAG') return 0.9;
  if (from === 'MC') return 0.93; // meia central aberto
  if (slot === 'MC') return 0.94;
  if (from === 'CA') return 0.9; // centroavante de ponta
  if (slot === 'CA') return 0.9; // ponta de centroavante
  return 0.88;
}


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
      players.push({ id: `${club.id}-${n++}`, name, pos, spot: SPOT_PATTERN[pos][i], age, strength });
    }
  }
  return players;
}

/** Vagas de uma formação por linha, na ordem (esquerda para a direita). */
export function slotsOfLine(formation: FormationId, pos: Position): Spot[] { return FORMATION_SLOTS[formation].filter((sp) => SPOT_LINE[sp] === pos); }

/** Quanto o jogador rende na vaga: força x adequação à função. */
const effective = (p: Player, slot: Spot) => p.strength * spotFit(spotOf(p), slot);

/**
 * Escolhe os 11 titulares para a formação, vaga por vaga: primeiro quem joga na função exata (o lateral direito vai para a lateral direita),
 * depois, nas vagas que sobrarem, o melhor jogador da linha mesmo fora da função (rende um pouco menos).
 */
export function autoLineup(players: Player[], formation: FormationId): string[] {
  const ids: string[] = [];
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
    const pool = players.filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength);
    const slots = slotsOfLine(formation, pos);
    const chosen = new Map<number, Player>();
    const taken = new Set<string>();
    slots.forEach((slot, i) => { const p = pool.find((q) => !taken.has(q.id) && spotOf(q) === slot); if (p) { chosen.set(i, p); taken.add(p.id); } }); // função exata
    slots.forEach((slot, i) => { if (chosen.has(i)) return; const p = pool.filter((q) => !taken.has(q.id)).sort((a, b) => effective(b, slot) - effective(a, slot))[0]; if (p) { chosen.set(i, p); taken.add(p.id); } });
    slots.forEach((_, i) => { const p = chosen.get(i); if (p) ids.push(p.id); });
  }
  return ids;
}

/** Em que vaga cada titular joga (escolhendo a distribuição que melhor aproveita as funções) e o quanto rende nela. */
export function assignSlots(team: Pick<TeamState, 'players' | 'lineup' | 'formation'>): { slot: Spot; player: Player; fit: number }[] {
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const xi = team.lineup.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const out: { slot: Spot; player: Player; fit: number }[] = [];
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
    const line = xi.filter((p) => p.pos === pos);
    const slots = slotsOfLine(team.formation, pos);
    const free = [...line];
    const placed = new Map<number, Player>();
    slots.forEach((slot, i) => { const k = free.findIndex((p) => spotOf(p) === slot); if (k >= 0) { placed.set(i, free[k]); free.splice(k, 1); } }); // função exata
    slots.forEach((slot, i) => { if (placed.has(i) || !free.length) return; free.sort((a, b) => effective(b, slot) - effective(a, slot)); placed.set(i, free.shift()!); }); // o resto: quem rende mais na vaga que sobrou
    slots.forEach((slot, i) => { const p = placed.get(i); if (p) out.push({ slot, player: p, fit: spotFit(spotOf(p), slot) }); });
    free.forEach((p) => out.push({ slot: spotOf(p), player: p, fit: 0.7 })); // sobra (escalação fora do padrão da formação)
  }
  return out;
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
  const placed = assignSlots(team);
  const avg = (pos: Position) => {
    const xs = placed.filter((x) => x.player.pos === pos).map((x) => x.player.strength * x.fit); // fora da função rende menos
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 30;
  };
  const gk = avg('GK'), def = avg('DEF'), mid = avg('MID'), att = avg('ATT');
  return { gk, def, mid, att, overall: Math.round((gk + def * 4 + mid * 4 + att * 2) / 11) };
}

export type { Rng };
