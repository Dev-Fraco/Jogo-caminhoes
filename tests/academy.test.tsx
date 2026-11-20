import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer } from '../src/engine/game';
import { academyCost, academyCostAt, academyCostTable, academyPercent, academySpeed, coachSpecBonus, dedicationWith, facilityCost, facilityCostTable, facilityTrainingFactor, FACILITIES, facLevel, gapWindow, injuryDurationFactor, intakeCount, MAX_ACADEMY_LEVEL, MAX_FACILITY_LEVEL, originalCost, potentialBonus, totals, upgradeAcademy, upgradeFacility, youthCapacity, START_FACILITIES, type FacilityId } from '../src/engine/academy';
import { applyInjuries } from '../src/engine/injuries';
import { baseIncome } from '../src/engine/finance';
import { priceIndex } from '../src/engine/economy';
import { divisionIndexOf } from '../src/engine/transfers';
import { dismissCoach, genCoach, hireCoach, refreshMarket, starsOf, type YouthCoach } from '../src/engine/coaches';
import { aiAcademyYear, aiInfra, developYouth, ensureAiAcademies, ensureAiYouth, ensureAiYouthCoaches } from '../src/engine/aiyouth';
import { makeRng } from '../src/engine/rng';
import { loadGame, saveGame } from '../src/engine/save';
import { migrateGame } from '../src/engine/migrate';
import { pointsPerYear, rollPotential, trainTick } from '../src/engine/training';
import { ensureCategoryState, ensureYouth, youthOf, youthSeason, type Prospect, type YouthState } from '../src/engine/youth';
import { AcademyScreen } from '../src/ui/AcademyScreen';
import type { GameState, Player } from '../src/engine/types';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const mk = (cash = 1e12): GameState => { const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() } as never, 7); return { ...ensureYouth(g), budgets: { ...g.budgets, palmeiras: cash } }; };
const income = (g: GameState) => baseIncome(divisionIndexOf(g, g.userClubId), g.clubs[g.userClubId].reputation, priceIndex(g));
const FAC = FACILITIES.map((f) => f.id);
const MAXFAC = { centro: 20, fisica: 20, medico: 20, alojamento: 20, campos: 20 };
const C = (rating: number, specs: YouthCoach['specs'] = ['tatica']): YouthCoach => ({ id: `c${rating}${specs.join('')}`, name: 'T', age: 45, exp: 15, rating, specs, trait: 'metodico', wage: 50000, history: [] });
const pr = (id: string, age: number, over: number, pot: number, pos: Player['pos'] = 'MID', extra: Partial<Prospect> = {}): Prospect => ({ player: { id, name: `J ${id}`, pos, age, strength: over }, potential: pot, exact: over, train: 0, base: over, attrs: Array(6).fill(over), ...extra });
const Y = (g: GameState, over: Partial<YouthState> = {}): YouthState => ({ ...youthOf(g), ...over });
const run = (p: Prospect, y: YouthState, n = 38): Prospect => { let q = p; for (let i = 0; i < n; i++) q = trainTick(q, y, 38); return q; };

describe('academia de 20 níveis', () => {
  it('sobe do nível 0 ao 20, um a um, e para no máximo', () => {
    let g = mk();
    expect(MAX_ACADEMY_LEVEL).toBe(20); expect(youthOf(g).level).toBe(0);
    for (let L = 1; L <= 20; L++) { const r = upgradeAcademy(g); if (!r.ok) throw new Error(`${L}: ${r.error}`); g = r.state; expect(youthOf(g).level).toBe(L); expect(academyPercent(youthOf(g))).toBe(L * 5); }
    const over = upgradeAcademy(g);
    expect(over.ok).toBe(false); if (!over.ok) expect(over.error).toMatch(/máximo/);
    expect(youthOf(g).level).toBe(20); expect(academyCost(g)).toBe(0);
  });
});

