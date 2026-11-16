import { aiWindow, maxBuysFor } from './ai';
import { avgXI, clubProfile, profileCtx } from './aiprofile';
import { longInjured, needLabel, squadNeeds } from './aineeds';
import { aiSignFreeAgents } from './aicontracts';
import { aiLoanWindow } from './aiyouth';
import { marketValue, roleOf, saleReasons } from './aisales';
import { aiTrade, installmentPlan, seasonEndDay } from './aitrade';
import { calOf } from './calendar';
import { openDeal } from './deals';
import { activeDeals, fmt, locate } from './dealeval';
import { makeInstallments } from './dealpay';
import { baseWage } from './finance';
import { managed } from './lookup';
import { notifyPhone } from './phone';
import { hashString, makeRng, type Rng } from './rng';
import { MAX_OPEN_OFFERS, OFFER_CHANCE, rosterOk, STAR_COUNT, STAR_INTEREST } from './roster';
import { autoLineup, spotOf } from './squad';
import { divisionIndexOf, MAX_SQUAD } from './transfers';
import { transferBlock } from './windows';
import type { AgentOffer, GameState, Mood, NewsItem, Offer, Player } from './types';

/* =====================================================================
   Mercado da IA em tempo real: a cada poucos dias da carreira, uma parte dos clubes (por frequência própria) analisa o elenco e negocia;
   clubes colocam jogadores à venda; jogadores ficam insatisfeitos por motivos reais; agentes oferecem seus representados a quem precisa.
   Cada dia é processado uma única vez (salvar/carregar/redesenhar a tela não repete decisões).
   ===================================================================== */

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const aiIds = (g: GameState) => Object.keys(g.teams).filter((id) => !managed(g, id));
const today = (g: GameState) => calOf(g).day;
export const TICK_EVERY = 4;                 // dias entre as rodadas de decisão da IA
export const URGENT = 60;                    // prioridade mínima da necessidade para ir ao mercado no dia a dia (falta de gente, função ou lesão)
export const LIST_CAP_PER_CLUB = 3;
export const LIST_LIFE = 60;                 // dias à venda antes de sair da lista
export const MAX_AGENT_OFFERS = 4;           // ofertas de agentes abertas ao mesmo tempo para o usuário

/** Período (em dias) entre análises de mercado do clube: quanto mais ativo, mais seguido. */
const periodOf = (id: string, rep: number) => TICK_EVERY * (3 + (hashString(`${id}:per`) % 4) - (rep >= 4 ? 1 : 0)); // gigantes olham o mercado com mais frequência

/* ---------- agentes ---------- */

export const AGENTS = ['Jorge Mendes Filho', 'Paulo Cruz', 'Márcio Teixeira', 'Rogério Pacheco', 'Eduardo Vasques', 'Sílvio Barreto', 'Carla Nogueira', 'Fernando Lacerda', 'Otávio Brandão', 'Helena Duarte', 'Ricardo Falcão', 'André Pinheiro'];
/** Agente do jogador (sempre o mesmo: sai do id do jogador). */
export const agentOf = (playerId: string) => ({ id: `ag${hashString(playerId) % AGENTS.length}`, name: AGENTS[hashString(playerId) % AGENTS.length] });

/* ---------- lista oficial de venda da IA ---------- */

