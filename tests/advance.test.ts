import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import type { ClubData } from '../src/data/clubs';
import { advanceToUserMatch, nextUserMatchDay, userPlaysNextSlot } from '../src/engine/advance';
import { advanceToMatchDays } from '../src/engine/daily';
import { calOf, isMatchDay, matchDayOf } from '../src/engine/calendar';
import { isSeasonOver, newCareer, playNext } from '../src/engine/game';
import { pendingEvent } from '../src/engine/events';
import { generateSquad } from '../src/engine/squad';
import type { GameState } from '../src/engine/types';
import { auditSeasonEnd } from './audit_lib';

const coach = { name: 'A B', nationality: 'BR', reputation: 'pro' };
const custom = (): ClubData => ({ id: 'meu-real-esperanca', name: 'Real Esperança', shortName: 'RES', badge: 'x', primaryColor: '#1e6bff', secondaryColor: '#ffffff', stadium: 'Estádio da Esperança', city: 'Fortaleza', budget: 900_000, boardExpectation: 'mid', reputation: 1, uf: 'CE', custom: true, squad: generateSquad({ id: 'meu-real-esperanca', name: 'Real Esperança', short: 'RES', color: '#1e6bff', strength: 48 }, 2026) });
const outsider = (seed = 5): GameState => { const c = custom(); return newCareer({ saveName: 't', coach, difficulty: 'normal', mode: 'career', season: 2026, userClubId: c.id, divisions: brazilPyramid(), cup: true, outside: c }, seed); };
const career = (id: string, seed = 5): GameState => newCareer({ saveName: 't', coach, difficulty: 'normal', mode: 'career', season: 2026, userClubId: id, divisions: brazilPyramid(), cup: true }, seed);
const noNews = (g: GameState) => JSON.stringify({ ...g, news: [] });
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 70 } }); // diretoria paciente: não demite no meio do teste

/** O mesmo avanço, feito à mão passo a passo (a referência para comparar). */
function manual(g: GameState): GameState {
  let s = g;
  for (let i = 0; i < 500 && !isSeasonOver(s); i++) { if (userPlaysNextSlot(s)) return advanceToMatchDays(s); s = playNext(advanceToMatchDays(s)).state; }
  return s;
}

