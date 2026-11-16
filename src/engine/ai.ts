import { clamp, hashString, type Rng } from './rng';
import { managed } from './lookup';
import { repairLineup, rosterOk } from './roster';
import { DIVISION_INCOME, inflate, priceIndex, SEASON_INCOME_FACTOR } from './economy';
import { autoLineup, pickSpot, randomName, spotOf } from './squad';
import { divisionIndexOf, playerValue } from './transfers';
import { avgXI, clubProfile, profileCtx, signingScore, type ClubProfile } from './aiprofile';
import { longInjured, needLabel, RETIRING_AGE, squadNeeds, type Need } from './aineeds';
import { baseWage, payrollOf } from './finance';
import { aiTrade, installmentPlan } from './aitrade';
import { goalStatus } from './aigoals';
import { aiBalanceSquads, squadLimits } from './aisquad';
import { aiLoanWindow, aiPromoteYouth, developYouth, ensureAiYouth, loanedIds, returnAiLoans } from './aiyouth';
import { aiRenewals, aiSignFreeAgents, agedFreeAgents, newContract, WAGE_LIMIT } from './aicontracts';
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
    players.push({ id: `${team.clubId}-y${season}-${n++}`, name: randomName(rng, used), pos, spot: pickSpot(players, pos), age: 17 + Math.floor(rng() * 3), strength: clamp(Math.round(base + (rng() - 0.5) * 8), 25, 90) });
  }
  return players;
}

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, NEWS_LIMIT) });

/** Transfere um jogador entre dois clubes (dinheiro vai para o vendedor). */
export function move(g: GameState, playerId: string, fromId: string, toId: string, fee: number): GameState {
  const from = g.teams[fromId], to = g.teams[toId];
  const p0 = from.players.find((x) => x.id === playerId)!;
  const p = { ...p0, contract: newContract(g, toId, p0) }; // contrato novo no clube que contrata (salário e prazo da realidade dele)
  const left = from.players.filter((x) => x.id !== playerId);
  return {
    ...g,
    teams: { ...g.teams, [fromId]: { ...from, players: left, lineup: autoLineup(left, from.formation) }, [toId]: { ...to, players: [...to.players, p] } },
    budgets: { ...g.budgets, [fromId]: (g.budgets[fromId] ?? 0) + fee, [toId]: (g.budgets[toId] ?? 0) - fee },
    aiMoves: { ...(g.aiMoves ?? {}), [playerId]: { season: g.season, round: g.round, from: fromId, to: toId } }, // anti-repetição: o mesmo jogador não roda pelo mercado
  };
}

/**
 * Elenco acima do limite: libera os excedentes para o mercado de jogadores livres (nunca apaga ninguém), começando pelas posições acima do ideal
 * e pelos mais fracos, e sempre respeitando o mínimo por posição. `maxCuts` limita quantos saem de uma vez (elencos cadastrados grandes encolhem aos poucos).
 */
function trimSquad(g: GameState, clubId: string, size: number, maxCuts = 12): GameState {
  const L = squadLimits(g);
  let players = g.teams[clubId].players;
  const freed: Player[] = [];
  const loaned = loanedIds(g);
  const xi = new Set(autoLineup(players, g.teams[clubId].formation));
  while (players.length > size && freed.length < maxCuts) {
    const count = (pos: Position) => players.filter((p) => p.pos === pos).length;
    const cut = [...players].filter((p) => !loaned.has(p.id)).sort((a, b) => ((xi.has(a.id) ? 1 : 0) - (xi.has(b.id) ? 1 : 0)) || (count(b.pos) - L.pos[b.pos].ideal) - (count(a.pos) - L.pos[a.pos].ideal) || a.strength - b.strength).find((p) => rosterOk(players.filter((x) => x.id !== p.id)) && count(p.pos) > L.pos[p.pos].min);
    if (!cut) break;
    players = players.filter((x) => x.id !== cut.id);
    const { contract: _c, ...free } = cut;
    freed.push(free);
  }
  const t = g.teams[clubId];
  return players === t.players ? g : { ...g, freeAgents: [...(g.freeAgents ?? []), ...freed], teams: { ...g.teams, [clubId]: { ...t, players, lineup: autoLineup(players, t.formation) } } };
}

/** Quantos clubes vendedores cada comprador consulta por janela (amostra) quando o universo é grande: mantém a janela rápida com centenas de clubes. */
export const SELLER_POOL = 90;
/**
 * Frequência com que o clube vai ao mercado (0,25 a 1): depende do porte, da situação financeira e de uma tendência própria do clube,
 * então nem todos negociam com a mesma frequência. Necessidade urgente (falta de gente numa posição) ignora isso.
 */
export function clubActivity(clubId: string, prof: ClubProfile): number {
  const base = prof.tier === 'gigante' ? 0.85 : prof.tier === 'medio' ? 0.7 : 0.55;
  const trait = (hashString(`${clubId}:atividade`) % 100) / 100 * 0.3 - 0.15;
  return Math.max(0.25, Math.min(1, base + trait + (prof.financial === 'crise' ? -0.2 : 0)));
}