describe('custos: 1,2× a tabela original (o triplo com 60% de desconto)', () => {
  it('exemplos: R$ 500 mil → R$ 600 mil e R$ 2 mi → R$ 2,4 mi (antes R$ 1,5 mi e R$ 6 mi: 60% a menos)', () => {
    expect(originalCost(6_250_000, 0)).toBe(500_000); expect(academyCostAt(6_250_000, 0)).toBe(600_000);
    expect(originalCost(25_000_000, 0)).toBe(2_000_000); expect(academyCostAt(25_000_000, 0)).toBe(2_400_000);
    for (const inc of [3e6, 6.25e6, 25e6, 80e6]) for (let L = 0; L < 20; L++) expect(academyCostAt(inc, L)).toBeCloseTo(0.4 * 3 * originalCost(inc, L), -3); // exatamente 40% do custo de antes, em todos os níveis
  });
  it('a tabela do jogo é exatamente 1,2× a original, mantendo a progressão entre os níveis (sem valores iguais)', () => {
    const g = mk(); const inc = income(g);
    const table = academyCostTable(g);
    expect(table).toHaveLength(20);
    for (let L = 0; L < 20; L++) {
      expect(table[L]).toBe(Math.round(1.2 * Math.round((0.08 * inc * (L + 1)) / 10_000) * 10_000)); // a fórmula original, ×1,2
      expect(table[L]).toBe(Math.round(1.2 * originalCost(inc, L)));
      if (L > 0) expect(table[L]).toBeGreaterThan(table[L - 1]);
    }
    expect(new Set(table).size).toBe(20);
    for (let L = 1; L < 20; L++) expect(table[L] / table[L - 1]).toBeCloseTo(originalCost(inc, L) / originalCost(inc, L - 1), 2); // mesma progressão
    expect(academyCost(g, 0)).toBe(table[0]); expect(academyCost(g, 7)).toBe(table[7]);
  });
  it('o custo é visto antes de confirmar (tela) e nada muda sem confirmar', () => {
    const g = mk();
    const html = renderToStaticMarkup(createElement(AcademyScreen, { game: g, onChange: () => {} }));
    expect(html).toMatch(/Próxima melhoria \(nível 1\)/);
    expect(html).toContain('Melhorar a academia');
    expect(html).toMatch(/tabela de custos dos 20 níveis/);
    expect(youthOf(g).level).toBe(0); expect(g.budgets.palmeiras).toBe(1e12);
  });
});

describe('cinco instalações', () => {
  it('existem as cinco, começam no nível 1 e cada uma sobe separadamente até 20', () => {
    expect(FAC).toEqual(['centro', 'fisica', 'medico', 'alojamento', 'campos']);
    expect(FACILITIES.map((f) => f.label)).toEqual(['Centro de treinamento', 'Academia física', 'Centro médico', 'Alojamento', 'Campos de treinamento']);
    let g = mk();
    for (const f of FAC) expect(facLevel(youthOf(g), f)).toBe(1);
    for (let i = 0; i < 4; i++) { const r = upgradeFacility(g, 'medico'); if (!r.ok) throw new Error(r.error); g = r.state; }
    expect(facLevel(youthOf(g), 'medico')).toBe(5);
    for (const f of FAC.filter((x) => x !== 'medico')) expect(facLevel(youthOf(g), f)).toBe(1); // as outras não mudam
    expect(youthOf(g).level).toBe(0);                                                          // nem a academia geral
    for (let i = 0; i < 40; i++) { const r = upgradeFacility(g, 'campos'); if (r.ok) g = r.state; }
    expect(facLevel(youthOf(g), 'campos')).toBe(20);
    const over = upgradeFacility(g, 'campos'); expect(over.ok).toBe(false);
    expect(facilityCost(g, 'campos')).toBe(0);
  });
  it('cada instalação tem sua tabela de custos (19 degraus, progressivos e diferentes entre si)', () => {
    const g = mk(); const tables = FAC.map((f) => facilityCostTable(g, f));
    for (const t of tables) { expect(t).toHaveLength(MAX_FACILITY_LEVEL - 1); for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]); }
    expect(new Set(tables.map((t) => t[0])).size).toBeGreaterThan(2);
    expect(facilityCost(g, 'centro')).toBe(tables[0][0]);
  });
});

