import { describe, expect, it } from 'vitest';
import { aiBalanceBooks, aiWindow } from '../src/engine/ai';
import { clubProfile } from '../src/engine/aiprofile';
import { evaluateOffer, marketValue, MAX_STARTER_SALES, roleOf, saleReasons, stance } from '../src/engine/aisales';
import { makeRng } from '../src/engine/rng';
import { autoLineup } from '../src/engine/squad';
import type { GameState, Player, Position } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const club = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
const buyer = g0.divisions[0].clubIds.filter((x) => x !== 'flamengo')[5];
const best = (g: GameState, id: string, pos: Position) => [...g.teams[id].players].filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength)[0];
const setPlayers = (g: GameState, id: string, f: (ps: Player[]) => Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: f(g.teams[id].players) } } });
const budget = (g: GameState, id: string, v: number): GameState => ({ ...g, budgets: { ...g.budgets, [id]: v } });
/** Deixa só 1 jogador bom na posição (os outros fracos): o titular vira peça fundamental sem substituto. */
const lone = (g: GameState, id: string, pos: Position, star: number, others: number) => setPlayers(g, id, (ps) => { const top = ps.filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength)[0]; return ps.map((p) => (p.id === top.id ? { ...p, strength: star } : p.pos === pos ? { ...p, strength: others } : p)); });

describe('vendas da IA: importância, substituto e preço', () => {
  it('peça fundamental sem substituto à altura: o clube RECUSA, mesmo com a proposta muito boa', () => {
    const g = lone(g0, club, 'ATT', 92, 40);
    const star = best(g, club, 'ATT');
    const r = roleOf(g, club, star);
    expect(r.role).toBe('craque'); expect(r.gap).toBeGreaterThan(6);
    const st = stance(g, club, star, buyer);
    expect(st.willing).toBe(false); expect(st.refusal).toBe('fundamental');
    expect(evaluateOffer(g, club, star, marketValue(g, club, star) * 5, buyer).accept).toBe(false);
  });
  it('com substituto à altura, o mesmo craque pode sair, mas por bem mais que o valor de mercado', () => {
    const g = lone(g0, club, 'ATT', 92, 88);
    const star = best(g, club, 'ATT');
    const st = stance(g, club, star, buyer);
    expect(st.willing).toBe(true); expect(st.role).toBe('craque');
    expect(st.ask).toBeGreaterThan(1.1);
    const value = marketValue(g, club, star);
    expect(evaluateOffer(g, club, star, value, buyer).accept).toBe(false); // valor de mercado não basta
    expect(evaluateOffer(g, club, star, value * 2, buyer).accept).toBe(true);
  });
  it('reserva e excedente saem mais baratos que titular; fim de contrato, salário alto e sem espaço reduzem o preço', () => {
    const g = g0;
    const xi = new Set(autoLineup(g.teams[club].players, g.teams[club].formation));
    const starter = g.teams[club].players.find((p) => xi.has(p.id) && p.pos === 'MID')!;
    const reserve = g.teams[club].players.find((p) => !xi.has(p.id) && p.pos === 'MID')!;
    expect(stance(g, club, reserve, buyer).ask).toBeLessThan(stance(g, club, starter, buyer).ask);
    const ending = { ...reserve, contract: { wage: 1000, until: g.season } };
    const g2 = setPlayers(g, club, (ps) => ps.map((p) => (p.id === reserve.id ? ending : p)));
    expect(saleReasons(g2, club, ending, clubProfile(g2, club))).toContain('fim-contrato');
    expect(stance(g2, club, ending, buyer).ask).toBeLessThan(stance(g, club, reserve, buyer).ask);
  });
  it('clube sem dinheiro vende mais barato (e só aceita vender peça-chave por muito dinheiro)', () => {
    const g = budget(lone(g0, club, 'ATT', 92, 88), club, 1_000);
    const star = best(g, club, 'ATT');
    expect(clubProfile(g, club).financial).toBe('crise');
    const poor = stance(g, club, star, buyer), rich = stance(lone(g0, club, 'ATT', 92, 88), club, star, buyer);
    expect(poor.reasons).toContain('financas');
    expect(poor.ask).toBeGreaterThanOrEqual(1.4); // peça-chave: nem o desesperado vende barato
    expect(rich.willing).toBe(true);
    const reserve = g.teams[club].players.find((p) => p.pos === 'MID' && !new Set(autoLineup(g.teams[club].players, g.teams[club].formation)).has(p.id))!;
    expect(stance(g, club, reserve, buyer).ask).toBeLessThan(stance(budget(g, club, 500_000_000), club, reserve, buyer).ask);
  });
  it('não vende se a posição ficaria sem o mínimo e sem folga', () => {
    const g = setPlayers(g0, club, (ps) => { const gk = ps.filter((p) => p.pos === 'GK').slice(0, 2); return [...gk, ...ps.filter((p) => p.pos !== 'GK')]; });
    const keeper = best(g, club, 'GK');
    const st = stance(g, club, keeper, buyer);
    expect(st.willing).toBe(false); expect(st.refusal).toBe('sem-reposicao');
  });
  it('titular não vai para divisão inferior e o clube não vende titulares demais numa janela', () => {
    const lowBuyer = g0.divisions[2].clubIds[0];
    const star = best(g0, club, 'MID');
    expect(stance(g0, club, star, lowBuyer).refusal === 'nao-quer-descer' || !stance(g0, club, star, lowBuyer).willing || stance(g0, club, star, lowBuyer).role !== 'craque').toBe(true);
    const prof = clubProfile(g0, club);
    const xi = new Set(autoLineup(g0.teams[club].players, g0.teams[club].formation));
    const starter = g0.teams[club].players.find((p) => xi.has(p.id) && p.pos === 'DEF')!;
    const over = stance(g0, club, starter, buyer, undefined, MAX_STARTER_SALES[prof.tier]);
    expect(over.willing).toBe(false); expect(over.refusal).toBe('limite-de-titulares');
  });
});

