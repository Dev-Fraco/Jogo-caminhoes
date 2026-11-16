import { describe, expect, it } from 'vitest';
import { aiLoanWindow, aiPromoteYouth, ensureAiYouth, loanedIds, MAX_AI_LOANS, MAX_LOAN_AGE, returnAiLoans } from '../src/engine/aiyouth';
import { skipSeasons } from '../src/engine/game';
import { rosterOk } from '../src/engine/roster';
import { divisionIndexOf, MIN_BY_POS } from '../src/engine/transfers';
import { makeRng } from '../src/engine/rng';
import type { GameState, Player, Position, Prospect } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = ensureAiYouth(makeCareer('flamengo', 4), makeRng(1));
const ids = g0.divisions[0].clubIds.filter((x) => x !== 'flamengo');
const setPlayers = (g: GameState, id: string, f: (ps: Player[]) => Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: f(g.teams[id].players) } } });
const setBase = (g: GameState, id: string, base: Prospect[]): GameState => ({ ...g, aiYouth: { ...g.aiYouth!, [id]: base } });
const prospect = (id: string, pos: Position, age: number, strength: number, pot: number): Prospect => ({ id, name: `Base ${id}`, pos, age, strength, pot });

describe('base dos clubes da IA', () => {
  it('todo clube da IA tem garotos na base, com potencial acima da força atual', () => {
    for (const id of ids) {
      const b = g0.aiYouth![id];
      expect(b.length).toBeGreaterThanOrEqual(4);
      expect(b.every((p) => p.age <= 17 && p.pot >= p.strength)).toBe(true);
    }
    expect(g0.aiYouth!['flamengo']).toBeUndefined(); // o clube do jogador tem a base dele
  });

  it('promessa de 18 anos é promovida quando o clube precisa da posição (não fica esquecida na base)', () => {
    const club = ids[0];
    // o clube fica sem atacantes além do mínimo e fracos
    let g = setPlayers(g0, club, (ps) => { let k = 0; return ps.filter((p) => p.pos !== 'ATT' || k++ < 2).map((p) => (p.pos === 'ATT' ? { ...p, strength: 45 } : p)); });
    g = setBase(g, club, [prospect('pr1', 'ATT', 18, 58, 80)]);
    const out = aiPromoteYouth(g, makeRng(1));
    expect(out.teams[club].players.some((p) => p.id === 'pr1')).toBe(true);
    expect(out.aiYouth![club].some((p) => p.id === 'pr1')).toBe(false);
    expect(out.teams[club].players.find((p) => p.id === 'pr1')!.pot).toBe(80); // leva o potencial para o time principal
    expect(out.teams[club].players.find((p) => p.id === 'pr1')!.contract).toBeTruthy();
  });

  it('garoto de 16 anos não é promovido, mesmo com o clube precisando', () => {
    const club = ids[0];
    let g = setPlayers(g0, club, (ps) => { let k = 0; return ps.filter((p) => p.pos !== 'ATT' || k++ < 2); });
    g = setBase(g, club, [prospect('pr2', 'ATT', 16, 60, 90)]);
    const out = aiPromoteYouth(g, makeRng(1));
    expect(out.teams[club].players.some((p) => p.id === 'pr2')).toBe(false);
  });

  it('quem chega aos 20 sem ser aproveitado deixa a base (sem promessa esquecida para sempre)', () => {
    const club = ids[1];
    const g = setBase(g0, club, [prospect('old', 'DEF', 20, 40, 45)]);
    expect(aiPromoteYouth(g, makeRng(1)).aiYouth![club].some((p) => p.id === 'old')).toBe(false);
  });
});

describe('empréstimos da IA', () => {
  /** Vários clubes ficam sem atacantes (precisam da posição); todos os outros têm reservas jovens. */
  const world = () => {
    let g = g0;
    for (const id of ids.slice(0, 8)) g = setPlayers(g, id, (ps) => { let k = 0; return ps.filter((p) => p.pos !== 'ATT' || k++ < 2); });
    for (const id of ids.slice(8, 16)) g = setPlayers(g, id, (ps) => [...ps, ...[0, 1, 2].map((i): Player => ({ id: `${id}-res${i}`, name: `Reserva ${id}${i}`, pos: 'ATT', age: 19, strength: 52, contract: { wage: 20_000, until: g.season + 2 } }))]);
    return g;
  };

  it('jovens sem espaço são emprestados a clubes que precisam da posição, e o dono não fica curto', () => {
    const g = world();
    const out = aiLoanWindow(g, makeRng(3), 1);
    const loans = out.aiLoans ?? [];
    expect(loans.length).toBeGreaterThan(0);
    expect(loans.length).toBeLessThanOrEqual(MAX_AI_LOANS);
    for (const l of loans) {
      const p = out.teams[l.hostId].players.find((x) => x.id === l.playerId)!;
      expect(p).toBeTruthy();
      expect(out.teams[l.ownerId].players.some((x) => x.id === l.playerId)).toBe(false);
      expect(p.age).toBeLessThanOrEqual(MAX_LOAN_AGE);
      expect(divisionIndexOf(out, l.ownerId)).toBeLessThanOrEqual(divisionIndexOf(out, l.hostId));
      expect(out.teams[l.ownerId].players.filter((x) => x.pos === p.pos).length).toBeGreaterThanOrEqual(MIN_BY_POS[p.pos]);
      expect(rosterOk(out.teams[l.ownerId].players)).toBe(true);
    }
    expect(loanedIds(out).size).toBeGreaterThanOrEqual(loans.length);
  });

  it('no fim da temporada os emprestados voltam ao dono', () => {
    const out = aiLoanWindow(world(), makeRng(3), 1);
    const back = returnAiLoans(out);
    expect(back.aiLoans).toEqual([]);
    for (const l of out.aiLoans!) {
      expect(back.teams[l.ownerId].players.some((x) => x.id === l.playerId)).toBe(true);
      expect(back.teams[l.hostId].players.some((x) => x.id === l.playerId)).toBe(false);
    }
  });

  it('emprestado não é vendido nem emprestado de novo na mesma janela', () => {
    const once = aiLoanWindow(world(), makeRng(3), 1);
    const twice = aiLoanWindow(once, makeRng(4), 1);
    const seen = (twice.aiLoans ?? []).map((l) => l.playerId);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('várias temporadas', () => {
  it('base e empréstimos ficam coerentes: elencos válidos, base sem idosos, empréstimos zerados na virada', () => {
    const g = skipSeasons(makeCareer('flamengo', 13), 3);
    for (const id of Object.keys(g.teams)) {
      if (id === g.userClubId) continue;
      expect(rosterOk(g.teams[id].players)).toBe(true);
      expect((g.aiYouth?.[id] ?? []).every((p) => p.age <= 20)).toBe(true);
    }
    const names = Object.values(g.teams).flatMap((t) => t.players.map((p) => p.id));
    expect(new Set(names).size).toBe(names.length); // ninguém duplicado entre clubes
    expect((g.aiLoans ?? []).length).toBeLessThanOrEqual(MAX_AI_LOANS);
  }, 120_000);
});