describe('benefícios reais', () => {
  const base = mk();
  const withFac = (f: Partial<Record<FacilityId, number>>, extra: Partial<YouthState> = {}): YouthState => ({ ...Y(base, { fac: { ...START_FACILITIES, ...f } }), ...extra });
  it('centro de treinamento: treino técnico/tático e eficiência geral', () => {
    const p = (focus: 'tecnico' | 'tatico' | 'fisico') => pr('a', 16, 30, 90, 'MID', { focus });
    for (const f of ['tecnico', 'tatico'] as const) expect(pointsPerYear(p(f), withFac({ centro: 20 }))).toBeGreaterThan(pointsPerYear(p(f), withFac({ centro: 1 })) * 1.2);
    const fis = pointsPerYear(p('fisico'), withFac({ centro: 20 })) / pointsPerYear(p('fisico'), withFac({ centro: 1 }));
    expect(fis).toBeGreaterThan(1); expect(fis).toBeLessThan(1.1);   // eficiência geral pequena
    expect(run(pr('b', 16, 30, 95), withFac({ centro: 20 }, { coaches: { sub17: C(5, ['tecnica']) } })).exact).toBeGreaterThan(run(pr('b', 16, 30, 95), withFac({ centro: 1 }, { coaches: { sub17: C(5, ['tecnica']) } })).exact);
  });
  it('academia física: treino físico e preparação', () => {
    const p = pr('c', 16, 30, 90, 'MID', { focus: 'fisico' });
    expect(pointsPerYear(p, withFac({ fisica: 20 }))).toBeGreaterThan(pointsPerYear(p, withFac({ fisica: 1 })) * 1.25);
    const t = pr('c', 16, 30, 90, 'MID', { focus: 'tatico' });
    expect(pointsPerYear(t, withFac({ fisica: 20 }))).toBeGreaterThan(pointsPerYear(t, withFac({ fisica: 1 }))); // preparação geral
    expect(coachSpecBonus(withFac({ fisica: 20 }), 'fisica')).toBeGreaterThan(1.1);
  });
  it('campos de treinamento: fundamentos, treinos práticos e especialistas de posição', () => {
    const f = pr('d', 16, 30, 60, 'ATT', { focus: 'fundamentos' });
    expect(pointsPerYear(f, withFac({ campos: 20 }))).toBeGreaterThan(pointsPerYear(f, withFac({ campos: 1 })) * 1.25);
    const y1 = withFac({ campos: 1 }, { coaches: { sub17: C(4, ['atacantes']) } }), y20 = withFac({ campos: 20 }, { coaches: { sub17: C(4, ['atacantes']) } });
    expect(pointsPerYear(f, y20)).toBeGreaterThan(pointsPerYear(f, y1));                // o especialista rende mais com campos melhores
    expect(run(f, y20).exact).toBeGreaterThanOrEqual(run(f, y1).exact);
    expect(facilityTrainingFactor({ fac: { ...START_FACILITIES, campos: 20 } }, 'tecnico')).toBeGreaterThan(facilityTrainingFactor({ fac: START_FACILITIES }, 'tecnico'));
  });
  it('alojamento: dedicação maior e mais vagas na base', () => {
    expect(dedicationWith(1, { fac: { ...START_FACILITIES, alojamento: 20 } })).toBeGreaterThan(1.2); expect(dedicationWith(1, { fac: START_FACILITIES })).toBe(1);
    expect(dedicationWith(1.3, { fac: { ...START_FACILITIES, alojamento: 20 } })).toBeLessThanOrEqual(1.6);
    expect(youthCapacity({ fac: START_FACILITIES })).toBe(80); expect(youthCapacity({ fac: { ...START_FACILITIES, alojamento: 20 } })).toBe(118);
    const p = pr('e', 16, 30, 90);
    expect(pointsPerYear(p, withFac({ alojamento: 20 }))).toBeGreaterThan(pointsPerYear(p, withFac({ alojamento: 1 })));
    // capacidade real: com 100 jovens de potenciais diferentes, o alojamento no máximo mantém mais deles na virada
    const many = (n: number): Prospect[] => Array.from({ length: n }, (_, i) => pr(`m${i}`, 13, 8, 50 + (i % 40)));
    const keep = (alo: number) => youthOf(youthSeason({ ...base, round: base.totalRounds + 1, youth: { ...youthOf(base), fac: { ...START_FACILITIES, alojamento: alo }, prospects: many(100) } })).prospects.length;
    expect(keep(20)).toBeGreaterThan(keep(1));
  });
  it('centro médico: lesões leves do SEU clube duram menos; graves seguem acima de 1 mês; rivais não mudam', () => {
    const g0 = mk(); const mine = g0.teams.palmeiras.players[0].id, other = g0.teams.flamengo.players[0].id;
    const hit = (id: string, club: string, days: number, severity: 'leve' | 'grave') => ({ playerId: id, clubId: club, rounds: Math.max(1, Math.ceil(days / 7)), kind: 'x', days, severity });
    const days = (g: GameState, id: string) => g.injuries![id].days!;
    const lowMed = applyInjuries(g0, [hit(mine, 'palmeiras', 20, 'leve'), hit(other, 'flamengo', 20, 'leve')]);
    const hiMed = applyInjuries({ ...g0, youth: { ...youthOf(g0), fac: { ...START_FACILITIES, medico: 20 } } }, [hit(mine, 'palmeiras', 20, 'leve'), hit(other, 'flamengo', 20, 'leve')]);
    expect(days(lowMed, mine)).toBe(20); expect(days(hiMed, mine)).toBeLessThan(15); expect(days(hiMed, mine)).toBeGreaterThanOrEqual(11);
    expect(days(hiMed, other)).toBe(20); // clube rival: igual
    const grave = applyInjuries({ ...g0, youth: { ...youthOf(g0), fac: { ...START_FACILITIES, medico: 20 } } }, [hit(mine, 'palmeiras', 40, 'grave')]);
    expect(days(grave, mine)).toBeLessThan(40); expect(days(grave, mine)).toBeGreaterThanOrEqual(31);
    expect(injuryDurationFactor({ fac: START_FACILITIES }, 'leve')).toBe(1); expect(injuryDurationFactor({ fac: { ...START_FACILITIES, medico: 20 } }, 'leve')).toBeCloseTo(0.62, 5);
  });
  it('academia geral: velocidade, safra, potencial, desenvolvimento perto do teto e treinadores melhores', () => {
    expect(academySpeed(20)).toBeGreaterThan(academySpeed(0)); expect(intakeCount(20)).toBeGreaterThan(intakeCount(0));
    expect(potentialBonus(20)).toBeGreaterThan(potentialBonus(0)); expect(gapWindow(20)).toBeLessThan(gapWindow(0));
    const rng = (seed: number) => makeRng(seed); const avg = (lv: number) => { const r = rng(9); let t = 0; for (let i = 0; i < 4000; i++) t += rollPotential(r, lv); return t / 4000; };
    expect(avg(20)).toBeGreaterThan(avg(0) + 3);
    const near = pr('n', 17, 70, 78);
    expect(pointsPerYear(near, { ...Y(base), level: 20 })).toBeGreaterThan(pointsPerYear(near, { ...Y(base), level: 0 }) * 1.2);
    const stars = (lv: number) => { let t = 0, n = 0; for (let k = 0; k < 40; k++) { const g = { ...base, round: k + 1, youth: { ...youthOf(base), level: lv, market: undefined } }; for (const c of refreshMarket(g, g.youth!, 'full').market!.list) { t += starsOf(c.rating); n++; } } return t / n; };
    expect(stars(20)).toBeGreaterThan(stars(0) + 1);
  });
  it('a safra anual traz mais jovens com academia melhor', () => {
    const n = (lv: number) => youthOf(youthSeason({ ...mk(), round: 39, youth: { ...youthOf(mk()), level: lv, prospects: [] } })).prospects.length;
    expect(n(20)).toBeGreaterThan(n(0)); expect(n(0)).toBe(4); expect(n(20)).toBe(10);
  });
});

