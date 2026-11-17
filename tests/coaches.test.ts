import { beforeEach, describe, expect, it, vi } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer, playNext } from '../src/engine/game';
import { CATEGORIES } from '../src/engine/categories';
import { answer, buildReport, chat, parseTopic, playersOf, TOPICS } from '../src/engine/coachtalk';
import { canHireStars, COACH_SPECS, dismissCoach, employedIds, evaluateCoaches, genCoach, hireCoach, hireFee, marketTick, ratingDelta, refreshMarket, severance, starsOf, vacancies, MARKET_SIZE, type CoachSpecId, type YouthCoach } from '../src/engine/coaches';
import { makeRng } from '../src/engine/rng';
import { loadGame, saveGame } from '../src/engine/save';
import { migrateGame } from '../src/engine/migrate';
import { aiCoachBoost, aiCoachesOf, developYouth, ensureAiYouth, ensureAiYouthCoaches } from '../src/engine/aiyouth';
import { growYoung } from '../src/engine/potential';
import { assignFocus, pointsPerYear, trainTick, attrsOf, ATTR_KIND, academyPercent } from '../src/engine/training';
import { ensureCategoryState, ensureYouth, youthOf, youthSeason, youthTick, type Prospect, type YouthState } from '../src/engine/youth';
import type { GameState, Player } from '../src/engine/types';

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const mk = (): GameState => { const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() } as never, 7); return { ...ensureYouth(g), budgets: { ...g.budgets, palmeiras: 5e9 } }; };
const C = (rating: number, specs: CoachSpecId[] = ['tatica'], extra: Partial<YouthCoach> = {}): YouthCoach => ({ id: `c${rating}-${specs.join('')}`, name: `T${rating}${specs[0]}`, age: 45, exp: 15, rating, specs, trait: 'metodico', wage: 50000, history: [], ...extra });
const withCoach = (y: YouthState, c: YouthCoach, cat: 'sub13' | 'sub15' | 'sub17' | 'sub21' = 'sub17'): YouthState => ({ ...y, coaches: { ...y.coaches, [cat]: c } });
const pr = (id: string, age: number, over: number, pot: number, pos: Player['pos'] = 'ATT'): Prospect => ({ player: { id, name: `J ${id}`, pos, age, strength: over }, potential: pot, exact: over, train: 0, base: over, attrs: Array(6).fill(over) });
const run = (p: Prospect, y: YouthState, n = 38): Prospect => { let q = p; for (let i = 0; i < n; i++) q = trainTick(q, y, 38); return q; };

describe('um treinador exclusivo por categoria', () => {
  it('cada categoria tem o seu espaço, com treinador próprio e diferente dos outros', () => {
    const y = youthOf(mk());
    expect(CATEGORIES.map((c) => c.id)).toEqual(['sub13', 'sub15', 'sub17', 'sub21']);
    for (const c of CATEGORIES) { const t = y.coaches![c.id]!; expect(t, c.id).toBeDefined(); expect(t.specs.length).toBeGreaterThanOrEqual(1); expect(t.rating).toBeGreaterThanOrEqual(2); expect(t.rating).toBeLessThanOrEqual(4); expect(t.history.length).toBeGreaterThan(0); }
    expect(employedIds(y).size).toBe(4);
    expect(vacancies(y)).toEqual([]);
  });
});

