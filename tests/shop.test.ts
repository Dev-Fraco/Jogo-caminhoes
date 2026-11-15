import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { balanceOf, payPix, registerBank } from '../src/engine/bank';
import { buyPlan } from '../src/engine/dataplan';
import { newCareer } from '../src/engine/game';
import { appsUsed, CHIPS, chipOf, DEFAULT_PHONE, downloadMs, installApp, modelOf, netState, openDelayMs, ownsPhone, PHONE_MODELS, phoneOf, toggleConn, connectWifi, FREE_WIFI } from '../src/engine/phone';
import { buyChip, buyPhoneCash, buyPhonePix } from '../src/engine/shop';
import { coachMoneyOf } from '../src/engine/finance';
import type { GameState } from '../src/engine/types';

const fresh = (money = 200_000): GameState => {
  const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 2);
  return { ...g, coachMoney: money, phone: { ...DEFAULT_PHONE, noPhone: true } };
};

describe('Mega-zona Luiz', () => {
  it('catálogo vai de um aparelho barato e fraco até o de R$ 80 mil', () => {
    const prices = PHONE_MODELS.map((m) => m.price);
    expect(Math.min(...prices)).toBe(5_000);
    expect(Math.max(...prices)).toBe(80_000);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const apps = PHONE_MODELS.map((m) => m.apps), speeds = PHONE_MODELS.map((m) => m.speed);
    expect(apps).toEqual([...apps].sort((a, b) => a - b));
    expect(speeds).toEqual([...speeds].sort((a, b) => b - a));
  });
  it('sem celular: não instala apps; primeira compra é em dinheiro, sem Pix', () => {
    let g = fresh();
    expect(ownsPhone(g)).toBe(false);
    expect(installApp(g, 'banco')).toBe(g);
    expect(buyPhonePix(g, 'zap').ok).toBe(false);
    const cash = coachMoneyOf(g);
    const r = buyPhoneCash(g, 'orbit');
    expect(r.ok).toBe(true);
    if (r.ok) g = r.state;
    expect(coachMoneyOf(g)).toBe(cash - 24_000);
    expect(ownsPhone(g)).toBe(true);
    expect(modelOf(g).id).toBe('orbit');
    expect(installApp(g, 'banco')).not.toBe(g);
  });
  it('não compra sem dinheiro e depois de ter celular não paga mais em dinheiro', () => {
    const poor = buyPhoneCash(fresh(3_000), 'zap');
    expect(poor.ok).toBe(false);
    const r = buyPhoneCash(fresh(), 'zap');
    if (!r.ok) throw new Error();
    expect(buyPhoneCash(r.state, 'fenix').ok).toBe(false);
  });
  it('memória: o celular só guarda um número de apps', () => {
    let r = buyPhoneCash(fresh(), 'zap'); if (!r.ok) throw new Error(); let g = r.state;
    for (const id of ['banco', 'linstagra', 'tikiteko']) g = installApp(g, id);
    expect(appsUsed(g)).toBe(modelOf(g).apps);
    expect(modelOf(g).apps).toBe(2);
  });
  it('celular melhor abre e baixa mais rápido', () => {
    const slow = buyPhoneCash(fresh(), 'zap'), fast = buyPhoneCash(fresh(), 'imperial');
    if (!slow.ok || !fast.ok) throw new Error();
    const wifi = (g: GameState) => connectWifi(toggleConn(g, 'wifi'), FREE_WIFI[0].name);
    expect(openDelayMs(wifi(fast.state))).toBeLessThan(openDelayMs(wifi(slow.state)) * 0.6); // no Wi-Fi ruim os 3,5 s extras valem para todos os aparelhos
    expect(downloadMs(wifi(fast.state))).toBeLessThan(downloadMs(wifi(slow.state)) / 3);
  });
  it('troca de celular é por Pix no Banco e mantém chip e apps que cabem', () => {
    let r = buyPhoneCash(fresh(), 'fenix'); if (!r.ok) throw new Error(); let g = r.state;
    const rb = registerBank(g, 'A B', 'segredo1', 'segredo1'); if (!rb.ok) throw new Error(); g = rb.state;
    g = { ...g, coachMoney: 300_000 };
    const c = buyChip(g, 'morto'); if (!c.ok) throw new Error(); g = c.state;
    for (const id of ['banco', 'linstagra', 'tikiteko']) g = installApp(g, id);
    expect(appsUsed(g)).toBe(3);
    const b = buyPhonePix(g, 'zenith'); if (!b.ok) throw new Error(b.error);
    expect(modelOf(b.state).id).toBe('fenix'); // só troca depois de pagar
    const cash = balanceOf(b.state);
    const p = payPix(b.state, b.charge.key, 'segredo1'); if (!p.ok) throw new Error(p.error);
    expect(balanceOf(p.state)).toBe(cash - 66_000);
    expect(modelOf(p.state).id).toBe('zenith');
    expect(chipOf(p.state)?.id).toBe('morto');
    expect(appsUsed(p.state)).toBe(3);
    // volta para um aparelho com menos memória: apps que não cabem saem
    const b2 = buyPhonePix({ ...p.state, coachMoney: 900_000 }, 'zap'); if (!b2.ok) throw new Error();
    const p2 = payPix(b2.state, b2.charge.key, 'segredo1'); if (!p2.ok) throw new Error();
    expect(appsUsed(p2.state)).toBe(2);
    expect(buyPhonePix(p2.state, 'zap').ok).toBe(false);
  });
  it('chip: três opções; dados móveis precisam de chip e de plano', () => {
    expect(CHIPS.map((c) => c.id)).toEqual(['morto', 'escuro', 'toim']);
    let r = buyPhoneCash(fresh(), 'nova'); if (!r.ok) throw new Error(); let g = toggleConn(r.state, 'mobileData');
    expect(netState(g).label).toMatch(/sem chip/i);
    expect(buyChip(fresh(), 'toim').ok).toBe(false); // sem celular
    const c = buyChip(g, 'escuro'); if (!c.ok) throw new Error(); g = c.state;
    expect(phoneOf(g).chip).toBe('escuro');
    expect(buyChip(g, 'escuro').ok).toBe(false);
    expect(netState(g).label).toMatch(/sem plano/i);
    g = { ...g, phone: { ...phoneOf(g), plan: { until: g.season * 200 + g.round + 3 } } };
    expect(netState(g)).toMatchObject({ kind: '5g', speed: 'fast' });
    void buyPlan;
  });
  it('saves antigos continuam com celular e dados móveis', () => {
    const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 2);
    expect(ownsPhone(g)).toBe(true);
    expect(chipOf(g)?.id).toBe('toim');
    expect(modelOf(g).apps).toBeGreaterThanOrEqual(8);
  });
});
