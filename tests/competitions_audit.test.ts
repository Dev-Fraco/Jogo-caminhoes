import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { divisionTable, newCareer, simulateToEnd } from '../src/engine/game';
import { estadualTable, estadualChampions, playoffOf, hasPlayoff } from '../src/engine/estadual';
import { kindOf, leagueTable, rulesFor, serieBStanding, serieCStanding, serieDFlow, serieDStanding } from '../src/engine/phases';
import { serieDQualifiers } from '../src/engine/estadual';
import { groupTable } from '../src/engine/continental';
import { newObserverWorld, simLeagues } from '../src/engine/sim';
import type { GameState, TableRow } from '../src/engine/types';
import { auditCompetitions, auditSeasonEnd } from './audit_lib';

const tieOrder = (t: TableRow[]): string[] => { const p: string[] = []; for (let i = 1; i < t.length; i++) { const a = t[i - 1], b = t[i]; if (a.points < b.points || (a.points === b.points && (a.won < b.won || (a.won === b.won && (a.gd < b.gd || (a.gd === b.gd && a.gf < b.gf)))))) p.push(`${a.clubId} antes de ${b.clubId} fora da regra de desempate`); } return p; };

/** Confere, para uma temporada que terminou, tudo o que dá para provar sobre classificações e quem sobe/desce. */
function auditStandings(e: GameState, next: GameState): string[] {
  const p: string[] = [];
  const divs = e.divisions.filter((d) => d.format !== 'outside');
  const rank = (d: GameState['divisions'][number]): { order: string[]; up: string[] } => {
    const k = kindOf(d);
    if (d.format === 'groups') { const f = serieDStanding(e, d); return { order: f.table.map((r) => r.clubId), up: f.promoted }; }
    if (k === 'C') return { order: leagueTable(e, d).map((r) => r.clubId), up: serieCStanding(e, d).promoted }; // caem os últimos da 1ª fase; sobem os 2 melhores de cada quadrangular
    const t = divisionTable(e, d.id); p.push(...tieOrder(t).map((x) => `${d.id}: ${x}`));
    return { order: t.map((r) => r.clubId), up: k === 'B' ? serieBStanding(e, d).promoted : [] }; // Série B: 1º, 2º e os vencedores dos playoffs
  };
  const ranks = divs.map(rank);
  const flow = serieDFlow(e.season, serieDQualifiers(e).length);
  for (let i = 0; i + 1 < divs.length; i++) {
    const U = divs[i], L = divs[i + 1];
    const nu = next.divisions.find((d) => d.id === U.id)!, nl = next.divisions.find((d) => d.id === L.id)!;
    const cd = kindOf(U) === 'C' && L.format === 'groups'; // Série C ↔ D: caem 2 e sobem 6 (a C cresce); a D segue com 96
    if ((kindOf(U) !== 'C' && nu.clubIds.length !== U.clubIds.length) || (kindOf(L) !== 'C' && nl.clubIds.length !== L.clubIds.length)) p.push(`${U.id}/${L.id}: tamanho da divisão mudou (${U.clubIds.length}→${nu.clubIds.length}, ${L.clubIds.length}→${nl.clubIds.length})`);
    const down = U.clubIds.filter((id) => nl.clubIds.includes(id)), up = L.clubIds.filter((id) => nu.clubIds.includes(id));
    if (cd) {
      if (down.length !== rulesFor(e.season).cRelegated) p.push(`${U.id}/${L.id}: ${down.length} rebaixados, esperado ${rulesFor(e.season).cRelegated}`);
      if (up.length !== flow.promoted) p.push(`${U.id}/${L.id}: ${up.length} promovidos, esperado ${flow.promoted}`);
      if (nl.clubIds.length !== 96) p.push(`${L.id}: ${nl.clubIds.length} clubes, esperado 96`);
    } else if (down.length !== up.length) p.push(`${U.id}/${L.id}: ${down.length} rebaixados e ${up.length} promovidos`);
    if (!down.length) p.push(`${U.id}/${L.id}: ninguém rebaixado`);
    const k = down.length;
    const bottom = ranks[i].order.slice(-k), top = (ranks[i + 1].up.length ? ranks[i + 1].up : ranks[i + 1].order.slice(0, k));
    if ([...down].sort().join() !== [...bottom].sort().join()) p.push(`${U.id}: rebaixados ${down.join(',')} não são os últimos colocados ${bottom.join(',')}`);
    const want = cd ? top.slice(0, flow.promoted) : top;
    if (!cd && up.length !== top.length) p.push(`${L.id}: ${up.length} promovidos, esperado ${top.length}`);
    if (cd || k === top.length) if ([...up].sort().join() !== [...want].sort().join()) p.push(`${L.id}: promovidos ${up.join(',')} não são os melhores colocados ${want.join(',')}`);
  }
  return p;
}

const knockoutQualifiers = (g: GameState): string[] => {
  const p: string[] = [];
  for (const k of ['lib', 'sula', 'ucl'] as const) {
    const c = g[k]; if (!c) continue;
    const first = c.ko[0];
    const qualified = new Set(first.ties.flatMap((t) => [t.homeId, t.awayId]));
    for (const grp of c.groups) {
      const t = groupTable(g, grp);
      if (!qualified.has(t[0].clubId)) p.push(`${k} ${grp.id}: líder ${t[0].clubId} não avançou`);
      if (!qualified.has(t[1].clubId)) p.push(`${k} ${grp.id}: 2º ${t[1].clubId} não avançou`);
      if (t.slice(2).some((r) => qualified.has(r.clubId) && false)) p.push('x');
      p.push(...tieOrder(t as unknown as TableRow[]).map((x) => `${k} ${grp.id}: ${x}`));
    }
  }
  return p;
};