/** Atualiza as listas de venda dos clubes (os que estão na vez): quem não entra nos planos, sobra na posição, quer sair ou termina contrato. */
function listTick(g: GameState, due: string[]): GameState {
  const ctx = profileCtx(g);
  const day = today(g);
  const listed = { ...(g.listed ?? {}) };
  for (const [pid, v] of Object.entries(listed)) { // sai da lista: vendido, vencida ou o clube mudou
    const l = locate(g, pid);
    if (!l || l.clubId !== v.clubId || day - v.day > LIST_LIFE) delete listed[pid];
  }
  const loaned = new Set([...(g.loans ?? []).map((x) => x.playerId), ...(g.aiLoans ?? []).map((x) => x.playerId)]);
  for (const id of due) {
    const prof = clubProfile(g, id, ctx);
    const mine = Object.values(listed).filter((v) => v.clubId === id).length;
    if (mine >= LIST_CAP_PER_CLUB) continue;
    const team = g.teams[id];
    const cands = team.players.filter((p) => !listed[p.id] && !loaned.has(p.id)).map((p) => ({ p, reasons: saleReasons(g, id, p, prof, ctx), role: roleOf(g, id, p, ctx).role, mood: g.mood?.[p.id] }))
      .filter((x) => x.role !== 'craque' && (x.mood?.want === 'sair' || x.reasons.some((r) => r === 'sem-espaco' || r === 'fora-dos-planos' || r === 'fim-contrato' || r === 'salario-alto') || (x.reasons.includes('financas') && prof.sellPressure >= 0.7 && x.role !== 'titular')))
      .sort((a, b) => b.reasons.length - a.reasons.length || b.p.strength - a.p.strength);
    let added = 0;
    for (const c of cands) {
      if (mine + added >= LIST_CAP_PER_CLUB || added >= 2) break;
      if (!rosterOk(team.players.filter((x) => x.id !== c.p.id))) continue;
      const why = c.mood?.want === 'sair' ? 'pediu para sair' : c.reasons.includes('fim-contrato') ? 'fim de contrato' : c.reasons.includes('sem-espaco') ? 'sem espaço no elenco' : c.reasons.includes('salario-alto') ? 'salário alto' : c.reasons.includes('fora-dos-planos') ? 'fora dos planos' : 'equilibrar as contas';
      listed[c.p.id] = { clubId: id, day, reason: why };
      added++;
    }
  }
  return { ...g, listed };
}

/** Quem está oficialmente à venda (IA), com o motivo. */
export const listedPlayers = (g: GameState) => Object.entries(g.listed ?? {}).flatMap(([pid, v]) => { const l = locate(g, pid); return l && l.clubId === v.clubId ? [{ player: l.player, clubId: v.clubId, reason: v.reason, day: v.day }] : []; });

/* ---------- insatisfação ---------- */

/**
 * Jogadores ficam insatisfeitos por motivos reais (reserva que é bom o bastante para jogar, salário abaixo da importância,
 * clube em crise, craque em clube pequeno, interesse de outros clubes). No máximo 2 por clube (3 no seu) e com intervalo entre pedidos.
 */