describe('treinadores de 10★ só com a academia em 100% (instalações não liberam)', () => {
  const ten = (g: GameState, level: number): { g: GameState; id: string } => {
    const y = youthOf(g); const c = { ...C(10, ['fisica']), id: 'tc-10' };
    const d = dismissCoach({ ...g, youth: { ...y, level, fac: { ...MAXFAC }, market: { key: 'x', list: [c, ...(y.market?.list ?? [])] } } }, 'sub21'); if (!d.ok) throw new Error(d.error);
    return { g: d.state, id: c.id };
  };
  it('com TODAS as instalações no 20 e a academia em 19 continua bloqueado; no 20 libera', () => {
    const a = ten(mk(), 19); const blocked = hireCoach(a.g, 'sub21', a.id);
    expect(blocked.ok).toBe(false); if (!blocked.ok) expect(blocked.error).toMatch(/100%/);
    const b = ten(mk(), 20); const ok = hireCoach(b.g, 'sub21', b.id);
    if (!ok.ok) throw new Error(ok.error);
    expect(starsOf(youthOf(ok.state).coaches!.sub21!.rating)).toBe(10);
  });
});

describe('caixa real e histórico', () => {
  it('cada investimento desconta o valor exato do caixa e fica registrado; sem saldo não acontece nada', () => {
    let g = mk(1e12); const cash0 = g.budgets.palmeiras;
    const c1 = academyCost(g); const r1 = upgradeAcademy(g); if (!r1.ok) throw new Error(r1.error); g = r1.state;
    const c2 = facilityCost(g, 'centro'); const r2 = upgradeFacility(g, 'centro'); if (!r2.ok) throw new Error(r2.error); g = r2.state;
    expect(g.budgets.palmeiras).toBe(cash0 - c1 - c2);
    const y = youthOf(g);
    expect(y.fin!.log.map((e) => [e.kind, e.cost, e.from, e.to])).toEqual([['academia', c1, 0, 1], ['centro', c2, 1, 2]]);
    expect(totals(y).obras).toBe(c1 + c2);
    const poor = { ...g, budgets: { ...g.budgets, palmeiras: c1 - 1 } };
    const bad = upgradeAcademy(poor); expect(bad.ok).toBe(false); if (!bad.ok) expect(bad.error).toMatch(/não tem caixa/);
    expect(upgradeFacility({ ...poor, budgets: { ...poor.budgets, palmeiras: 0 } }, 'medico').ok).toBe(false);
    expect(poor.budgets.palmeiras).toBe(c1 - 1); expect(youthOf(poor).fin!.log).toHaveLength(2); // nada foi cobrado nem registrado
  });
  it('despesas com treinadores (luvas, multa e folha) também entram no histórico', () => {
    let g = mk(); const cash0 = g.budgets.palmeiras;
    const d = dismissCoach(g, 'sub15'); if (!d.ok) throw new Error(d.error); g = d.state;
    const cand = youthOf(g).market!.list.find((c) => starsOf(c.rating) < 10)!;
    const h = hireCoach(g, 'sub15', cand.id); if (!h.ok) throw new Error(h.error); g = h.state;
    const log = youthOf(g).fin!.log;
    expect(log.map((e) => e.kind)).toEqual(['treinador', 'treinador']);
    expect(log.reduce((t, e) => t + e.cost, 0)).toBe(cash0 - g.budgets.palmeiras);
    expect(totals(youthOf(g)).treinadores).toBe(cash0 - g.budgets.palmeiras); expect(totals(youthOf(g)).obras).toBe(0);
    const n = youthSeason({ ...g, round: g.totalRounds + 1 });
    expect(youthOf(n).fin!.log.some((e) => /Folha/.test(e.text))).toBe(true);
    const wages = Object.values(youthOf(g).coaches!).reduce((t, c) => t + c!.wage, 0);
    const coachFolha = youthOf(n).fin!.log.filter((e) => /Folha anual dos treinadores/.test(e.text)).reduce((t, e) => t + e.cost, 0);
    expect(coachFolha).toBe(wages);                                                  // a folha dos treinadores sai do caixa e é registrada
    expect(g.budgets.palmeiras - n.budgets.palmeiras).toBeGreaterThanOrEqual(wages); // (a folha dos jovens também sai: Etapa 6)
  });
  it('o painel mostra nível, %, caixa, próximo custo, instalações, histórico e total investido', () => {
    let g = mk(); const r = upgradeAcademy(g); if (!r.ok) throw new Error(r.error); g = r.state;
    const html = renderToStaticMarkup(createElement(AcademyScreen, { game: g, onChange: () => {} }));
    for (const t of ['Nível 1 / 20', '5%', 'Disponível', 'Total investido', 'Histórico de investimentos', 'Treinadores disponíveis', 'Centro médico', 'Campos de treinamento', 'Academia física', 'Alojamento', 'Centro de treinamento', 'Academia: nível 0 → 1']) expect(html, t).toContain(t);
  });
});

