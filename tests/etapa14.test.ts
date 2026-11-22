import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { aiCoachTick, coachOf, maxFirings, unemployedCoaches } from '../src/engine/aicoaches';
import { aiRenewals, aiSignFreeAgents, WAGE_LIMIT } from '../src/engine/aicontracts';
import { aiBalanceBooks, aiWindow } from '../src/engine/ai';
import { auditUniverse } from '../src/engine/aiaudit';
import { clubProfile, profileCtx } from '../src/engine/aiprofile';
import { evaluateOffer, marketValue } from '../src/engine/aisales';
import { ensureAiState } from '../src/engine/aistate';
import { aiBalanceSquads } from '../src/engine/aisquad';
import { aiLoanWindow, loanedIds, returnAiLoans } from '../src/engine/aiyouth';
import { payrollOf } from '../src/engine/finance';
import { playRound, simulateToEnd } from '../src/engine/game';
import { makeRng } from '../src/engine/rng';
import { managed } from '../src/engine/lookup';
import type { GameState, MatchResult, Player, Position } from '../src/engine/types';
import { makeCareer } from './helpers';

const base = ensureAiState(makeCareer('flamengo', 14));
const topIds = base.divisions[0].clubIds.filter((x) => x !== 'flamengo');
const setPlayers = (g: GameState, id: string, f: (ps: Player[]) => Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: f(g.teams[id].players) } } });
const withBudget = (g: GameState, id: string, v: number): GameState => ({ ...g, budgets: { ...g.budgets, [id]: v } });
const sum = (g: GameState) => Object.values(g.budgets).reduce((a, b) => a + b, 0);
const owner = (g: GameState, pid: string) => Object.keys(g.teams).filter((id) => g.teams[id].players.some((p) => p.id === pid));

/** Tira os atacantes do clube além de `keep` (ele passa a precisar da posição). */
const needAttackers = (g: GameState, id: string, keep = 2) => setPlayers(g, id, (ps) => { let k = 0; return ps.filter((p) => p.pos !== 'ATT' || k++ < keep); });

describe('TESTE 1 — Contratações', () => {
  const needy = topIds.slice(0, 10);
  let world = base;
  for (const id of needy) world = withBudget(needAttackers(world, id), id, 400_000_000);
  const out = aiWindow(world, makeRng(5), 3);
  const moves = Object.entries(out.aiMoves ?? {}).filter(([, m]) => m.season === out.season);

  it('clubes que precisam de reforço contratam e o jogador muda corretamente de clube', () => {
    expect(moves.length).toBeGreaterThan(0);
    for (const [pid, m] of moves) {
      expect(owner(out, pid)).toEqual([m.to]);                     // está em um único clube: o comprador
      expect(owner(world, pid)).toEqual([m.from]);                 // e estava só no vendedor
    }
  });
  it('contratam a posição de que precisam (atacante) quando faltam atacantes', () => {
    const bought = moves.filter(([, m]) => needy.includes(m.to)).map(([pid, m]) => out.teams[m.to].players.find((p) => p.id === pid)!);
    expect(bought.length).toBeGreaterThan(0);
    // todo clube que ficou abaixo do mínimo de atacantes (3) voltou ao mínimo, e a maioria dos clubes carentes contratou ao menos um atacante
    for (const id of needy) expect(out.teams[id].players.filter((p) => p.pos === 'ATT').length, id).toBeGreaterThanOrEqual(3);
    const withAtt = needy.filter((id) => moves.some(([pid, m]) => m.to === id && out.teams[id].players.find((p) => p.id === pid)?.pos === 'ATT')).length;
    expect(withAtt / needy.length).toBeGreaterThanOrEqual(0.6);
  });
  it('o dinheiro é descontado do comprador e entra no vendedor (total do universo conservado)', () => {
    expect(Math.abs(sum(out) - sum(world))).toBeLessThan(1);
    const buyers = new Set(moves.map(([, m]) => m.to)), sellers = new Set(moves.map(([, m]) => m.from));
    for (const id of buyers) if (!sellers.has(id)) expect(out.budgets[id]).toBeLessThan(world.budgets[id]);
    for (const id of sellers) if (!buyers.has(id)) expect(out.budgets[id]).toBeGreaterThan(world.budgets[id]);
  });
  it('quem não tem dinheiro não contrata', () => {
    let w = base;
    for (const id of needy) w = withBudget(needAttackers(w, id), id, 0);
    const o = aiWindow(w, makeRng(5), 3);
    for (const [, m] of Object.entries(o.aiMoves ?? {}).filter(([, x]) => x.season === o.season)) expect(needy).not.toContain(m.to);
  });
});