describe('avanço do calendário até o próximo jogo do seu clube', () => {
  it('clube só de estadual: para exatamente no dia do jogo dele; depois do estadual simula tudo dos outros clubes até o fim da temporada', () => {
    let g = keep(outsider());
    const r0 = advanceToUserMatch(g);
    expect(r0.stoppedBy).toBe('jogo');
    const c = calOf(r0.state);
    expect(isMatchDay(r0.state)).toBe(true);
    expect(c.day).toBe(matchDayOf(g.seed, g.season, c.start, c.slot));            // o dia exato da data do calendário
    expect(userPlaysNextSlot(r0.state)).toBe(true); expect(pendingEvent(r0.state)?.match.homeId === g.userClubId || pendingEvent(r0.state)?.match.awayId === g.userClubId).toBe(true);
    // joga todos os jogos do estadual do seu clube
    g = r0.state; let guard = 0;
    while (guard++ < 80) { const a = advanceToUserMatch(keep(g)); g = a.state; if (a.stoppedBy !== 'jogo') break; g = keep(playNext(g).state); }
    expect(isSeasonOver(g)).toBe(true);
    const end = g;
    expect(auditSeasonEnd(end)).toEqual([]);                                       // todas as partidas geradas, jogadas e somando certo
    for (const d of end.divisions.filter((x) => x.format !== 'outside' && x.format !== 'groups')) expect(end.results.filter((r) => r.divisionId === d.id).length).toBe(d.clubIds.length * (d.clubIds.length - 1));
    expect(end.cup?.championId).toBeTruthy(); expect(end.estadual?.done).toBe(true);
  }, 300_000);
  it('o avanço automático dá exatamente o mesmo resultado que simular data por data: resultados, classificações, caixas e salários preservados', () => {
    const g = keep(outsider(9));
    // joga todos os jogos do estadual do clube; guarda o estado logo antes do avanço longo (até o fim da temporada)
    let s = g, prev = g, guard = 0, auto = advanceToUserMatch(g);
    while (guard++ < 80) { prev = s; auto = advanceToUserMatch(s); if (auto.stoppedBy !== 'jogo') break; s = keep(playNext(auto.state).state); }
    s = prev;
    const ref = manual(s);
    expect(auto.simulated).toBeGreaterThan(5);                                      // muitas datas só de outros clubes
    expect(auto.stoppedBy).toBe('fim-da-temporada');
    expect(noNews(auto.state)).toBe(noNews(ref));                                   // idêntico à simulação manual (tudo preservado)
    expect(auto.state.news[0].text).toContain('simuladas');
    // dinheiro e tabelas se movimentaram de verdade
    expect(auto.state.results.length).toBeGreaterThan(s.results.length + 300);
    const moved = Object.keys(auto.state.budgets).filter((id) => auto.state.budgets[id] !== s.budgets[id]).length;
    expect(moved).toBeGreaterThan(50);
    expect(calOf(auto.state).day).toBeGreaterThan(calOf(s).day + 60);               // vários meses passaram
  }, 300_000);
  it('Série D com o clube eliminado: pula as rodadas dos outros, para a cada jogo do clube e o calendário avança por data sem repetir nem pular', () => {
    const pyr = brazilPyramid();
    const dClub = pyr[3].clubs[0].id;
    let g = keep(career(dClub, 3));
    let simulatedTotal = 0, slots = calOf(g).slot, playedTotal = 0, lastDay = calOf(g).day;
    for (let i = 0; i < 120 && !isSeasonOver(g); i++) {
      const a = advanceToUserMatch(g); g = keep(a.state); simulatedTotal += a.simulated;
      expect(calOf(g).day).toBeGreaterThanOrEqual(lastDay); lastDay = calOf(g).day;
      if (a.stoppedBy !== 'jogo') break;
      expect(userPlaysNextSlot(g)).toBe(true); expect(isMatchDay(g)).toBe(true);
      const before = calOf(g).slot; g = keep(playNext(g).state); playedTotal++;
      expect(calOf(g).slot).toBe(before + 1);
    }
    expect(isSeasonOver(g)).toBe(true);
    expect(calOf(g).slot - slots).toBe(simulatedTotal + playedTotal);               // cada data do calendário foi usada uma única vez
    expect(auditSeasonEnd(g)).toEqual([]);
  }, 300_000);
  it('com jogo marcado para a próxima data: só leva até o dia dele (não simula nada)', () => {
    const g = career('palmeiras', 4);
    const a = advanceToUserMatch(g);
    expect(a.simulated).toBe(0); expect(a.stoppedBy).toBe('jogo'); expect(userPlaysNextSlot(a.state)).toBe(true);
    expect(nextUserMatchDay(a.state)).toBe(calOf(a.state).day);
    expect(a.state.results.length).toBe(g.results.length);                          // o jogo não foi jogado
  });
  it('desempregado: continua como antes (avança até a próxima data do calendário)', () => {
    const g = { ...career('palmeiras', 4), unemployed: true } as GameState;
    const a = advanceToUserMatch(g);
    expect(noNews(a.state)).toBe(noNews(advanceToMatchDays(g)));
  });
  it('próximo jogo do clube: sem jogo na próxima data, aponta o dia do seguinte', () => {
    let g = keep(outsider(11)); let guard = 0;
    while (guard++ < 80) { const a = advanceToUserMatch(g); g = a.state; if (a.stoppedBy !== 'jogo') break; g = keep(playNext(g).state); }
    expect(nextUserMatchDay(g)).toBeUndefined();                                      // acabou o estadual do clube: não há mais jogos nesta temporada
  }, 300_000);
});