function moodTick(g: GameState, due: string[]): GameState {
  const ctx = profileCtx(g);
  const day = today(g);
  const mood = { ...(g.mood ?? {}) };
  let s = g;
  let transferList = g.transferList;
  for (const [pid, m] of Object.entries(mood)) {
    const l = locate(g, pid);
    if (!l || !l.clubId || day - m.since > 120) { delete mood[pid]; continue; }
    // pedido de saída ignorado por muito tempo: o jogador é colocado à venda (só no seu clube; a IA resolve pela lista)
    if (!g.unemployed && l.clubId === g.userClubId && m.want === 'sair' && m.level >= 3 && day - m.since > 45 && !transferList.includes(pid)) {
      transferList = [...transferList, pid]; delete mood[pid];
      s = notifyPhone(news(s, `📋 ${l.player.name} foi colocado na lista de transferência: o pedido de saída ficou sem resposta.`, 'info'), 'noticias', `${l.player.name} foi colocado à venda.`);
    }
  }
  for (const id of due) {
    const team = g.teams[id];
    if (!team) continue;
    const isUser = !g.unemployed && id === g.userClubId;
    const cap = isUser ? 3 : 2;
    let n = team.players.filter((p) => mood[p.id]).length;
    if (n >= cap) continue;
    const prof = clubProfile(g, id, ctx);
    const level = ctx.xi.get(id) ?? avgXI(team);
    const xi = new Set(autoLineup(team.players, team.formation));
    const fair = (p: Player) => baseWage(g, id, { ...p, contract: undefined });
    for (const p of team.players) {
      if (n >= cap) break;
      const cur = mood[p.id];
      if (cur && (cur.cooldown ?? 0) > day) continue;
      if (cur && cur.want) continue;
      let reason = '', want: Mood['want'] = 'sair', level2: Mood['level'] = 1;
      const role = roleOf(g, id, p, ctx);
      if (!xi.has(p.id) && p.strength >= level - 2 && p.age >= 22 && p.age <= 31) { reason = 'perdeu espaço no time'; level2 = 2; }
      else if (xi.has(p.id) && p.strength >= level + 8 && prof.tier === 'pequeno') { reason = 'quer disputar competições maiores'; level2 = 2; }
      else if (role.starter && (p.contract?.wage ?? 0) > 0 && (p.contract?.wage ?? 0) < fair(p) * 0.72) { reason = 'salário abaixo da importância'; want = 'aumento'; }
      else if (prof.financial === 'crise' && p.strength >= level + 3 && xi.has(p.id)) { reason = 'clube em crise'; }
      else if (activeDeals(g, p.id).some((d) => d.sellerId === id) && p.strength >= level) { reason = 'interesse de outros clubes'; }
      if (!reason) continue;
      if (hashString(`${p.id}:${day}:mood`) % 100 >= 18) continue; // nem todo mundo reclama ao mesmo tempo, e nem toda semana
      mood[p.id] = { since: day, reason, level: level2, want };
      n++;
      if (isUser) s = notifyPhone(news(s, want === 'sair' ? `😠 ${p.name} (${reason}) quer deixar o clube. Resolva: coloque-o à venda ou melhore a situação.` : `💬 ${p.name} pede aumento salarial (${reason}). Veja a renovação do contrato.`, 'bad'), 'noticias', want === 'sair' ? `${p.name} quer sair do clube.` : `${p.name} pede aumento.`);
    }
  }
  // clube da IA resolve: quem quer sair vai à lista (listTick); quem pede aumento recebe se couber na folha
  const teams = { ...s.teams };
  for (const [pid, m] of Object.entries(mood)) {
    if (m.want !== 'aumento') continue;
    const l = locate(s, pid);
    if (!l?.clubId || (!s.unemployed && l.clubId === s.userClubId)) continue;
    const prof = clubProfile(s, l.clubId, ctx);
    const raise = Math.round(baseWage(s, l.clubId, { ...l.player, contract: undefined }) * 1.08 / 1_000) * 1_000;
    const t = teams[l.clubId];
    const payroll = t.players.reduce((a, p) => a + (p.contract?.wage ?? baseWage(s, l.clubId!, p)), 0);
    if (payroll - (l.player.contract?.wage ?? 0) + raise <= prof.revenue * 1.05) teams[l.clubId] = { ...t, players: t.players.map((p) => (p.id === pid ? { ...p, contract: { wage: raise, until: Math.max(p.contract?.until ?? s.season, s.season + 1) } } : p)) };
    delete mood[pid];
  }
  return { ...s, teams, mood, transferList };
}

/* ---------- agentes ---------- */

