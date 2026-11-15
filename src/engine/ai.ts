import { clamp, type Rng } from './rng';
import { managed } from './lookup';
import { repairLineup, rosterOk } from './roster';
import { DIVISION_INCOME, inflate, priceIndex, SEASON_INCOME_FACTOR } from './economy';
import { autoLineup, randomName } from './squad';
import { divisionIndexOf, playerValue } from './transfers';
import { avgXI, clubProfile, profileCtx, signingScore, type ClubProfile } from './aiprofile';
import { longInjured, RETIRING_AGE, squadNeeds, type Need } from './aineeds';
import { baseWage, payrollOf } from './finance';
import { forgetClub, marketValue, saleReasons, stance, type Stance } from './aisales';
import type { GameState, NewsItem, Player, Position, RetiredPlayer, TeamState } from './types';

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

/** Fim de carreira (para os clubes da IA): 37+ sempre; de 34 a 36 com 35% de chance, se o elenco continuar válido. */
function retire(players: Player[], rng: Rng): { left: Player[]; retired: Player[] } {
  let left = [...players];
  const retired: Player[] = [];
  for (const p of [...players].sort((a, b) => b.age - a.age)) {
    if (p.age < 34) break;
    if (p.age >= 37 || rng() < 0.35) { const next = left.filter((x) => x.id !== p.id); if (rosterOk(next)) { left = next; retired.push(p); } }
  }
  return { left, retired };
}