describe('contratação e demissão', () => {
  it('demitir abre a vaga, cobra a multa e preserva jovens e histórico; contratar ocupa a vaga e cobra luvas', () => {
    const g = mk();
    const y0 = youthOf(g), cash0 = g.budgets.palmeiras;
    const old = y0.coaches!.sub15!;
    const d = dismissCoach(g, 'sub15');
    if (!d.ok) throw new Error(d.error);
    expect(vacancies(youthOf(d.state))).toEqual(['sub15']);
    expect(d.state.budgets.palmeiras).toBe(cash0 - severance(old));
    expect(youthOf(d.state).prospects).toEqual(y0.prospects);            // jovens intactos
    expect(youthOf(d.state).catLog!.sub15!.some((l) => l.text.includes(old.name))).toBe(true); // histórico da categoria preservado
    const cand = youthOf(d.state).market!.list.find((c) => starsOf(c.rating) < 10)!;
    const h = hireCoach(d.state, 'sub15', cand.id);
    if (!h.ok) throw new Error(h.error);
    const y1 = youthOf(h.state);
    expect(y1.coaches!.sub15!.id).toBe(cand.id);
    expect(y1.market!.list.some((c) => c.id === cand.id)).toBe(false);
    expect(h.state.budgets.palmeiras).toBe(d.state.budgets.palmeiras - hireFee(cand));
    expect(y1.prospects).toEqual(y0.prospects);
    expect(y1.catLog!.sub15!.length).toBe(2);
    expect(y1.coaches!.sub15!.history.some((x) => /Contratado/.test(x.text))).toBe(true);
  });
  it('não contrata para categoria ocupada, nem o mesmo treinador em duas categorias, nem sem caixa', () => {
    const g = mk();
    const cand = youthOf(g).market!.list.find((c) => starsOf(c.rating) < 10)!;
    expect(hireCoach(g, 'sub13', cand.id)).toMatchObject({ ok: false }); // ocupada
    let d = dismissCoach(g, 'sub13'); if (!d.ok) throw new Error(d.error);
    d = dismissCoach(d.state, 'sub15'); if (!d.ok) throw new Error(d.error);
    const h = hireCoach(d.state, 'sub13', cand.id); if (!h.ok) throw new Error(h.error);
    expect(hireCoach(h.state, 'sub15', cand.id)).toMatchObject({ ok: false });   // já saiu do mercado
    const y = youthOf(h.state); // força o mesmo treinador de volta ao mercado: ainda assim a vaga é exclusiva
    const forced = { ...h.state, youth: { ...y, market: { ...y.market!, list: [...y.market!.list, y.coaches!.sub13!] } } };
    const r = hireCoach(forced, 'sub15', y.coaches!.sub13!.id);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/duas/);
    const broke = { ...d.state, budgets: { ...d.state.budgets, palmeiras: 0 } };
    expect(hireCoach(broke, 'sub15', youthOf(broke).market!.list.find((c) => starsOf(c.rating) < 10)!.id)).toMatchObject({ ok: false });
    expect(dismissCoach(g, 'sub17')).toMatchObject({ ok: true });
    const noC = dismissCoach(d.state, 'sub15'); expect(noC.ok).toBe(false); // vaga já aberta
  });
});

describe('treinadores de 10 estrelas × academia 100%', () => {
  const ten = (g: GameState): { g: GameState; id: string } => {
    const y = youthOf(g); const c = { ...C(10, ['fisica']), id: 'tc-10' };
    let s: GameState = { ...g, youth: { ...y, market: { key: 'x', list: [c, ...y.market!.list] } } };
    const d = dismissCoach(s, 'sub21'); if (!d.ok) throw new Error(d.error);
    return { g: d.state, id: c.id };
  };
  it('com a academia abaixo de 100% a contratação é bloqueada, em todos os níveis de 0 a 4', () => {
    for (let level = 0; level < 5; level++) {
      const base = mk(); const { g, id } = ten(base);
      const s = { ...g, youth: { ...youthOf(g), level } };
      expect(academyPercent(youthOf(s))).toBe(level * 20);
      const r = hireCoach(s, 'sub21', id);
      expect(r.ok, `nível ${level}`).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/100%/);
      expect(canHireStars(youthOf(s), 10)).toBe(false); expect(canHireStars(youthOf(s), 9)).toBe(true);
    }
  });
  it('com a academia em 100% o treinador de 10 estrelas pode ser contratado', () => {
    const { g, id } = ten(mk());
    const s = { ...g, youth: { ...youthOf(g), level: 5 } };
    expect(academyPercent(youthOf(s))).toBe(100);
    const r = hireCoach(s, 'sub21', id);
    if (!r.ok) throw new Error(r.error);
    expect(starsOf(youthOf(r.state).coaches!.sub21!.rating)).toBe(10);
  });
});

