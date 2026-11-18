import type { ClubData } from '../data/clubs';
import { offseason } from './ai';
import { aiRenewals } from './aicontracts';
import { freezeGoals } from './aigoals';
import { ensureAiState, prunePlayerMaps } from './aistate';
import { coachAfterMatch, coachRelegationRisk, coachSeasonEval, payTierNotice, reputationDrift, stampPayTier } from './coachcareer';
import { startingOverall } from './coachpay';
import { postContractOffer } from './inbox';
import { addScorers, topScorersOf, type GoalEntry } from './scorers';
import { settleLoanPurchases, trackLoanApps } from './loandeals';
import { clauseGames, clauseSeasonEnd } from './dealpay';
import { aiLineup, matchImportance, updateLoad } from './rotation';
import { aiPromoteYouth, ensureAiYouth, trackApps } from './aiyouth';
import { aiCoachSeasonEnd, aiCoachTick } from './aicoaches';
import { contAfterLeagueRound, createContinentals, mundialAfterLeagueRound, playContStep, playMundialStep } from './continental';
import { pendingEvent, playEvent } from './events';
import { tickContracts } from './assets';
import { advanceKnockout, finalStandings, groupFixtures, isGroups, userGroupRows, withGroups } from './groups';
import { adoptClub, createEstaduais, estadualChampions, estadualOfUser, estadualTable, nextEstaduais, playEstadualStep, serieDQualifiers } from './estadual';
import { boardTick, fire, seasonEndFiring, seasonEndOffers, seasonPoints } from './jobs';
import { anyClubName, expireContracts } from './market';
import { managed } from './lookup';
import { socialAds, socialAfterMatch } from './social';
import { tickBoletos } from './bank';
import { roundFinance } from './finance';
import { playHomeGate } from './stadium';
import { inboxTick } from './inbox';
import './shop';
import { processDays } from './daily';
import { youthSeason, youthTick } from './youth';
import { youthSeasonEnd, youthStartSeason, youthSync } from './ycomp';
import { fibraTick } from './netfibra';
import { settleSalary } from './salary';
import { afterMatch, calOf, newSeasonCalendar, nextMatchDay } from './calendar';
import { createCup, cupAfterLeagueRound, penaltyTakers, playCupRound, shootoutKicks } from './cup';
import { MORALE_START, moraleFactor, updateMorale } from './morale';
import { simulateMatch, withInjured, withTactics, type Tactic } from './match';
import { applyInjuries, healUserLineup, injuredSet, lineupWithout, pruneInjuries, rolloverInjuries, type InjuryHit } from './injuries';
import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { generateOffers, returnLoans } from './roster';
import { autoLineup, teamFromPlayers, teamRatings } from './squad';
import { computeTable } from './table';
import type { ClubInfo, DivisionState, FormationId, Fixture, GameState, MatchResult, PlayedMatch, Position, SeasonSummary, TableRow } from './types';

export { DIVISION_INCOME, seasonIncome } from './economy';
import { baseIncome } from './finance';
import { nextInflation, priceIndex, seasonIncome } from './economy';

/** Quantos clubes sobem e descem entre divisões vizinhas (Série A↔B, B↔C, C↔D). */
export const PROMOTION_SLOTS = 4;
export const RELEGATION_SLOTS = 4;
/** Vagas de acesso/rebaixamento da carreira (cada liga tem a sua regra). */
export const slotsOf = (g: Pick<GameState, 'slots'>) => g.slots ?? PROMOTION_SLOTS;
export const leagueNameOf = (g: Pick<GameState, 'leagueName'>) => g.leagueName ?? 'Campeonato Brasileiro';

export interface CareerInput {
  saveName: string;
  coach: { name: string; nationality: string; reputation: string };
  difficulty: string;
  mode: string;
  season: number;
  userClubId: string;
  leagueName?: string;
  /** Disputa a Copa do Brasil junto com o campeonato. */
  cup?: boolean;
  /** Clubes que sobem/descem entre divisões vizinhas (padrão 4). */
  slots?: number;
  /** Pirâmide, da divisão principal para as inferiores. */
  divisions: { id: string; name: string; clubs: ClubData[]; format?: 'groups' }[];
  /** Clube que só joga estadual (ou criado pelo jogador): fica fora da pirâmide e começa pelo estadual. */
  outside?: ClubData;
  /** Parte da verba do seu clube que sobra (desafios: 1, 0,5, 0,25...). */
  budgetFactor?: number;
}

