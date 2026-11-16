import { divisionTable, isSeasonOver } from '../src/engine/game';
import { estadualChampions } from '../src/engine/estadual';
import { finalStandings } from '../src/engine/groups';
import type { GameState } from '../src/engine/types';

/** Problemas encontrados numa temporada que acabou de terminar (antes da virada). */
export function auditSeasonEnd(g: GameState): string[] {
  const p: string[] = [];
  if (!isSeasonOver(g)) p.push('a temporada não terminou');
  if (g.round !== g.totalRounds + 1) p.push(`rodada final inesperada: ${g.round}/${g.totalRounds}`);
  const clubIds = new Set(g.divisions.flatMap((d) => d.clubIds));
  if (clubIds.size !== g.divisions.reduce((a, d) => a + d.clubIds.length, 0)) p.push('clube em duas divisões');
  for (const d of g.divisions.filter((x) => x.format !== 'outside')) {
    const fx = g.fixtures.filter((f) => f.divisionId === d.id);
    const key = (f: { round: number; homeId: string; awayId: string }) => `${f.round}:${f.homeId}:${f.awayId}`;
    if (new Set(fx.map(key)).size !== fx.length) p.push(`${d.id}: partida duplicada no calendário`);
    // cada clube joga no máximo uma vez por rodada
    const per = new Map<string, number>();
    for (const f of fx) for (const id of [f.homeId, f.awayId]) { const k = `${f.round}:${id}`; per.set(k, (per.get(k) ?? 0) + 1); }
    if ([...per.values()].some((n) => n > 1)) p.push(`${d.id}: clube joga duas vezes na mesma rodada`);
    const res = g.results.filter((r) => r.divisionId === d.id);
    if (new Set(res.map((r) => `${r.round}:${r.homeId}:${r.awayId}`)).size !== res.length) p.push(`${d.id}: resultado duplicado`);
    if (d.format === 'groups') {
      try { const fs = finalStandings(g, d); if (!fs.championId) p.push(`${d.id}: sem campeão`); } catch (e) { p.push(`${d.id}: mata-mata não resolve (${(e as Error).message})`); }
      continue;
    }
    const n = d.clubIds.length;
    if (res.length !== n * (n - 1)) p.push(`${d.id}: ${res.length} resultados, esperado ${n * (n - 1)}`);
    if (fx.length !== n * (n - 1)) p.push(`${d.id}: ${fx.length} jogos no calendário, esperado ${n * (n - 1)}`);
    const pairs = new Set(res.map((r) => `${r.homeId}>${r.awayId}`));
    if (pairs.size !== n * (n - 1)) p.push(`${d.id}: confrontos repetidos ou faltando`);
    const t = divisionTable(g, d.id);
    if (t.length !== n) p.push(`${d.id}: tabela com ${t.length} linhas`);
    if (t.some((r) => r.played !== 2 * (n - 1))) p.push(`${d.id}: clube com jogos faltando na tabela`);
    const gf = t.reduce((a, r) => a + r.gf, 0), ga = t.reduce((a, r) => a + r.ga, 0);
    if (gf !== ga) p.push(`${d.id}: gols pró e contra não fecham`);
    const pts = t.reduce((a, r) => a + r.points, 0);
    const draws = res.filter((r) => r.homeGoals === r.awayGoals).length;
    if (pts !== 3 * (res.length - draws) + 2 * draws) p.push(`${d.id}: pontos não fecham`);
    if (t.some((r, i) => i > 0 && (r.points > t[i - 1].points))) p.push(`${d.id}: tabela fora de ordem`);
  }
  if (g.cup && (g.cup.due || !g.cup.championId)) p.push('copa não terminou');
  for (const k of ['lib', 'sula', 'ucl'] as const) if (g[k] && (g[k]!.due || !g[k]!.championId)) p.push(`${k} não terminou`);
  if (g.estadual && !g.estadual.done) p.push('estadual não terminou');
  if (g.estadual?.done && estadualChampions(g).length === 0) p.push('estadual sem campeões');
  if (g.mundial && !g.mundial.championId) p.push('mundial sem campeão');
  return p;
}

