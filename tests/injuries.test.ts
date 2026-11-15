import { describe, expect, it } from 'vitest';
import { aiWindow } from '../src/engine/ai';
import { applyInjuries, healUserLineup, injuredSet, isInjured, pruneInjuries, replaceInjuredStarters, rollInjury, rolloverInjuries, roundsLeft } from '../src/engine/injuries';
import { isSeasonOver, playNext, playRound, startNextSeason } from '../src/engine/game';
import { simulateMatch, withInjured } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { autoLineup } from '../src/engine/squad';
import { saleReasons } from '../src/engine/aisales';
import { clubProfile } from '../src/engine/aiprofile';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const hit = (g: GameState, clubId: string, playerId: string, rounds: number) => applyInjuries(g, [{ playerId, clubId, rounds, kind: 'entorse no tornozelo' }]);

describe('sistema de lesões', () => {
  it('gravidade e duração: maioria leve, poucas graves; veterano demora mais que garoto', () => {
    const rng = makeRng(1); const n = 4000; const c = { leve: 0, media: 0, grave: 0 }; let old = 0, young = 0;
    for (let i = 0; i < n; i++) { const r = rollInjury(rng, 26); c[r.severity]++; expect(r.rounds).toBeGreaterThanOrEqual(1); expect(r.rounds).toBeLessThanOrEqual(20); old += rollInjury(rng, 34).rounds; young += rollInjury(rng, 19).rounds; }
    expect(c.leve / n).toBeGreaterThan(0.5); expect(c.grave / n).toBeLessThan(0.15); expect(c.grave).toBeGreaterThan(0);
    expect(old).toBeGreaterThan(young);
  });
  it('o jogador volta no prazo: lesão de 3 rodadas na rodada 5 fica fora das rodadas 6, 7 e 8', () => {
    const id = g0.teams.flamengo.players[3].id;
    const g = hit({ ...g0, round: 5 }, 'flamengo', id, 3);
    const at = (r: number) => isInjured({ ...g, round: r }, id);
    expect([6, 7, 8, 9].map(at)).toEqual([true, true, true, false]); // a lesão foi na rodada 5: fora das rodadas 6, 7 e 8
    expect(roundsLeft({ ...g, round: 6 }, id)).toBe(3);
    expect(injuredSet({ ...g, round: 7 }).has(id)).toBe(true);
    expect(pruneInjuries({ ...g, round: 9 }).injuries).toEqual({});
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
  it('lesões acontecem nas partidas: taxa razoável, com substituição e evento na narração', () => {
    const t = g0.teams.palmeiras, a = g0.teams.santos; let hits = 0, matches = 400, withSub = 0;
    for (let seed = 1; seed <= matches; seed++) {
      const r = simulateMatch(t, a, makeRng(seed));
      const ev = r.events.filter((e) => e.type === 'injury');
      expect(ev.length).toBe(r.injured!.length);
      hits += ev.length; withSub += ev.filter((e) => /Entra /.test(e.text)).length;
      for (const e of ev) expect(e.injury!.rounds).toBeGreaterThanOrEqual(1);
    }
    expect(hits / matches).toBeGreaterThan(0.12); expect(hits / matches).toBeLessThan(0.6);
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