/** Aposentadoria no seu clube: 38+ sempre; de 35 a 37 com 40% de chance. O elenco nunca fica abaixo do mínimo. */
export function retireUser(players: Player[], rng: Rng): { left: Player[]; retired: Player[] } {
  let left = [...players];
  const retired: Player[] = [];
  for (const p of [...players].sort((a, b) => b.age - a.age)) {
    if (p.age < 35) break;
    if (p.age >= 38 || rng() < 0.4) { const next = left.filter((x) => x.id !== p.id); if (rosterOk(next)) { left = next; retired.push(p); } }
  }
  return { left, retired };
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
    aiMoves: { ...(g.aiMoves ?? {}), [playerId]: { season: g.season, round: g.round, from: fromId, to: toId } }, // anti-repetição: o mesmo jogador não roda pelo mercado
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

/** Quantas contratações um clube faz por janela, no máximo, conforme o porte (além do limite de cada janela e das necessidades reais). */
export const maxBuysFor = (p: ClubProfile) => (p.tier === 'gigante' ? 6 : p.tier === 'medio' ? 4 : 3);
/** Folga da folha salarial por porte: gigantes aceitam passar um pouco da receita-base, pequenos não. */
const WAGE_LIMIT = { gigante: 1.2, medio: 1.05, pequeno: 0.95 } as const;
/** Quanto acima do nível do time (nota dos titulares) cada porte aceita contratar: o pequeno não vai atrás de astros. */
const STAR_CEILING = { gigante: 22, medio: 12, pequeno: 8 } as const;

/** O jogador mudou de clube nesta temporada (por uma transferência da IA)? Então não volta ao mercado agora. */
const recentlyMoved = (g: GameState, playerId: string) => { const m = g.aiMoves?.[playerId]; return !!m && m.season >= g.season; };
/** O comprador vendeu este jogador há pouco (até 2 temporadas)? Então não o recompra. */
const soldByBuyer = (g: GameState, playerId: string, buyerId: string) => { const m = g.aiMoves?.[playerId]; return !!m && m.from === buyerId && g.season - m.season <= 2; };
const pruneMoves = (g: GameState): GameState => (g.aiMoves ? { ...g, aiMoves: Object.fromEntries(Object.entries(g.aiMoves).filter(([, m]) => g.season - m.season <= 2)) } : g);

/**
 * Janela de transferências da IA. Cada clube (em ordem sorteada) analisa o PRÓPRIO elenco (aineeds.ts): falta de gente numa posição,
 * titular fraco, veterano, aposentadoria à vista, lesão longa e reposição de quem saiu. Só vai ao mercado onde há necessidade,
 * da mais urgente para a menos, e no máximo `maxBuys` vezes (e o teto do porte). A escolha segue a personalidade (aiprofile.ts) e a realidade do clube:
 * cabe no caixa (gasto por negócio do perfil), cabe na folha salarial, não é um astro grande demais para o porte, não vem lesionado nem perto
 * da aposentadoria, não foi negociado nesta temporada e não é um jogador que o próprio clube vendeu há pouco. O vendedor não vende titular, a não ser
 * para clube de divisão mais alta, nem fica sem o mínimo na posição.
 */
export function aiWindow(g: GameState, rng: Rng, maxBuys: number, only?: string[]): GameState {
  let s = pruneMoves(g);
  const ctx = profileCtx(s);
  const onLoan = new Set(s.loans.map((l) => l.playerId)); // jogadores seus emprestados: o clube que os recebeu não pode vendê-los
  const ai = shuffle(Object.keys(s.teams).filter((id) => !managed(s, id)), rng);
  const startersSold = new Map<string, number>(); // titulares vendidos por clube nesta janela
  const refusals: { seller: string; buyer: string; player: Player; offer: number }[] = [];
  for (const buyerId of ai) {
    if (only && !only.includes(buyerId)) continue;
    let bought = 0;
    while (bought < maxBuys) {
      // elenco cheio: dispensa o menos cotado para abrir vaga
      if (s.teams[buyerId].players.length >= AI_MAX_SQUAD) s = trimSquad(s, buyerId, AI_MAX_SQUAD - 1);
      const buyer = s.teams[buyerId];
      if (buyer.players.length >= AI_MAX_SQUAD) break;
      const prof = clubProfile(s, buyerId, ctx);
      if (bought >= Math.max(maxBuysFor(prof), maxBuys > 3 ? maxBuys : 0)) break; // promovido com investimento forte (janela de 8) não leva o teto do porte
      const cap = (s.budgets[buyerId] ?? 0) * prof.spendShare;
      if (cap < 20_000) break;
      const needs = squadNeeds(s, buyerId, prof, { upgrade: maxBuys > 3, divisionLevel: ctx.divAvg.get(divisionIndexOf(s, buyerId)) });
      if (!needs.length) break;
      const bdi = divisionIndexOf(s, buyerId);
      const level = ctx.xi.get(buyerId) ?? avgXI(buyer);
      const wageRoom = prof.revenue * WAGE_LIMIT[prof.tier] * (maxBuys > 3 ? 1.35 : 1) - payrollOf(s, buyerId); // investimento forte de promovido também libera folha
      type Cand = { id: string; from: string; price: number; strength: number; score: number; need: Need; st: Stance };
      let best = null as Cand | null;
      const xi = new Set(autoLineup(buyer.players, buyer.formation));
      for (const need of needs) {
        const weak = Math.min(...buyer.players.filter((p) => p.pos === need.pos && xi.has(p.id)).map((p) => p.strength));
        for (const sellerId of ai) {
          if (sellerId === buyerId) continue;
          const seller = s.teams[sellerId];
          const sdi = divisionIndexOf(s, sellerId);
          if (sdi < bdi) continue; // clubes não compram de divisões acima da sua (o talento sobe, não desce)
          for (const p of seller.players) {
            if (p.pos !== need.pos || p.strength < need.minStrength || p.age > need.maxAge || p.age >= RETIRING_AGE) continue;
            if (onLoan.has(p.id) || recentlyMoved(s, p.id) || soldByBuyer(s, p.id, buyerId) || longInjured(s, p.id)) continue;
            if (p.strength > level + STAR_CEILING[prof.tier]) continue; // astro grande demais para o porte do clube
            // o vendedor avalia: importância do jogador, substituto, posição, valor e finanças (aisales.ts)
            const st = stance(s, sellerId, p, buyerId, ctx, startersSold.get(sellerId) ?? 0);
            const price = Math.max(10_000, Math.round((marketValue(s, sellerId, p) * st.ask) / 10_000) * 10_000);
            if (!st.willing) { if (st.refusal === 'fundamental' && p.strength >= 72 && price <= cap) refusals.push({ seller: sellerId, buyer: buyerId, player: p, offer: Math.round(marketValue(s, sellerId, p) * 1.3) }); continue; }
            if (price > cap || baseWage(s, buyerId, p) > wageRoom) continue; // não cabe no caixa nem na folha
            const gain = need.forStarter && Number.isFinite(weak) ? p.strength - weak : Math.max(1, p.strength - need.minStrength);
            const score = signingScore(prof, gain, price, p.age);
            if (best && score <= best.score) continue;
            if (!rosterOk(seller.players.filter((x) => x.id !== p.id))) continue;
            best = { id: p.id, from: sellerId, price, strength: p.strength, score, need, st };
          }
        }
        if (best) break; // a necessidade mais urgente que tem alguém disponível
      }
      const deal = best as Cand | null;
      if (!deal) break;
      const p = s.teams[deal.from].players.find((x) => x.id === deal.id)!;
      s = move(s, deal.id, deal.from, buyerId, deal.price);
      forgetClub(ctx, deal.from); forgetClub(ctx, buyerId);
      bought++;
      if (deal.st.role === 'craque' || deal.st.role === 'titular') startersSold.set(deal.from, (startersSold.get(deal.from) ?? 0) + 1);
      if (p.strength >= 70 || deal.price >= 5_000_000) {
        s = news(s, `🔁 ${s.clubs[buyerId].name} contrata ${p.name} (${p.pos === 'GK' ? 'goleiro' : p.pos === 'DEF' ? 'defensor' : p.pos === 'MID' ? 'meia' : 'atacante'}, overall ${p.strength}) do ${s.clubs[deal.from].name} por ${fmtMoney(deal.price)}.`, 'info');
        s = { ...s, market: [{ season: s.season, round: s.round, text: `${s.clubs[buyerId].name} contrata ${p.name} (overall ${p.strength}) do ${s.clubs[deal.from].name} por ${fmtMoney(deal.price)}.` }, ...(s.market ?? [])].slice(0, 60) };
      }
    }
  }
  // propostas recusadas por jogadores fundamentais (só quem não acabou comprando o próprio jogador): vira notícia de mercado
  const done = new Set(Object.keys(s.aiMoves ?? {}));
  for (const r of refusals.filter((x) => !done.has(x.player.id)).slice(0, 2)) {
    const text = `${s.clubs[r.seller].name} recusa ${fmtMoney(r.offer)} do ${s.clubs[r.buyer].name} por ${r.player.name}: peça fundamental, sem substituto à altura.`;
    s = { ...s, market: [{ season: s.season, round: s.round, text }, ...(s.market ?? [])].slice(0, 60) };
  }
  return s;
}

/**
 * Vendas por iniciativa do clube (na virada de temporada). Vende quem tem motivo: contas apertadas (principalmente o clube pequeno),
 * jogador sem espaço ou fora dos planos, salário alto, fim de contrato ou excedente na posição. Cada venda passa pela avaliação do clube
 * (aisales.ts: importância, substituto, posição, valor e finanças): nunca desmonta o time nem vende peça fundamental sem substituto.
 * O comprador é um clube que PRECISA da posição (e pode pagar); só o clube em crise aceita vender para quem não precisa, para fechar o caixa.
 */
export function aiBalanceBooks(g: GameState, rng: Rng): GameState {
  let s = pruneMoves(g);
  const ctx = profileCtx(s);
  const onLoan = new Set(s.loans.map((l) => l.playerId));
  const needCache = new Map<string, Need[]>();
  const needsOf = (id: string) => { let n = needCache.get(id); if (!n) needCache.set(id, (n = squadNeeds(s, id, clubProfile(s, id, ctx)))); return n; };
  const startersSold = new Map<string, number>();
  for (const id of shuffle(Object.keys(s.teams).filter((x) => !managed(s, x)), rng)) {
    const prof = clubProfile(s, id, ctx);
    const di = divisionIndexOf(s, id);
    const broke = prof.sellPressure >= 0.5 && (s.budgets[id] ?? 0) <= prof.revenue * 0.35;
    const team = s.teams[id];
    const rows = team.players.filter((p) => !onLoan.has(p.id) && !recentlyMoved(s, p.id)).map((p) => ({ p, reasons: saleReasons(s, id, p, prof, ctx), value: marketValue(s, id, p) }));
    // quem o clube quer ver pelas costas, do mais ao menos prioritário
    const wanted = broke ? rows : rows.filter((r) => r.reasons.some((x) => x === 'fim-contrato' || x === 'fora-dos-planos' || x === 'salario-alto'));
    wanted.sort((a, b) => (b.reasons.includes('fim-contrato') ? 1 : 0) - (a.reasons.includes('fim-contrato') ? 1 : 0) || b.value - a.value);
    let sales = 0;
    const maxSales = broke ? (prof.financial === 'crise' ? 2 : 1) : 1;
    for (const { p } of wanted) {
      if (sales >= maxSales) break;
      const others = Object.keys(s.teams).filter((b) => b !== id && !managed(s, b) && divisionIndexOf(s, b) <= di + 1 && s.teams[b].players.length < AI_MAX_SQUAD && !soldByBuyer(s, p.id, b));
      let done = false;
      for (const b of shuffle(others, rng)) {
        const st = stance(s, id, p, b, ctx, startersSold.get(id) ?? 0);
        if (!st.willing) continue;
        const fee = Math.max(10_000, Math.round((marketValue(s, id, p) * st.ask) / 10_000) * 10_000);
        if ((s.budgets[b] ?? 0) < fee * 1.5) continue;
        const wants = needsOf(b).some((n) => n.pos === p.pos); // o comprador precisa da posição
        if (!wants && prof.financial !== 'crise') continue;
        if (!rosterOk(s.teams[id].players.filter((x) => x.id !== p.id))) continue;
        s = move(s, p.id, id, b, fee);
        needCache.delete(b); forgetClub(ctx, id); forgetClub(ctx, b);
        if (st.role === 'craque' || st.role === 'titular') startersSold.set(id, (startersSold.get(id) ?? 0) + 1);
        sales++; done = true;
        if (p.strength >= 65 || fee >= 1_000_000) {
          const why = st.reasons.includes('fim-contrato') ? 'fim de contrato' : st.reasons.includes('financas') && broke ? 'para equilibrar as contas' : st.reasons.includes('salario-alto') ? 'salário alto' : 'sem espaço no elenco';
          s = news(s, `💸 ${s.clubs[id].name} vende ${p.name} (overall ${p.strength}) ao ${s.clubs[b].name} por ${fmtMoney(fee)}: ${why}.`, 'info');
        }
        break;
      }
      if (!done) continue;
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
  const retiredNow: RetiredPlayer[] = [];
  for (const [id, t] of Object.entries(g.teams)) {
    let players = t.players.map((p) => developPlayer(p, rng));
    if (!managed(g, id)) { const r = retire(players, rng); players = r.left; retiredNow.push(...r.retired.map((p) => ({ name: p.name, age: p.age, pos: p.pos, strength: p.strength, clubId: id, season: g.season - 1 }))); players = youthIntake({ ...t, players }, g.season, rng); }
    else { const r = retireUser(players, rng); players = r.left; retiredNow.push(...r.retired.map((p) => ({ name: p.name, age: p.age, pos: p.pos, strength: p.strength, clubId: id, season: g.season - 1 }))); }
    teams[id] = { ...t, players, lineup: managed(g, id) ? repairLineup({ ...t, players }).lineup : autoLineup(players, t.formation) };
  }
  let s: GameState = { ...g, teams, retired: [...retiredNow, ...(g.retired ?? [])].slice(0, 200) };
  const mineRetired = retiredNow.filter((r) => r.clubId === g.userClubId && !g.unemployed);
  if (mineRetired.length) s = news(s, `🧓 Aposentados do seu clube: ${mineRetired.map((r) => `${r.name} (${r.age} anos)`).join(', ')}.`, 'info');
  const stars = retiredNow.filter((r) => r.strength >= 80 && r.clubId !== g.userClubId).slice(0, 3);
  if (stars.length) s = news(s, `🧓 Aposentadoria: ${stars.map((r) => `${r.name} (${r.age} anos, overall ${r.strength})`).join(', ')}.`, 'info');

  // 2) clubes promovidos: sorteio do investimento (65% de chance de investimento forte)
  const promotion: { clubId: string; strong: boolean; bonus: number }[] = [];
  for (const { clubId, to } of input.promoted) {
    const strong = rng() < PROMOTED_STRONG_CHANCE;
    const base = DIVISION_INCOME[Math.min(to, DIVISION_INCOME.length - 1)] * SEASON_INCOME_FACTOR * priceIndex(s);
    const bonus = Math.max(100_000, round100k(base * (strong ? 1 + rng() : 0.1 + 0.3 * rng())));
    s = { ...s, budgets: { ...s.budgets, [clubId]: (s.budgets[clubId] ?? 0) + bonus } };
    promotion.push({ clubId, strong, bonus });
    const name = s.clubs[clubId].name;
    s = news(s, strong ? `🔼 ${name} sobe e a diretoria investe forte: ${fmtMoney(bonus)} para reforçar o elenco.` : `🔼 ${name} sobe, mas a diretoria libera pouco dinheiro: ${fmtMoney(bonus)}.`, managed(s, clubId) ? (strong ? 'good' : 'bad') : 'info');
  }

  // 3) clubes rebaixados (da IA): 35% entram em crise, perdem metade do orçamento e vendem as estrelas
  for (const { clubId } of input.relegated) {
    if (managed(s, clubId) || rng() >= RELEGATED_CRISIS_CHANCE) continue;
    s = { ...s, budgets: { ...s.budgets, [clubId]: Math.round((s.budgets[clubId] ?? 0) * 0.5) } };
    const stars = [...s.teams[clubId].players].sort((a, b) => b.strength - a.strength).slice(0, 2);
    const sold: string[] = [];
    for (const p of stars) {
      const fee = inflate(s, playerValue(p, divisionIndexOf(s, clubId)));
      const buyers = Object.keys(s.teams).filter((id) => id !== clubId && !managed(s, id) && s.teams[id].players.length < AI_MAX_SQUAD && (s.budgets[id] ?? 0) >= fee);
      const left = s.teams[clubId].players.filter((x) => x.id !== p.id);
      if (!buyers.length || !rosterOk(left)) continue;
      s = move(s, p.id, clubId, buyers[Math.floor(rng() * buyers.length)], fee);
      sold.push(p.name);
    }
    s = news(s, `💸 ${s.clubs[clubId].name} cai e entra em crise financeira${sold.length ? `: vendeu ${sold.join(' e ')}` : ''}.`, 'info');
  }

  // 4) janela de transferências da IA: promovidos com investimento forte vão às compras primeiro (até 8 contratações); depois, todos (até 3)
  s = aiBalanceBooks(s, rng); // clubes apertados vendem para fechar as contas
  const strongIds = promotion.filter((p) => p.strong && !managed(s, p.clubId)).map((p) => p.clubId);
  if (strongIds.length) s = aiWindow(s, rng, 8, strongIds);
  s = aiWindow(s, rng, 3);

  // 5) elenco enxuto: a IA dispensa o excedente (os menos cotados)
  for (const id of Object.keys(s.teams)) if (!managed(s, id)) s = trimSquad(s, id, AI_MAX_SQUAD);
  return { state: s, promotion };
}