function buildSeason(divisions: DivisionState[]): { fixtures: Fixture[]; totalRounds: number } {
  const fixtures: Fixture[] = [];
  let totalRounds = 0;
  for (const d of divisions) {
    if (isGroups(d)) { fixtures.push(...groupFixtures(d)); totalRounds = Math.max(totalRounds, 10); continue; }
    const f = buildFixtures(d.clubIds, d.id);
    fixtures.push(...f.fixtures);
    totalRounds = Math.max(totalRounds, f.totalRounds);
  }
  return { fixtures, totalRounds };
}

/** Cria uma carreira nova: todos os clubes de todas as divisões, calendário completo e elencos. */
export function newCareer(input: CareerInput, seed = Date.now() % 2147483647): GameState {
  const all = [...input.divisions.flatMap((d) => d.clubs), ...(input.outside ? [input.outside] : [])];
  if (!all.some((c) => c.id === input.userClubId)) throw new Error('Clube inexistente na pirâmide');
  if (new Set(all.map((c) => c.id)).size !== all.length) throw new Error('Clubes repetidos na pirâmide');
  const slots = input.slots ?? PROMOTION_SLOTS;
  if (input.divisions.some((d) => d.clubs.length < slots * 2)) throw new Error('Divisão com poucos clubes');

  let divisions: DivisionState[] = input.divisions.map((d) => ({ id: d.id, name: d.name, clubIds: d.clubs.map((c) => c.id), format: d.format }));
  const clubs: Record<string, ClubInfo> = {};
  const teams: GameState['teams'] = {};
  const budgets: Record<string, number> = {};
  for (const c of all) {
    budgets[c.id] = c.budget;
    clubs[c.id] = { id: c.id, name: c.name, shortName: c.shortName, badge: c.badge, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: c.stadium, city: c.city, reputation: c.reputation, boardExpectation: c.boardExpectation };
    teams[c.id] = teamFromPlayers(c.id, c.squad);
  }
  if (input.budgetFactor !== undefined && input.budgetFactor !== 1) budgets[input.userClubId] = Math.round(budgets[input.userClubId] * input.budgetFactor / 10_000) * 10_000;
  divisions = divisions.map((d, i) => withGroups(d, teams, seed * 7 + i));
  if (input.outside) divisions.push({ id: 'fora', name: 'Estadual', clubIds: [input.outside.id], format: 'outside' });
  const { fixtures, totalRounds } = buildSeason(divisions);
  const career: GameState = {
    coachOverall: startingOverall(input.difficulty), version: 5, leagueName: input.leagueName, slots, saveName: input.saveName, coach: input.coach, difficulty: input.difficulty, mode: input.mode,
    userClubId: input.userClubId, seed, season: input.season, round: 1, totalRounds,
    clubs, budgets, transfers: [], morale: { ...MORALE_START }, transferList: [], loanList: [], offers: [], loans: [], news: [], divisions, teams, fixtures, results: [], history: [],
  };
  // a carreira já nasce completa (contratos, treinadores, base, objetivos): carregar o save depois não muda nada
  if (!input.cup) return youthStartSeason(stampPayTier(ensureAiState(freezeGoals(createContinentals(career)))));
  return youthStartSeason(stampPayTier(ensureAiState(freezeGoals(createContinentals({ ...career, cup: createCup(career), estadual: createEstaduais(input.outside ? { id: input.outside.id, uf: input.outside.uf ?? 'SP' } : undefined) })))));
}

export const isSeasonOver = (g: GameState) => g.round > g.totalRounds && !g.mundial?.due;

export const userDivisionIndex = (g: GameState) => g.divisions.findIndex((d) => d.clubIds.includes(g.userClubId));
export const userDivision = (g: GameState) => g.divisions[userDivisionIndex(g)];

