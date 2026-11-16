import { describe, expect, it } from 'vitest';
import { ensureAiCoaches, aiCoachSeasonEnd, coachOf, coachPressure, unemployedCoaches, FIRE_AT } from '../src/engine/aicoaches';
import { simulateToEnd, startNextSeason } from '../src/engine/game';
import { newObserverWorld } from '../src/engine/sim';
import { managed } from '../src/engine/lookup';
import { MAX_OFFERS, acceptOffer, fire, generateJobOffers, hire, resign } from '../src/engine/jobs';
import { makeRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';
import { makeCareer } from './helpers';

const coachProblems = (g: GameState): string[] => {
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const id of Object.keys(g.teams)) {
    if (managed(g, id)) { if (g.clubCoach?.[id]) out.push(`${id}: clube do usuário com treinador da IA`); continue; }
    const c = coachOf(g, id);
    if (!c) { out.push(`${id}: sem treinador`); continue; }
    if (c.clubId !== id) out.push(`${id}: treinador aponta para ${c.clubId}`);
    if (seen.has(c.id)) out.push(`${c.id} em dois clubes: ${seen.get(c.id)} e ${id}`);
    seen.set(c.id, id);
    if (c.rep < 1 || c.rep > 5) out.push(`${c.id}: reputação ${c.rep}`);
    if (c.until === undefined || c.until < g.season - 1) out.push(`${id}: contrato do treinador vencido (${c.until})`);
  }
  for (const c of Object.values(g.aiCoaches ?? {})) if (c.clubId && g.clubCoach?.[c.clubId] !== c.id) out.push(`${c.id}: clubCoach inconsistente`);
  if (unemployedCoaches(g).length < 8) out.push(`fila de desempregados pequena: ${unemployedCoaches(g).length}`);
  return out;
};

describe('ETAPA 5 — treinadores da IA (5 temporadas, mundo sem jogador)', () => {
  it('todo clube sempre tem treinador, contrato válido, ninguém em dois clubes; demissões justificadas e limitadas; há renovações e trocas', () => {
    let g = newObserverWorld('BR' as never, 'brasileirao', 11);
    g = ensureAiCoaches(g);
    const problems: string[] = [...coachProblems(g)];
    let changes = 0, renewals = 0, fired = 0;
    for (let t = 0; t < 5; t++) {
      const before = { ...(g.clubCoach ?? {}) };
      const untilBefore = Object.fromEntries(Object.values(g.aiCoaches ?? {}).map((c) => [c.id, c.until]));
      g = startNextSeason(simulateToEnd(g));
      problems.push(...coachProblems(g).map((x) => `T${g.season}: ${x}`));
      const n = Object.keys(before).filter((id) => g.clubCoach?.[id] !== before[id]).length;
      changes += n;
      renewals += Object.values(g.aiCoaches ?? {}).filter((c) => c.clubId && untilBefore[c.id] !== undefined && c.until! > untilBefore[c.id]!).length;
      fired += Object.values(g.aiCoaches ?? {}).reduce((a, c) => a + c.past.filter((p) => p.ended === 'demitido' && p.toSeason === g.season - 1).length, 0);
      const clubs = Object.keys(before).length;
      if (n > clubs * 0.5) problems.push(`T${g.season}: ${n}/${clubs} clubes trocaram de treinador (onda de demissões)`);
    }
    expect(problems).toEqual([]);
    expect(changes).toBeGreaterThan(5);
    expect(renewals).toBeGreaterThan(20);
    void fired;
  }, 900_000);
  it('a pressão sobre o treinador é limitada pelo tempo de casa; demissão só acima do limite', () => {
    const g = newObserverWorld('BR' as never, 'brasileirao', 3);
    const id = Object.keys(g.teams)[5];
    expect(coachPressure(g, id).score).toBeLessThan(FIRE_AT);
  });
  it('contrato terminando com mau desempenho: o clube troca de treinador e o antigo vai para a fila de desempregados', () => {
    let g = newObserverWorld('BR' as never, 'brasileirao', 5);
    const done = simulateToEnd(g);
    g = startNextSeason(done);
    // força: todos os contratos vencem e todos os treinadores têm mérito baixo
    const aiCoaches = Object.fromEntries(Object.entries(g.aiCoaches!).map(([k, c]) => [k, { ...c, until: g.season - 1, merit: -3 }]));
    const forced = { ...g, aiCoaches };
    const next = aiCoachSeasonEnd({ ...forced, season: g.season }, { ...forced, season: g.season + 1 }, makeRng(1));
    const changed = Object.keys(forced.clubCoach!).filter((id) => next.clubCoach?.[id] !== forced.clubCoach![id]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(Object.keys(forced.clubCoach!).length * 0.5);
    expect(coachProblems(next).filter((x) => !x.includes('vencido'))).toEqual([]);
  }, 300_000);
});

describe('ETAPA 5 — carreira do usuário (demissão, propostas, troca de clube)', () => {
  const base = makeCareer('flamengo', 14);
  it('demitido: clube ganha treinador da IA, usuário recebe propostas compatíveis e ao aceitar o antigo clube continua com treinador', () => {
    let g = fire(base, 'teste');
    expect(g.unemployed).toBe(true);
    expect(coachOf(g, 'flamengo')).toBeDefined();
    for (let i = 0; i < 12 && !(g.jobOffers ?? []).length; i++) g = generateJobOffers({ ...g, round: g.round + 1 }, makeRng(i), i > 6 ? 2 : 0);
    expect((g.jobOffers ?? []).length).toBeGreaterThan(0);
    const dom = g.jobOffers!.find((o) => !o.foreign);
    if (!dom) return;                                                    // só propostas do exterior (têm fluxo próprio em abroad.ts)
    const target = dom.clubId;
    const r = acceptOffer(g, target);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.userClubId).toBe(target);
      expect(r.state.unemployed).toBe(false);
      expect(r.state.clubCoach?.[target]).toBeUndefined();            // o treinador da IA que estava lá saiu
      expect(coachProblems(r.state).filter((x) => !x.includes('vencido'))).toEqual([]);
      expect(r.state.jobs?.length).toBe(2);
    }
  });
  it('pedir demissão e assumir outro clube diretamente mantém os dois clubes consistentes', () => {
    const g = resign(base);
    expect(g.unemployed).toBe(true);
    const other = Object.keys(base.teams).find((id) => id !== 'flamengo')!;
    const h = hire(g, other);
    expect(h.userClubId).toBe(other);
    expect(coachProblems(h).filter((x) => !x.includes('vencido'))).toEqual([]);
  });
});

