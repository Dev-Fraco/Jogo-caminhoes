import { creditAccount } from './bank';
import { coachSalary } from './finance';
import { MORALE_START } from './morale';
import { notifyPhone } from './phone';
import { makeRng, type Rng } from './rng';
import { returnLoans } from './roster';
import { autoLineup } from './squad';
import { CLUBS_DATA, type ClubData } from '../data/clubs';
import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import type { ClubInfo, ForeignOffer, GameState, JobOffer, JobSpell, NewsItem } from './types';

export const COACH_LEVEL: Record<string, number> = { unknown: 1, amateur: 2, 'semi-pro': 3, pro: 4, legend: 5 };
export const MAX_OFFERS = 4;
const OFFER_LIFE = 8; // rodadas

const news = (g: GameState, text: string, tone: NewsItem['tone']): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const absRound = (g: Pick<GameState, 'season' | 'round' | 'totalRounds'>, season = g.season, round = g.round) => season * g.totalRounds + round;

/** Nível do treinador (1 a 6): reputação inicial + pontos de carreira (títulos e acessos sobem, demissões descem). */
export const coachLevel = (g: Pick<GameState, 'coach' | 'coachPoints'>) => Math.max(1, Math.min(6, (COACH_LEVEL[g.coach.reputation] ?? 2) + Math.floor((g.coachPoints ?? 0) / 25)));

export const jobsOf = (g: GameState): JobSpell[] => g.jobs ?? [{ clubId: g.userClubId, fromSeason: g.history[0]?.season ?? g.season }];

/** A diretoria é mais paciente no Fácil e menos paciente no Difícil. */
const patience = (g: Pick<GameState, 'difficulty'>) => (g.difficulty === 'easy' ? -8 : g.difficulty === 'hard' || g.difficulty === 'legend' ? 8 : 0);

/* ---------- demissão ---------- */

/** Motivo da demissão no fim da temporada, ou null se você fica. */
export function seasonEndFiring(g: GameState, position: number, relegated: boolean): string | null {
  if (g.unemployed) return null;
  const exp = g.clubs[g.userClubId].boardExpectation;
  if (g.morale.board <= 22 + patience(g)) return 'A diretoria perdeu a confiança no seu trabalho.';
  if (relegated && exp !== 'survive') return 'O rebaixamento foi inaceitável para a diretoria.';
  if (exp === 'title' && position > 10 && g.morale.board < 45 + patience(g)) return 'O clube queria brigar pelo título e terminou muito longe.';
  return null;
}

export function leaveClub(g: GameState): GameState {
  let s = returnLoans(g); // jogadores emprestados voltam para o clube que você deixa
  s = { ...s, transferList: [], loanList: [], offers: [] };
  const jobs = jobsOf(g);
  s = { ...s, jobs: jobs.map((j, i) => (i === jobs.length - 1 && !j.toSeason ? { ...j, toSeason: g.season } : j)) };
  return s;
}

/** Demissão: indenização pelo contrato, queda de seguidores, e o clube passa para a IA. */
export function fire(g: GameState, reason: string): GameState {
  if (g.unemployed) return g;
  const former = g.clubs[g.userClubId].name;
  let s = leaveClub(g);
  const jobs = jobsOf(s);
  s = { ...s, jobs: jobs.map((j, i) => (i === jobs.length - 1 ? { ...j, ended: 'demitido' as const } : j)) };
  const pay = Math.round(coachSalary(g) * 0.5 / 1_000) * 1_000;
  s = { ...s, unemployed: true, firedInfo: { clubId: g.userClubId, season: g.season, round: g.round, reason }, jobOffers: [], coachPoints: (g.coachPoints ?? 0) - 15, boardLow: 0, wageCover: 0 };
  s = creditAccount(s, 'Indenização', `Rescisão com ${former}`, pay);
  if (s.social) s = { ...s, social: { ...s.social, linstagra: { ...s.social.linstagra, followers: Math.round(s.social.linstagra.followers * 0.92) }, tikiteko: { ...s.social.tikiteko, followers: Math.round(s.social.tikiteko.followers * 0.92) } } };
  s = news(s, `🚫 Você foi demitido do ${former}. ${reason}`, 'bad');
  return notifyPhone(s, 'banco', `Você recebeu uma indenização de R$ ${pay.toLocaleString('pt-BR')} do ${former}.`);
}

/** Pedir demissão: sem indenização. */
export function resign(g: GameState): GameState {
  if (g.unemployed) return g;
  const former = g.clubs[g.userClubId].name;
  let s = leaveClub(g);
  const jobs = jobsOf(s);
  s = { ...s, jobs: jobs.map((j, i) => (i === jobs.length - 1 ? { ...j, ended: 'pediu demissão' as const } : j)), unemployed: true, firedInfo: { clubId: g.userClubId, season: g.season, round: g.round, reason: 'Você pediu demissão.', resigned: true }, jobOffers: [], boardLow: 0, wageCover: 0 };
  return news(s, `🧳 Você pediu demissão do ${former}.`, 'info');
}

