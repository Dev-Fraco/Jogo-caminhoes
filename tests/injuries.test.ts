import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { aiWindow } from '../src/engine/ai';
import { DAYS_PER_ROUND, INJURY_CHANCE, applyInjuries, healUserLineup, injuredSet, isInjured, pruneInjuries, replaceInjuredStarters, rollInjury, rollMatchInjuries, rolloverInjuries, roundsLeft, spanLabel } from '../src/engine/injuries';
import { isSeasonOver, playNext, playRound } from '../src/engine/game';
import { simulateMatch, withInjured } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { autoLineup } from '../src/engine/squad';
import { saleReasons } from '../src/engine/aisales';
import { clubProfile } from '../src/engine/aiprofile';
import type { GameState } from '../src/engine/types';
import { calOf } from '../src/engine/calendar';
import { daysLeft } from '../src/engine/injuries';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const hit = (g: GameState, clubId: string, playerId: string, rounds: number) => applyInjuries(g, [{ playerId, clubId, rounds, kind: 'entorse no tornozelo' }]);

describe('sistema de lesões', () => {
  it('duração por gravidade: leve em dias (até ~3 semanas), grave acima de 1 mês em meses de jogo; veterano demora mais que garoto', () => {
    const rng = makeRng(1); const n = 4000; let old = 0, young = 0;
    for (let i = 0; i < n; i++) {
      const l = rollInjury(rng, 26, 'leve'), g = rollInjury(rng, 26, 'grave');
      expect(l.severity).toBe('leve'); expect(l.days).toBeGreaterThanOrEqual(2); expect(l.days).toBeLessThanOrEqual(20); expect(l.days).toBeLessThan(30);
      expect(g.severity).toBe('grave'); expect(g.days).toBeGreaterThanOrEqual(31); expect(g.days).toBeLessThanOrEqual(180);
      expect(l.rounds).toBe(Math.max(1, Math.ceil(l.days / DAYS_PER_ROUND))); expect(g.rounds).toBe(Math.ceil(g.days / DAYS_PER_ROUND));
      expect(g.rounds).toBeGreaterThanOrEqual(8);                       // mais de um mês = pelo menos 8 rodadas
      old += rollInjury(rng, 34, 'leve').days; young += rollInjury(rng, 19, 'leve').days;
    }
    expect(old).toBeGreaterThan(young);
    expect(spanLabel(3)).toBe('3 dias'); expect(spanLabel(1)).toBe('1 dia'); expect(spanLabel(31)).toBe('1 mês'); expect(spanLabel(95)).toBe('3 meses');
  });
  it('o sorteio respeita os percentuais: 5% leve e 1,5% grave por time em cada partida (200 mil sorteios)', () => {
    const rng = makeRng(7); const n = 200_000; let leve = 0, grave = 0, both = 0;
    for (let i = 0; i < n; i++) {
      const r = rollMatchInjuries(rng);
      const l = r.some((x) => x.severity === 'leve'), g = r.some((x) => x.severity === 'grave');
      if (l) leve++; if (g) grave++; if (l && g) both++;
      for (const x of r) { expect(x.minute).toBeGreaterThanOrEqual(1); expect(x.minute).toBeLessThanOrEqual(90); }
    }
    expect(leve / n).toBeGreaterThan(0.047); expect(leve / n).toBeLessThan(0.053);
    expect(grave / n).toBeGreaterThan(0.0135); expect(grave / n).toBeLessThan(0.0165);
    expect(both / n).toBeGreaterThan(0.0004); expect(both / n).toBeLessThan(0.0012); // independentes: 5% × 1,5% = 0,075%
    expect(INJURY_CHANCE).toEqual({ leve: 0.05, grave: 0.015 });
  });
  it('nas partidas simuladas, a taxa real de lesões por time bate com os percentuais e a gravidade vem com a duração certa', () => {
    const t = g0.teams.palmeiras, a = g0.teams.santos; const matches = 3000;
    let leve = 0, grave = 0, otherSev = 0, mostPerTeam = 0;
    for (let seed = 1; seed <= matches; seed++) {
      const r = simulateMatch(t, a, makeRng(seed * 7 + 3));
      const hits = r.injured ?? [];
      const byClub = new Map<string, number>(); for (const h of hits) byClub.set(h.clubId, (byClub.get(h.clubId) ?? 0) + 1);
      mostPerTeam = Math.max(mostPerTeam, ...byClub.values(), 0);
      for (const h of hits) {
        if (h.severity === 'leve') { leve++; expect(h.days!).toBeLessThan(30); }
        else if (h.severity === 'grave') { grave++; expect(h.days!).toBeGreaterThanOrEqual(31); expect(h.rounds).toBeGreaterThanOrEqual(8); }
        else otherSev++;
        expect(h.rounds).toBe(Math.ceil(h.days! / DAYS_PER_ROUND));
      }
      for (const e of r.events.filter((x) => x.type === 'injury')) expect(e.text).toMatch(/fora por \d+ (dia|dias|mês|meses)/);
    }
    const sides = matches * 2;
    expect(otherSev).toBe(0);
    expect(leve / sides).toBeGreaterThan(0.04); expect(leve / sides).toBeLessThan(0.06);
    expect(grave / sides).toBeGreaterThan(0.009); expect(grave / sides).toBeLessThan(0.021);
    expect(mostPerTeam).toBeLessThanOrEqual(2);
  });
  it('o jogador volta no prazo: lesão de 3 rodadas (12 dias) cura 12 dias depois', () => {
    const id = g0.teams.flamengo.players[3].id;
    const g = hit({ ...g0, round: 5 }, 'flamengo', id, 3);
    const c = g.cal ?? { day: calOf(g).day, start: calOf(g).start, slot: 0 };
    const at = (d: number) => isInjured({ ...g, cal: { ...c, day: c.day + d } }, id);
    expect([1, 6, 11, 12].map(at)).toEqual([true, true, true, false]);
    expect(roundsLeft(g, id)).toBe(3);
    expect(injuredSet({ ...g, cal: { ...c, day: c.day + 7 } }).has(id)).toBe(true);
    expect(pruneInjuries({ ...g, cal: { ...c, day: c.day + 12 } }).injuries).toEqual({});
    expect(g.news[0].text).toMatch(/se lesionou/); // o seu clube é avisado
  });
  it('a escalação automática pula lesionados (e só usa um se faltar gente na linha)', () => {
    const t = g0.teams.palmeiras; const star = t.players.filter((p) => p.pos === 'ATT').sort((a, b) => b.strength - a.strength)[0];
    expect(autoLineup(t.players, t.formation)).toContain(star.id);
    expect(autoLineup(t.players, t.formation, new Set([star.id]))).not.toContain(star.id);
    const allAtt = new Set(t.players.filter((p) => p.pos === 'ATT').map((p) => p.id));
    expect(autoLineup(t.players, t.formation, allAtt).filter((id) => allAtt.has(id)).length).toBe(2); // faltou ATA: escala os lesionados
  });
  it('seu titular lesionado dá lugar a um reserva da mesma linha, com aviso', () => {
    const team = g0.teams.flamengo; const starter = team.players.find((p) => team.lineup.includes(p.id) && p.pos === 'MID')!;
    const r = replaceInjuredStarters(team, new Set([starter.id]));
    expect(r.swaps).toHaveLength(1); expect(r.swaps[0].in.pos).toBe('MID'); expect(r.team.lineup).not.toContain(starter.id);
    const g = healUserLineup(hit(g0, 'flamengo', starter.id, 4));
    expect(g.teams.flamengo.lineup).not.toContain(starter.id);
    expect(g.news[0].text).toMatch(/entra no time/);
    expect(healUserLineup(g0)).toBe(g0);
  });
  it('lesões acontecem nas partidas: taxa baixa, com substituição e evento na narração', () => {
    const t = g0.teams.palmeiras, a = g0.teams.santos; let hits = 0, matches = 400, withSub = 0;
    for (let seed = 1; seed <= matches; seed++) {
      const r = simulateMatch(t, a, makeRng(seed));
      const ev = r.events.filter((e) => e.type === 'injury');
      expect(ev.length).toBe(r.injured!.length);
      hits += ev.length; withSub += ev.filter((e) => /Entra /.test(e.text)).length;
      for (const e of ev) expect(e.injury!.rounds).toBeGreaterThanOrEqual(1);
    }
    expect(hits / matches).toBeGreaterThan(0.15); expect(hits / matches).toBeLessThan(0.4); // ~0,26 por partida (2 times × 13%)
    expect(withSub / hits).toBeGreaterThan(0.9);
  });
  it('quem já está lesionado nunca entra como substituto', () => {
    const t = g0.teams.palmeiras, a = g0.teams.santos;
    const bench = new Set(t.players.filter((p) => !t.lineup.includes(p.id)).map((p) => p.id));
    for (let seed = 1; seed <= 200; seed++) {
      const r = withInjured(bench, () => simulateMatch(t, a, makeRng(seed)));
      for (const e of r.events.filter((x) => x.type === 'injury' && x.side === 'home')) expect(/Entra /.test(e.text)).toBe(false);
    }
  });
  it('na rodada, o clube da IA escala sem o lesionado e o seu time troca o lesionado', () => {
    const ai = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
    const star = [...g0.teams[ai].players].sort((a, b) => b.strength - a.strength)[0];
    const user = g0.teams.flamengo.players.find((p) => g0.teams.flamengo.lineup.includes(p.id) && p.pos === 'DEF')!;
    let g = hit(hit(g0, ai, star.id, 6), 'flamengo', user.id, 6);
    const r = playRound(g);
    expect(r.state.teams[ai].lineup).not.toContain(star.id);
    const n = playNext(g);
    expect(n.state.teams.flamengo.lineup).not.toContain(user.id);
    expect(n.state.news.some((x) => /entra no time/.test(x.text))).toBe(true);
  });
  it('durante uma temporada inteira as lesões aparecem, o jogo segue válido e a virada converte lesões longas', () => {
    let g = g0; let seen = 0; let maxPerTeam = 0;
    while (!isSeasonOver(g)) {
      g = playRound(g).state; g = { ...g, morale: { ...g.morale, board: 60 } };
      seen = Math.max(seen, Object.keys(g.injuries ?? {}).length);
      for (const id of Object.keys(g.teams)) maxPerTeam = Math.max(maxPerTeam, g.teams[id].players.filter((p) => isInjured(g, p.id)).length);
    }
    expect(seen).toBeGreaterThan(10); expect(maxPerTeam).toBeLessThanOrEqual(9);
    for (const [id, i] of Object.entries(g.injuries ?? {})) { expect(Object.values(g.teams).some((t) => t.players.some((p) => p.id === id))).toBe(true); expect(i.rounds).toBeGreaterThan(0); }
    const long = { ...g, injuries: { ...(g.injuries ?? {}), x1: { season: g.season, untilRound: g.totalRounds + 1 + 3, kind: 'fratura no pé', rounds: 12 }, x2: { season: g.season, untilRound: g.totalRounds + 1 + 14, kind: 'ruptura de ligamento do joelho', rounds: 20 } } };
    const roll = rolloverInjuries({ ...long, season: g.season + 1, round: 1 }, g.season, g.totalRounds);
    expect(roll.injuries?.x1).toBeUndefined(); // o descanso curou
    expect(roll.injuries?.x2).toMatchObject({ season: g.season + 1, untilRound: 1 + (14 - 8) });
    expect(startNextSeason(g).season).toBe(g.season + 1);
  });
  it('a IA considera lesão: lesionado por muito tempo é mais barato e nunca é contratado', () => {
    const club = g0.divisions[1].clubIds[2], seller = g0.divisions[2].clubIds[0];
    const star = [...g0.teams[seller].players].filter((p) => p.pos === 'ATT').sort((a, b) => b.strength - a.strength)[0];
    const g = hit({ ...g0 }, seller, star.id, 15);
    expect(saleReasons(g, seller, star, clubProfile(g, seller))).toContain('lesao-longa');
    const weak = { ...g, teams: { ...g.teams, [club]: { ...g.teams[club], players: g.teams[club].players.map((p) => (p.pos === 'ATT' ? { ...p, strength: 35 } : p)) } }, budgets: { ...g.budgets, [club]: 90_000_000 } };
    const s = aiWindow(weak, makeRng(2), 3, [club]);
    expect(s.teams[club].players.some((p) => p.id === star.id)).toBe(false);
  });
});

