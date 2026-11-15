import { describe, expect, it } from 'vitest';
import { aiWindow } from '../src/engine/ai';
import { clubProfile } from '../src/engine/aiprofile';
import { longInjured, squadNeeds } from '../src/engine/aineeds';
import { baseWage, payrollOf } from '../src/engine/finance';
import { makeRng } from '../src/engine/rng';
import { rosterOk } from '../src/engine/roster';
import type { GameState, Player, Position } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const club = g0.divisions[1].clubIds[4];
const setPlayers = (g: GameState, id: string, f: (ps: Player[]) => Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: f(g.teams[id].players) } } });
const budget = (g: GameState, id: string, v: number): GameState => ({ ...g, budgets: { ...g.budgets, [id]: v } });
const count = (g: GameState, id: string, pos: Position) => g.teams[id].players.filter((p) => p.pos === pos).length;
const needs = (g: GameState, id: string) => squadNeeds(g, id, clubProfile(g, id));

describe('necessidades do elenco (IA)', () => {
  it('3 goleiros e poucos defensores: a necessidade é de defensor, nunca de outro goleiro', () => {
    let g = setPlayers(g0, club, (ps) => { const gk = ps.filter((p) => p.pos === 'GK').slice(0, 3), def = ps.filter((p) => p.pos === 'DEF').slice(0, 4), rest = ps.filter((p) => p.pos === 'MID' || p.pos === 'ATT'); return [...gk, ...def, ...rest]; });
    expect(count(g, club, 'GK')).toBe(3);
    const n = needs(g, club);
    expect(n[0].pos).toBe('DEF'); expect(n[0].reasons).toContain('falta-gente');
    expect(n.some((x) => x.pos === 'GK')).toBe(false);
    g = budget(g, club, 80_000_000);
    const before = new Set(g.teams[club].players.map((p) => p.id));
    const s = aiWindow(g, makeRng(5), 1, [club]);
    const bought = s.teams[club].players.filter((p) => !before.has(p.id));
    expect(bought.length).toBe(1); expect(bought[0].pos).toBe('DEF');
    expect(count(s, club, 'GK')).toBe(3);
  });
  it('veterano titular e aposentadoria à vista geram necessidade, e o substituto não é veterano', () => {
    const g = setPlayers(g0, club, (ps) => { let k = 0; return ps.map((p) => (p.pos === 'MID' && k++ < 6 ? { ...p, age: 36 } : p)); });
    const mid = needs(g, club).find((x) => x.pos === 'MID')!;
    expect(mid.reasons).toEqual(expect.arrayContaining(['veterano', 'aposentadoria']));
    expect(mid.maxAge).toBeLessThanOrEqual(29);
    const before = new Set(g.teams[club].players.map((p) => p.id));
    const s = aiWindow(budget(g, club, 80_000_000), makeRng(6), 2, [club]);
    for (const p of s.teams[club].players.filter((q) => !before.has(q.id))) expect(p.age).toBeLessThan(35);
  });
  it('lesão longa (quando existir) vira necessidade, e o clube nunca contrata lesionado', () => {
    const starter = [...g0.teams[club].players].filter((p) => p.pos === 'ATT').sort((a, b) => b.strength - a.strength)[0];
    const g = { ...g0, injuries: { [starter.id]: { season: g0.season, untilRound: g0.round + 20 } } };
    expect(longInjured(g, starter.id)).toBe(true);
    expect(needs(g, club).find((x) => x.pos === 'ATT')?.reasons).toContain('lesao');
    const seller = g0.divisions[2].clubIds[0];
    const hurt = [...g0.teams[seller].players].filter((p) => p.pos === 'ATT').sort((a, b) => b.strength - a.strength)[0];
    const g2 = budget({ ...g, injuries: { ...g.injuries, [hurt.id]: { season: g0.season, untilRound: g0.round + 30 } } }, club, 80_000_000);
    const s = aiWindow(g2, makeRng(2), 3, [club]);
    expect(s.teams[club].players.some((p) => p.id === hurt.id)).toBe(false);
  });
  it('elenco completo e forte, sem veteranos: nenhuma necessidade e nenhuma contratação (dinheiro sozinho não basta)', () => {
    const g = budget(setPlayers(g0, club, (ps) => ps.map((p) => ({ ...p, strength: 92, age: 25 }))), club, 500_000_000);
    expect(needs(g, club)).toEqual([]);
    const s = aiWindow(g, makeRng(1), 5, [club]);
    expect(s.teams[club].players.map((p) => p.id)).toEqual(g.teams[club].players.map((p) => p.id));
    expect(s.budgets[club]).toBe(500_000_000);
  });
  it('reposição de quem saiu: ao perder um jogador da posição no limite, o clube passa a precisar de um substituto', () => {
    const base = setPlayers(g0, club, (ps) => { const keep = ps.filter((p) => p.pos !== 'DEF'); return [...keep, ...ps.filter((p) => p.pos === 'DEF').slice(0, 6).map((p) => ({ ...p, age: 25 }))]; });
    expect(needs(base, club).some((x) => x.pos === 'DEF' && x.reasons.includes('reposicao'))).toBe(false);
    const sold = setPlayers(base, club, (ps) => { let removed = false; return ps.filter((p) => { if (!removed && p.pos === 'DEF') { removed = true; return false; } return true; }); });
    const n = needs(sold, club).find((x) => x.pos === 'DEF');
    expect(n).toBeTruthy(); expect(n!.reasons).toContain('reposicao');
  });
  it('a folha salarial limita: o clube não passa do teto da folha do seu porte ao contratar', () => {
    for (const id of g0.divisions[3].clubIds.slice(0, 6)) {
      const g = budget(setPlayers(g0, id, (ps) => ps.map((p) => ({ ...p, strength: 38 }))), id, 100_000_000);
      const prof = clubProfile(g, id), limit = prof.revenue * 0.95;
      const s = aiWindow(g, makeRng(3), 3, [id]);
      expect(payrollOf(s, id)).toBeLessThanOrEqual(Math.max(limit, payrollOf(g, id)) + 1);
      expect(rosterOk(s.teams[id].players)).toBe(true);
    }
  });
  it('não há repetição: o mesmo jogador não muda de clube duas vezes na temporada e ninguém recontrata quem vendeu há pouco', () => {
    let s = g0; const moved = new Map<string, number>();
    for (let w = 0; w < 4; w++) {
      const prev = new Map<string, string>(); for (const [c, t] of Object.entries(s.teams)) for (const p of t.players) prev.set(p.id, c);
      s = aiWindow(s, makeRng(20 + w), 3);
      for (const [c, t] of Object.entries(s.teams)) for (const p of t.players) if (prev.get(p.id) !== c) moved.set(p.id, (moved.get(p.id) ?? 0) + 1);
    }
    expect(moved.size).toBeGreaterThan(20);
    expect([...moved.values()].every((v) => v === 1)).toBe(true);
    // recompra bloqueada: aiMoves diz que o comprador vendeu o jogador agora há pouco
    const seller = g0.divisions[2].clubIds[0], buyer = club;
    const star = [...g0.teams[seller].players].filter((p) => p.pos === 'ATT').sort((a, b) => b.strength - a.strength)[0];
    const blocked = { ...budget(setPlayers(g0, buyer, (ps) => ps.map((p) => (p.pos === 'ATT' ? { ...p, strength: 35 } : p))), buyer, 90_000_000), aiMoves: { [star.id]: { season: g0.season, round: 1, from: buyer, to: seller } } };
    expect(aiWindow(blocked, makeRng(1), 3, [buyer]).teams[buyer].players.some((p) => p.id === star.id)).toBe(false);
  });
  it('o salário do reforço é calculado para o clube que contrata', () => {
    const p = g0.teams[g0.divisions[2].clubIds[0]].players[0];
    expect(baseWage(g0, club, p)).toBeGreaterThan(0);
  });
});