describe('mercado de treinadores', () => {
  it('tem treinadores variados (estrelas, especialidades, características) e se renova', () => {
    let g = mk();
    const m = youthOf(g).market!.list;
    expect(m).toHaveLength(MARKET_SIZE);
    expect(new Set(m.map((c) => starsOf(c.rating))).size).toBeGreaterThan(3);
    expect(new Set(m.flatMap((c) => c.specs)).size).toBeGreaterThan(3);
    expect(new Set(m.map((c) => c.trait)).size).toBeGreaterThan(1);
    expect(new Set(m.map((c) => c.id)).size).toBe(m.length);
    expect(m.every((c) => c.specs.length >= 1 && c.specs.length <= 3 && c.wage > 0)).toBe(true);
    // renovação periódica (a cada 12 rodadas) e total na virada de temporada
    const mid = { ...g, round: 13 };
    const y2 = marketTick(mid, youthOf(mid));
    expect(y2.market!.list.map((c) => c.id)).not.toEqual(m.map((c) => c.id));
    expect(y2.market!.list.filter((c) => m.some((o) => o.id === c.id)).length).toBeGreaterThan(0); // só parte renova
    const next = youthSeason({ ...g, round: g.totalRounds + 1 });
    expect(youthOf(next).market!.list.some((c) => m.some((o) => o.id === c.id))).toBe(false);
    expect(refreshMarket(g, youthOf(g), 'full').market!.list).toHaveLength(MARKET_SIZE);
  });
  it('10 estrelas são raros no mercado', () => {
    const g = mk(); const rng = makeRng(5); let tens = 0; const N = 3000;
    for (let i = 0; i < N; i++) if (starsOf(genCoach(g, rng, new Set()).rating) === 10) tens++;
    expect(tens / N).toBeLessThan(0.05); expect(tens).toBeGreaterThan(0);
  });
});

describe('especialidades', () => {
  const ALL = COACH_SPECS.map((s) => s.id);
  it('existem as sete (4 técnicas + 3 de preparação) e o gerador usa todas', () => {
    expect(ALL).toEqual(['atacantes', 'meias', 'defensores', 'goleiros', 'fisica', 'tecnica', 'tatica']);
    expect(COACH_SPECS.filter((s) => s.group === 'Técnica')).toHaveLength(4); expect(COACH_SPECS.filter((s) => s.group === 'Preparação')).toHaveLength(3);
    const g = mk(); const rng = makeRng(3); const seen = new Set<string>(); const used = new Set<string>();
    for (let i = 0; i < 200; i++) genCoach(g, rng, new Set()).specs.forEach((s) => seen.add(s));
    expect([...seen].sort()).toEqual([...ALL].sort());
    expect(genCoach(g, rng, used, { specs: ['atacantes', 'fisica'] }).specs).toEqual(['atacantes', 'fisica']);
  });
  it('o foco é decidido pelo treinador conforme a especialidade', () => {
    const att = pr('x', 15, 30, 80, 'ATT');
    expect(assignFocus(att, C(5, ['atacantes']))).toBe('fundamentos');
    expect(assignFocus(att, C(5, ['fisica']))).toBe('fisico');
    expect(assignFocus(att, C(5, ['tecnica']))).toBe('tecnico');
    expect(assignFocus(att, C(5, ['tatica']))).toBe('tatico');
    expect(assignFocus(pr('y', 15, 30, 80, 'GK'), C(5, ['goleiros']))).toBe('fundamentos');
    expect(assignFocus(pr('y', 15, 30, 80, 'DEF'), C(5, ['atacantes', 'fisica']))).toBe('fisico'); // não é a posição dele: usa a preparação
    expect(assignFocus(att, undefined)).toBeUndefined();
  });
  it('especialista na posição acelera esse jovem e melhora os fundamentos dele', () => {
    const yFor = (c: YouthCoach): YouthState => ({ ...youthOf(mk()), coaches: { sub17: c, sub15: c, sub13: c, sub21: c }, level: 0 });
    const at = pr('z', 16, 30, 90, 'ATT'), df = pr('z', 16, 30, 90, 'DEF');
    const spec = yFor(C(6, ['atacantes'])), other = yFor(C(6, ['defensores']));
    const pf = (c: YouthCoach, y: YouthState) => pointsPerYear({ ...at, focus: assignFocus(at, c) }, y);
    expect(pf(C(6, ['atacantes']), spec)).toBeGreaterThan(pf(C(6, ['defensores']), other)); // cada treinador com o foco que ele mesmo escolhe
    expect(pointsPerYear(df, other)).toBeGreaterThan(pointsPerYear(df, spec)); // o de defesa prefere o especialista em defensores
    const a = run(at, spec, 38 * 2), b = run(at, other, 38 * 2);
    expect(a.exact).toBeGreaterThanOrEqual(b.exact);
    const fund = (p: Prospect) => ATTR_KIND.ATT.reduce((t, k, i) => t + (k === 'fundamentos' ? attrsOf(p)[i] : 0), 0);
    expect(fund(a)).toBeGreaterThan(fund(b));
  });
  it('preparação física faz crescer os atributos físicos, técnica os técnicos, tática os táticos', () => {
    const base = pr('w', 16, 30, 95, 'MID');
    for (const [spec, kind] of [['fisica', 'fisico'], ['tecnica', 'tecnico'], ['tatica', 'tatico']] as const) {
      const y: YouthState = { ...youthOf(mk()), coaches: { sub17: C(7, [spec]) }, level: 0 };
      const q = run(base, y, 38 * 3);
      const gainOf = (k: string) => ATTR_KIND.MID.reduce((t, kk, i) => t + (kk === k ? attrsOf(q)[i] - 30 : 0), 0) / ATTR_KIND.MID.filter((kk) => kk === k).length;
      const others = ['fisico', 'tecnico', 'tatico', 'fundamentos'].filter((k) => k !== kind).map(gainOf);
      expect(gainOf(kind), spec).toBeGreaterThan(Math.max(...others));
    }
  });
});

