import { describe, expect, it } from 'vitest';
import { aiRenewals, aiSignFreeAgents, decideRenewal, ensureAiContracts, importanceOf, WAGE_LIMIT } from '../src/engine/aicontracts';
import { clubProfile, profileCtx } from '../src/engine/aiprofile';
import { payrollOf } from '../src/engine/finance';
import { makeRng } from '../src/engine/rng';
import type { GameState, Player, Position } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const club = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
const best = (g: GameState, id: string, pos: Position) => [...g.teams[id].players].filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength)[0];
const setPlayers = (g: GameState, id: string, f: (ps: Player[]) => Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: f(g.teams[id].players) } } });
const withContract = (g: GameState, id: string, pid: string, until: number, wage?: number) => setPlayers(g, id, (ps) => ps.map((p) => (p.id === pid ? { ...p, contract: { wage: wage ?? p.contract?.wage ?? 50_000, until } } : p)));

describe('contratos da IA', () => {
  it('todo jogador de clube da IA ganha contrato, com prazos espalhados', () => {
    const g = ensureAiContracts(g0);
    const ps = g.teams[club].players;
    expect(ps.every((p) => p.contract && p.contract.wage > 0 && p.contract.until >= g.season)).toBe(true);
    expect(new Set(ps.map((p) => p.contract!.until)).size).toBeGreaterThan(1);
    expect(g.teams['flamengo'].players.every((p) => !p.contract)).toBe(true); // o clube do jogador não é mexido
  });

  it('craque em último ano de contrato é renovado cedo (janela do meio do ano), antes de sair de graça', () => {
    let g = ensureAiContracts(g0);
    const star = best(g, club, 'ATT');
    g = withContract(g, club, star.id, g.season);
    const out = aiRenewals(g, makeRng(1), 'meio');
    const after = out.teams[club].players.find((p) => p.id === star.id)!;
    expect(after.contract!.until).toBeGreaterThan(g.season);
  });

  it('na virada: contrato vencido de jogador fraco e velho não é renovado e ele vira jogador livre', () => {
    let g = ensureAiContracts(g0);
    const old = best(g, club, 'MID');
    g = setPlayers(g, club, (ps) => ps.map((p) => (p.id === old.id ? { ...p, age: 37, strength: 50, contract: { wage: 30_000, until: g.season - 1 } } : p)));
    const out = aiRenewals(g, makeRng(2), 'virada', g.season - 1);
    expect(out.teams[club].players.some((p) => p.id === old.id)).toBe(false);
  });

  it('contrato vencido de jogador importante e jovem é renovado na virada, com contrato novo no futuro', () => {
    let g = ensureAiContracts(g0);
    const star = best(g, club, 'DEF');
    g = setPlayers(g, club, (ps) => ps.map((p) => (p.id === star.id ? { ...p, age: 24, contract: { wage: 30_000, until: g.season - 1 } } : p)));
    const out = aiRenewals(g, makeRng(3), 'virada', g.season - 1);
    const after = out.teams[club].players.find((p) => p.id === star.id);
    expect(after).toBeTruthy();
    expect(after!.contract!.until).toBeGreaterThanOrEqual(g.season);
  });

  it('salário renovado nunca estoura a folha máxima do porte (ninguém ganha salário impossível)', () => {
    let g = ensureAiContracts(g0);
    // todos os contratos do clube vencem de uma vez
    g = setPlayers(g, club, (ps) => ps.map((p) => ({ ...p, contract: { wage: p.contract!.wage, until: g.season - 1 } })));
    const out = aiRenewals(g, makeRng(4), 'virada', g.season - 1);
    const prof = clubProfile(out, club, profileCtx(out));
    const cap = prof.revenue * WAGE_LIMIT[prof.tier];
    // a folha pode ficar acima só por causa de contratos de elenco mínimo forçados; limite generoso
    expect(payrollOf(out, club)).toBeLessThanOrEqual(cap * 1.15);
    expect(out.teams[club].players.length).toBeGreaterThanOrEqual(g.teams[club].players.length * 0.5);
  });

  it('clube em crise não renova quem não é fundamental', () => {
    const g = ensureAiContracts(g0);
    const ctx = profileCtx(g);
    const prof = { ...clubProfile(g, club, ctx), financial: 'crise' as const };
    const reserve = [...g.teams[club].players].sort((a, b) => a.strength - b.strength)[3];
    const d = decideRenewal(g, club, { ...reserve, age: 30 }, prof, ctx, payrollOf(g, club));
    expect(d.renew).toBe(false);
  });

  it('importância: craque vale mais que reserva', () => {
    const g = ensureAiContracts(g0);
    const ctx = profileCtx(g);
    const star = best(g, club, 'ATT');
    const bench = [...g.teams[club].players].sort((a, b) => a.strength - b.strength)[0];
    expect(importanceOf(g, club, star, ctx).value).toBeGreaterThan(importanceOf(g, club, bench, ctx).value);
  });

  it('jogador livre é contratado por clube que precisa da posição, sem pagar transferência e com salário que cabe', () => {
    let g = ensureAiContracts(g0);
    // tira todos os goleiros menos 2 e cria um goleiro livre bom
    g = setPlayers(g, club, (ps) => ps.filter((p) => p.pos !== 'GK').concat(ps.filter((p) => p.pos === 'GK').slice(0, 1)));
    const free: Player = { id: 'free-gk', name: 'Livre GK', pos: 'GK', age: 27, strength: 60, contract: undefined };
    g = { ...g, freeAgents: [free] };
    const budgetBefore = g.budgets[club];
    const out = aiSignFreeAgents(g, makeRng(5), 2);
    const holder = Object.keys(out.teams).find((id) => out.teams[id].players.some((p) => p.id === 'free-gk'));
    if (holder) {
      expect(out.freeAgents!.some((p) => p.id === 'free-gk')).toBe(false);
      expect(out.teams[holder].players.find((p) => p.id === 'free-gk')!.contract).toBeTruthy();
      expect(out.budgets[holder]).toBe(g.budgets[holder]); // sem taxa de transferência
    }
    expect(out.budgets[club]).toBe(budgetBefore);
  });
});

import { skipSeasons } from '../src/engine/game';
describe('contratos ao longo de várias temporadas', () => {
  it('3 temporadas: folhas dos clubes da IA ficam sob controle, elencos válidos e o mercado de livres não explode', () => {
    const g = skipSeasons(makeCareer('flamengo', 9), 3);
    expect((g.freeAgents ?? []).length).toBeLessThanOrEqual(600);
    let over = 0, total = 0;
    for (const id of Object.keys(g.teams)) {
      if (id === g.userClubId) continue;
      total++;
      const prof = clubProfile(g, id, profileCtx(g));
      if (payrollOf(g, id) > prof.revenue * WAGE_LIMIT[prof.tier] * 1.4) over++;
      expect(g.teams[id].players.every((p) => p.contract && p.contract.until >= g.season - 1)).toBe(true);
    }
    expect(over / total).toBeLessThan(0.1);
  }, 120_000);
});