describe('persistência e saves anteriores', () => {
  it('nível, instalações e histórico sobrevivem a salvar e reabrir', () => {
    let g = mk();
    for (let i = 0; i < 3; i++) { const r = upgradeAcademy(g); if (r.ok) g = r.state; }
    const f = upgradeFacility(g, 'alojamento'); if (!f.ok) throw new Error(f.error); g = f.state;
    expect(saveGame(g).ok).toBe(true);
    const back = loadGame()!;
    expect(youthOf(back).level).toBe(3); expect(youthOf(back).fac).toEqual(youthOf(g).fac); expect(youthOf(back).fin).toEqual(youthOf(g).fin);
    expect(back.budgets.palmeiras).toBe(g.budgets.palmeiras);
    expect(migrateGame(back).game.youth!.fac!.alojamento).toBe(2);
  });
  it('save da Etapa 3 (sem instalações nem histórico): completa sem perder nível, treinadores nem jovens', () => {
    const base = mk(); const y = youthOf(base);
    const old: GameState = { ...base, youth: { ...y, level: 4, schema: 3, fac: undefined, fin: undefined } };
    const m = ensureCategoryState(old);
    expect(youthOf(m).level).toBe(4); expect(youthOf(m).fac).toEqual(START_FACILITIES); expect(youthOf(m).fin).toEqual({ total: 0, staff: 0, log: [] });
    expect(youthOf(m).coaches).toEqual(y.coaches); expect(youthOf(m).prospects).toEqual(y.prospects);
    expect(academyPercent(youthOf(m))).toBe(20); expect(ensureCategoryState(m)).toBe(m);
    expect(migrateGame(old).report.violations).toEqual([]);
  });
});

