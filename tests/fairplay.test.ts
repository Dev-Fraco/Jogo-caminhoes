import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { calOf, YEAR_DAYS } from '../src/engine/calendar';
import { banOf, FAIRPLAY_LIMIT, fairplayWarning, signingsThisSeason } from '../src/engine/fairplay';
import { loanIn, loanMarket } from '../src/engine/loanin';
import { quickSign } from '../src/engine/market';
import { simulateToEnd } from '../src/engine/game';
import { autoLineup } from '../src/engine/squad';
import { returnLoans } from '../src/engine/roster';
import { MAX_SQUAD } from '../src/engine/transfers';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const rich = (g: GameState): GameState => ({ ...g, budgets: { ...g.budgets, [g.userClubId]: 900_000_000 }, teams: { ...g.teams, [g.userClubId]: (() => { const t = g.teams[g.userClubId]; const players = t.players.slice(0, 22); return { ...t, players, lineup: autoLineup(players, t.formation) }; })() } });
/** Um reserva barato de cada um dos primeiros clubes (para contratar). */
const targets = (g: GameState) => Object.keys(g.teams).filter((id) => id !== g.userClubId).slice(0, 10).map((id) => ({ id, p: [...g.teams[id].players].sort((a, b) => a.strength - b.strength)[10] }));

describe('fair play financeiro', () => {
  it('5 contratações avisam; a 6ª gera transfer ban de 1 ano; durante o ban ninguém é contratado', () => {
    let g = rich(makeCareer('flamengo', 4));
    const t = targets(g);
    for (let i = 0; i < FAIRPLAY_LIMIT; i++) { const r = quickSign(g, t[i].id, t[i].p.id); expect(r.deal).toBe(true); g = r.state; }
    expect(signingsThisSeason(g)).toBe(FAIRPLAY_LIMIT);
    expect(fairplayWarning(g)).toMatch(/meta de transferência/);
    expect(banOf(g)).toBeUndefined();
    const r4 = quickSign(g, t[FAIRPLAY_LIMIT].id, t[FAIRPLAY_LIMIT].p.id); expect(r4.deal).toBe(true); g = r4.state;
    expect(banOf(g)).toBeTruthy();
    expect(g.news.some((n) => /transfer ban/i.test(n.text))).toBe(true);
    const r5 = quickSign(g, t[FAIRPLAY_LIMIT + 1].id, t[FAIRPLAY_LIMIT + 1].p.id);
    expect(r5.deal).toBe(false); expect(r5.blocked).toMatch(/Transfer ban/);
    // passado 1 ano o ban acaba
    g = { ...g, cal: { ...calOf(g), day: g.transferBan!.since + YEAR_DAYS } };
    expect(banOf(g)).toBeUndefined();
  });
  it('empréstimo de jogadores de outros clubes: lista, taxa, conta no fair play e volta ao dono no fim da temporada', () => {
    let g = rich(makeCareer('flamengo', 4));
    const list = loanMarket(g);
    expect(list.length).toBeGreaterThan(50);
    expect(list.every((e) => e.clubId !== 'flamengo')).toBe(true);
    const e = list.find((x) => x.player.age <= 27)!; // jovem: não se aposenta na virada
    const before = g.budgets.flamengo, ownerBefore = g.teams[e.clubId].players.length;
    const r = loanIn(g, e.player.id);
    expect(r.check.ok).toBe(true); g = r.state;
    expect(g.teams.flamengo.players.some((p) => p.id === e.player.id)).toBe(true);
    expect(g.teams[e.clubId].players.length).toBe(ownerBefore - 1);
    expect(g.budgets.flamengo).toBe(before - e.fee);
    expect(signingsThisSeason(g)).toBe(1);
    expect(loanMarket(g).some((x) => x.player.id === e.player.id)).toBe(false);
    g = simulateToEnd({ ...g, morale: { ...g.morale, board: 60 } });
    const back = returnLoans(g);
    expect(back.teams[e.clubId].players.some((p) => p.id === e.player.id)).toBe(true);
    expect(back.teams.flamengo.players.some((p) => p.id === e.player.id)).toBe(false);
    expect(back.loansIn).toEqual([]);
    expect(startNextSeason({ ...g, unemployed: undefined, morale: { ...g.morale, board: 60 } }).loansIn).toEqual([]);
  });
  it('elenco cheio bloqueia empréstimo', () => {
    let g = makeCareer('flamengo', 4);
    const me = g.teams.flamengo;
    const extra = Object.values(g.teams).find((t) => t !== me)!.players;
    g = { ...g, teams: { ...g.teams, flamengo: { ...me, players: [...me.players, ...extra].slice(0, MAX_SQUAD).map((p, i) => ({ ...p, id: p.id + (i >= me.players.length ? 'x' : '') })) } } };
    const r = loanIn(g, loanMarket(g)[0].player.id);
    expect(r.check.ok).toBe(false);
  });
});
