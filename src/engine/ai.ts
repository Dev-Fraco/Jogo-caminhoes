import { clamp, type Rng } from './rng';
import { rosterOk } from './roster';
import { DIVISION_INCOME } from './economy';
import { autoLineup, randomName } from './squad';
import { divisionIndexOf, playerValue } from './transfers';
import type { GameState, NewsItem, Player, Position, TeamState } from './types';

/**
 * A "IA" do jogo: todos os clubes, menos o do jogador, tomam as próprias decisões (contratar, vender, renovar o elenco).
 * Ela roda na virada de temporada (janela grande) e no meio do campeonato (janela pequena).
 */

/** Chance de um clube recém-promovido receber um investimento forte (e, com isso, ter boa chance de se manter na divisão). */
export const PROMOTED_STRONG_CHANCE = 0.65;
/** Chance de um clube recém-rebaixado entrar em crise financeira (orçamento cai pela metade e vende estrelas). */
export const RELEGATED_CRISIS_CHANCE = 0.35;
export const AI_MAX_SQUAD = 27;
export const SQUAD_TARGET = 24;
const TARGET_SHAPE: Record<Position, number> = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
const NEWS_LIMIT = 80;

export const fmtMoney = (v: number) => (v >= 1e6 ? `R$ ${(Math.round(v / 1e5) / 10).toString().replace('.', ',')} mi` : `R$ ${Math.round(v / 1e3)} mil`);
const round100k = (v: number) => Math.round(v / 100_000) * 100_000;

function shuffle<T>(a: T[], rng: Rng): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/** Evolução anual de um jogador: +1 ano e o overall muda conforme a idade (jovens evoluem, veteranos caem). */
export function developPlayer(p: Player, rng: Rng): Player {
  const age = p.age + 1;
  const d = age <= 21 ? 1 + Math.floor(rng() * 4) : age <= 24 ? Math.floor(rng() * 4) : age <= 28 ? Math.floor(rng() * 3) - 1 : age <= 31 ? -Math.floor(rng() * 3) : -(1 + Math.floor(rng() * 4));
  return { ...p, age, strength: clamp(p.strength + d, 25, 97) };
}

const avgXI = (t: TeamState) => {
  const xi = new Set(autoLineup(t.players, t.formation));
  const ps = t.players.filter((p) => xi.has(p.id));
  return ps.reduce((s, p) => s + p.strength, 0) / Math.max(1, ps.length);
};

/** Fim de carreira (para os clubes da IA): 37+ sempre; de 34 a 36 com 35% de chance, se o elenco continuar válido. */
function retire(players: Player[], rng: Rng): Player[] {
  let left = [...players];
  for (const p of [...players].sort((a, b) => b.age - a.age)) {
    if (p.age < 34) break;
    if (p.age >= 37 || rng() < 0.35) { const next = left.filter((x) => x.id !== p.id); if (rosterOk(next)) left = next; }
  }
  return left;
}

/** Categorias de base da IA: completa o elenco com garotos de 17 a 19 anos, em torno de 14 pontos abaixo do time titular. */
function youthIntake(team: TeamState, season: number, rng: Rng): Player[] {
  const players = [...team.players];
  const used = new Set(players.map((p) => p.name));
  const base = avgXI(team) - 14;
  const need = (pos: Position) => TARGET_SHAPE[pos] - players.filter((p) => p.pos === pos).length;
  let n = 0;
  while (players.length < SQUAD_TARGET) {
    const pos = [...POSITIONS].sort((a, b) => need(b) - need(a))[0];
    players.push({ id: `${team.clubId}-y${season}-${n++}`, name: randomName(rng, used), pos, age: 17 + Math.floor(rng() * 3), strength: clamp(Math.round(base + (rng() - 0.5) * 8), 25, 90) });
  }
  return players;
}

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, NEWS_LIMIT) });

/** Transfere um jogador entre dois clubes (dinheiro vai para o vendedor). */
function move(g: GameState, playerId: string, fromId: string, toId: string, fee: number): GameState {
  const from = g.teams[fromId], to = g.teams[toId];
  const p = from.players.find((x) => x.id === playerId)!;
  const left = from.players.filter((x) => x.id !== playerId);
  return {
    ...g,
    teams: { ...g.teams, [fromId]: { ...from, players: left, lineup: autoLineup(left, from.formation) }, [toId]: { ...to, players: [...to.players, p] } },
    budgets: { ...g.budgets, [fromId]: (g.budgets[fromId] ?? 0) + fee, [toId]: (g.budgets[toId] ?? 0) - fee },
  };
}