describe('academias dos clubes rivais', () => {
  const ai = (): GameState => { const g = mk(); return ensureAiYouthCoaches(ensureAiYouth(g, makeRng(11))); };
  it('todo clube da IA tem academia e instalações; os grandes saem na frente e ninguém começa no 20', () => {
    const g = ai(); const ids = Object.keys(g.teams).filter((id) => id !== g.userClubId);
    for (const id of ids) { const a = g.aiAcademy![id]; expect(a, id).toHaveLength(6); expect(a[0]).toBeGreaterThanOrEqual(0); expect(a[0]).toBeLessThan(20); for (const v of a.slice(1)) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(20); } }
    const lvl = (rep: number) => { const l = ids.filter((id) => g.clubs[id]?.reputation === rep).map((id) => g.aiAcademy![id][0]); return l.reduce((a, b) => a + b, 0) / Math.max(1, l.length); };
    expect(lvl(5)).toBeGreaterThan(lvl(3)); expect(lvl(3)).toBeGreaterThan(lvl(1));
    expect(ensureAiAcademies(g)).toBe(g);
    expect(aiInfra(g, 'flamengo')).toBeGreaterThan(aiInfra(g, ids.find((id) => g.clubs[id]?.reputation === 1)!));
  });
  it('separam parte da receita num fundo (só com folga de caixa), pagam as obras com ele, no máximo +1 por ano, e o dinheiro sai do caixa e fica registrado', () => {
    const g = ai(); const poor = ids(g).find((id) => g.clubs[id].reputation === 5)!, rich = ids(g).find((id) => g.clubs[id].reputation === 4 && id !== poor)!;
    const before = g.aiAcademy![rich].slice();
    const rng = makeRng(1);
    const g2: GameState = { ...g, aiAcademy: { ...g.aiAcademy!, [rich]: [...before.slice(0, 6), 1e12] }, budgets: { ...g.budgets, [poor]: 0, [rich]: 1e12 } };
    const out = aiAcademyYear(g2, rng);
    expect(out.aiAcademy![poor][0]).toBe(g.aiAcademy![poor][0]); expect(out.budgets[poor]).toBe(0); expect(out.aiAcademy![poor][6]).toBe(g.aiAcademy![poor][6] ?? 0);   // sem caixa: nada
    expect(out.aiAcademy![rich][0]).toBeLessThanOrEqual(before[0] + 1); expect(out.aiAcademy![rich].slice(0, 6).every((v, i) => v <= before[i] + 1)).toBe(true);
    const spent = out.aiAcademyLog!.filter((l) => l.clubId === rich).reduce((t, l) => t + l.cost, 0);
    expect(spent).toBeGreaterThan(0);                                                   // obras pagas pelo fundo
    expect(out.budgets[rich]).toBeLessThan(1e12);                                       // a contribuição saiu do caixa
    for (const id of ids(g)) { expect(out.budgets[id]).toBeGreaterThanOrEqual(Math.min(0, g2.budgets[id] ?? 0)); expect(out.aiAcademy![id][0]).toBeLessThanOrEqual(20); }
    // o dinheiro só muda de lugar: caixa + fundos antes = caixa + fundos depois + obras pagas
    const tot = (x: GameState) => Object.values(x.budgets).reduce((a, b) => a + b, 0) + Object.values(x.aiAcademy!).reduce((a, r) => a + (r[6] ?? 0), 0);
    expect(Math.abs(tot(g2) - tot(out) - spentAll(out, g2))).toBeLessThan(ids(g).length);   // (arredondamentos)
  });
  it('clubes de todos os tamanhos evoluem a academia ao longo das temporadas, sem passar de 20 e só com o dinheiro que têm', () => {
    let g = ai(); const rng = makeRng(3);
    const start = new Map(ids(g).map((id) => [id, g.aiAcademy![id][0]]));
    const cash0 = { ...g.budgets };
    for (let y = 0; y < 12; y++) g = aiAcademyYear({ ...g, season: g.season + 1, budgets: { ...cash0 } }, rng);   // (o caixa se recompõe a cada ano, como na temporada)
    const grew = ids(g).filter((id) => g.aiAcademy![id][0] > start.get(id)!);
    expect(grew.length).toBeGreaterThan(5);                                             // não ficam parados
    expect(grew.some((id) => g.clubs[id].reputation <= 2)).toBe(true);                  // os pequenos também avançam
    for (const id of ids(g)) { expect(g.aiAcademy![id][0]).toBeLessThanOrEqual(20); expect(Number.isFinite(g.budgets[id])).toBe(true); }
    const diff = new Set(grew.map((id) => g.aiAcademy![id][0] - start.get(id)!));
    expect(diff.size).toBeGreaterThan(1);                                               // ritmos diferentes
  });
  it('a academia e as instalações do rival influenciam a base dele e os treinadores que ele atrai', () => {
    const g = ai(); const id = 'flamengo';
    const hi: GameState = { ...g, aiAcademy: { ...g.aiAcademy!, [id]: [20, 20, 20, 20, 20, 20] } }, lo: GameState = { ...g, aiAcademy: { ...g.aiAcademy!, [id]: [0, 1, 1, 1, 1, 1] } };
    expect(aiInfra(hi, id)).toBe(1); expect(aiInfra(lo, id)).toBeLessThan(0.2);
    const sum = (s: GameState) => { const n = developYouth(s, makeRng(5)); return n.aiYouth![id].reduce((t, p) => t + p.strength, 0); };
    expect(sum(hi)).toBeGreaterThanOrEqual(sum(lo));
    const coaches = (s: GameState) => ensureAiYouthCoaches({ ...s, aiYouthCoaches: undefined }).aiYouthCoaches![id].reduce((t, r) => t + r[0], 0);
    expect(coaches(hi)).toBeGreaterThan(coaches(lo));
  });
  it('as academias rivais ficam salvas', () => {
    const g = ai(); expect(saveGame(g).ok).toBe(true); const back = loadGame()!;
    expect(back.aiAcademy).toEqual(g.aiAcademy); expect(migrateGame(back).game.aiAcademy).toEqual(g.aiAcademy);
  });
});
const ids = (g: GameState) => Object.keys(g.teams).filter((id) => id !== g.userClubId);
void genCoach;

const spentAll = (out: GameState, before: GameState) => (out.aiAcademyLog ?? []).filter((l) => !(before.aiAcademyLog ?? []).includes(l)).reduce((t, l) => t + l.cost, 0);
