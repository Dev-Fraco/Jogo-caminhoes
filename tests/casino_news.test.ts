import { describe, expect, it } from 'vitest';
import { balanceOf, payPix, registerBank } from '../src/engine/bank';
import { casinoOf, COLORS, depositCharge, MIN_BET, PAYOUT, placeBet, withdraw } from '../src/engine/casino';
import { aiWindow } from '../src/engine/ai';
import { fanInterviews, transferFeed } from '../src/engine/news';
import { makeRng } from '../src/engine/rng';
import { socialAfterMatch } from '../src/engine/social';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const bank = (money = 1_000_000): GameState => {
  const r = registerBank(makeCareer('palmeiras'), 'Carlos Almeida', 'segredo1', 'segredo1');
  if (!r.ok) throw new Error(r.error);
  return { ...r.state, coachMoney: money };
};
const funded = (deposit = 100_000): GameState => {
  const d = depositCharge(bank(), deposit);
  if (!d.ok) throw new Error(d.error);
  const p = payPix(d.state, d.charge.key, 'segredo1');
  if (!p.ok) throw new Error(p.error);
  return p.state;
};

describe('cassino', () => {
  it('3 cores, cada uma com 1/3 de chance (33%), pagando 2x', () => {
    expect(COLORS.map((c) => c.id)).toEqual(['azul', 'preto', 'vermelho']);
    expect(PAYOUT).toBe(2);
    const g = funded();
    const drawn = [0.0, 0.2, 0.33, 0.34, 0.66, 0.67, 0.99].map((roll) => { const r = placeBet(g, 'azul', 100, roll); return r.ok ? r.bet.drawn : '?'; });
    expect(drawn).toEqual(['azul', 'azul', 'azul', 'preto', 'preto', 'vermelho', 'vermelho']);
    // frequência real ≈ 33%
    const rng = makeRng(42); let wins = 0; const N = 6000;
    for (let i = 0; i < N; i++) { const r = placeBet(g, 'preto', 100, rng()); if (r.ok && r.won) wins++; }
    expect(wins / N).toBeGreaterThan(0.31); expect(wins / N).toBeLessThan(0.355);
  });
  it('depósito só chega ao Cassino depois do Pix confirmado; desconta do banco', () => {
    const b = bank();
    expect(depositCharge(b, 10).ok).toBe(false);
    const d = depositCharge(b, 50_000);
    if (!d.ok) throw new Error(d.error);
    expect(casinoOf(d.state).balance).toBe(0);
    const p = payPix(d.state, d.charge.key, 'segredo1');
    if (!p.ok) throw new Error(p.error);
    expect(casinoOf(p.state).balance).toBe(50_000);
    expect(balanceOf(p.state)).toBe(950_000);
    expect(p.state.bank!.txs[0].title).toContain('Cassino');
  });
  it('aposta de R$ 30 mil: acerta e vai a R$ 60 mil; erra e perde tudo; valida saldo e mínimo', () => {
    const g = funded(100_000);
    const win = placeBet(g, 'azul', 30_000, 0.1);
    if (!win.ok) throw new Error(win.error);
    expect(win.won).toBe(true);
    expect(win.bet.payout).toBe(60_000);
    expect(casinoOf(win.state).balance).toBe(130_000);
    const lose = placeBet(g, 'azul', 30_000, 0.9);
    if (!lose.ok) throw new Error(lose.error);
    expect(lose.won).toBe(false);
    expect(casinoOf(lose.state).balance).toBe(70_000);
    expect(casinoOf(lose.state).bets[0]).toMatchObject({ color: 'azul', drawn: 'vermelho', payout: 0 });
    expect(placeBet(g, 'azul', 500_000, 0.1).ok).toBe(false);
    expect(placeBet(g, 'azul', MIN_BET - 1, 0.1).ok).toBe(false);
    expect(placeBet(bank(), 'azul', 1000, 0.1).ok).toBe(false); // sem depósito
    expect(placeBet(g, 'roxo' as never, 1000, 0.1).ok).toBe(false);
  });
  it('saque devolve o saldo do Cassino para a conta', () => {
    const g = funded(40_000);
    const before = balanceOf(g);
    expect(withdraw(g, 99_999).ok).toBe(false);
    const w = withdraw(g, 40_000);
    if (!w.ok) throw new Error(w.error);
    expect(casinoOf(w.state).balance).toBe(0);
    expect(balanceOf(w.state)).toBe(before + 40_000);
  });
});

describe('notícias', () => {
  it('entrevistas com torcedores: tom positivo com torcida feliz, negativo com torcida irritada', () => {
    const happy = socialAfterMatch({ ...makeCareer('palmeiras'), morale: { team: 80, board: 70, fans: 90 } }, 3, 0);
    const angry = socialAfterMatch({ ...makeCareer('palmeiras'), morale: { team: 30, board: 30, fans: 10 } }, 0, 3);
    const h = fanInterviews(happy), a = fanInterviews(angry);
    expect(h.items.length).toBe(4);
    expect(h.items.filter((i) => i.tone === 'good').length).toBeGreaterThan(h.items.filter((i) => i.tone === 'bad').length);
    expect(a.items.filter((i) => i.tone === 'bad').length).toBeGreaterThan(a.items.filter((i) => i.tone === 'good').length);
    expect(h.headline).toMatch(/aprova/);
    expect(a.headline).toMatch(/insatisfeita/);
    expect(h.items.every((i) => i.quote.length > 10 && !i.quote.includes('{'))).toBe(true);
    // estável dentro da mesma rodada, muda na seguinte
    expect(fanInterviews(happy)).toEqual(h);
    expect(fanInterviews({ ...happy, round: happy.round + 1 }).items.map((i) => i.quote)).not.toEqual(h.items.map((i) => i.quote));
  });
  it('feed de transferências mostra as negociações da IA e as suas', () => {
    let g = makeCareer('palmeiras', 5);
    expect(transferFeed(g).length).toBe(0);
    g = aiWindow(g, makeRng(7), 1);
    const feed = transferFeed(g);
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].text).toMatch(/contrata/);
    const mine = transferFeed({ ...g, transfers: [{ kind: 'buy', season: g.season, round: 3, playerId: 'x', playerName: 'João Silva', pos: 'ATT', strength: 70, fromClubId: 'santos', toClubId: 'palmeiras', fee: 1_000_000 }] });
    expect(mine.some((n) => n.mine && /contratou João Silva do Santos/.test(n.text))).toBe(true);
  });
});
