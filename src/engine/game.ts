import type { ClubData } from '../data/clubs';
import { aiRenewals } from './aicontracts';
import { freezeGoals } from './aigoals';
import { ensureAiState } from './aistate';
import { coachAfterMatch, coachRelegationRisk, stampPayTier } from './coachcareer';
import { startingOverall } from './coachpay';
import { addScorers, topScorersOf, type GoalEntry } from './scorers';
import { trackLoanApps } from './loandeals';
import { clauseGames } from './dealpay';
import { aiLineup, matchImportance, updateLoad } from './rotation';
import { aiPromoteYouth, ensureAiYouth, trackApps } from './aiyouth';
import { aiCoachTick } from './aicoaches';
import { contAfterLeagueRound, createContinentals, mundialAfterLeagueRound, playContStep, playMundialStep } from './continental';
import { hooks, REGIONAL_KEYS } from './hooks';
import { pendingEvent, playEvent } from './events';
import { tickContracts } from './assets';
import { groupFixtures, isGroups, userGroupRows, withGroups } from './groups';
import { advancePhases, kindOf, leagueTable, rulesFor, serieBStanding, serieCFixtures, serieCStanding, serieCTotalRounds, serieDFlow, serieDStanding } from './phases';
import { createEstaduais, estadualChampions, playEstadualStep, serieDQualifiers } from './estadual';
import { boardTick, seasonEndFiring } from './jobs';
import { managed } from './lookup';
import { socialAds, socialAfterMatch } from './social';
import { tickBoletos } from './bank';
import { roundFinance } from './finance';
import { playHomeGate } from './stadium';
import { inboxTick } from './inbox';
import './shop';
import { processDays } from './daily';
import { ensureYouth, youthTick } from './youth';
import { youthStartSeason, youthSync } from './ycomp';
import { fibraTick } from './netfibra';
import { afterMatch, calOf, nextMatchDay } from './calendar';
import { createCup, cupAfterLeagueRound, penaltyTakers, playCupRound, shootoutKicks } from './cup';
import { MORALE_START, moraleFactor, updateMorale } from './morale';
import { simulateMatch, withInjured, withTactics, type Tactic } from './match';
import { applyInjuries, healUserLineup, injuredSet, lineupWithout, pruneInjuries, type InjuryHit } from './injuries';
import { makeRng } from './rng';
import { buildFixtures } from './schedule';
import { generateOffers } from './roster';
import { autoLineup, teamFromPlayers, teamRatings } from './squad';
import { computeTable } from './table';
import type { ClubInfo, DivisionState, FormationId, Fixture, GameState, MatchResult, PlayedMatch, Position, SeasonSummary, Stance, TableRow } from './types';

export { DIVISION_INCOME, seasonIncome } from './economy';

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

export function buildSeason(divisions: DivisionState[]): { fixtures: Fixture[]; totalRounds: number } {
  const fixtures: Fixture[] = [];
  let totalRounds = 0;
  for (const d of divisions) {
    if (isGroups(d)) { fixtures.push(...groupFixtures(d)); totalRounds = Math.max(totalRounds, 10); continue; }
    if (kindOf(d) === 'C') { fixtures.push(...serieCFixtures(d)); totalRounds = Math.max(totalRounds, serieCTotalRounds(d)); continue; } // 1ª fase em turno único; quadrangulares e final entram depois
    const f = buildFixtures(d.clubIds, d.id);
    fixtures.push(...f.fixtures);
    totalRounds = Math.max(totalRounds, f.totalRounds + (kindOf(d) === 'B' ? 2 : 0)); // Série B: mais 2 rodadas (ida e volta) dos playoffs de acesso
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
    userClubId: input.userClubId, seed, season: input.season, freeStart: input.season, round: 1, totalRounds,
    clubs, budgets, transfers: [], morale: { ...MORALE_START }, transferList: [], loanList: [], offers: [], loans: [], news: [], divisions, teams, fixtures, results: [], history: [],
  };
  // a carreira já nasce completa (contratos, treinadores, base, objetivos): carregar o save depois não muda nada
  if (!input.cup) return hooks.ensureWorld(youthStartSeason(ensureYouth(stampPayTier(ensureAiState(freezeGoals(createContinentals(career)))))));
  return hooks.ensureWorld(youthStartSeason(ensureYouth(stampPayTier(ensureAiState(freezeGoals(hooks.createRegionals(createContinentals({ ...career, cup: createCup(career), estadual: createEstaduais(input.outside ? { id: input.outside.id, uf: input.outside.uf ?? 'SP' } : undefined) }))))))));
}