/** A IA dispensa os jogadores menos cotados até o elenco ficar com no máximo `size` jogadores (sempre respeitando o mínimo por posição). */
function trimSquad(g: GameState, clubId: string, size: number): GameState {
  let players = g.teams[clubId].players;
  while (players.length > size) {
    const cut = [...players].sort((a, b) => a.strength - b.strength).find((p) => rosterOk(players.filter((x) => x.id !== p.id)));
    if (!cut) break;
    players = players.filter((x) => x.id !== cut.id);
  }
  const t = g.teams[clubId];
  return players === t.players ? g : { ...g, teams: { ...g.teams, [clubId]: { ...t, players, lineup: autoLineup(players, t.formation) } } };
}

/**
 * Janela de transferências da IA. Cada clube (em ordem sorteada) tenta até `maxBuys` contratações:
 * procura a posição do seu time titular com o jogador mais fraco e compra, se couber no orçamento (até 60% dele),
 * o melhor jogador que seja pelo menos 4 pontos mais forte. O vendedor não vende titular, a não ser para clube de divisão mais alta.
 */
export function aiWindow(g: GameState, rng: Rng, maxBuys: number, only?: string[]): GameState {
  let s = g;
  const ai = shuffle(Object.keys(s.teams).filter((id) => id !== s.userClubId), rng);
  for (const buyerId of ai) {
    if (only && !only.includes(buyerId)) continue;
    for (let i = 0; i < maxBuys; i++) {
      // elenco cheio: dispensa o menos cotado para abrir vaga
      if (s.teams[buyerId].players.length >= AI_MAX_SQUAD) s = trimSquad(s, buyerId, AI_MAX_SQUAD - 1);
      const buyer = s.teams[buyerId];
      if (buyer.players.length >= AI_MAX_SQUAD) break;
      const cap = (s.budgets[buyerId] ?? 0) * 0.6;
      if (cap < 20_000) break;
      const bdi = divisionIndexOf(s, buyerId);
      const xi = new Set(autoLineup(buyer.players, buyer.formation));
      const weakest = (pos: Position) => Math.min(...buyer.players.filter((p) => p.pos === pos && xi.has(p.id)).map((p) => p.strength));
      type Cand = { id: string; from: string; price: number; strength: number };
      let best = null as Cand | null;
      for (const pos of [...POSITIONS].sort((a, b) => weakest(a) - weakest(b))) {
        const w = weakest(pos);
        for (const sellerId of ai) {
          if (sellerId === buyerId) continue;
          const seller = s.teams[sellerId];
          const sdi = divisionIndexOf(s, sellerId);
          if (sdi < bdi) continue; // clubes não compram de divisões acima da sua (o talento sobe, não desce)
          const sxi = new Set(autoLineup(seller.players, seller.formation));
          for (const p of seller.players) {
            if (p.pos !== pos || p.strength < w + 4 || p.age > 33) continue;
            if (sxi.has(p.id) && !(bdi < sdi)) continue; // titular só sai para clube de divisão mais alta
            const price = playerValue(p, sdi);
            if (price > cap || (best && p.strength <= best.strength)) continue;
            if (!rosterOk(seller.players.filter((x) => x.id !== p.id))) continue;
            best = { id: p.id, from: sellerId, price, strength: p.strength };
          }
        }
        if (best) break;
      }
      const deal = best as Cand | null;
      if (!deal) break;
      const p = s.teams[deal.from].players.find((x) => x.id === deal.id)!;
      s = move(s, deal.id, deal.from, buyerId, deal.price);
      if (p.strength >= 70 || deal.price >= 5_000_000) {
        s = news(s, `🔁 ${s.clubs[buyerId].name} contrata ${p.name} (${p.pos === 'GK' ? 'goleiro' : p.pos === 'DEF' ? 'defensor' : p.pos === 'MID' ? 'meia' : 'atacante'}, overall ${p.strength}) do ${s.clubs[deal.from].name} por ${fmtMoney(deal.price)}.`, 'info');
        s = { ...s, market: [{ season: s.season, round: s.round, text: `${s.clubs[buyerId].name} contrata ${p.name} (overall ${p.strength}) do ${s.clubs[deal.from].name} por ${fmtMoney(deal.price)}.` }, ...(s.market ?? [])].slice(0, 60) };
      }
    }
  }
  return s;
}