/** Depois de cada rodada: acompanha a paciência da diretoria (3 rodadas no limite = demissão) e, sem clube, procura propostas. */
export function boardTick(g: GameState, rng: Rng): GameState {
  if (g.observer) return g;
  if (g.unemployed) return generateJobOffers(g, rng);
  const low = g.morale.board <= 10 + patience(g) && g.round >= 15 && g.round <= g.totalRounds - 3;
  const boardLow = low ? (g.boardLow ?? 0) + 1 : 0;
  let s: GameState = { ...g, boardLow };
  if (boardLow >= 4) return fire(s, 'A diretoria perdeu a paciência com os resultados.');
  if (boardLow === 3) s = notifyPhone(news(s, '⚠️ A diretoria está por um fio: mais uma rodada ruim e você pode ser demitido.', 'bad'), 'noticias', 'A diretoria está por um fio!');
  return s;
}

/* ---------- propostas e candidaturas ---------- */

const former = (g: GameState) => (g.firedInfo && g.season - g.firedInfo.season <= 1 ? g.firedInfo.clubId : '');

/** Clubes que aceitariam o treinador: reputação do clube até o nível dele (e, mais raramente, um degrau acima). */
export function eligibleClubs(g: GameState, stretch = 0): string[] {
  const lvl = coachLevel(g) + stretch;
  return g.divisions.flatMap((d) => d.clubIds).filter((id) => id !== g.userClubId || g.unemployed).filter((id) => id !== former(g) && g.clubs[id].reputation <= lvl);
}

/** Clube de uma proposta (do seu mundo ou de outro país). */
export const offerClub = (g: GameState, o: JobOffer): ClubInfo => o.foreign?.club ?? g.clubs[o.clubId];
export const toInfo = (c: ClubData): ClubInfo => ({ id: c.id, name: c.name, shortName: c.shortName, badge: c.badge, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: c.stadium, city: c.city, reputation: c.reputation, boardExpectation: c.boardExpectation });

/** Clubes do mundo inteiro (fora da liga em que o jogo está) que aceitariam o treinador pelo nível dele. */
export function foreignClubs(g: GameState, stretch = 0): ForeignOffer[] {
  const lvl = coachLevel(g) + stretch;
  const here = new Set(g.divisions.map((d) => d.id));
  const out: ForeignOffer[] = [];
  for (const cid of COUNTRY_ORDER) {
    const country = WORLD_DATA[cid];
    if (!country) continue;
    for (const league of country.leagues) {
      if (league.divisions.some((d) => here.has(d.id))) continue; // é a liga atual
      for (const d of league.divisions) {
        if (d.format === 'estadual') continue;
        for (const c of CLUBS_DATA[d.id] ?? []) if (c.reputation <= lvl && !g.clubs[c.id]) out.push({ countryId: cid, leagueId: league.id, countryName: country.name, leagueName: league.name, divisionName: d.alias ?? d.name, club: toInfo(c) });
      }
    }
  }
  return out;
}

export function generateJobOffers(g: GameState, rng: Rng, force = 0): GameState {
  const now = absRound(g);
  let offers = (g.jobOffers ?? []).filter((o) => now - absRound(g, o.season, o.round) <= OFFER_LIFE);
  const tries = force || (rng() < 0.3 ? 1 : 0);
  for (let i = 0; i < tries && offers.length < MAX_OFFERS; i++) {
    // demitido: clubes do mundo inteiro podem contratar o treinador (cerca de 4 em cada 10 propostas vêm de fora)
    if (g.unemployed && rng() < 0.4) {
      const abroad = foreignClubs(g, rng() < 0.25 ? 1 : 0).filter((f) => !offers.some((o) => o.clubId === f.club.id));
      if (abroad.length) {
        const f = abroad[Math.floor(rng() * abroad.length)];
        offers = [...offers, { clubId: f.club.id, season: g.season, round: g.round, expires: OFFER_LIFE, foreign: f }];
        continue;
      }
    }
    const pool = eligibleClubs(g, rng() < 0.25 ? 1 : 0).filter((id) => !offers.some((o) => o.clubId === id));
    if (!pool.length) break;
    const clubId = pool[Math.floor(rng() * pool.length)];
    offers = [...offers, { clubId, season: g.season, round: g.round, expires: OFFER_LIFE }];
  }
  const fresh = offers.filter((o) => !(g.jobOffers ?? []).some((x) => x.clubId === o.clubId));
  let s: GameState = { ...g, jobOffers: offers };
  for (const o of fresh) { const nm = offerClub(s, o).name + (o.foreign ? ` (${o.foreign.countryName})` : ''); s = notifyPhone(news(s, `📨 ${nm} quer contratar você como treinador!`, 'good'), 'noticias', `O ${nm} quer contratar você!`); }
  return s;
}