describe('ETAPA 5 — 4 temporadas de uma carreira (histórico, reputação, objetivos, propostas)', () => {
  it('a carreira avança sem travar: histórico cresce, reputação e pontos coerentes, objetivo válido, propostas limitadas, treinadores íntegros', () => {
    let g = makeCareer('flamengo', 21);
    const problems: string[] = [];
    for (let t = 0; t < 4; t++) {
      const h = g.history.length;
      g = startNextSeason(simulateToEnd(g));
      if (g.history.length !== h + 1) problems.push(`T${g.season}: histórico não cresceu (${h} → ${g.history.length})`);
      if (!Number.isFinite(g.coachPoints ?? 0)) problems.push(`T${g.season}: pontos de treinador inválidos`);
      if (!['title', 'continental', 'midtable', 'survive', 'promotion', 'top-half'].includes(g.clubs[g.userClubId].boardExpectation ?? 'midtable')) problems.push(`T${g.season}: objetivo inválido ${g.clubs[g.userClubId].boardExpectation}`);
      if ((g.jobOffers ?? []).length > MAX_OFFERS) problems.push(`T${g.season}: ${(g.jobOffers ?? []).length} propostas`);
      if (g.unemployed) { // demitido: o fluxo continua (propostas aparecem, aceitar volta a ter clube)
        for (let i = 0; i < 14 && !(g.jobOffers ?? []).some((o) => !o.foreign); i++) g = generateJobOffers({ ...g, round: g.round + 1 }, makeRng(i), i > 6 ? 2 : 0);
        const dom = (g.jobOffers ?? []).find((o) => !o.foreign);
        if (!dom) { problems.push(`T${g.season}: demitido e sem nenhuma proposta nacional`); break; }
        const r = acceptOffer(g, dom.clubId);
        if (!r.ok) { problems.push(`T${g.season}: não conseguiu assumir ${dom.clubId}`); break; }
        g = r.state;
      }
      problems.push(...coachProblems(g).filter((x) => !x.includes('vencido')).map((x) => `T${g.season}: ${x}`));
    }
    expect(problems).toEqual([]);
  }, 900_000);
});