export function fixturesOfRound(g: GameState, round: number, divisionId?: string) {
  return g.fixtures.filter((f) => f.round === round && (!divisionId || f.divisionId === divisionId));
}

/** Joga a próxima rodada em TODAS as divisões. Retorna o novo estado e os resultados da rodada. */
export function playRound(g: GameState): { state: GameState; results: MatchResult[] } {
  if (g.round > g.totalRounds) return g.mundial?.due ? playMundialStep(g) : { state: g, results: [] }; // só falta o Mundial
  for (let i = 0; g.estadual?.due && i < 40; i++) g = playEstadualStep(g).state; // estaduais pendentes (antes do campeonato): simulados automaticamente
  if (g.cup?.due) g = playCupRound(g).state; // fases pendentes das copas: simuladas automaticamente
  for (const key of ['lib', 'sula', 'ucl'] as const) if (g[key]?.due) g = playContStep(g, key).state;
  const rng = makeRng(g.seed * 1000 + g.round + g.season * 100003);
  const teams = { ...g.teams };
  const inj = injuredSet(g);
  // clubes controlados pela IA sempre escalam o melhor time disponível (sem lesionados)
  const oppOf = new Map<string, string>();
  for (const f of fixturesOfRound(g, g.round)) { oppOf.set(f.homeId, f.awayId); oppOf.set(f.awayId, f.homeId); }
  const played = new Map<string, string[]>();
  for (const id of Object.keys(teams)) {
    if (managed(g, id)) continue;
    const t = teams[id];
    const lineup = oppOf.has(id) ? aiLineup(g, t, inj, matchImportance(g, id, oppOf.get(id))) : lineupWithout(t, inj); // rodízio conforme desgaste e importância do jogo
    teams[id] = { ...t, lineup };
    if (oppOf.has(id)) played.set(id, lineup);
  }
  const hits: InjuryHit[] = [];
  const factor = moraleFactor(g.morale.team); // humor da equipe mexe um pouco na força do seu time
  const goalLog: GoalEntry[] = [];
  const results: MatchResult[] = fixturesOfRound(g, g.round).map((f) => {
    const mods = { home: f.homeId === g.userClubId ? factor : 1, away: f.awayId === g.userClubId ? factor : 1 };
    const out = simulateMatch(teams[f.homeId], teams[f.awayId], rng, mods, { home: g.clubs[f.homeId].name, away: g.clubs[f.awayId].name });
    if (out.injured) hits.push(...out.injured);
    for (const e of out.events) if (e.type === 'goal' && !e.annulled && e.player && e.side !== 'none') goalLog.push({ clubId: e.side === 'home' ? f.homeId : f.awayId, name: e.player, comp: f.divisionId });
    const mine = f.homeId === g.userClubId || f.awayId === g.userClubId;
    // jogo eliminatório empatado: pênaltis
    const sk = f.ko && out.homeGoals === out.awayGoals ? shootoutKicks(rng, teamRatings(teams[f.homeId]).gk, teamRatings(teams[f.awayId]).gk, penaltyTakers(teams[f.homeId]), penaltyTakers(teams[f.awayId])) : undefined;
    const pens = sk?.score;
    return { divisionId: f.divisionId, round: f.round, homeId: f.homeId, awayId: f.awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, ...(pens ? { pens } : {}), ...(sk && mine ? { penKicks: { home: sk.home, away: sk.away } } : {}), events: mine ? out.events : [] };
  });
  let state: GameState = advanceKnockout({ ...g, teams, round: g.round + 1, results: [...g.results, ...results], load: updateLoad(g, played), scorers: addScorers(g, goalLog) });
  state = pruneInjuries(applyInjuries(state, hits, g.round)); // lesões da rodada (valem a partir da próxima) e limpeza das vencidas
  // titulares da rodada: contam para bônus por jogos e para a obrigação de compra dos emprestados
  const started = new Set<string>();
  for (const f of fixturesOfRound(g, g.round)) for (const id of [f.homeId, f.awayId]) for (const pid of state.teams[id]?.lineup ?? []) started.add(pid);
  state = trackApps(trackLoanApps(clauseGames(state, started), started), started);

  // humor: depois do jogo do seu clube
  const my = results.find((r) => r.homeId === g.userClubId || r.awayId === g.userClubId);
  if (my && !g.unemployed) {
    const home = my.homeId === g.userClubId;
    const div = userDivision(state);
    // Série D (grupos): a posição vale no grupo de 6; a escala de 20 mantém as metas da diretoria justas
    const grp = isGroups(div) ? userGroupRows(state, div) : undefined;
    const table = grp ?? divisionTable(state, div.id);
    state = { ...state, morale: updateMorale(g.morale, {
      gf: home ? my.homeGoals : my.awayGoals, ga: home ? my.awayGoals : my.homeGoals, home,
      position: table.findIndex((r) => r.clubId === g.userClubId) + 1, size: grp ? 20 : table.length, round: g.round, expectation: g.clubs[g.userClubId].boardExpectation,
    }) };
  }
  if (my && !g.unemployed) {
    const home = my.homeId === g.userClubId;
    state = coachAfterMatch(state, home ? my.homeGoals : my.awayGoals, home ? my.awayGoals : my.homeGoals); // overall do treinador: resultado e sequência
    const tb = isGroups(userDivision(state)) ? undefined : divisionTable(state, userDivision(state).id);
    if (tb) state = coachRelegationRisk(state, tb.findIndex((r) => r.clubId === g.userClubId) + 1, tb.length, slotsOf(g));
  }
  if (my && !g.unemployed) state = socialAfterMatch(state, my.homeId === g.userClubId ? my.homeGoals : my.awayGoals, my.homeId === g.userClubId ? my.awayGoals : my.homeGoals);
  const myHome = my && !g.unemployed && my.homeId === g.userClubId ? my : undefined;
  state = socialAds(tickContracts(tickBoletos(roundFinance(state, new Set(results.map((r) => r.homeId)), !!myHome))));
  if (myHome) state = playHomeGate(state, myHome.awayId).state; // público e bilheteria do seu jogo em casa (preço do ingresso)
  state = youthTick(fibraTick(inboxTick(state))); // mensagens, metas, fatura e plano de dados do celular
  state = boardTick(state, makeRng(g.seed * 19 + g.season * 7 + g.round)); // diretoria (demissão) ou, sem clube, propostas de emprego
  if (state.round >= 8 && state.round < state.totalRounds && state.round % 4 === 0) state = aiCoachTick(state, makeRng(g.seed * 53 + g.season * 17 + g.round)); // diretorias da IA avaliam os treinadores
  state = mundialAfterLeagueRound(contAfterLeagueRound(cupAfterLeagueRound(state)));
  // propostas dos outros clubes pelos jogadores listados
  state = generateOffers(state, rng);
  // meio da temporada: janela pequena de transferências da IA
  if (state.round === Math.floor(state.totalRounds / 2) + 1) state = aiPromoteYouth(aiRenewals(ensureAiYouth(state, rng), rng, 'meio'), rng, 1); // renovações antecipadas e base (o mercado da IA corre todo dia, na janela)
  return { state, results };
}