describe('TESTE 2 — Vendas', () => {
  const club = topIds[3];
  const reserve = [...base.teams[club].players].sort((a, b) => a.strength - b.strength)[2];
  const star = [...base.teams[club].players].sort((a, b) => b.strength - a.strength)[0];
  it('proposta baixa é recusada e proposta alta por jogador sem importância é aceita', () => {
    const v = marketValue(base, club, reserve);
    expect(evaluateOffer(base, club, reserve, v * 0.2, topIds[0]).accept).toBe(false);
    expect(evaluateOffer(base, club, reserve, v * 4, topIds[0]).accept).toBe(true);
  });
  it('craque sem substituto à altura é recusado mesmo com ótima proposta; a recusa é coerente com o preço pedido', () => {
    const g = setPlayers(base, club, (ps) => ps.map((p) => (p.id === star.id ? { ...p, strength: 93 } : p.pos === star.pos ? { ...p, strength: 40 } : p)));
    const s = g.teams[club].players.find((p) => p.id === star.id)!;
    const r = evaluateOffer(g, club, s, marketValue(g, club, s) * 5, topIds[0]);
    expect(r.accept).toBe(false);
    expect(r.stance.willing).toBe(false);
  });
  it('venda feita pela IA transfere o jogador e o dinheiro (aiBalanceBooks)', () => {
    let g = base;
    const poor = topIds[5];
    g = withBudget(g, poor, -50_000_000);
    const out = aiBalanceBooks(g, makeRng(2));
    expect(Math.abs(sum(out) - sum(g))).toBeLessThan(1);
    for (const [pid, m] of Object.entries(out.aiMoves ?? {})) { expect(owner(out, pid)).toEqual([m.to]); }
  });
});

describe('TESTE 3 — Empréstimos', () => {
  let world = base;
  for (const id of topIds.slice(0, 8)) world = needAttackers(world, id);
  for (const id of topIds.slice(8, 16)) world = setPlayers(world, id, (ps) => [...ps, ...[0, 1, 2].map((i): Player => ({ id: `${id}-t3-${i}`, name: `Jovem ${id}${i}`, pos: 'ATT', age: 19, strength: 52, contract: { wage: 20_000, until: world.season + 2 } }))]);
  const lent = aiLoanWindow(world, makeRng(3), 1);
  it('início: o jogador sai do dono, entra no clube que o recebe e fica registrado como emprestado', () => {
    expect((lent.aiLoans ?? []).length).toBeGreaterThan(0);
    for (const l of lent.aiLoans!) {
      expect(owner(lent, l.playerId)).toEqual([l.hostId]);
      expect(l.season).toBe(lent.season);
      expect(loanedIds(lent).has(l.playerId)).toBe(true);
    }
  });
  it('duração: durante toda a temporada o jogador continua no clube que o recebeu (não é vendido nem emprestado de novo)', () => {
    let g = lent;
    const loans = lent.aiLoans!;
    while (g.round <= g.totalRounds) {
      g = playRound(g).state;
      for (const l of loans) if (managed(g, l.hostId) === false) expect(owner(g, l.playerId), `rodada ${g.round}`).toEqual([l.hostId]);
    }
    expect((g.aiLoans ?? []).length).toBeGreaterThanOrEqual(loans.length);
    // encerramento: volta ao dono certo
    const back = returnAiLoans(g);
    for (const l of loans) expect(owner(back, l.playerId)).toEqual([l.ownerId]);
    expect(back.aiLoans).toEqual([]);
  }, 120_000);
  it('encerramento pela virada de temporada: ninguém fica emprestado para a temporada seguinte', () => {
    const g = simulateToEnd(lent);
    const next = startNextSeason(g);
    const stillOut = (next.aiLoans ?? []).filter((l) => l.season < next.season);
    expect(stillOut).toEqual([]);
    expect(auditUniverse(next)).toEqual([]);
  }, 120_000);
});