describe('os treinadores influenciam a evolução', () => {
  it('avaliação maior = evolução maior; sem treinador = a mais lenta', () => {
    const y0 = youthOf(mk());
    const gain = (c: YouthCoach | undefined) => run(pr('g', 17, 20, 90, 'MID'), { ...y0, coaches: c ? { sub17: c } : {}, level: 2 }).exact - 20;
    const g1 = gain(C(1, ['tatica'])), g5 = gain(C(5, ['tatica'])), g9 = gain(C(9, ['tatica'])), none = gain(undefined);
    expect(g9).toBeGreaterThan(g5); expect(g5).toBeGreaterThan(g1); expect(g1).toBeGreaterThan(none);
  });
  it('característica profissional também conta (paciente com os pequenos)', () => {
    const y0 = youthOf(mk());
    const kid = pr('k', 12, 5, 80, 'MID');
    const gen = pointsPerYear(kid, { ...y0, coaches: { sub13: C(6, ['tatica'], { trait: 'exigente' }) }, level: 0 });
    const pac = pointsPerYear(kid, { ...y0, coaches: { sub13: C(6, ['tatica'], { trait: 'paciente' }) }, level: 0 });
    expect(pac).toBeGreaterThan(gen);
  });
  it('na temporada real o treino usa o treinador da categoria e o foco aparece nos jovens', () => {
    let g = mk();
    for (let i = 0; i < 20; i++) g = youthTick(g);
    for (const p of youthOf(g).prospects) expect(p.focus).toBeDefined(); // decidido pelo treinador, não pelo usuário
    expect(youthOf(g).coaches!.sub21!.season?.expected ?? 0).toBe(0); // só quem tem jovens na faixa acumula
    expect(youthOf(g).coaches!.sub13!.season!.expected).toBeGreaterThan(0);
  });
});