/** Próximo jogo do seu clube: a fase da copa (se for a data) ou a rodada do campeonato. */
export function playNext(g: GameState, tactics?: Tactic[]) {
  const orig = g;
  // sem "sorte" gravada a partida é a de sempre; com ela, a semente muda só nesta simulação (e volta ao normal no resultado)
  if (g.luck) g = { ...g, seed: (g.seed + g.luck) % 2147483647 };
  const out = playNextSeeded(g, tactics);
  return orig.luck ? { ...out, state: { ...out.state, seed: orig.seed, luck: undefined } } : out;
}

function playNextSeeded(g: GameState, tactics?: Tactic[]) {
  g = healUserLineup(g); // titular lesionado dá lugar a um reserva da mesma função
  const r = withInjured(injuredSet(g), () => withTactics(g.userClubId, g.unemployed ? undefined : tactics, () => playNextRaw(g))); // mudanças táticas feitas na partida ao vivo
  const my = g.unemployed ? undefined : r.results.find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
  if (my) { // registra o jogo (com a data) para o Calendário
    const ev = pendingEvent(g);
    const label = ev ? ev.label.replace(/^\S+\s/, '') : g.estadual?.due ? 'Estadual' : `${userDivision(g)?.name ?? ''} · Rodada ${g.round}`;
    const entry: PlayedMatch = { season: g.season, day: nextMatchDay(g), homeId: my.homeId, awayId: my.awayId, homeGoals: my.homeGoals, awayGoals: my.awayGoals, ...(my.pens ? { pens: my.pens } : {}), label };
    r.state = { ...r.state, played: [...(g.played ?? []).filter((x) => x.season === g.season), entry].slice(-140) };
  }
  const st = afterMatch(g, r.state);
  return { ...r, state: youthSync(processDays(st, calOf(g).day, calOf(st).day)) }; // (as competições da base andam junto) mensalidades e vencimentos dos dias que passaram
}
function playNextRaw(g: GameState) {
  const ev = pendingEvent(g);
  if (ev) return playEvent(g, ev.kind);
  if (g.estadual?.due) return playEstadualStep(g); // rodada dos estaduais sem jogo seu
  if (g.mundial?.due) return playMundialStep(g); // o seu clube não joga: avança sozinho
  return playRound(g);
}