/** Ofertas de agentes: oferecem jogadores livres ou listados a clubes que realmente precisam da posição (poucas e espaçadas). */
function agentTick(g: GameState, rng: Rng, due: string[]): GameState {
  const day = today(g);
  let s: GameState = { ...g, agentOffers: (g.agentOffers ?? []).map((o) => (o.state === 'aberta' && o.expiresDay < day ? { ...o, state: 'expirada' as const } : o)).filter((o) => o.state === 'aberta' || day - o.day < 60).slice(-60) };
  const ctx = profileCtx(s);
  const open = (s.agentOffers ?? []).filter((o) => o.state === 'aberta');
  const pool: { p: Player; clubId: string | null; ask: number; why: string }[] = [
    ...(s.freeAgents ?? []).slice(0, 80).map((p) => ({ p, clubId: null as string | null, ask: 0, why: 'jogador livre' })),
    ...listedPlayers(s).slice(0, 80).map((x) => ({ p: x.player, clubId: x.clubId as string | null, ask: marketValue(s, x.clubId, x.player), why: `à venda (${x.reason})` })),
  ];
  if (!pool.length) return s;
  let made = 0;
  for (const id of due) {
    if (made >= 2) break;
    const isUser = !s.unemployed && id === s.userClubId;
    if (s.agentOffers?.some((o) => o.clubId === id && day - o.day < 14)) continue; // um clube não é bombardeado
    if (isUser && open.length + made >= MAX_AGENT_OFFERS) continue;
    const prof = clubProfile(s, id, ctx);
    const needs = squadNeeds(s, id, prof, { divisionLevel: ctx.divAvg.get(divisionIndexOf(s, id)) });
    const need = needs[0];
    if (!need || need.priority < 25) continue;
    const level = ctx.xi.get(id) ?? avgXI(s.teams[id]);
    const fit = pool.filter(({ p, clubId }) => clubId !== id && p.pos === need.pos && (!need.spot || spotOf(p) === need.spot) && p.strength >= need.minStrength && p.age <= need.maxAge && p.strength <= level + 12 && !longInjured(s, p.id) && !activeDeals(s, p.id).some((d) => d.buyerId === id))
      .filter(({ p }) => baseWage(s, id, p) <= prof.revenue * 0.08).sort((a, b) => b.p.strength - a.p.strength);
    const pick = fit[Math.floor(rng() * Math.min(3, fit.length))];
    if (!pick) continue;
    const ag = agentOf(pick.p.id);
    const offer: AgentOffer = { id: `${ag.id}:${pick.p.id}:${id}:${day}`, agentId: ag.id, playerId: pick.p.id, clubId: id, day, expiresDay: day + 10, ask: pick.ask, pitch: `${ag.name} oferece ${pick.p.name} (${pick.why}) a quem precisa de ${needLabel(need)}.`, state: 'aberta' };
    made++;
    if (isUser) { s = { ...s, agentOffers: [...(s.agentOffers ?? []), offer] }; s = notifyPhone(news(s, `🕴️ ${offer.pitch}`, 'info'), 'noticias', `${ag.name} oferece ${pick.p.name} ao seu clube.`); continue; }
    // clube da IA: o agente apresenta o jogador e o clube avalia como qualquer outra negociação
    const r = pick.clubId === null
      ? aiTrade(s, { kind: 'livre', playerId: pick.p.id, buyerId: id, fee: 0, reason: `${need.reasons.includes('falta-gente') ? 'falta de ' : 'reposição de '}${needLabel(need)} · oferecido pelo agente ${ag.name}` })
      : aiTrade(s, { kind: 'compra', playerId: pick.p.id, buyerId: id, fee: pick.ask, reason: `${need.reasons.includes('falta-gente') ? 'falta de ' : 'reposição de '}${needLabel(need)} · oferecido pelo agente ${ag.name}` });
    s = { ...r.state, agentOffers: [...(r.state.agentOffers ?? []), { ...offer, state: r.ok ? 'aceita' : 'recusada' }] };
  }
  return s;
}

/* ---------- processamento diário ---------- */

/**
 * Chamado todo dia (dayTick). Só age a cada TICK_EVERY dias, uma única vez por dia, e só com os clubes que estão na vez
 * (frequência própria). Com a janela fechada, só jogadores livres e agentes funcionam.
 */
export function marketTick(g: GameState): GameState {
  const day = today(g);
  if (g.marketDay === day) return g;                   // este dia já foi processado (salvar/carregar não repete)
  let s: GameState = { ...g, marketDay: day };
  if (day % TICK_EVERY !== 0 || s.observer) return s;
  const rng = makeRng(hashString(`${s.seed}:${day}:mkt`));
  const ids = Object.keys(s.teams);
  const dueOf = (extra = 0) => ids.filter((id) => (hashString(id) + Math.floor(day / TICK_EVERY) + extra) % (periodOf(id, s.clubs[id]?.reputation ?? 2) / TICK_EVERY) === 0);
  const aiDue = dueOf().filter((id) => !managed(s, id));
  const open = !transferBlock(s, 'comum');
  if (Math.floor(day / TICK_EVERY) % 2 === 0) s = listTick(s, aiDue);
  s = moodTick(s, dueOf(1));
  if (open) {
    const ctx0 = profileCtx(s);
    const buyers = aiDue.filter((id) => (s.dealLog ?? []).filter((r) => r.buyerId === id && r.state === 'concluida' && day - r.day < 120).length < maxBuysFor(clubProfile(s, id, ctx0)) * 2);
    if (buyers.length) s = aiWindow(s, rng, 1, buyers, URGENT);
    if ((Math.floor(day / TICK_EVERY)) % 3 === 0) s = aiLoanWindow(s, rng, 1, aiDue);
    if ((Math.floor(day / TICK_EVERY)) % 4 === 1) s = aiSwapTick(s, rng, aiDue);
  }
  if ((s.freeAgents ?? []).length && (Math.floor(day / TICK_EVERY)) % 2 === 0) s = aiSignFreeAgents(s, rng, 1, aiDue);
  s = agentTick(s, rng, dueOf(2));
  return s;
}