describe('TESTE 4 — Contratos', () => {
  it('contratos no último ano: importantes são renovados antes; quem sai não some, vira jogador livre', () => {
    let g = base;
    const club = topIds[2];
    const ps = [...g.teams[club].players].sort((a, b) => b.strength - a.strength);
    const expiring = new Set(ps.slice(0, 14).map((p) => p.id));
    g = setPlayers(g, club, (all) => all.map((p) => (expiring.has(p.id) ? { ...p, contract: { wage: p.contract!.wage, until: g.season } } : p)));
    const mid = aiRenewals(g, makeRng(1), 'meio');
    const renewedMid = mid.teams[club].players.filter((p) => expiring.has(p.id) && p.contract!.until > g.season);
    expect(renewedMid.length).toBeGreaterThan(0);
    expect(renewedMid.every((p) => p.strength >= ps[Math.min(13, ps.length - 1)].strength - 1)).toBe(true);
    // virada: o que sobrou vencido é renovado ou liberado (nunca apagado)
    const turn = aiRenewals({ ...mid, season: g.season + 1 }, makeRng(2), 'virada', g.season);
    for (const id of expiring) {
      const inClub = turn.teams[club].players.find((p) => p.id === id);
      const free = (turn.freeAgents ?? []).find((p) => p.id === id);
      expect(inClub || free, `jogador ${id} não pode sumir`).toBeTruthy();
      if (inClub) expect(inClub.contract!.until).toBeGreaterThanOrEqual(g.season + 1);
    }
    expect(auditUniverse(turn)).toEqual([]);
  });
  it('salários renovados cabem na folha do porte do clube', () => {
    const club = topIds[4];
    let g = setPlayers(base, club, (all) => all.map((p) => ({ ...p, contract: { wage: p.contract!.wage, until: base.season - 1 } })));
    g = aiRenewals(g, makeRng(4), 'virada', base.season - 1);
    const prof = clubProfile(g, club, profileCtx(g));
    expect(payrollOf(g, club)).toBeLessThanOrEqual(prof.revenue * WAGE_LIMIT[prof.tier] * 1.15);
  });
});

describe('TESTE 5 — Treinadores', () => {
  const fake = (g: GameState, losers: string[], rounds: number): MatchResult[] => {
    const ids = g.divisions[0].clubIds, out: MatchResult[] = [];
    for (let r = 1; r <= rounds; r++) for (let i = 0; i + 1 < ids.length; i += 2) { const a = ids[(i + r) % ids.length], b = ids[(i + 1 + r) % ids.length]; out.push({ divisionId: g.divisions[0].id, round: r, homeId: a, awayId: b, homeGoals: losers.includes(a) ? 0 : 1, awayGoals: losers.includes(b) ? 0 : losers.includes(a) ? 2 : 1 }); }
    return out;
  };
  it('clubes em crise trocam de treinador (com limite) e o novo é um desempregado que existia', () => {
    const losers = topIds.slice(0, 6);
    let g: GameState = { ...base, round: 24, results: fake(base, losers, 23) };
    const coaches = { ...g.aiCoaches! };
    for (const id of topIds) { const c = coachOf(g, id)!; coaches[c.id] = { ...c, since: { season: g.season - 1, round: 1 }, merit: -1 }; }
    g = { ...g, aiCoaches: coaches };
    const before = new Map(topIds.map((id) => [id, coachOf(g, id)!.id]));
    const pool = new Set(unemployedCoaches(g).map((c) => c.id));
    const out = aiCoachTick(g, makeRng(1));
    const changed = topIds.filter((id) => coachOf(out, id)!.id !== before.get(id));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThanOrEqual(maxFirings(g, false));
    for (const id of changed) { expect(losers).toContain(id); expect(coachOf(out, id)!.clubId).toBe(id); }
    expect(changed.some((id) => pool.has(coachOf(out, id)!.id))).toBe(true);
    expect(auditUniverse(out)).toEqual([]);
  });
  it('depois de várias temporadas nenhum clube da IA está sem treinador', () => {
    let g = base;
    for (let i = 0; i < 2; i++) g = startNextSeason(simulateToEnd(g));
    for (const id of Object.keys(g.teams)) if (!managed(g, id)) expect(coachOf(g, id)?.clubId, id).toBe(id);
    expect(unemployedCoaches(g).length).toBeGreaterThan(0);
  }, 180_000);
});