/** Pula a temporada: simula tudo (campeonato, copas e Mundial) até a última rodada, inclusive os jogos do seu clube. */
export function simulateToEnd(g: GameState): GameState {
  let s = g;
  for (let i = 0; i < 400 && !isSeasonOver(s); i++) s = playNext(s).state;
  return s;
}

export const resultsOfDivision = (g: GameState, divisionId: string) => g.results.filter((r) => r.divisionId === divisionId);

/** Classificação atual de uma divisão. */
export function divisionTable(g: GameState, divisionId: string): TableRow[] {
  const d = g.divisions.find((x) => x.id === divisionId)!;
  if (isGroups(d)) return finalStandings(g, d).table; // Série D: campeão, vice, semifinalistas… e quem caiu antes
  return computeTable(d.clubIds.map((id) => ({ id, name: g.clubs[id].name })), resultsOfDivision(g, divisionId));
}

export interface DivisionMoves { divisionId: string; table: TableRow[]; promoted: string[]; relegated: string[] }

/** Quem sobe e quem desce em cada divisão, de acordo com a classificação atual. */
export function seasonMoves(g: GameState): DivisionMoves[] {
  const last = g.divisions.filter((d) => d.format !== 'outside').length - 1;
  const slots = slotsOf(g);
  const quals = serieDQualifiers(g); // clubes de estadual que sobem à Série D
  return g.divisions.map((d, i) => {
    const table = divisionTable(g, d.id);
    if (d.format === 'outside') return { divisionId: d.id, table, promoted: quals.filter((id) => d.clubIds.includes(id)), relegated: [] };
    if (isGroups(d)) return { divisionId: d.id, table, promoted: finalStandings(g, d).promoted, relegated: quals.length ? table.slice(-quals.length).map((r) => r.clubId) : [] }; // os piores da D voltam para os estaduais
    return {
      divisionId: d.id, table,
      promoted: i > 0 ? table.slice(0, slots).map((r) => r.clubId) : [],
      relegated: i < last ? table.slice(-slots).map((r) => r.clubId) : [],
    };
  });
}

export type Movement = 'promoted' | 'relegated' | 'stay';

export interface SeasonOutcome {
  moves: DivisionMoves[];
  userDivisionId: string;
  userPosition: number;
  movement: Movement;
  /** Divisão onde o clube jogará na próxima temporada. */
  nextDivisionId: string;
}

export function seasonOutcome(g: GameState): SeasonOutcome {
  const moves = seasonMoves(g);
  const i = userDivisionIndex(g);
  const m = moves[i];
  const movement: Movement = m.promoted.includes(g.userClubId) ? 'promoted' : m.relegated.includes(g.userClubId) ? 'relegated' : 'stay';
  const next = movement === 'promoted' ? i - 1 : movement === 'relegated' ? i + 1 : i;
  return { moves, userDivisionId: g.divisions[i].id, userPosition: m.table.findIndex((r) => r.clubId === g.userClubId) + 1, movement, nextDivisionId: g.divisions[next]?.id ?? 'fora' }; // 'fora' = volta para o estadual (caiu da Série D)
}