describe('avaliação do treinador: sobe e desce aos poucos', () => {
  it('variação limitada por temporada, positiva com bom rendimento e negativa com mau', () => {
    expect(ratingDelta(2, 0, 5)).toBeLessThanOrEqual(0.8); expect(ratingDelta(0, 0, 5)).toBeGreaterThanOrEqual(-0.8);
    expect(ratingDelta(1.3, 0, 5)).toBeGreaterThan(0); expect(ratingDelta(0.6, 0, 5)).toBeLessThan(0);
    expect(ratingDelta(1.3, 0, 9.5)).toBeLessThan(ratingDelta(1.3, 0, 3)); // lá em cima é mais difícil subir
    expect(ratingDelta(1, 0, 5)).toBe(0);
  });
  const seasonOf = (g: GameState, ratio: number, rating = 5): GameState => {
    const y = youthOf(g);
    return { ...g, youth: { ...y, coaches: { ...y.coaches, sub13: { ...C(rating, ['tatica']), season: { gained: ratio * 10, expected: 10 } } } } };
  };
  it('um bom ano sobe a nota e um ano ruim a derruba, nunca de forma exagerada', () => {
    const g = mk();
    const up = evaluateCoaches(seasonOf(g, 1.4), youthOf(seasonOf(g, 1.4))); const upC = up.y.coaches!.sub13!;
    expect(upC.rating).toBeGreaterThan(5); expect(upC.rating - 5).toBeLessThanOrEqual(0.8);
    const down = evaluateCoaches(seasonOf(g, 0.6), youthOf(seasonOf(g, 0.6))); const dnC = down.y.coaches!.sub13!;
    expect(dnC.rating).toBeLessThan(5); expect(5 - dnC.rating).toBeLessThanOrEqual(0.8);
    expect(upC.evals![0].met).toBe(true); expect(dnC.evals![0].met).toBe(false);
    expect(upC.season).toEqual({ gained: 0, expected: 0 }); // nova temporada, contagem zerada
    expect(upC.history.some((h) => /Temporada 2026/.test(h.text))).toBe(true);
  });
  it('as estrelas mudam depois de algumas temporadas, não de uma só vez', () => {
    let g = seasonOf(mk(), 0.5, 6.0); let seen: number[] = [];
    for (let i = 0; i < 4; i++) { const e = evaluateCoaches(g, youthOf(g)); g = { ...e.g, youth: e.y }; seen.push(starsOf(g.youth!.coaches!.sub13?.rating ?? 0)); g = seasonOf(g, 0.5, g.youth!.coaches!.sub13?.rating ?? 6); if (!g.youth!.coaches!.sub13) break; }
    expect(seen[0]).toBeGreaterThanOrEqual(5);               // 6★ não despenca para 1★ de uma vez
    expect(seen[0] - seen[seen.length - 1]).toBeLessThanOrEqual(2 + 0);
  });
  it('desempenho ruim seguido com nota baixa: o treinador pede para sair e o clube é avisado', () => {
    let g = mk();
    const y = youthOf(g);
    g = { ...g, youth: { ...y, coaches: { ...y.coaches, sub13: { ...C(3.4, ['tatica']), bad: 1, season: { gained: 5, expected: 10 } } } } };
    const e = evaluateCoaches(g, youthOf(g));
    expect(e.y.coaches!.sub13).toBeUndefined();
    expect(vacancies(e.y)).toContain('sub13');
    expect(e.g.news.some((n) => /pediu demissão/.test(n.text))).toBe(true);
    expect(e.y.catLog!.sub13!.some((l) => /deixou/.test(l.text))).toBe(true);
  });
  it('aviso no meio da temporada quando o treinador rende abaixo do esperado', () => {
    let g = mk();
    const y = youthOf(g);
    g = { ...g, round: Math.floor(g.totalRounds / 2) + 1, youth: { ...y, coaches: { ...y.coaches, sub13: { ...C(1, ['tatica']), season: { gained: 4, expected: 10 } } } } };
    const t = youthTick(g);
    expect(t.news.some((n) => /abaixo do esperado/.test(n.text))).toBe(true);
    expect(youthOf(t).coaches!.sub13!.season!.warned).toBe(true);
  });
  it('na virada de temporada a folha dos treinadores é paga e a avaliação é registrada', () => {
    let g = mk();
    for (let i = 0; i < 38; i++) g = youthTick(g);
    const wages = Object.values(youthOf(g).coaches!).reduce((t, c) => t + c!.wage, 0);
    const cash = g.budgets.palmeiras;
    const n = youthSeason(g);
    expect(n.budgets.palmeiras).toBe(cash - wages);
    expect(Object.values(youthOf(n).coaches!).every((c) => c!.evals && c!.evals.length === 1)).toBe(true);
  });
});

