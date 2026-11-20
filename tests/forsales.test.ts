import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/engine/windows', async (orig) => ({ ...(await orig<typeof import('../src/engine/windows')>()), transferBlock: () => undefined })); // janela sempre aberta neste teste
import { acceptForeignSale, counterForeignSale, foreignSalesTick, MAX_OPEN_SALES, openSales, refuseForeignSale, wealthCap } from '../src/engine/forsales';
import { clubPlayers, directory, foreignSquad, quote } from '../src/engine/market';
import { makeRng } from '../src/engine/rng';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const listed = (g: GameState, n = 4) => { const ps = [...g.teams[g.userClubId].players].sort((a, b) => b.strength - a.strength).slice(2, 2 + n); return { ...g, transferList: ps.map((p) => p.id) }; };
const withOffers = (seed = 1) => { let g = listed(makeCareer('palmeiras', seed)); for (let i = 0; i < 12 && openSales(g).length < 2; i++) g = foreignSalesTick({ ...g, round: g.round + 0 }, makeRng(100 + i)); return g; };

describe('vender para clubes do mundo', () => {
  it('clubes de outros países fazem propostas pelos jogadores à venda (até o limite), com valores dentro do que eles podem pagar', () => {
    const g = withOffers(); const sales = openSales(g);
    expect(sales.length).toBeGreaterThan(0); expect(sales.length).toBeLessThanOrEqual(MAX_OPEN_SALES);
    for (const o of sales) {
      const d = directory(g).find((c) => c.id === o.clubId)!; expect(d.domestic).toBe(false);
      expect(o.fee).toBeLessThanOrEqual(wealthCap(g, d)); expect(g.transferList).toContain(o.playerId);
      expect(g.teams[g.userClubId].players.some((p) => p.id === o.playerId)).toBe(true); expect(g.news[0].text).toContain('faz proposta');
    }
    expect(new Set(sales.map((s) => s.playerId)).size).toBe(sales.length);   // uma proposta por jogador
  });

  it('aceitar: o jogador sai, o dinheiro entra à vista, ele passa a jogar no clube de fora e vira contratável no mercado', () => {
    const g = withOffers(2); const o = openSales(g)[0]; const cash = g.budgets[g.userClubId], n = g.teams[g.userClubId].players.length;
    const r = acceptForeignSale(g, o.id); expect(r.ok, r.text).toBe(true); const s = r.state;
    expect(s.teams[s.userClubId].players.some((p) => p.id === o.playerId)).toBe(false); expect(s.teams[s.userClubId].players.length).toBe(n - 1);
    expect(s.budgets[s.userClubId]).toBe(cash + o.fee);
    expect(clubPlayers(s, o.clubId).some((p) => p.id === o.playerId)).toBe(true);
    expect(foreignSquad(s, o.clubId).find((p) => p.id === o.playerId)!.contract!.wage).toBe(o.wage);
    expect(s.transfers.at(-1)).toMatchObject({ kind: 'sale', playerId: o.playerId, toClubId: o.clubId, fee: o.fee });
    expect(s.transferList).not.toContain(o.playerId); expect(openSales(s).some((x) => x.playerId === o.playerId)).toBe(false);
    expect(quote(s, o.clubId, o.playerId)).not.toBeNull();                      // dá para recomprar dele
    expect(acceptForeignSale(s, o.id).ok).toBe(false);                           // não vende duas vezes
    expect(s.teams[s.userClubId].lineup.every((id) => s.teams[s.userClubId].players.some((p) => p.id === id))).toBe(true); // a escalação continua válida
  });

  it('recusar tira a proposta; pedir 15% a mais funciona uma vez por proposta (o clube topa ou retira)', () => {
    const g = withOffers(3); const o = openSales(g)[0];
    expect(openSales(refuseForeignSale(g, o.id)).some((x) => x.id === o.id)).toBe(false);
    const c = counterForeignSale(g, o.id);
    if (c.ok) { const o2 = openSales(c.state).find((x) => x.id === o.id)!; expect(o2.fee).toBeGreaterThan(o.fee); expect(o2.countered).toBe(true); expect(counterForeignSale(c.state, o.id).ok).toBe(false); }
    else expect(openSales(c.state).some((x) => x.id === o.id)).toBe(false);
  });

  it('não vende se o elenco ficaria incompleto, jogador emprestado ou sem clube; propostas vencem com as rodadas e na troca de temporada', () => {
    let g = withOffers(4); const o = openSales(g)[0];
    expect(acceptForeignSale({ ...g, unemployed: true }, o.id).ok).toBe(false);
    expect(openSales({ ...g, round: o.expires + 1 }).length).toBe(0);
    expect(openSales({ ...g, season: g.season + 1 }).length).toBe(0);
    g = foreignSalesTick({ ...g, round: o.expires + 1 }, makeRng(5)); expect((g.foreignSales ?? []).every((x) => x.expires >= g.round)).toBe(true);
  });

  it('sem jogadores à venda quase não há propostas (só por destaques, raramente); sem clube ou observando, nenhuma', () => {
    const g0 = makeCareer('palmeiras', 6); let g = g0; for (let i = 0; i < 6; i++) g = foreignSalesTick(g, makeRng(i));
    expect(openSales(g).length).toBeLessThanOrEqual(2);
    expect(foreignSalesTick({ ...listed(g0), unemployed: true }, makeRng(1)).foreignSales ?? []).toHaveLength(0);
  });
});