/* ---------- propostas da IA pelos jogadores do usuário ---------- */

const myValueOf = (g: GameState, p: Player) => marketValue(g, g.userClubId, p);

/**
 * Depois de uma rodada: clubes da IA que precisam da posição fazem propostas oficiais pelos jogadores das suas listas e pelos destaques
 * (com pagamento à vista ou parcelado, às vezes uma troca; empréstimos com divisão salarial e opção de compra). Cada proposta é uma negociação
 * que você aceita, recusa ou contrapropõe dentro do prazo.
 */
export function proposeToUser(g: GameState, rng: Rng): GameState {
  if (g.unemployed || transferBlock(g, 'comum')) return g;
  const user = g.teams[g.userClubId];
  const day = today(g);
  const open = (g.deals ?? []).filter((d) => d.sellerId === g.userClubId && ['recebida', 'aguardando', 'contraproposta', 'em-analise'].includes(d.state));
  let s = g;
  const ctx = profileCtx(s);
  const tryOffer = (pid: string, kind: Offer['kind'], premium: [number, number], sure = false) => {
    const p = user.players.find((x) => x.id === pid);
    const cur = (s.deals ?? []).filter((d) => d.sellerId === s.userClubId && d.playerId === pid && ['recebida', 'aguardando', 'contraproposta', 'em-analise'].includes(d.state));
    if (!p || cur.length >= 1 || open.length + 1 > MAX_OPEN_OFFERS) return;
    if (!rosterOk(user.players.filter((x) => x.id !== pid))) return;
    if (!sure && rng() >= OFFER_CHANCE[kind]) return;
    const value = myValueOf(s, p);
    const fee = kind === 'buy' ? Math.max(10_000, Math.round(value * (premium[0] + (premium[1] - premium[0]) * rng()) / 10_000) * 10_000) : Math.max(10_000, Math.round(value * 0.08 / 10_000) * 10_000);
    // compradores: clubes da IA que precisam da posição e comportam o negócio
    const buyers = aiIds(s).filter((id) => s.teams[id].players.length < MAX_SQUAD && (s.budgets[id] ?? 0) >= fee * 0.4 && !(s.deals ?? []).some((d) => d.buyerId === id && d.playerId === pid));
    const wanting = buyers.filter((id) => squadNeeds(s, id, clubProfile(s, id, ctx)).some((n) => n.pos === p.pos));
    const list = wanting.length ? wanting : buyers; // sem clube precisando da posição, quem tem caixa pode aproveitar a oportunidade
    if (!list.length) return;
    const clubId = list[Math.floor(rng() * list.length)];
    const need = squadNeeds(s, clubId, clubProfile(s, clubId, ctx)).find((n) => n.pos === p.pos);
    const reason = need ? `${need.reasons.includes('falta-gente') ? 'falta de ' : 'reposição de '}${needLabel(need)}` : 'oportunidade de mercado';
    if (kind === 'buy') {
      const plan = (s.budgets[clubId] ?? 0) >= fee ? (rng() < 0.2 ? 3 : 1) : installmentPlan(s, clubId, fee);
      const swapPool = s.teams[clubId].players.filter((q) => q.pos !== p.pos && q.strength >= 55 && marketValue(s, clubId, q) * 0.85 < fee * 0.7).sort((a, b) => b.strength - a.strength);
      const swap = rng() < 0.15 && swapPool.length ? swapPool[Math.floor(rng() * Math.min(3, swapPool.length))] : undefined;
      const cash = swap ? Math.max(10_000, fee - Math.round(marketValue(s, clubId, swap) * 0.85 / 10_000) * 10_000) : fee;
      const o = openDeal(s, { kind: swap ? 'troca' : 'compra', playerId: pid, buyerId: clubId, reason, terms: { fee: cash, installments: plan > 1 ? makeInstallments(cash, plan, day, 0.4, 90) : undefined, swapPlayerIds: swap ? [swap.id] : undefined } });
      if (o.deal) { s = o.state; open.push(o.deal); }
    } else {
      const o = openDeal(s, { kind: 'emprestimo', playerId: pid, buyerId: clubId, reason, terms: { fee, loan: { untilDay: seasonEndDay(s), originWagePct: rng() < 0.25 ? 0.5 : 0, fee, ...(p.age <= 23 && rng() < 0.4 ? { buyOption: Math.round(value * 1.25 / 10_000) * 10_000 } : {}) } } });
      if (o.deal) { s = o.state; open.push(o.deal); }
    }
  };
  for (const id of g.transferList) tryOffer(id, 'buy', [0.85, 1.15]);
  for (const id of g.loanList) tryOffer(id, 'loan', [1, 1]);
  const stars = [...user.players].sort((a, b) => b.strength - a.strength).slice(0, STAR_COUNT);
  for (const p of stars) {
    if (g.transferList.includes(p.id) || open.length >= MAX_OPEN_OFFERS) continue;
    if (rng() >= STAR_INTEREST) continue;
    tryOffer(p.id, 'buy', [1.1, 1.5], true); // o sorteio do destaque já foi feito
  }
  return s;
}
export { fmt };