describe('lesões — efeito numa temporada inteira', () => {
  it('poucos jogadores fora ao mesmo tempo; lesão grave dura mais de 1 mês de jogo e atravessa a virada; a notícia fala em dias ou meses', () => {
    let g = makeCareer('flamengo', 9);
    const out: number[] = []; let guard = 0;
    const seenGrave: number[] = [];
    while (!isSeasonOver(g) && guard++ < 600) {
      g = playNext(g).state;
      const teams = Object.keys(g.teams);
      out.push(teams.reduce((a, id) => a + g.teams[id].players.filter((p) => isInjured(g, p.id)).length, 0) / teams.length);
      for (const i of Object.values(g.injuries ?? {})) if (i.severity === 'grave') seenGrave.push(i.days ?? 0);
    }
    const avg = out.reduce((a, b) => a + b, 0) / out.length;
    expect(avg).toBeGreaterThan(0.1); expect(avg).toBeLessThan(2);          // lesões existem, mas nunca em excesso
    expect(Math.max(...out)).toBeLessThan(3);
    for (const d of seenGrave) expect(d).toBeGreaterThanOrEqual(31);
    const txt = g.news.filter((n) => /se lesionou/.test(n.text)).map((n) => n.text);
    for (const t of txt) expect(t).toMatch(/fora por \d+ (dia|dias|mês|meses)/);
  }, 300_000);
  it('lesão grave de 5 meses (150 dias) continua ativa na temporada seguinte e mostra o tempo restante em meses', () => {
    const id = g0.teams.flamengo.players[3].id;
    const days = 150, rounds = Math.ceil(days / DAYS_PER_ROUND);
    const g = applyInjuries({ ...g0, round: 10 }, [{ playerId: id, clubId: 'flamengo', rounds, days, kind: 'ruptura de ligamento do joelho', severity: 'grave' }]);
    expect(g.injuries![id]).toMatchObject({ days: 150, severity: 'grave' });
    expect(g.news[0].text).toContain('5 meses'); expect(g.news[0].text).toContain('lesão grave');
    const next = rolloverInjuries({ ...g, season: g.season + 1, round: 1, cal: { day: calOf(g).day + 100, start: calOf(g).start, slot: 0 } }, g.season, g.totalRounds);
    expect(next.injuries![id]).toBeDefined();
    expect(daysLeft(next, id)).toBe(50);
  });
});

describe('lesão conta em dias do calendário', () => {
  it('15 dias: cai 1 por dia e cura exatamente no 15º dia, sem depender de rodadas', async () => {
    const { remainingLabel } = await import('../src/engine/injuries');
    const id = g0.teams[g0.userClubId].players[0].id;
    let g = applyInjuries(g0, [{ playerId: id, clubId: g0.userClubId, rounds: 4, days: 15, kind: 'entorse no tornozelo' }]);
    expect(daysLeft(g, id)).toBe(15);
    expect(remainingLabel(g, id)).toBe('15 dias');
    const bump = (x: GameState) => ({ ...x, cal: { ...calOf(x), day: calOf(x).day + 1 } });
    for (let d = 1; d <= 14; d++) { g = bump(g); expect(daysLeft(g, id)).toBe(15 - d); expect(isInjured(g, id)).toBe(true); }
    g = bump(g);
    expect(daysLeft(g, id)).toBe(0); expect(isInjured(g, id)).toBe(false);
  });
});