describe('vendas por iniciativa do clube', () => {
  it('clube pequeno em crise vende para equilibrar as contas, mas mantém o melhor jogador e nunca fica sem o mínimo', () => {
    const small = g0.divisions[3].clubIds[0], rich = g0.divisions[3].clubIds[1];
    let g = budget(budget(g0, small, 1_000), rich, 600_000_000);
    g = setPlayers(g, rich, (ps) => ps.map((p) => ({ ...p, strength: 30 }))); // comprador com necessidade em todas as posições
    const top = [...g0.teams[small].players].sort((a, b) => b.strength - a.strength)[0];
    const s = aiBalanceBooks(g, makeRng(3));
    const lost = g0.teams[small].players.length - s.teams[small].players.length;
    expect(lost).toBeGreaterThan(0); expect(lost).toBeLessThanOrEqual(2);
    expect(s.budgets[small]).toBeGreaterThan(1_000);
  });
  it('clube saudável não vende titular: só sai quem está fora dos planos', () => {
    const id = g0.divisions[0].clubIds.find((x) => x !== 'flamengo')!;
    const s = aiBalanceBooks(budget(g0, id, 900_000_000), makeRng(2));
    const xi = autoLineup(g0.teams[id].players, g0.teams[id].formation);
    for (const pid of xi) expect(s.teams[id].players.some((p) => p.id === pid)).toBe(true); // só sai quem está fora dos planos: os titulares ficam
  });
  it('proposta recusada por peça fundamental vira notícia de mercado e a venda não acontece na janela', () => {
    const star = lone(g0, club, 'ATT', 92, 40);
    const target = best(star, club, 'ATT');
    let g = setPlayers(star, buyer, (ps) => ps.map((p) => (p.pos === 'ATT' ? { ...p, strength: 40 } : p)));
    g = budget(g, buyer, 900_000_000);
    const s = aiWindow(g, makeRng(5), 3, [buyer]);
    expect(s.teams[club].players.some((p) => p.id === target.id)).toBe(true);
  });
});