/** Resumo da temporada que acabou de terminar (campeões, classificações, copas). */
export function seasonSummary(g: GameState, out: SeasonOutcome = seasonOutcome(g)): SeasonSummary {
  const moves = out.moves;
  return {
    season: g.season, estadualChampions: g.estadual?.done ? estadualChampions(g) : undefined, tables: moves.map((m) => ({ id: m.divisionId, rows: m.table.map((r) => [r.clubId, r.points, r.played, r.gd] as [string, number, number, number]) })), cupChampionId: g.cup?.championId, libChampionId: g.lib?.championId, sulaChampionId: g.sula?.championId, uclChampionId: g.ucl?.championId, mundialChampionId: g.mundial?.championId, userDivisionId: out.userDivisionId, userPosition: out.userPosition,
    divisions: moves.map((m) => ({ id: m.divisionId, championId: m.table[0].clubId, promoted: m.promoted, relegated: m.relegated })),
    topScorers: topScorersOf(g),
  };
}

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
  const cupped: GameState = g.cup ? { ...state, cup: createCup(state), estadual: g.estadual ? nextEstaduais(g, g.estadual) : undefined } : state;
  const withCup: GameState = createContinentals({ ...cupped, mundial: undefined }, moves[0].table.map((r) => r.clubId), g.cup?.championId);
  const cal = calNew;
  let result: GameState = freezeGoals(youthSeason({ ...withCup, cal, history: withCup.history.map((h, i) => (i === withCup.history.length - 1 ? { ...h, promotion } : h)) }));
  result = { ...result, apps: {} }; // a evolução desta temporada já usou os minutos jogados: a contagem recomeça
  // carreira do treinador: pontos, demissão ou propostas de clubes maiores
  const relegatedU = out.movement === 'relegated', promotedU = out.movement === 'promoted';
  const reason = seasonEndFiring(g, out.userPosition, relegatedU);
  result = seasonPoints(result, out.userPosition, promotedU, relegatedU);
  result = coachSeasonEval(result, out.userPosition, out.movement, (result.titles ?? []).filter((t) => t.season === g.season && t.clubId === g.userClubId).length); // overall do treinador: objetivos e títulos
  result = reputationDrift(result);                                          // reputação dos clubes: sobe devagar, só no fim da temporada
  const after = seasonEndOffers(reason ? fire(result, reason) : result, out.userPosition, promotedU);
  const started = after.unemployed ? after : postContractOffer(payTierNotice(after)); // início da temporada: aviso de nova divisão e proposta de contrato (uma vez por temporada)
  return youthStartSeason(ensureAiState(prunePlayerMaps(started))); // (as competições da base da temporada nova) clubes que entraram na pirâmide e o clube que você deixou ficam completos
}

/** Aviso antes de virar a temporada: o treinador será demitido? (motivo ou null) */
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

export const firingWarning = (g: GameState): string | null => {
  if (!isSeasonOver(g) || g.unemployed) return null;
  const out = seasonOutcome(g);
  return seasonEndFiring(g, out.userPosition, out.movement === 'relegated');
};

export function setFormation(g: GameState, formation: FormationId): GameState {
  const t = g.teams[g.userClubId];
  return { ...g, teams: { ...g.teams, [g.userClubId]: { ...t, formation, lineup: autoLineup(t.players, formation) } } };
}

/** Troca um titular por um reserva da MESMA posição. */
export function swapPlayer(g: GameState, outId: string, inId: string): GameState {
  const t = g.teams[g.userClubId];
  const o = t.players.find((p) => p.id === outId), i = t.players.find((p) => p.id === inId);
  if (!o || !i || o.pos !== i.pos || !t.lineup.includes(outId) || t.lineup.includes(inId)) return g;
  const lineup = t.lineup.map((id) => (id === outId ? inId : id));
  return { ...g, teams: { ...g.teams, [g.userClubId]: { ...t, lineup } } };
}

export const POS_ORDER: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