/* ---------- trocas entre clubes da IA ---------- */

/**
 * Clubes sem caixa para pagar à vista oferecem um jogador que sobra no elenco (e que o outro clube precisa) mais algum dinheiro.
 * No máximo 2 trocas por rodada de decisão.
 */
export function aiSwapTick(g: GameState, rng: Rng, due: string[]): GameState {
  let s = g;
  let done = 0;
  const ctx = profileCtx(s);
  const ids = aiIds(s);
  for (const buyerId of due) {
    if (done >= 2) break;
    const prof = clubProfile(s, buyerId, ctx);
    const needs = squadNeeds(s, buyerId, prof, { divisionLevel: ctx.divAvg.get(divisionIndexOf(s, buyerId)) });
    const need = needs[0];
    if (!need || need.priority < 25) continue;
    const cash = (s.budgets[buyerId] ?? 0) * prof.spendShare;
    const surplus = s.teams[buyerId].players.filter((p) => roleOf(s, buyerId, p, ctx).role === 'excedente' && !(s.loans ?? []).some((l) => l.playerId === p.id) && !(s.aiLoans ?? []).some((l) => l.playerId === p.id));
    if (!surplus.length) continue;
    const sample = ids.filter((id) => id !== buyerId).sort(() => rng() - 0.5).slice(0, 25);
    for (const sellerId of sample) {
      const sNeeds = squadNeeds(s, sellerId, clubProfile(s, sellerId, ctx));
      const give = surplus.find((p) => sNeeds.some((n) => n.pos === p.pos) && p.strength >= 45);
      if (!give) continue;
      const target = s.teams[sellerId].players.filter((p) => p.pos === need.pos && p.strength >= need.minStrength && p.age <= need.maxAge).sort((a, b) => b.strength - a.strength)[0];
      if (!target) continue;
      const tv = marketValue(s, sellerId, target), gv = marketValue(s, buyerId, give) * 0.85;
      if (gv < tv * 0.35 || tv - gv > cash) continue; // a troca só faz sentido se o jogador oferecido vale algo e o resto cabe no caixa
      const r = aiTrade(s, { kind: 'troca', playerId: target.id, buyerId, fee: Math.max(0, Math.round((tv - gv) / 10_000) * 10_000), swapIds: [give.id], reason: `troca: ${needLabel(need)} por excedente em ${give.pos}` });
      if (r.ok) { s = r.state; done++; break; }
    }
  }
  return s;
}
