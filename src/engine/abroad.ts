import { pyramidOf, slotsOfLeague } from '../data/pyramid';
import { hire, stashClubProjects, type HireResult } from './jobs';
import { newCareer } from './game';
import { MORALE_START } from './morale';
import type { GameState, JobOffer, NewsItem } from './types';

/** Aceita um emprego em outro país: a carreira passa para a liga dele (nova temporada), levando tudo que é do treinador (títulos, dinheiro, celular, banco, bens, redes). */
export function hireAbroad(g: GameState, offer: JobOffer): GameState {
  const f = offer.foreign!;
  const divisions = pyramidOf(f.countryId, f.leagueId);
  const fresh = newCareer({
    saveName: g.saveName, coach: g.coach, difficulty: g.difficulty, mode: g.mode, season: g.season, userClubId: f.club.id,
    leagueName: f.leagueId === 'brasileirao' ? undefined : f.leagueName, slots: slotsOfLeague(f.leagueId), divisions, cup: f.leagueId === 'brasileirao',
  }, (g.seed * 31 + g.season * 7 + 11) % 2147483647);
  const stashed = stashClubProjects(g); // o que você construiu no clube que deixa fica guardado
  const back = stashed.clubProjects?.[f.club.id]; // e, se você já trabalhou no novo clube, volta como estava
  const spells = (g.jobs ?? []).map((j, i, a) => (i === a.length - 1 && !j.toSeason ? { ...j, toSeason: g.season } : j));
  const note: NewsItem = { season: g.season, round: 1, text: `✍️ Você se mudou para ${f.countryName}: novo treinador do ${f.club.name} (${f.leagueName}).`, tone: 'good' };
  return {
    ...fresh,
    morale: { ...MORALE_START, board: 55 },
    news: [note],
    coachPoints: g.coachPoints, coachMoney: g.coachMoney, wageCover: 0, titles: g.titles, inflation: g.inflation, autoPay: g.autoPay,
    jobs: [...spells, { clubId: f.club.id, fromSeason: g.season }],
    clubProjects: stashed.clubProjects, aiAcademy: { ...(fresh.aiAcademy ?? {}), ...(stashed.aiAcademy ?? {}) }, ...(back?.youth ? { youth: back.youth } : {}), ...(back?.stadium ? { stadium: back.stadium } : {}),
    phone: g.phone, bank: g.bank, assets: g.assets, inbox: g.inbox,
    social: g.social ? { ...g.social, lastMatch: undefined } : g.social,
  };
}

/** Aceita uma proposta (do seu país ou de fora). */
export function acceptAnyOffer(g: GameState, clubId: string): HireResult {
  const o = (g.jobOffers ?? []).find((x) => x.clubId === clubId);
  if (!o) return { ok: false, error: 'Proposta não encontrada ou vencida.' };
  try { return { ok: true, state: o.foreign ? hireAbroad(g, o) : hire(g, clubId) }; } catch { return { ok: false, error: 'Não foi possível assumir esse clube agora.' }; }
}
