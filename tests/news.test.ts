import { describe, expect, it } from 'vitest';
import { balanceOf, payPix, registerBank } from '../src/engine/bank';
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
    expect(feed.some((n) => /contrata|anuncia/.test(n.text))).toBe(true); // a lista também traz recusas de propostas
    const mine = transferFeed({ ...g, transfers: [{ kind: 'buy', season: g.season, round: 3, playerId: 'x', playerName: 'João Silva', pos: 'ATT', strength: 70, fromClubId: 'santos', toClubId: 'palmeiras', fee: 1_000_000 }] });
    expect(mine.some((n) => n.mine && /contratou João Silva do Serranos Clube/.test(n.text))).toBe(true);
  });
});