export const isSeasonOver = (g: GameState) => g.round > g.totalRounds && !g.mundial?.due && !g.superMundial?.due && !REGIONAL_KEYS.some((k) => g.regionais?.[k]?.due);

export const userDivisionIndex = (g: GameState) => g.divisions.findIndex((d) => d.clubIds.includes(g.userClubId));
export const userDivision = (g: GameState) => g.divisions[userDivisionIndex(g)];

export function fixturesOfRound(g: GameState, round: number, divisionId?: string) {
  return g.fixtures.filter((f) => f.round === round && (!divisionId || f.divisionId === divisionId));
}

/** Joga a próxima rodada em TODAS as divisões. Retorna o novo estado e os resultados da rodada. */
export function playRound(g: GameState): { state: GameState; results: MatchResult[] } {
  if (g.round > g.totalRounds) return g.mundial?.due ? playMundialStep(g) : g.superMundial?.due ? hooks.playSuperStep(g) : (() => { const k = REGIONAL_KEYS.find((x) => g.regionais?.[x]?.due); return k ? hooks.playRegionalStep(g, k) : { state: g, results: [] as MatchResult[] }; })(); // só falta o Mundial / Super Mundial / copas regionais
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
    // jogo eliminatório: pênaltis se empatar (confronto de ida e volta: só na volta, se o agregado terminar empatado)
    const leg1 = f.tie && f.leg === 2 ? g.results.find((r) => r.divisionId === f.divisionId && r.tie === f.tie && r.leg === 1) : undefined;
    const tiedNow = f.tie ? f.leg === 2 && !!leg1 && out.homeGoals + leg1.awayGoals === out.awayGoals + leg1.homeGoals : out.homeGoals === out.awayGoals;
    const sk = f.ko && tiedNow ? shootoutKicks(rng, teamRatings(teams[f.homeId]).gk, teamRatings(teams[f.awayId]).gk, penaltyTakers(teams[f.homeId]), penaltyTakers(teams[f.awayId])) : undefined;
    const pens = sk?.score;
    return { divisionId: f.divisionId, round: f.round, homeId: f.homeId, awayId: f.awayId, homeGoals: out.homeGoals, awayGoals: out.awayGoals, ...(f.tie ? { tie: f.tie, leg: f.leg, phase: f.phase } : {}), ...(pens ? { pens } : {}), ...(sk && mine ? { penKicks: { home: sk.home, away: sk.away } } : {}), events: mine ? out.events : [] };
  });
  let state: GameState = advancePhases({ ...g, teams, round: g.round + 1, results: [...g.results, ...results], load: updateLoad(g, played), scorers: addScorers(g, goalLog) });
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
  state = hooks.superAfterLeagueRound(mundialAfterLeagueRound(hooks.regionalAfterLeagueRound(contAfterLeagueRound(cupAfterLeagueRound(state)))));
  // propostas dos outros clubes pelos jogadores listados
  state = generateOffers(state, rng);
  state = hooks.foreignSalesTick(state, makeRng(g.seed * 43 + g.season * 13 + g.round * 3)); // propostas de clubes de outros países pelos jogadores à venda
  state = hooks.worldTick(state); // as ligas do mundo jogam a parte delas da rodada
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
  if (g.superMundial?.due) return hooks.playSuperStep(g);
  { const k = REGIONAL_KEYS.find((x) => g.regionais?.[x]?.due); if (k) return hooks.playRegionalStep(g, k); }
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
  if (isGroups(d)) return serieDStanding(g, d).table; // Série D: campeão, vice, semifinalistas… e quem caiu antes
  if (kindOf(d) === 'C') return serieCStanding(g, d).table; // Série C: 1ª fase; depois quadrangulares e final
  if (kindOf(d) === 'B') return leagueTable(g, d); // Série B: só as 38 rodadas (os playoffs ficam à parte)
  return computeTable(d.clubIds.map((id) => ({ id, name: g.clubs[id].name })), resultsOfDivision(g, divisionId));
}

