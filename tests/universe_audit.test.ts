import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer, simulateToEnd, startNextSeason } from '../src/engine/game';
import { fire } from '../src/engine/jobs';
import { managed } from '../src/engine/lookup';
import { auditUniverse } from '../src/engine/aiaudit';
import type { GameState } from '../src/engine/types';

const career = (seed: number): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, seed);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const aiIds = (g: GameState) => Object.keys(g.teams).filter((id) => !managed(g, id));
const squadKey = (g: GameState, id: string) => g.teams[id].players.map((p) => p.id).sort().join();

describe('ETAPA 7 — o universo da IA não congela (carreira em 5 temporadas)', () => {
  it('todos os clubes jogam, mudam de elenco, evoluem, trocam de treinador, renovam e têm artilharia; o universo continua íntegro e estável', () => {
    let g = career(41);
    const problems: string[] = [];
    const startOvr = mean(aiIds(g).flatMap((id) => g.teams[id].players.map((p) => p.strength)));
    const startAge = mean(aiIds(g).flatMap((id) => g.teams[id].players.map((p) => p.age)));
    const titles = new Map<string, number>();
    let relegatedAi = 0, promotedAi = 0, changedSquads = 0, evolved = 0, tot = 0;
    for (let t = 0; t < 5; t++) {
      const before = g;
      const e = simulateToEnd(g);
      // todos os clubes das divisões nacionais jogaram a temporada inteira
      for (const d of e.divisions.filter((x) => x.format !== 'outside' && x.format !== 'groups')) {
        const n = d.clubIds.length;
        for (const id of d.clubIds) if (e.results.filter((r) => r.divisionId === d.id && (r.homeId === id || r.awayId === id)).length !== 2 * (n - 1)) problems.push(`T${e.season}: ${id} não jogou todas as partidas`);
      }
      // artilharia: existe em todas as divisões, soma bate com os gols das partidas, e os artilheiros são de clubes da IA também
      const sc = Object.values(e.scorers ?? {});
      for (const d of e.divisions.filter((x) => x.format !== 'outside')) {
        const goals = e.results.filter((r) => r.divisionId === d.id).reduce((a, r) => a + r.homeGoals + r.awayGoals, 0);
        const logged = sc.filter((s) => s[2] === d.id).reduce((a, s) => a + s[3], 0);
        if (logged !== goals) problems.push(`T${e.season}: ${d.id}: artilharia soma ${logged} gols, partidas têm ${goals}`);
      }
      if (!sc.some((s) => s[1] !== e.userClubId && !!e.teams[s[1]] && s[3] >= 3)) problems.push(`T${e.season}: sem artilheiros fora do seu clube`);
      g = startNextSeason(e);
      const sum = g.history[g.history.length - 1];
      if (!sum.topScorers?.length || sum.topScorers.some((x) => x.rows.length === 0)) problems.push(`T${e.season}: resumo sem artilheiros`);
      if (g.scorers && Object.keys(g.scorers).length) problems.push(`T${g.season}: artilharia não zerou na virada`);
      for (const d of sum.divisions) { titles.set(d.championId, (titles.get(d.championId) ?? 0) + 1); if (!managed(g, d.championId)) { /* campeão da IA */ } relegatedAi += d.relegated.filter((x) => x !== g.userClubId).length; promotedAi += d.promoted.filter((x) => x !== g.userClubId).length; }
      for (const id of aiIds(g)) {
        if (!before.teams[id]) continue;
        tot++;
        if (squadKey(before, id) !== squadKey(g, id)) changedSquads++;
        if (Math.abs(mean(g.teams[id].players.map((p) => p.strength)) - mean(before.teams[id].players.map((p) => p.strength))) > 0.05) evolved++;
      }
      problems.push(...auditUniverse(g).map((x) => `T${g.season}: ${x}`));
      for (const id of aiIds(g)) { if (!Number.isFinite(g.budgets[id] ?? 0)) problems.push(`T${g.season}: caixa inválido em ${id}`); if (!g.clubCoach?.[id]) problems.push(`T${g.season}: ${id} sem treinador`); }
    }
    const ovr = mean(aiIds(g).flatMap((id) => g.teams[id].players.map((p) => p.strength)));
    const age = mean(aiIds(g).flatMap((id) => g.teams[id].players.map((p) => p.age)));
    if (ovr - startOvr > 8 || startOvr - ovr > 4) problems.push(`nível médio da IA derivou ${startOvr.toFixed(1)} → ${ovr.toFixed(1)}`);
    if (age < 23 || age > 29.5) problems.push(`idade média da IA fora da faixa 23–29,5: ${age.toFixed(1)}`);
    expect(problems).toEqual([]);
    expect(changedSquads / tot).toBeGreaterThan(0.9);          // elencos se reorganizam
    expect(evolved / tot).toBeGreaterThan(0.8);                // jogadores evoluem
    expect(relegatedAi).toBeGreaterThan(10); expect(promotedAi).toBeGreaterThan(10);
    expect([...titles.keys()].filter((id) => id !== 'palmeiras').length).toBeGreaterThan(5); // vários campeões diferentes
    const coachChanges = Object.values(g.aiCoaches ?? {}).reduce((a, c) => a + c.past.length, 0);
    expect(coachChanges).toBeGreaterThan(10);
  }, 900_000);

  it('o jogador demitido e sem clube por uma temporada inteira: o resto do universo segue idêntico em funcionamento', () => {
    let g = fire(career(42), 'teste');
    expect(g.unemployed).toBe(true);
    const problems: string[] = [];
    const r0 = g.results.length;
    for (let t = 0; t < 2; t++) {
      const e = simulateToEnd(g);
      if (e.results.length <= r0 && t === 0) problems.push('nenhuma partida simulada sem o jogador');
      for (const d of e.divisions.filter((x) => x.format !== 'outside' && x.format !== 'groups')) {
        const n = d.clubIds.length;
        if (e.results.filter((r) => r.divisionId === d.id).length !== n * (n - 1)) problems.push(`T${e.season}: ${d.id} incompleta`);
      }
      if (!e.cup?.championId) problems.push(`T${e.season}: copa sem campeão`);
      g = startNextSeason(e);
      problems.push(...auditUniverse(g).map((x) => `T${g.season}: ${x}`));
      if (!g.unemployed && !g.userClubId) problems.push('sem clube');
    }
    expect(problems).toEqual([]);
    expect(g.history.length).toBeGreaterThanOrEqual(2);
  }, 900_000);
});