/** Várias temporadas seguidas, com fotografia a cada virada (usada pelos testes 6, 7 e 8). */
interface Snap { season: number; audit: string[]; moved: number; overPay: number; clubs: number; negative: number; avgStrength: number; totalPlayers: number }
const snaps: Snap[] = [];
let final: GameState;
beforeAll(() => {
  let g = base;
  for (let i = 0; i < 4; i++) {
    const before = new Map(Object.entries(g.teams).map(([id, t]) => [id, new Set(t.players.map((p) => p.id))]));
    g = simulateToEnd(g);
    g = startNextSeason(g);
    let moved = 0, overPay = 0, clubs = 0, negative = 0, str = 0, n = 0;
    const ctx = profileCtx(g);
    for (const [id, t] of Object.entries(g.teams)) {
      for (const p of t.players) { if (before.get(id) && !before.get(id)!.has(p.id)) moved++; str += p.strength; n++; }
      if (managed(g, id)) continue;
      clubs++;
      const prof = clubProfile(g, id, ctx);
      if (payrollOf(g, id) > prof.revenue * WAGE_LIMIT[prof.tier] * 1.5) overPay++;
      if ((g.budgets[id] ?? 0) < 0) negative++;
    }
    snaps.push({ season: g.season, audit: auditUniverse(g), moved, overPay, clubs, negative, avgStrength: str / n, totalPlayers: n });
  }
  final = g;
}, 300_000);

describe('TESTE 6 — Finanças', () => {
  it('clubes não gastam mais do que podem: folhas dentro do limite e nenhum caixa negativo na virada', () => {
    for (const s of snaps) { expect(s.overPay / s.clubs, `temporada ${s.season}`).toBeLessThan(0.12); expect(s.negative).toBe(0); } // (a partir de 2028 caem 6 clubes da Série C por ano e ainda estão ajustando a folha)
  });
  it('contratação de livres só com salário que cabe e sem taxa de transferência', () => {
    const club = topIds[7];
    const free: Player = { id: 'fa-t6', name: 'Livre Teste', pos: 'ATT', age: 26, strength: 62 };
    let g = needAttackers(base, club, 1);
    g = { ...g, freeAgents: [free] };
    const out = aiSignFreeAgents(g, makeRng(9), 2);
    expect(Math.abs(sum(out) - sum(g))).toBeLessThan(1);
    const holder = Object.keys(out.teams).find((id) => out.teams[id].players.some((p) => p.id === 'fa-t6'));
    if (holder) {
      const prof = clubProfile(out, holder, profileCtx(out));
      expect(payrollOf(out, holder)).toBeLessThanOrEqual(prof.revenue * WAGE_LIMIT[prof.tier] * 1.0 + 1);
    }
  });
  it('valores financeiros do universo são números válidos', () => {
    for (const v of Object.values(final.budgets)) expect(Number.isFinite(v)).toBe(true);
    for (const id of Object.keys(final.teams)) expect(Number.isFinite(payrollOf(final, id))).toBe(true);
  });
});