/** Fim de temporada: quem foi bem (título, G4 ou acesso) recebe propostas de clubes maiores. */
export function seasonEndOffers(g: GameState, position: number, promoted: boolean): GameState {
  if (g.observer) return g;
  if (g.unemployed) return generateJobOffers(g, makeRng(g.seed * 41 + g.season * 7), 2);
  if (!(position <= 3 || promoted)) return g;
  const rng = makeRng(g.seed * 43 + g.season * 11);
  const myRep = g.clubs[g.userClubId].reputation;
  const bigger = eligibleClubs(g, 1).filter((id) => g.clubs[id].reputation > myRep);
  if (!bigger.length || rng() > 0.7) return g;
  const clubId = bigger[Math.floor(rng() * bigger.length)];
  const offers: JobOffer[] = [...(g.jobOffers ?? []), { clubId, season: g.season, round: g.round, expires: OFFER_LIFE }].slice(-MAX_OFFERS);
  return notifyPhone(news({ ...g, jobOffers: offers }, `📨 ${g.clubs[clubId].name} quer contratar você como treinador!`, 'good'), 'noticias', `O ${g.clubs[clubId].name} quer contratar você!`);
}

export type HireResult = { ok: true; state: GameState } | { ok: false; error: string };

/** Assume o clube: zera humor, listas e propostas e escala o melhor time. */
export function hire(g: GameState, clubId: string): GameState {
  let s = g.unemployed ? g : leaveClub(g);
  if (!g.unemployed) {
    const jobs = jobsOf(s);
    s = { ...s, jobs: jobs.map((j, i) => (i === jobs.length - 1 ? { ...j, ended: 'contratado por outro clube' as const } : j)) };
  }
  const t = s.teams[clubId];
  s = {
    ...s, youth: undefined, userClubId: clubId, unemployed: false, firedInfo: g.firedInfo, jobOffers: [], boardLow: 0, appliedKey: undefined,
    payMult: undefined, salaryNeg: undefined, // salário novo no clube novo
    morale: { ...MORALE_START, board: 55 }, transferList: [], loanList: [], offers: [], loans: [], wageCover: 0,
    teams: { ...s.teams, [clubId]: { ...t, lineup: autoLineup(t.players, t.formation) } },
    jobs: [...jobsOf(s), { clubId, fromSeason: g.season }],
    social: s.social ? { ...s.social, lastMatch: undefined } : s.social,
  };
  return news(s, `✍️ Você é o novo treinador do ${s.clubs[clubId].name}!`, 'good');
}

export function acceptOffer(g: GameState, clubId: string): HireResult {
  if (!(g.jobOffers ?? []).some((o) => o.clubId === clubId)) return { ok: false, error: 'Proposta não encontrada ou vencida.' };
  return { ok: true, state: hire(g, clubId) };
}
export const declineOffer = (g: GameState, clubId: string): GameState => ({ ...g, jobOffers: (g.jobOffers ?? []).filter((o) => o.clubId !== clubId) });

/** Chance de ser aceito ao se candidatar: alta se o clube está no seu nível, baixa se está acima. */
export function applicationOdds(g: GameState, clubId: string): { pct: number; label: 'Alta' | 'Média' | 'Baixa' | 'Muito baixa' } {
  const diff = g.clubs[clubId].reputation - coachLevel(g);
  const pct = diff <= -2 ? 80 : diff === -1 ? 70 : diff === 0 ? 55 : diff === 1 ? 20 : 3;
  return { pct, label: pct >= 65 ? 'Alta' : pct >= 40 ? 'Média' : pct >= 15 ? 'Baixa' : 'Muito baixa' };
}

/** Candidatura: uma por rodada. O resultado é sorteado, mas fixo para a mesma rodada e clube. */
export function applyForJob(g: GameState, clubId: string): { ok: true; state: GameState; accepted: boolean; text: string } | { ok: false; error: string } {
  if (!g.unemployed) return { ok: false, error: 'Você já tem um clube.' };
  const key = `${g.season}-${g.round}`;
  if (g.appliedKey === key) return { ok: false, error: 'Você já se candidatou nesta rodada. Avance a rodada para tentar de novo.' };
  if (clubId === former(g)) return { ok: false, error: 'O clube que demitiu você não quer te receber de volta agora.' };
  const odds = applicationOdds(g, clubId);
  const rng = makeRng(g.seed * 61 + g.season * 17 + g.round * 5 + clubId.length * 13 + (clubId.charCodeAt(0) || 0));
  const accepted = rng() * 100 < odds.pct;
  const name = g.clubs[clubId].name;
  if (accepted) return { ok: true, state: hire(g, clubId), accepted, text: `O ${name} aceitou a sua candidatura!` };
  return { ok: true, accepted, state: news({ ...g, appliedKey: key }, `❌ O ${name} recusou a sua candidatura.`, 'bad'), text: `O ${name} preferiu outro treinador.` };
}

/** Pontos de carreira no fim da temporada. */
export function seasonPoints(g: GameState, position: number, promoted: boolean, relegated: boolean): GameState {
  if (g.unemployed) return g;
  const pts = (position === 1 ? 8 : position <= 4 ? 3 : 0) + (promoted ? 5 : 0) - (relegated ? 6 : 0);
  return { ...g, coachPoints: (g.coachPoints ?? 0) + pts };
}
