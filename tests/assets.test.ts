import { describe, expect, it } from 'vitest';
import { buyHome, buyVehicle, currentRental, endRent, HOUSES_BUY, HOUSES_RENT, houseQuote, loanQuote, ownsHouse, ownsVehicle, prestigeScore, rentHome, resaleValue, sellAsset, tickContracts, vehicleQuote, VEHICLES, assetsOf, MONTH_ROUNDS } from '../src/engine/assets';
import { balanceOf, payBoleto, payPix, registerBank, tickBoletos } from '../src/engine/bank';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const rich = (money = 5_000_000): GameState => {
  const r = registerBank(makeCareer('palmeiras'), 'Carlos Almeida', 'segredo1', 'segredo1');
  if (!r.ok) throw new Error(r.error);
  return { ...r.state, coachMoney: money };
};
const pay = (g: GameState, key: string) => { const r = payPix(g, key, 'segredo1'); if (!r.ok) throw new Error(r.error); return r.state; };
const at = (g: GameState, round: number): GameState => ({ ...g, round });

describe('catálogos', () => {
  it('15 veículos (de baratos a milhões), casas para comprar e para alugar de R$ 600 a R$ 50 mil', () => {
    expect(VEHICLES.length).toBe(15);
    expect(Math.min(...VEHICLES.map((v) => v.price))).toBeLessThan(20_000);
    expect(Math.max(...VEHICLES.map((v) => v.price))).toBeGreaterThanOrEqual(3_000_000);
    expect(VEHICLES.some((v) => v.kind === 'Elétrico')).toBe(true);
    expect(VEHICLES.some((v) => v.kind === 'Esportivo')).toBe(true);
    expect(new Set(VEHICLES.map((v) => v.id)).size).toBe(15);
    const rents = HOUSES_RENT.map((h) => h.rent!);
    expect(Math.min(...rents)).toBe(600);
    expect(Math.max(...rents)).toBe(50_000);
    expect(HOUSES_BUY.length).toBeGreaterThanOrEqual(8);
    const byPrestige = [...HOUSES_RENT].sort((a, b) => a.rent! - b.rent!).map((h) => h.prestige);
    expect(byPrestige).toEqual([...byPrestige].sort((a, b) => a - b)); // quanto mais caro, melhor a casa
  });
  it('financiamento: parcela com juros fixa, total maior que o preço', () => {
    const q = vehicleQuote(100_000, 24);
    expect(q.entry).toBe(20_000);
    expect(q.monthly * 24).toBeGreaterThan(80_000);
    expect(q.total).toBeGreaterThan(100_000);
    expect(loanQuote(1000, 0, 0.01, 10).monthly).toBe(106);
    expect(houseQuote(1_000_000, 120).entry).toBe(300_000);
  });
});