describe('TESTE 7 — Temporadas consecutivas', () => {
  it('a cada temporada os clubes seguem contratando, vendendo e reorganizando elencos', () => {
    expect(snaps.length).toBe(4);
    for (const s of snaps) expect(s.moved, `temporada ${s.season}`).toBeGreaterThan(20);
  });
  it('o universo evolui sem estourar: nível médio e população estáveis', () => {
    for (const s of snaps) { expect(s.avgStrength).toBeGreaterThan(45); expect(s.avgStrength).toBeLessThan(80); }
    const first = snaps[0].totalPlayers;
    for (const s of snaps) expect(Math.abs(s.totalPlayers - first) / first).toBeLessThan(0.35);
    expect(final.retired?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('TESTE 8 — Integridade', () => {
  it('nenhuma duplicata, elenco inválido, treinador repetido ou valor inconsistente em nenhuma virada', () => {
    for (const s of snaps) expect(s.audit, `temporada ${s.season}`).toEqual([]);
    expect(auditUniverse(final)).toEqual([]);
  });
  it('cada treinador comanda no máximo um clube e cada clube da IA tem exatamente um', () => {
    const holders = Object.values(final.aiCoaches!).filter((c) => c.clubId);
    expect(new Set(holders.map((c) => c.clubId)).size).toBe(holders.length);
  });
});

describe('TESTE 9 — Desempenho com muitos clubes', () => {
  it('a IA processa 600 clubes nas rotinas de janela, contratos, empréstimos, elencos e treinadores em tempo razoável', () => {
    let g = base;
    // clona clubes até ter ~600 (mesmo universo de dados, ids novos): só para medir custo das rotinas da IA
    const teams = { ...g.teams }, clubs = { ...g.clubs }, budgets = { ...g.budgets };
    const ids: string[] = [];
    const src = Object.keys(g.teams).filter((id) => id !== 'flamengo');
    for (let k = 0; ids.length < 450; k++) {
      const from = src[k % src.length], id = `clone${k}`;
      teams[id] = { ...g.teams[from], clubId: id, players: g.teams[from].players.map((p) => ({ ...p, id: `${id}-${p.id}`, contract: p.contract && { ...p.contract } })), lineup: g.teams[from].lineup.map((x) => `${id}-${x}`) };
      clubs[id] = { ...g.clubs[from], id, name: `Clone ${k}` };
      budgets[id] = g.budgets[from] ?? 10_000_000;
      ids.push(id);
    }
    g = { ...g, teams, clubs, budgets, divisions: [...g.divisions, { id: 'clones', name: 'Clones', clubIds: ids }] };
    const rng = makeRng(1);
    const t0 = performance.now();
    g = aiRenewals(g, rng, 'meio');
    const t1 = performance.now();
    g = aiWindow(g, rng, 1);
    const t2 = performance.now();
    g = aiLoanWindow(g, rng, 1);
    g = aiBalanceSquads(g, rng);
    g = aiSignFreeAgents(g, rng, 1);
    g = aiCoachTick(g, rng);
    const t3 = performance.now();
    expect(t1 - t0).toBeLessThan(15_000);
    expect(t2 - t1).toBeLessThan(30_000);
    expect(t3 - t2).toBeLessThan(30_000);
    expect(auditUniverse(g)).toEqual([]);
  }, 120_000);
});

describe('TESTE 10 — Carreira existente', () => {
  it('uma carreira já iniciada mantém todos os dados anteriores ao ser completada e continuar', () => {
    let g = makeCareer('flamengo', 41);
    for (let i = 0; i < 12; i++) g = playRound(g).state;
    const old = JSON.parse(JSON.stringify(g)) as GameState;
    for (const k of ['aiCoaches', 'clubCoach', 'aiYouth', 'aiLoans', 'freeAgents', 'load', 'aiGoals'] as const) delete (old as unknown as Record<string, unknown>)[k];
    for (const t of Object.values(old.teams)) for (const p of t.players) delete p.contract;
    const opened = ensureAiState(old);
    expect(opened.round).toBe(old.round);
    expect(opened.userClubId).toBe(old.userClubId);
    expect(opened.coach).toEqual(old.coach);
    expect(opened.budgets).toEqual(old.budgets);
    expect(opened.results).toEqual(old.results);
    expect(opened.history).toEqual(old.history);
    expect(opened.news).toEqual(old.news);
    for (const [id, t] of Object.entries(old.teams)) expect(opened.teams[id].players.map((p) => p.id)).toEqual(t.players.map((p) => p.id));
    expect(auditUniverse(opened)).toEqual([]);
    const end = simulateToEnd(opened);
    expect(end.results.length).toBeGreaterThan(opened.results.length);
    expect(end.results.slice(0, opened.results.length)).toEqual(opened.results); // resultados já jogados não mudam
  }, 180_000);

  const fixture = process.env.SAVE_FIXTURE;
  it.skipIf(!fixture || !existsSync(fixture))('save real de versão anterior abre intacto (SAVE_FIXTURE)', () => {
    const raw = JSON.parse(readFileSync(fixture!, 'utf8')) as GameState;
    const opened = ensureAiState(raw);
    expect(opened.userClubId).toBe(raw.userClubId);
    expect(opened.history).toEqual(raw.history);
    expect(opened.budgets).toEqual(raw.budgets);
    expect(opened.results).toEqual(raw.results);
    for (const [id, t] of Object.entries(raw.teams)) expect(opened.teams[id].players.map((p) => p.id).sort()).toEqual(t.players.map((p) => p.id).sort());
    expect(auditUniverse(opened)).toEqual([]);
    const next = startNextSeason(simulateToEnd(opened));
    expect(next.season).toBe(opened.season + 1);
    expect(auditUniverse(next)).toEqual([]);
  }, 300_000);
});