/** Quantas contratações um clube faz por janela, no máximo, conforme o porte (além do limite de cada janela e das necessidades reais). */
export const maxBuysFor = (p: ClubProfile) => (p.tier === 'gigante' ? 6 : p.tier === 'medio' ? 4 : 3);
/** Folga da folha salarial por porte: gigantes aceitam passar um pouco da receita-base, pequenos não. */
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
  const onLoan = loanedIds(s); // jogadores emprestados (seus ou entre clubes da IA): ninguém os vende
  const ai = shuffle(Object.keys(s.teams).filter((id) => !managed(s, id)), rng);
  const startersSold = new Map<string, number>(); // titulares vendidos por clube nesta janela
  const refusals: { seller: string; buyer: string; player: Player; offer: number }[] = [];
  for (const buyerId of ai) {
    if (only && !only.includes(buyerId)) continue;
    let bought = 0, failures = 0;
    const tried = new Set<string>();
    const pool = ai.length > SELLER_POOL ? shuffle(ai, rng).slice(0, SELLER_POOL) : ai;
    while (bought < maxBuys) {
      // elenco cheio: dispensa o menos cotado para abrir vaga
      if (s.teams[buyerId].players.length >= AI_MAX_SQUAD) s = trimSquad(s, buyerId, AI_MAX_SQUAD - 1);
      const buyer = s.teams[buyerId];
      if (buyer.players.length >= AI_MAX_SQUAD) break;
      const prof = clubProfile(s, buyerId, ctx);
      if (bought >= Math.max(maxBuysFor(prof), maxBuys > 3 ? maxBuys : 0)) break; // promovido com investimento forte (janela de 8) não leva o teto do porte
      const cap = (s.budgets[buyerId] ?? 0) * prof.spendShare;
      if (cap < 20_000) break;
      const gs = goalStatus(s, buyerId); // objetivo e momento do clube mudam o jeito de contratar
      const needs = squadNeeds(s, buyerId, prof, { upgrade: maxBuys > 3 || gs.mode === 'disputa', divisionLevel: ctx.divAvg.get(divisionIndexOf(s, buyerId)) });
      if (!needs.length) break;
      if (bought === 0 && !only && needs[0].priority < 100 && rng() > clubActivity(buyerId, prof) * (maxBuys === 1 ? 0.7 : 1)) break; // este clube não vai ao mercado agora
      const bdi = divisionIndexOf(s, buyerId);
      const level = ctx.xi.get(buyerId) ?? avgXI(buyer);
      const wageRoom = prof.revenue * WAGE_LIMIT[prof.tier] * (maxBuys > 3 ? 1.35 : 1) - payrollOf(s, buyerId); // investimento forte de promovido também libera folha
      type Cand = { id: string; from: string; price: number; strength: number; score: number; need: Need; st: Stance; plan: number };
      let best = null as Cand | null;
      const xi = new Set(autoLineup(buyer.players, buyer.formation));
      for (const need of needs) {
        const weak = Math.min(...buyer.players.filter((p) => p.pos === need.pos && xi.has(p.id)).map((p) => p.strength));
        for (const sellerId of pool) {
          if (sellerId === buyerId) continue;
          const seller = s.teams[sellerId];
          const sdi = divisionIndexOf(s, sellerId);
          if (sdi < bdi) continue; // clubes não compram de divisões acima da sua (o talento sobe, não desce)
          for (const p of seller.players) {
            if (p.pos !== need.pos || (need.spot && spotOf(p) !== need.spot) || p.strength < need.minStrength || p.age > need.maxAge || p.age >= RETIRING_AGE) continue;
            if (onLoan.has(p.id) || recentlyMoved(s, p.id) || soldByBuyer(s, p.id, buyerId) || longInjured(s, p.id)) continue;
            if (p.strength > level + STAR_CEILING[prof.tier]) continue; // astro grande demais para o porte do clube
            // o vendedor avalia: importância do jogador, substituto, posição, valor e finanças (aisales.ts)
            const st = stance(s, sellerId, p, buyerId, ctx, startersSold.get(sellerId) ?? 0);
            const price = Math.max(10_000, Math.round((marketValue(s, sellerId, p) * st.ask) / 10_000) * 10_000);
            if (!st.willing) { if (st.refusal === 'fundamental' && p.strength >= 72 && price <= cap) refusals.push({ seller: sellerId, buyer: buyerId, player: p, offer: Math.round(marketValue(s, sellerId, p) * 1.3) }); continue; }
            if (tried.has(`${buyerId}:${p.id}`)) continue;                       // já tentou nesta janela e não deu
            const capM = cap * (gs.mode === 'disputa' ? 1.25 : 1);
            const plan = price <= capM ? 1 : price <= capM * 1.8 ? installmentPlan(s, buyerId, price) : 1; // sem caixa para pagar à vista: tenta parcelar
            if ((price > capM && plan < 2) || baseWage(s, buyerId, p) > wageRoom) continue; // não cabe no caixa nem na folha
            const gain = need.forStarter && Number.isFinite(weak) ? p.strength - weak : Math.max(1, p.strength - need.minStrength);
            let score = signingScore(prof, gain, price, p.age);
            if (gs.mode === 'sobrevivencia') score *= p.age >= 26 && p.age <= 33 ? 1.3 : p.age <= 21 ? 0.7 : 1; // fugindo do rebaixamento: experiência
            else if (gs.mode === 'disputa') score = (score + Math.max(0, gain) * 0.6) * (p.age <= 21 && gain < 4 ? 0.7 : 1); // disputando algo: reforço que melhora já
            if (best && score <= best.score) continue;
            if (!rosterOk(seller.players.filter((x) => x.id !== p.id))) continue;
            best = { id: p.id, from: sellerId, price, strength: p.strength, score, need, st, plan };
          }
        }
        if (best) break; // a necessidade mais urgente que tem alguém disponível
      }
      const deal = best as Cand | null;
      if (!deal) break;
      const p = s.teams[deal.from].players.find((x) => x.id === deal.id)!;
      tried.add(`${buyerId}:${p.id}`);
      const why = `${deal.need.reasons.includes('falta-gente') || deal.need.reasons.includes('falta-funcao') ? 'falta de' : deal.need.reasons.includes('titular-fraco') ? 'reforço de titular em' : 'reposição de'} ${needLabel(deal.need)}${gs.mode === 'sobrevivencia' ? ' · experiência contra o rebaixamento' : gs.mode === 'disputa' && p.strength >= 70 ? ' · reforço para a briga lá em cima' : ''}`;
      const tr = aiTrade(s, { kind: 'compra', playerId: deal.id, buyerId, fee: deal.price, reason: why, installments: deal.plan > 1 ? deal.plan : undefined });
      if (!tr.ok) { if (++failures >= 3) break; continue; }       // sem acordo: tenta outro jogador (no máximo 3 tentativas por clube)
      s = tr.state;
      forgetClub(ctx, deal.from); forgetClub(ctx, buyerId);
      bought++;
      if (deal.st.role === 'craque' || deal.st.role === 'titular') startersSold.set(deal.from, (startersSold.get(deal.from) ?? 0) + 1);
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
  const onLoan = loanedIds(s);
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
        const need = needsOf(b).find((n) => n.pos === p.pos);
        const why = `${need ? (need.reasons.includes('falta-gente') ? 'falta de ' : 'reposição de ') + needLabel(need) : 'oportunidade de mercado'} · vendedor: ${st.reasons.includes('fim-contrato') ? 'fim de contrato' : st.reasons.includes('financas') && broke ? 'equilibrar as contas' : st.reasons.includes('salario-alto') ? 'salário alto' : 'sem espaço no elenco'}`;
        const tr = aiTrade(s, { kind: 'compra', playerId: p.id, buyerId: b, fee, reason: why });
        if (!tr.ok) continue;
        s = tr.state;
        needCache.delete(b); forgetClub(ctx, id); forgetClub(ctx, b);
        if (st.role === 'craque' || st.role === 'titular') startersSold.set(id, (startersSold.get(id) ?? 0) + 1);
        sales++; done = true;
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
  g = returnAiLoans(g); // emprestados voltam ao dono antes da evolução
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
      const tr = aiTrade(s, { kind: 'compra', playerId: p.id, buyerId: buyers[Math.floor(rng() * buyers.length)], fee, reason: 'oportunidade de mercado · vendedor: crise financeira' });
      if (!tr.ok) continue;
      s = tr.state;
      sold.push(p.name);
    }
    s = news(s, `💸 ${s.clubs[clubId].name} cai e entra em crise financeira${sold.length ? `: vendeu ${sold.join(' e ')}` : ''}.`, 'info');
  }

  s = developYouth(ensureAiYouth(s, rng), rng); // a base cresce e recebe garotos novos
  // 3b) contratos: os que acabaram são renovados (quem vale a pena) ou liberados; livres envelhecem e podem ser contratados
  s = { ...s, freeAgents: agedFreeAgents(s, rng) };
  s = aiRenewals(s, rng, 'virada', s.season - 1);

  s = aiPromoteYouth(s, rng); // a base resolve o que puder antes de ir ao mercado

  // 4) janela de transferências da IA: promovidos com investimento forte vão às compras primeiro (até 8 contratações); depois, todos (até 3)
  s = aiBalanceBooks(s, rng); // clubes apertados vendem para fechar as contas
  const strongIds = promotion.filter((p) => p.strong && !managed(s, p.clubId)).map((p) => p.clubId);
  if (strongIds.length) s = aiWindow(s, rng, 8, strongIds);
  s = aiWindow(s, rng, 3);
  s = aiSignFreeAgents(s, rng, 2);
  s = aiLoanWindow(s, rng, 1); // jovens sem espaço vão jogar em outros clubes
  s = aiBalanceSquads(s, rng); // excesso numa posição: vende ou libera (ninguém é apagado)
  s = aiSignFreeAgents(s, rng, 1); // quem precisa de posição pode pegar os recém-liberados

  // 5) elenco enxuto: a IA dispensa o excedente (os menos cotados)
  for (const id of Object.keys(s.teams)) if (!managed(s, id)) s = trimSquad(s, id, squadLimits(s).total.max, 4);
  return { state: s, promotion };
}