export interface OffseasonInput {
  /** clubes promovidos e a divisão (índice) em que jogarão */
  promoted: { clubId: string; to: number }[];
  relegated: { clubId: string; to: number }[];
}

/** Virada de temporada: evolução dos jogadores, investimento dos promovidos, crises dos rebaixados e janela grande da IA. */
export function offseason(g: GameState, rng: Rng, input: OffseasonInput): { state: GameState; promotion: NonNullable<import('./types').SeasonSummary['promotion']> } {
  // 1) todos envelhecem/evoluem; a IA ainda aposenta veteranos e renova com garotos da base
  const teams: GameState['teams'] = {};
  for (const [id, t] of Object.entries(g.teams)) {
    let players = t.players.map((p) => developPlayer(p, rng));
    if (id !== g.userClubId) { players = retire(players, rng); players = youthIntake({ ...t, players }, g.season, rng); }
    teams[id] = { ...t, players, lineup: id === g.userClubId ? t.lineup : autoLineup(players, t.formation) };
  }
  let s: GameState = { ...g, teams };

  // 2) clubes promovidos: sorteio do investimento (65% de chance de investimento forte)
  const promotion: { clubId: string; strong: boolean; bonus: number }[] = [];
  for (const { clubId, to } of input.promoted) {
    const strong = rng() < PROMOTED_STRONG_CHANCE;
    const base = DIVISION_INCOME[Math.min(to, DIVISION_INCOME.length - 1)];
    const bonus = Math.max(100_000, round100k(base * (strong ? 1 + rng() : 0.1 + 0.3 * rng())));
    s = { ...s, budgets: { ...s.budgets, [clubId]: (s.budgets[clubId] ?? 0) + bonus } };
    promotion.push({ clubId, strong, bonus });
    const name = s.clubs[clubId].name;
    s = news(s, strong ? `🔼 ${name} sobe e a diretoria investe forte: ${fmtMoney(bonus)} para reforçar o elenco.` : `🔼 ${name} sobe, mas a diretoria libera pouco dinheiro: ${fmtMoney(bonus)}.`, clubId === s.userClubId ? (strong ? 'good' : 'bad') : 'info');
  }

  // 3) clubes rebaixados (da IA): 35% entram em crise, perdem metade do orçamento e vendem as estrelas
  for (const { clubId } of input.relegated) {
    if (clubId === s.userClubId || rng() >= RELEGATED_CRISIS_CHANCE) continue;
    s = { ...s, budgets: { ...s.budgets, [clubId]: Math.round((s.budgets[clubId] ?? 0) * 0.5) } };
    const stars = [...s.teams[clubId].players].sort((a, b) => b.strength - a.strength).slice(0, 2);
    const sold: string[] = [];
    for (const p of stars) {
      const fee = playerValue(p, divisionIndexOf(s, clubId));
      const buyers = Object.keys(s.teams).filter((id) => id !== clubId && id !== s.userClubId && s.teams[id].players.length < AI_MAX_SQUAD && (s.budgets[id] ?? 0) >= fee);
      const left = s.teams[clubId].players.filter((x) => x.id !== p.id);
      if (!buyers.length || !rosterOk(left)) continue;
      s = move(s, p.id, clubId, buyers[Math.floor(rng() * buyers.length)], fee);
      sold.push(p.name);
    }
    s = news(s, `💸 ${s.clubs[clubId].name} cai e entra em crise financeira${sold.length ? `: vendeu ${sold.join(' e ')}` : ''}.`, 'info');
  }

  // 4) janela de transferências da IA: promovidos com investimento forte vão às compras primeiro (até 8 contratações); depois, todos (até 3)
  const strongIds = promotion.filter((p) => p.strong && p.clubId !== s.userClubId).map((p) => p.clubId);
  if (strongIds.length) s = aiWindow(s, rng, 8, strongIds);
  s = aiWindow(s, rng, 3);

  // 5) elenco enxuto: a IA dispensa o excedente (os menos cotados)
  for (const id of Object.keys(s.teams)) if (id !== s.userClubId) s = trimSquad(s, id, AI_MAX_SQUAD);
  return { state: s, promotion };
}