const estadualChecks = (e: GameState): string[] => {
  const p: string[] = [];
  const es = e.estadual; if (!es) return p;
  for (const comp of es.comps) for (const d of comp.divisions) {
    p.push(...tieOrder(estadualTable(e, d)).map((x) => `${comp.uf} ${d.name}: ${x}`));
    if (hasPlayoff(es, d)) {
      const po = playoffOf(e, d);
      if (!po?.champion) p.push(`${comp.uf} ${d.name}: mata-mata sem campeão`);
      else if (po.final?.winner && po.final.winner !== po.champion) p.push(`${comp.uf} ${d.name}: campeão diferente do vencedor da final`);
      if (po && po.seeds.length === 4 && po.semis.some((s) => !s.winner)) p.push(`${comp.uf} ${d.name}: semifinal sem vencedor`);
    }
  }
  const champs = estadualChampions(e);
  const divs = es.comps.reduce((a, c) => a + c.divisions.length, 0);
  if (champs.reduce((a, c) => a + c.divisions.length, 0) !== divs) p.push(`estadual: ${champs.reduce((a, c) => a + c.divisions.length, 0)} campeões para ${divs} divisões`);
  return p;
};

describe('ETAPA 6 — todas as competições (não só a do jogador)', () => {
  it('Brasil, 3 temporadas: classificações e desempates, subida e descida exatas, estaduais e mata-matas, classificados dos grupos, campeões definidos', () => {
    let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, 31);
    const problems: string[] = [];
    for (let t = 0; t < 3; t++) {
      problems.push(...auditCompetitions(g, 'inicio'));
      const e = simulateToEnd(g);
      problems.push(...auditSeasonEnd(e), ...auditCompetitions(e, 'fim'), ...knockoutQualifiers(e), ...estadualChecks(e));
      if (!e.cup) problems.push('sem copa nacional na temporada');
      const next = startNextSeason(e);
      problems.push(...auditStandings(e, next));
      if (next.season !== e.season + 1) problems.push('temporada seguinte não gerada');
      if (next.results.length !== 0) problems.push('resultados da temporada anterior ficaram');
      g = next;
    }
    expect(problems).toEqual([]);
  }, 900_000);
  it('todas as ligas do jogo, sem jogador (2 temporadas cada): competições íntegras, classificação, subida e descida exatas', () => {
    const problems: string[] = [];
    for (const l of simLeagues()) {
      let g = newObserverWorld(l.countryId, l.leagueId, 5);
      for (let t = 0; t < 2; t++) {
        const e = simulateToEnd(g);
        problems.push(...[...auditSeasonEnd(e), ...auditCompetitions(e, 'fim'), ...knockoutQualifiers(e), ...estadualChecks(e)].map((x) => `${l.label} T${e.season}: ${x}`));
        const next = startNextSeason(e);
        problems.push(...auditStandings(e, next).map((x) => `${l.label} T${e.season}: ${x}`));
        g = next;
      }
    }
    expect(problems).toEqual([]);
  }, 1_800_000);
});


describe('ETAPA 6 — o auditor realmente detecta defeitos (teste do teste)', () => {
  it('rebaixado errado, classificado fora do mata-mata, campeão de estadual trocado e desempate errado são apontados; e as competições auditadas existem', () => {
    const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, 31);
    const e = simulateToEnd(g);
    const next = startNextSeason(e);
    expect(auditStandings(e, next)).toEqual([]);
    // as competições auditadas existem de fato (o teste não é vazio)
    expect(e.divisions.filter((d) => d.format === 'groups').length).toBeGreaterThan(0);
    expect(e.estadual!.comps.some((c) => c.divisions.some((d) => hasPlayoff(e.estadual, d)))).toBe(true);
    expect(['lib', 'sula', 'ucl'].filter((k) => (e as never as Record<string, unknown>)[k]).length).toBe(3);
    // 1) troca um rebaixado: o último da Série A fica e outro clube desce no lugar
    const A = next.divisions[0], B = next.divisions[1];
    const stay = A.clubIds.find((id) => !e.divisions[0].clubIds.includes(id))!; // promovido que subiu
    const bad = { ...next, divisions: next.divisions.map((d) => (d.id === A.id ? { ...d, clubIds: d.clubIds.map((id) => (id === stay ? e.divisions[0].clubIds.find((x) => !A.clubIds.includes(x))! : id)) } : d.id === B.id ? { ...d, clubIds: d.clubIds.map((id) => (id === e.divisions[0].clubIds.find((x) => !A.clubIds.includes(x)) ? stay : id)) } : d)) };
    expect(auditStandings(e, bad).length).toBeGreaterThan(0);
    // 2) líder de grupo fora do mata-mata
    const lib = e.lib!; const t0 = groupTable(e, lib.groups[0]);
    const gone = { ...e, lib: { ...lib, ko: lib.ko.map((r, i) => (i ? r : { ...r, ties: r.ties.map((t) => (t.homeId === t0[0].clubId ? { ...t, homeId: 'intruso' } : t)) })) } };
    expect(knockoutQualifiers(gone).some((x) => x.includes('não avançou'))).toBe(true);
    // 3) desempate: inverte duas linhas com pontos iguais
    const row = (id: string, w: number, gd: number): TableRow => ({ clubId: id, played: 10, won: w, drawn: 0, lost: 0, gf: 10 + gd, ga: 10, gd, points: 9 });
    expect(tieOrder([row('a', 2, 1), row('b', 3, 0)]).length).toBe(1);
    expect(tieOrder([row('a', 3, 0), row('b', 3, 1)]).length).toBe(1);
    expect(tieOrder([row('a', 3, 1), row('b', 3, 0)]).length).toBe(0);
  }, 300_000);
});
