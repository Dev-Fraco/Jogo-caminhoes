/* =====================================================================
   PACOTE DA 2ª TEMPORADA EM DIANTE (Premium): a virada de temporada e tudo o que só acontece depois da primeira.
   O jogo grátis NÃO importa este arquivo diretamente: ele é carregado sob demanda (loader.ts) e, no app da loja, só depois da compra.
   ===================================================================== */
import { offseason } from '../engine/ai';
import { freezeGoals } from '../engine/aigoals';
import { ensureAiState, prunePlayerMaps } from '../engine/aistate';
import { coachSeasonEval, payTierNotice, reputationDrift } from '../engine/coachcareer';
import { postContractOffer } from '../engine/inbox';
import { settleLoanPurchases } from '../engine/loandeals';
import { clauseSeasonEnd } from '../engine/dealpay';
import { aiCoachSeasonEnd } from '../engine/aicoaches';
import { createContinentals } from '../engine/continental';
import { hooks, REGIONAL_KEYS } from '../engine/hooks';
import { limitedAt } from './entitlement';
import { withGroups } from '../engine/groups';
import { adoptClub, estadualOfUser, estadualTable, nextEstaduais, serieDQualifiers } from '../engine/estadual';
import { fire, seasonEndFiring, seasonEndOffers, seasonPoints } from '../engine/jobs';
import { anyClubName, expireContracts } from '../engine/market';
import { managed } from '../engine/lookup';
import { processDays } from '../engine/daily';
import { youthSeason } from '../engine/youth';
import { youthSeasonEnd, youthStartSeason } from '../engine/ycomp';
import { settleSalary } from '../engine/salary';
import { calOf, newSeasonCalendar } from '../engine/calendar';
import { createCup } from '../engine/cup';
import { serieDStanding } from '../engine/phases';
import { rolloverInjuries } from '../engine/injuries';
import { makeRng } from '../engine/rng';
import { returnLoans } from '../engine/roster';
import type { DivisionState, GameState } from '../engine/types';

import { baseIncome } from '../engine/finance';
import { nextInflation, priceIndex, seasonIncome } from '../engine/economy';

import { buildSeason, isSeasonOver, seasonOutcome, seasonSummary, simulateToEnd } from '../engine/game';

/** Vice-campeão da Copa do Brasil (perdeu a final). */
const cupVice = (g: GameState): string | undefined => { const f = g.cup?.rounds[g.cup.rounds.length - 1]?.ties[0]; return f?.winnerId ? (f.winnerId === f.homeId ? f.awayId : f.homeId) : undefined; };

/** Encerra a temporada: aplica acesso e rebaixamento, guarda o resumo e monta o calendário da próxima. */
export function startNextSeason(g: GameState): GameState {
  if (!isSeasonOver(g)) return g;
  g = youthSeasonEnd(g); // competições da base: termina o que faltar, paga prêmios e guarda a história
  // novembro, dezembro e janeiro passam antes da virada: salários e mensalidades continuam saindo (e a IA acerta o caixa depois)
  g = settleSalary(g); // rebaixado que não negociou pode levar um corte
  const calNew = newSeasonCalendar({ ...g, season: g.season + 1 });
  const pre = processDays(g, calOf(g).day, calNew.day);
  return startNextSeasonCore(pre, calNew);
}