describe('conversa e relatórios', () => {
  const rich = (): GameState => {
    let g = mk();
    const y = youthOf(g);
    const mkp = (id: string, name: string, age: number, ovr: number, pot: number, base: number, pos: Player['pos']): Prospect => ({ ...pr(id, age, ovr, pot, pos), player: { id, name, pos, age, strength: ovr }, exact: ovr + 0.4, base });
    const prospects = [mkp('a1', 'Davi Alves', 17, 55, 91, 45, 'ATT'), mkp('a2', 'Bruno Lima', 16, 40, 70, 39, 'MID'), mkp('a3', 'Caio Reis', 17, 66, 68, 60, 'DEF'), mkp('a4', 'Enzo Melo', 15, 30, 75, 29.9, 'GK'), mkp('a5', 'Léo Neto', 17, 50, 84, 41, 'ATT')];
    g = { ...g, round: 20, youth: { ...y, prospects } };
    return g;
  };
  it('o relatório usa os dados reais da categoria (quem evoluiu, maior potencial, perto do teto, promoção)', () => {
    const g = rich();
    const r = buildReport(g, 'sub17');
    expect(playersOf(g, 'sub17').map((p) => p.player.name).sort()).toEqual(['Bruno Lima', 'Caio Reis', 'Davi Alves', 'Léo Neto']);
    expect(r.count).toBe(4);
    expect(r.topGainers[0].name).toBe('Davi Alves');
    expect(r.topPotential[0].name).toBe('Davi Alves'); expect(r.topPotential[0].star).toBe(true);
    expect(r.nearPotential.map((l) => l.name)).toContain('Caio Reis');
    expect(r.promotions.every((p) => p.player.age >= 16)).toBe(true);
    expect(r.highlights.join(' ')).toMatch(/Davi Alves/);
  });
  it('responde cada assunto com jogadores reais e sem alterar o jogo', () => {
    const g = rich(); const snap = JSON.stringify(g);
    for (const t of TOPICS) { const lines = answer(g, 'sub17', t.id); expect(lines.length).toBeGreaterThan(0); expect(lines.join(' ').length).toBeGreaterThan(20); }
    expect(answer(g, 'sub17', 'evoluindo').join(' ')).toMatch(/Davi Alves/);
    expect(answer(g, 'sub17', 'talentos').join(' ')).toMatch(/Davi Alves.*⭐/);
    expect(answer(g, 'sub17', 'perto').join(' ')).toMatch(/Caio Reis/);
    expect(answer(g, 'sub17', 'sugestoes').length).toBeGreaterThan(0);
    expect(answer(g, 'sub17', 'avaliacao').join(' ')).toMatch(/★/);
    expect(JSON.stringify(g)).toBe(snap); // conversar nunca muda treinos nem jogadores
  });
  it('recomenda promoção só de quem tem 16 anos ou mais; a decisão continua do usuário', () => {
    const g = rich();
    const txt = answer(g, 'sub15', 'promocao').join(' ');
    expect(txt).not.toMatch(/Enzo Melo \(/); // 15 anos: não pode
    expect(txt).toMatch(/16 anos/);
  });
  it('entende perguntas digitadas e orienta quando não entende', () => {
    const g = rich();
    expect(parseTopic('Quem está evoluindo melhor?')).toBe('evoluindo');
    expect(parseTopic('quais os maiores talentos')).toBe('talentos');
    expect(parseTopic('quem posso promover pro profissional?')).toBe('promocao');
    expect(parseTopic('quem está perto do potencial máximo')).toBe('perto');
    expect(parseTopic('me dê sugestões')).toBe('sugestoes');
    expect(parseTopic('xyz')).toBeUndefined();
    expect(chat(g, 'sub17', 'quem evoluiu mais?').lines.join(' ')).toMatch(/Davi/);
    expect(chat(g, 'sub17', 'bla bla').lines[0]).toMatch(/Posso falar sobre/);
  });
  it('categoria sem treinador ou sem jovens responde de acordo com a realidade', () => {
    const g = rich();
    const d = dismissCoach(g, 'sub17'); if (!d.ok) throw new Error(d.error);
    expect(answer(d.state, 'sub17', 'resumo')[0]).toMatch(/Não há treinador/);
    expect(answer(g, 'sub21', 'resumo')[0]).toMatch(/Ainda não temos jovens/);
  });
  it('sugestões citam a situação real (academia, vagas, posição)', () => {
    const g = rich();
    const d = dismissCoach(g, 'sub13'); if (!d.ok) throw new Error(d.error);
    const txt = answer(d.state, 'sub17', 'sugestoes').join(' ');
    expect(txt).toMatch(/academia está em 0%/); expect(txt).toMatch(/Sub-13/);
  });
});

describe('clubes rivais', () => {
  const ai = (): GameState => { const g = mk(); const rng = makeRng(11); return ensureAiYouthCoaches(ensureAiYouth(g, rng)); };
  it('todos os clubes da IA têm quatro treinadores de base, com nome e avaliação', () => {
    const g = ai();
    const ids = Object.keys(g.teams).filter((id) => id !== g.userClubId);
    expect(ids.length).toBeGreaterThan(100);
    for (const id of ids) { expect(g.aiYouthCoaches![id], id).toHaveLength(4); }
    const info = aiCoachesOf(g, 'flamengo');
    expect(info.map((c) => c.cat)).toEqual(['Sub-13', 'Sub-15', 'Sub-17', 'Sub-21']);
    for (const c of info) { expect(c.name.length).toBeGreaterThan(3); expect(c.stars).toBeGreaterThanOrEqual(1); expect(c.stars).toBeLessThanOrEqual(10); expect(c.specs.length).toBeGreaterThan(0); }
    expect(ensureAiYouthCoaches(g)).toBe(g); // idempotente
  });
  it('clubes com estrutura melhor têm treinadores melhores; 10★ só com academia 100%', () => {
    const g = ai(); const avg = (id: string) => g.aiYouthCoaches![id].reduce((t, r) => t + r[0] / 10, 0) / 4;
    const big = ['flamengo', 'palmeiras', 'sao-paulo', 'corinthians'].filter((id) => g.aiYouthCoaches![id]).map(avg);
    const small = Object.keys(g.aiYouthCoaches!).filter((id) => g.clubs[id]?.reputation === 1).slice(0, 12).map(avg);
    expect(big.reduce((a, b) => a + b, 0) / big.length).toBeGreaterThan(small.reduce((a, b) => a + b, 0) / small.length);
  });
  it('o treinador rival acelera ou freia a evolução dos jovens do clube', () => {
    const g = ai(); const id = 'flamengo';
    const hi: GameState = { ...g, aiYouthCoaches: { ...g.aiYouthCoaches!, [id]: [[100, 1, 0], [100, 1, 0], [100, 1, 0], [100, 1, 0]] } };
    const lo: GameState = { ...g, aiYouthCoaches: { ...g.aiYouthCoaches!, [id]: [[10, 1, 0], [10, 1, 0], [10, 1, 0], [10, 1, 0]] } };
    expect(aiCoachBoost(hi, id, 17)).toBeGreaterThan(aiCoachBoost(lo, id, 17));
    const p = { id: 'pp', name: 'P P', pos: 'ATT' as const, age: 17, strength: 40, pot: 90 };
    const rng = () => 0.5;
    expect(growYoung(p, rng, undefined, 0.5, aiCoachBoost(hi, id, 17)).strength).toBeGreaterThanOrEqual(growYoung(p, rng, undefined, 0.5, aiCoachBoost(lo, id, 17)).strength);
    expect(growYoung(p, rng, undefined, 0.5, 1.3).strength).toBeGreaterThan(growYoung(p, rng, undefined, 0.5, 0.8).strength);
  });
  it('a cada temporada os treinadores rivais evoluem e o mercado da base segue funcionando', () => {
    const g = ai(); const before = JSON.stringify(g.aiYouthCoaches);
    const n = developYouth(g, makeRng(4));
    expect(JSON.stringify(n.aiYouthCoaches)).not.toBe(before);
    for (const recs of Object.values(n.aiYouthCoaches!)) { expect(recs).toHaveLength(4); for (const r of recs) { expect(r[0]).toBeGreaterThanOrEqual(10); expect(r[0]).toBeLessThanOrEqual(100); } }
    expect(Object.values(n.aiYouth!).every((l) => l.length >= 4)).toBe(true);
  });
});

describe('persistência', () => {
  it('treinadores, mercado, históricos e treinadores rivais sobrevivem a salvar e reabrir', () => {
    let g = ensureAiYouthCoaches(ensureAiYouth(mk(), makeRng(2)));
    const d = dismissCoach(g, 'sub15'); if (!d.ok) throw new Error(d.error);
    const cand = youthOf(d.state).market!.list.find((c) => starsOf(c.rating) < 10)!;
    const h = hireCoach(d.state, 'sub15', cand.id); if (!h.ok) throw new Error(h.error);
    g = h.state;
    for (let i = 0; i < 15; i++) g = youthTick(g);
    expect(saveGame(g).ok).toBe(true);
    const back = loadGame()!;
    expect(youthOf(back).coaches).toEqual(youthOf(g).coaches);
    expect(youthOf(back).market).toEqual(youthOf(g).market);
    expect(youthOf(back).catLog).toEqual(youthOf(g).catLog);
    expect(back.aiYouthCoaches).toEqual(g.aiYouthCoaches);
    const m = migrateGame(back);
    expect(m.report.rejected).toBe(false); expect(m.game.youth!.coaches!.sub15!.id).toBe(cand.id);
  });
  it('save da Etapa 2 (treinador automático de qualidade 1–5): vira treinador completo sem mudar jovens', () => {
    const base = mk(); const y = youthOf(base);
    const legacy = { ...y, schema: 2, coachesInit: undefined, market: undefined, coaches: { sub13: { name: 'Zé Velho', quality: 3 }, sub15: { name: 'Antônio Velho', quality: 1 }, sub17: { name: 'Beto Velho', quality: 5 }, sub21: { name: 'Caio Velho', quality: 2 } } } as unknown as YouthState;
    const old: GameState = { ...base, youth: legacy };
    const m = ensureCategoryState(old);
    const cs = youthOf(m).coaches!;
    expect(cs.sub13!.name).toBe('Zé Velho'); expect(cs.sub13!.rating).toBeGreaterThan(cs.sub15!.rating); expect(cs.sub17!.rating).toBeGreaterThan(cs.sub13!.rating);
    expect(cs.sub13!.specs.length).toBeGreaterThan(0); expect(cs.sub13!.wage).toBeGreaterThan(0);
    expect(youthOf(m).market!.list).toHaveLength(MARKET_SIZE);
    expect(youthOf(m).prospects.map((p) => [p.player.id, p.player.age, p.player.strength, p.potential])).toEqual(y.prospects.map((p) => [p.player.id, p.player.age, p.player.strength, p.potential]));
    expect(ensureCategoryState(m)).toBe(m);
    expect(migrateGame(old).report.violations).toEqual([]);
  });
});

describe('etapas anteriores continuam', () => {
  it('jogar rodadas mantém a base, as categorias e o treino sem alterar o elenco profissional', () => {
    let g = mk();
    const pro = g.teams.palmeiras.players.map((p) => [p.id, p.age]);
    while (g.estadual?.due) g = { ...playNext(g).state, morale: { ...g.morale, board: 60 } };
    for (let i = 0; i < 6; i++) g = { ...playNext(g).state, morale: { ...g.morale, board: 60 } };
    expect(youthOf(g).prospects.every((p) => p.player.age >= 12)).toBe(true);
    expect(Object.keys(youthOf(g).coaches!)).toHaveLength(4);
    expect(g.teams.palmeiras.players.map((p) => [p.id, p.age])).toEqual(pro);
  });
});
