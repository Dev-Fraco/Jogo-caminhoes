import { describe, expect, it } from 'vitest';
import { COACH_MONTHLY, coachMonthlyBase, coachSalary } from '../src/engine/finance';
import { OPEN_BASE_MS, WIFI_BAD_EXTRA_MS, openDelayMs, DEFAULT_PHONE, PHONE_MODELS } from '../src/engine/phone';
import { makeCareer } from './helpers';

describe('salário do treinador por divisão', () => {
  it('Série A de 100 mil a 450 mil; Europa até 850 mil; divisões abaixo pagam menos, uma faixa por série', () => {
    expect(COACH_MONTHLY.sul[0]).toEqual([100_000, 450_000]);
    expect(COACH_MONTHLY.europa[0]).toEqual([100_000, 850_000]);
    for (const r of ['sul', 'europa'] as const) for (let i = 1; i < 5; i++) { expect(COACH_MONTHLY[r][i][1]).toBeLessThan(COACH_MONTHLY[r][i - 1][1]); expect(COACH_MONTHLY[r][i][0]).toBeLessThan(COACH_MONTHLY[r][i - 1][0]); }
  });
  it('o clube grande da Série A paga perto do teto e o pequeno perto do piso; Série D paga bem menos', () => {
    const g = makeCareer('palmeiras', 4);
    const small = { ...g, clubs: { ...g.clubs, palmeiras: { ...g.clubs.palmeiras, reputation: 1 } } };
    const big = { ...g, clubs: { ...g.clubs, palmeiras: { ...g.clubs.palmeiras, reputation: 5 } } };
    expect(coachMonthlyBase(small)).toBe(100_000); expect(coachMonthlyBase(big)).toBe(450_000);
    const d = makeCareer('csa', 4);
    expect(coachMonthlyBase(d)).toBeLessThan(18_001);
    expect(coachSalary(d)).toBeLessThan(coachSalary(g));
  });
});

describe('tempo para abrir apps', () => {
  it('Wi-Fi ruim soma 3,5 segundos ao tempo base do aparelho', () => {
    const model = PHONE_MODELS[0];
    const g: any = { season: 1, round: 1, phone: { ...DEFAULT_PHONE, model: model.id, settings: { ...DEFAULT_PHONE.settings, wifi: true, wifiNet: 'Wi-Fi livre', mobileData: false } } };
    expect(openDelayMs(g)).toBe(Math.round(OPEN_BASE_MS * model.speed + WIFI_BAD_EXTRA_MS));
  });
});