function startNextSeasonCore(g: GameState, calNew: ReturnType<typeof newSeasonCalendar>): GameState {
  const out = seasonOutcome(g);
  const moves = out.moves;

  const pyramid = g.divisions.filter((d) => d.format !== 'outside');
  const outsideDiv = g.divisions.find((d) => d.format === 'outside');
  const lastP = pyramid.length - 1;
  const quals = serieDQualifiers(g); // clubes de estadual que sobem à Série D (e os 8 piores da D que saem)
  const divisions: DivisionState[] = pyramid.map((d, i) => {
    const stay = moves[i].table.map((r) => r.clubId).filter((id) => !moves[i].promoted.includes(id) && !moves[i].relegated.includes(id));
    const fromAbove = i > 0 ? moves[i - 1].relegated : [];
    const fromBelow = i < lastP ? moves[i + 1].promoted : quals;
    return withGroups({ id: d.id, name: d.name, format: d.format, clubIds: [...fromBelow, ...stay, ...fromAbove] }, g.teams, g.seed * 11 + g.season * 3 + i);
  });
  // o seu clube fora da pirâmide (estadual) continua lá, a menos que tenha subido; se cair da Série D, volta para o estadual
  const outsideIds = [...(outsideDiv?.clubIds ?? []).filter((id) => !quals.includes(id)), ...moves[lastP].relegated.filter((id) => id === g.userClubId && !g.unemployed)];
  if (outsideIds.length) divisions.push({ id: 'fora', name: 'Estadual', clubIds: outsideIds, format: 'outside' });

  const summary = seasonSummary(g, out);
  const { fixtures, totalRounds } = buildSeason(divisions);
  // receita da temporada para todos os clubes, conforme a divisão em que jogaram e a posição final
  const budgets = { ...g.budgets };
  moves.forEach((m, i) => m.table.forEach((r, idx) => {
    const id = r.clubId;
    budgets[id] = (budgets[id] ?? 0) + seasonIncome(i, g.clubs[id].reputation, idx + 1, m.table.length, priceIndex(g));
    if (!managed(g, id)) {
      // clubes da IA: o excesso de caixa vira obras e infraestrutura; dívida é renegociada (sem espiral de falência)
      const cap = 5 * baseIncome(i, g.clubs[id].reputation, priceIndex(g));
      if (budgets[id] > cap) budgets[id] = Math.round(cap + (budgets[id] - cap) * 0.5);
      if (budgets[id] < 0) budgets[id] = 0;
    }
  }));
  const back = expireContracts(returnLoans(settleLoanPurchases(g))); // opção/obrigação de compra antes da devolução
  // títulos do treinador nesta temporada
  const titles = [...(g.titles ?? [])];
  if (!g.unemployed && !g.observer) {
    const mine = g.userClubId, clubName = g.clubs[mine].name;
    const add = (competition: string, kind: 'liga' | 'copa' | 'continental' | 'mundial' | 'estadual') => titles.push({ season: g.season, clubId: mine, clubName, competition, kind });
    moves.forEach((m, i) => { if (m.table[0].clubId === mine) add(g.divisions[i].name, 'liga'); });
    const mineEst = estadualOfUser(g);
    if (mineEst && g.estadual?.done && estadualTable(g, mineEst.div)[0].clubId === mine) add(mineEst.divIndex === 0 ? mineEst.comp.name : `${mineEst.comp.name} (Série B)`, 'estadual');
    if (g.cup?.championId === mine) add(g.cup.name, 'copa');
    if (g.lib?.championId === mine) add(g.lib.name, 'continental');
    if (g.sula?.championId === mine) add(g.sula.name, 'continental');
    if (g.ucl?.championId === mine) add(g.ucl.name, 'continental');
    if (g.mundial?.championId === mine) add(g.mundial.name, 'mundial');
    if (g.superMundial?.championId === mine) add(g.superMundial.name, 'mundial');
    for (const k of REGIONAL_KEYS) if (g.regionais?.[k]?.championId === mine) add(g.regionais[k]!.name, 'copa');
  }
  const inflation = nextInflation(g, makeRng(g.seed * 37 + g.season * 5 + 1)); // a inflação do ano que começa
  let next: GameState = { ...back, titles, inflation, news: [{ season: g.season + 1, round: 1, text: `📈 Inflação de ${(inflation.rate * 100).toFixed(1).replace('.', ',')}%: preços, salários e receitas sobem.`, tone: 'info' as const }, ...back.news].slice(0, 80), season: g.season + 1, round: 1, totalRounds, divisions, fixtures, results: [], budgets, offers: [], history: [...g.history, summary] };
  next = clauseSeasonEnd(next, [...moves.map((m) => m.table[0].clubId), ...(g.cup?.championId ? [g.cup.championId] : []), ...(['lib', 'sula', 'ucl'] as const).flatMap((k) => (g[k]?.championId ? [g[k]!.championId!] : []))]); // bônus por títulos e desempenho
  next = { ...next, scorers: undefined }; // artilharia nova a cada temporada (a antiga fica no resumo)
  next = aiCoachSeasonEnd(g, next, makeRng(g.seed * 59 + g.season * 19 + 3)); // treinadores da IA: mérito, demissões e trocas
  next = rolloverInjuries(next, g.season, g.totalRounds); // lesões longas atravessam a virada
  for (const id of quals) next = adoptClub(next, id); // clubes de estadual que sobem ganham elenco, caixa e ficha
  if (quals.length && !g.observer) next = { ...next, news: [{ season: next.season, round: 1, text: `⬆️ Sobem dos estaduais para a Série D: ${quals.map((id) => anyClubName(next, id)).join(', ')}.`, tone: (quals.includes(g.userClubId) ? 'good' : 'info') as 'good' | 'info' }, ...next.news].slice(0, 80) };
  // a IA entra em ação: evolução dos jogadores, investimento dos promovidos, crises dos rebaixados e janela de transferências
  const arrivals = (list: 'promoted' | 'relegated', delta: number) => moves.flatMap((m, i) => m[list].map((clubId) => ({ clubId, to: i + delta })));
  const rng = makeRng(g.seed * 977 + g.season * 31 + 5);
  const { state, promotion } = offseason(next, rng, { promoted: arrivals('promoted', -1), relegated: arrivals('relegated', 1) });
  // vagas na Copa do Brasil: campeão da Série D e das copas regionais (Nordeste, os 2 blocos da Verde e Sul-Sudeste)
  const dChamp = g.divisions.find((d) => d.format === 'groups'); const guests = [...(dChamp ? [serieDStanding(g, dChamp).championId] : []), g.regionais?.nordeste?.championId, ...(g.regionais?.verde?.blocChampions ?? []), g.regionais?.sulsudeste?.championId].filter((x): x is string => !!x);
  let withGuests = state; for (const id of guests) withGuests = adoptClub(withGuests, id);
  const cupped: GameState = g.cup ? { ...withGuests, cup: createCup(withGuests, guests), estadual: g.estadual ? nextEstaduais(g, g.estadual) : undefined } : state;
  const withCup: GameState = hooks.createRegionals(createContinentals({ ...cupped, mundial: undefined, superMundial: undefined }, moves[0].table.map((r) => r.clubId), g.cup?.championId, { vice: cupVice(g), holders: ([g.lib?.championId, g.sula?.championId].filter((x): x is string => !!x)) }), g);
  const cal = calNew;
  const league = limitedAt(g, g.season + 1) ? onlyClubLeague(withCup) : withCup; // jogador do grátis depois da 1ª temporada: só a liga do clube
  let result: GameState = freezeGoals(youthSeason({ ...league, cal, history: withCup.history.map((h, i) => (i === withCup.history.length - 1 ? { ...h, promotion } : h)) }));
  result = { ...result, apps: {} }; // a evolução desta temporada já usou os minutos jogados: a contagem recomeça
  // carreira do treinador: pontos, demissão ou propostas de clubes maiores
  const relegatedU = out.movement === 'relegated', promotedU = out.movement === 'promoted';
  const reason = seasonEndFiring(g, out.userPosition, relegatedU);
  result = seasonPoints(result, out.userPosition, promotedU, relegatedU);
  result = coachSeasonEval(result, out.userPosition, out.movement, (result.titles ?? []).filter((t) => t.season === g.season && t.clubId === g.userClubId).length); // overall do treinador: objetivos e títulos
  result = reputationDrift(result);                                          // reputação dos clubes: sobe devagar, só no fim da temporada
  const after = seasonEndOffers(reason ? fire(result, reason) : result, out.userPosition, promotedU);
  const started = after.unemployed ? after : postContractOffer(payTierNotice(after)); // início da temporada: aviso de nova divisão e proposta de contrato (uma vez por temporada)
  return hooks.worldStartSeason(youthStartSeason(ensureAiState(prunePlayerMaps(started)))); // (as competições da base da temporada nova) clubes que entraram na pirâmide e o clube que você deixou ficam completos
}