describe('concessionária', () => {
  it('à vista: só vira seu depois do Pix; compra duplicada e saldo curto são barrados', () => {
    const g = rich();
    const r = buyVehicle(g, 'hatch-popular', { type: 'cash' });
    if (!r.ok) throw new Error(r.error);
    expect(ownsVehicle(r.state, 'hatch-popular')).toBe(false);
    expect(r.charge.amount).toBe(70_000);
    const s = pay(r.state, r.charge.key);
    expect(ownsVehicle(s, 'hatch-popular')).toBe(true);
    expect(balanceOf(s)).toBe(5_000_000 - 70_000);
    expect(buyVehicle(s, 'hatch-popular', { type: 'cash' }).ok).toBe(false);
    expect(buyVehicle(g, 'xyz', { type: 'cash' }).ok).toBe(false);
    expect(buyVehicle(g, 'hatch-popular', { type: 'finance', installments: 7 }).ok).toBe(false);
    const poor = { ...r.state, coachMoney: 1000 };
    expect(payPix(poor, r.charge.key, 'segredo1')).toMatchObject({ ok: false, error: 'Saldo insuficiente.' });
  });
  it('financiado: entrada por Pix, parcelas mensais em boleto e quitação', () => {
    const g = rich();
    const r = buyVehicle(g, 'sedan-compacto', { type: 'finance', installments: 12 });
    if (!r.ok) throw new Error(r.error);
    let s = pay(r.state, r.charge.key);
    const q = vehicleQuote(105_000, 12);
    expect(balanceOf(s)).toBe(5_000_000 - q.entry);
    expect(assetsOf(s).vehicles[0].contractId).toBeTruthy();
    expect(s.bank!.boletos.length).toBe(1);
    expect(s.bank!.boletos[0].amount).toBe(q.monthly);
    expect(sellAsset(s, 'vehicle', 'sedan-compacto')).toMatchObject({ ok: false });
    // paga as 12 parcelas, uma a cada mês
    for (let i = 1; i <= 12; i++) {
      const open = s.bank!.boletos.find((b) => b.status !== 'paid')!;
      const p = payBoleto(s, open.id, 'segredo1');
      if (!p.ok) throw new Error(p.error);
      s = p.state;
      if (i < 12) { s = tickContracts(at({ ...s }, s.round + MONTH_ROUNDS)); s = { ...s }; }
    }
    expect(assetsOf(s).contracts.length).toBe(0);
    expect(assetsOf(s).vehicles[0].contractId).toBeUndefined();
    expect(s.bank!.boletos.filter((b) => b.status !== 'paid').length).toBe(0);
    expect(sellAsset(s, 'vehicle', 'sedan-compacto').ok).toBe(true);
  });
  it('revenda perde valor com os anos e entra no saldo', () => {
    expect(resaleValue(100_000, 2026, 2026)).toBe(100_000);
    expect(resaleValue(100_000, 2026, 2028)).toBe(76_000);
    expect(resaleValue(100_000, 2026, 2040)).toBe(35_000);
    const r = buyVehicle(rich(), 'moto-urbana', { type: 'cash' });
    if (!r.ok) throw new Error(r.error);
    const s = pay(r.state, r.charge.key);
    const sold = sellAsset({ ...s, season: s.season + 1 }, 'vehicle', 'moto-urbana');
    if (!sold.ok) throw new Error(sold.error);
    expect(sold.value).toBe(10_560);
    expect(ownsVehicle(sold.state, 'moto-urbana')).toBe(false);
    expect(balanceOf(sold.state)).toBe(balanceOf(s) + 10_560);
  });
  it('2 boletos vencidos: o veículo é retomado', () => {
    const r = buyVehicle(rich(), 'suv-familia', { type: 'finance', installments: 24 });
    if (!r.ok) throw new Error(r.error);
    let s = pay(r.state, r.charge.key);
    for (let i = 0; i < 40 && ownsVehicle(s, 'suv-familia'); i++) { s = tickContracts(tickBoletos({ ...s, round: s.round + 1 })); }
    expect(ownsVehicle(s, 'suv-familia')).toBe(false);
    expect(assetsOf(s).contracts.length).toBe(0);
    expect(s.news[0].text).toMatch(/retomado/);
  });
});

describe('corretor de imóveis', () => {
  it('compra à vista e financiada de casa', () => {
    const g = rich(20_000_000);
    const a = buyHome(g, 'b-casa-popular', { type: 'cash' });
    if (!a.ok) throw new Error(a.error);
    const s1 = pay(a.state, a.charge.key);
    expect(ownsHouse(s1, 'b-casa-popular')).toBe(true);
    const b = buyHome(s1, 'b-condominio', { type: 'finance', installments: 120 });
    if (!b.ok) throw new Error(b.error);
    const s2 = pay(b.state, b.charge.key);
    expect(balanceOf(s2)).toBe(20_000_000 - 260_000 - houseQuote(900_000, 120).entry);
    expect(assetsOf(s2).contracts[0].total).toBe(120);
    expect(prestigeScore(s2)).toBeGreaterThan(0);
  });
  it('aluguel: 1º mês no Pix, depois boleto todo mês; não deixa alugar dois; encerra se estiver em dia', () => {
    const g = rich();
    const r = rentHome(g, 'r-kitnet');
    if (!r.ok) throw new Error(r.error);
    expect(r.charge.amount).toBe(600);
    let s = pay(r.state, r.charge.key);
    expect(currentRental(s)?.monthly).toBe(600);
    expect(rentHome(s, 'r-casa-2q').ok).toBe(false);
    expect(s.bank!.boletos.length).toBe(0);
    s = tickContracts({ ...s, round: s.round + MONTH_ROUNDS });
    expect(s.bank!.boletos.length).toBe(1);
    expect(s.bank!.boletos[0].description).toMatch(/Aluguel/);
    expect(endRent(s)).toMatchObject({ ok: false });
    const p = payBoleto(s, s.bank!.boletos[0].id, 'segredo1');
    if (!p.ok) throw new Error(p.error);
    s = tickContracts({ ...p.state, round: p.state.round + MONTH_ROUNDS });
    s = { ...s, bank: { ...s.bank!, boletos: s.bank!.boletos.map((b) => ({ ...b, status: 'paid' as const })) } };
    expect(endRent(s).ok).toBe(true);
  });
  it('aluguel atrasado em 2 meses: despejo', () => {
    const r = rentHome(rich(), 'r-quarto-sala');
    if (!r.ok) throw new Error(r.error);
    let s = pay(r.state, r.charge.key);
    for (let i = 0; i < 40 && currentRental(s); i++) s = tickContracts(tickBoletos({ ...s, round: s.round + 1 }));
    expect(currentRental(s)).toBeUndefined();
    expect(s.news[0].text).toMatch(/Despejo/);
  });
});