/** Competições (copa, continentais, estaduais, mundial): estrutura no começo e resultado no fim da temporada. */
export function auditCompetitions(g: GameState, phase: 'inicio' | 'fim'): string[] {
  const p: string[] = [];
  const tiesOf = (rounds: { name: string; ties: { homeId: string; awayId: string; winnerId?: string }[] }[], label: string) => {
    for (const r of rounds) {
      const ids = r.ties.flatMap((t) => [t.homeId, t.awayId]);
      if (new Set(ids).size !== ids.length) p.push(`${label} ${r.name}: clube em dois jogos da mesma fase`);
      if (phase === 'fim') for (const t of r.ties) if (!t.winnerId || ![t.homeId, t.awayId].includes(t.winnerId)) p.push(`${label} ${r.name}: confronto sem vencedor válido`);
    }
  };
  if (g.cup) {
    const c = g.cup;
    if (c.dueAfter.length !== c.totalRounds) p.push(`copa: ${c.dueAfter.length} marcos para ${c.totalRounds} fases`);
    if (c.dueAfter.some((d, i) => i > 0 && d <= c.dueAfter[i - 1])) p.push('copa: marcos fora de ordem');
    if (Math.max(...c.dueAfter) > g.totalRounds) p.push('copa: fase marcada depois da última rodada do campeonato');
    if (phase === 'inicio' && (c.championId || c.due || c.roundIndex !== 0)) p.push('copa nova já começou ou terminou');
    tiesOf(c.rounds, 'copa');
    if (phase === 'fim') {
      const finalTie = c.rounds[c.rounds.length - 1].ties;
      if (finalTie.length !== 1 || c.championId !== finalTie[0].winnerId) p.push('copa: campeão não é o vencedor da final');
      for (let i = 1; i < c.rounds.length; i++) { const prev = new Set(c.rounds[i - 1].ties.map((t) => t.winnerId)); for (const t of c.rounds[i].ties) if (!prev.has(t.homeId) && !prev.has(t.awayId) && c.rounds[i - 1].ties.length * 2 > c.rounds[i].ties.length * 2) { /* byes/seeds possíveis */ } }
    }
  }
  for (const k of ['lib', 'sula', 'ucl'] as const) {
    const c = g[k];
    if (!c) continue;
    const all = c.groups.flatMap((x) => x.clubIds);
    if (new Set(all).size !== all.length) p.push(`${k}: clube em dois grupos`);
    for (const grp of c.groups) {
      if (new Set(grp.clubIds).size !== grp.clubIds.length) p.push(`${k} ${grp.id}: clube repetido`);
      const keys = grp.matches.map((m) => `${m.homeId}>${m.awayId}`);
      if (new Set(keys).size !== keys.length) p.push(`${k} ${grp.id}: jogo repetido`);
      const n = grp.clubIds.length;
      if (grp.matches.length !== n * (n - 1)) p.push(`${k} ${grp.id}: ${grp.matches.length} jogos (esperado ${n * (n - 1)})`);
      const per = new Map<string, number>();
      for (const m of grp.matches) for (const id of [m.homeId, m.awayId]) { const kk = `${m.round}:${id}`; per.set(kk, (per.get(kk) ?? 0) + 1); }
      if ([...per.values()].some((v) => v > 1)) p.push(`${k} ${grp.id}: clube joga duas vezes na rodada`);
      if (phase === 'fim' && grp.matches.some((m) => m.homeGoals === undefined || m.awayGoals === undefined)) p.push(`${k} ${grp.id}: jogo sem resultado`);
    }
    if (c.dueAfter.some((d, i) => i > 0 && d <= c.dueAfter[i - 1])) p.push(`${k}: marcos fora de ordem`);
    if (Math.max(...c.dueAfter) > g.totalRounds) p.push(`${k}: fase marcada depois da última rodada`);
    tiesOf(c.ko, k);
    if (phase === 'inicio' && (c.championId || c.due)) p.push(`${k} novo já começou`);
    if (phase === 'fim') { const f = c.ko[c.ko.length - 1]; if (!f || f.ties.length !== 1 || c.championId !== f.ties[0].winnerId) p.push(`${k}: campeão não é o vencedor da final`); }
  }
  if (g.mundial) {
    tiesOf(g.mundial.ko, 'mundial');
    if (phase === 'fim' && (!g.mundial.championId || g.mundial.due)) p.push('mundial não terminou');
  }
  if (g.estadual) {
    for (const comp of g.estadual.comps) for (const d of comp.divisions) {
      const keys = d.matches.map((m) => `${m[0]}:${m[1]}:${m[2]}`);
      if (new Set(keys).size !== keys.length) p.push(`${comp.uf} ${d.name}: jogo repetido`);
      if (phase === 'fim' && d.matches.some((m) => m[3] === undefined || m[4] === undefined || m[3] < 0 || m[4] < 0)) p.push(`${comp.uf} ${d.name}: jogo sem resultado`);
      const idx = (i: number) => d.clubIds[i];
      if (d.matches.some((m) => idx(m[1]) === undefined || idx(m[2]) === undefined || m[1] === m[2])) p.push(`${comp.uf} ${d.name}: jogo com clube inválido`);
    }
  }
  return p;
}