/** Pula de 1 a 5 temporadas: simula tudo (campeonatos, copas, Mundial) e termina no fim da última temporada pulada. Com `autoPay`, boletos são pagos sozinhos. */
export function skipSeasons(g: GameState, years: number, autoPay = true): GameState {
  const n = Math.max(1, Math.min(5, Math.round(years)));
  let s: GameState = { ...g, autoPay: autoPay || g.autoPay };
  for (let i = 0; i < n; i++) {
    s = simulateToEnd(s);
    if (i < n - 1) s = startNextSeason(s);
  }
  return { ...s, autoPay: g.autoPay };
}

/** Jogo grátis depois da temporada grátis: ficam só a liga (divisão) do clube e o que ela exige. Sem copa nacional, estadual (exceto para quem só joga o estadual), continentais, Mundial, copas especiais e Super Mundial. */
export function onlyClubLeague(g: GameState): GameState {
  const outside = g.divisions.some((d) => d.format === 'outside' && d.clubIds.includes(g.userClubId)); // o estadual é a liga de quem está fora da pirâmide
  return { ...g, cup: undefined, estadual: outside ? g.estadual : undefined, lib: undefined, sula: undefined, ucl: undefined, mundial: undefined, superMundial: undefined, regionais: undefined, foreign: undefined };
}