export interface DivisionMoves { divisionId: string; table: TableRow[]; promoted: string[]; relegated: string[] }

/** Quem sobe e quem desce em cada divisão, de acordo com a classificação atual. */
export function seasonMoves(g: GameState): DivisionMoves[] {
  const last = g.divisions.filter((d) => d.format !== 'outside').length - 1;
  const slots = slotsOf(g);
  const quals = serieDQualifiers(g); // clubes de estadual que sobem à Série D
  const rules = rulesFor(g.season);
  const flow = serieDFlow(g.season, quals.length);
  return g.divisions.map((d, i) => {
    const table = divisionTable(g, d.id);
    if (d.format === 'outside') return { divisionId: d.id, table, promoted: quals.filter((id) => d.clubIds.includes(id)), relegated: [] };
    if (isGroups(d)) return { divisionId: d.id, table, promoted: serieDStanding(g, d).promoted.slice(0, flow.promoted), relegated: flow.relegated ? table.slice(-flow.relegated).map((r) => r.clubId) : [] }; // os piores da D voltam para os estaduais
    if (kindOf(d) === 'B') return { divisionId: d.id, table, promoted: serieBStanding(g, d).promoted, relegated: i < last ? table.slice(-slots).map((r) => r.clubId) : [] };
    if (kindOf(d) === 'C') return { divisionId: d.id, table, promoted: serieCStanding(g, d).promoted, relegated: i < last ? leagueTable(g, d).slice(-rules.cRelegated).map((r) => r.clubId) : [] }; // caem os últimos da 1ª fase
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
    season: g.season, estadualChampions: g.estadual?.done ? estadualChampions(g) : undefined, tables: moves.map((m) => ({ id: m.divisionId, rows: m.table.map((r) => [r.clubId, r.points, r.played, r.gd] as [string, number, number, number]) })), cupChampionId: g.cup?.championId, libChampionId: g.lib?.championId, sulaChampionId: g.sula?.championId, uclChampionId: g.ucl?.championId, mundialChampionId: g.mundial?.championId, superChampionId: g.superMundial?.championId, nordesteChampionId: g.regionais?.nordeste?.championId, verdeChampionId: g.regionais?.verde?.championId, userDivisionId: out.userDivisionId, userPosition: out.userPosition,
    divisions: moves.map((m) => ({ id: m.divisionId, championId: m.table[0].clubId, promoted: m.promoted, relegated: m.relegated })),
    topScorers: topScorersOf(g),
  };
}


/** Aviso antes de virar a temporada: o treinador será demitido? (motivo ou null) */

export const firingWarning = (g: GameState): string | null => {
  if (!isSeasonOver(g) || g.unemployed) return null;
  const out = seasonOutcome(g);
  return seasonEndFiring(g, out.userPosition, out.movement === 'relegated');
};

export function setFormation(g: GameState, formation: FormationId): GameState {
  const t = g.teams[g.userClubId];
  return { ...g, teams: { ...g.teams, [g.userClubId]: { ...t, formation, lineup: autoLineup(t.players, formation) } } };
}

/** Postura do seu time (posse, contra-ataque, agressivo, cauteloso ou equilibrado): vale em todas as partidas até mudar. */
export function setStance(g: GameState, stance: Stance): GameState {
  const t = g.teams[g.userClubId];
  return { ...g, teams: { ...g.teams, [g.userClubId]: { ...t, stance } } };
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
