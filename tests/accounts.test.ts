import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { checkPassword, FINGER, payPix, registerBank, balanceOf } from '../src/engine/bank';
import { buyPlan } from '../src/engine/dataplan';
import { coachMoneyOf } from '../src/engine/finance';
import { confirmCode, isVerified, needsAccount, requestCode, smsOf } from '../src/engine/accounts';
import { newCareer, playNext } from '../src/engine/game';
import { chipBlocked, chipLeft, chipNumberOf, chipOf, CHIP_PRICE, DEFAULT_PHONE, netState, phoneOf, toggleConn, updatePhoneSettings } from '../src/engine/phone';
import { buyChip, buyPhoneCash } from '../src/engine/shop';
import { addMonths, calOf } from '../src/engine/calendar';
import { processDays } from '../src/engine/daily';
import type { GameState } from '../src/engine/types';

const start = (): GameState => {
  const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 6);
  return { ...g, coachMoney: 100_000, phone: { ...DEFAULT_PHONE, noPhone: true } };
};
const withChip = (): GameState => {
  const a = buyPhoneCash(start(), 'zap'); if (!a.ok) throw new Error(a.error);
  const b = buyChip(a.state, 'morto'); if (!b.ok) throw new Error(b.error);
  return b.state;
};

describe('chip: número, preço e validade', () => {
  it('custa R$ 2.000, vem com número (DD) 9XXXX-XXXX e nunca bloqueia', () => {
    const a = buyPhoneCash(start(), 'zap'); if (!a.ok) throw new Error();
    const cash = coachMoneyOf(a.state);
    const g = withChip();
    expect(coachMoneyOf(g)).toBe(cash - CHIP_PRICE);
    expect(chipNumberOf(g)).toMatch(/^\(\d{2}\) 9\d{4}-\d{4}$/);
    expect(chipLeft(g)).toBeUndefined();
    expect(phoneOf(g).notifications.some((n) => n.text.includes(chipNumberOf(g)!))).toBe(true);
  });
  it('o chip nunca bloqueia: passam-se anos e os dados continuam funcionando, sem avisos de bloqueio', () => {
    let g = toggleConn(withChip(), 'mobileData');
    g = { ...g, phone: { ...phoneOf(g), plan: { until: calOf(g).day + 9999 } } };
    const num = chipNumberOf(g)!;
    g = processDays(g, calOf(g).day, calOf(g).day + 800);
    expect(chipBlocked(g)).toBe(false);
    expect(chipOf(g)).toBeDefined();
    expect(chipNumberOf(g)).toBe(num);
    expect(netState(g).kind).toBe('5g');
    expect(phoneOf(g).notifications.some((n) => /bloquead|vai bloquear/.test(n.text))).toBe(false);
  });
});

describe('conta nos apps com código por SMS', () => {
  it('app novo pede conta; sem chip o código não chega', () => {
    const a = buyPhoneCash(start(), 'zap'); if (!a.ok) throw new Error();
    expect(needsAccount(a.state, 'banco')).toBe(true);
    expect(needsAccount(a.state, 'noticias')).toBe(false);
    expect(requestCode(a.state, 'banco', '(11) 91234-5678')).toMatchObject({ ok: false });
    const g = withChip();
    const later = { ...g, cal: { ...calOf(g), day: calOf(g).day + 400 } };
    expect(requestCode(later, 'banco', chipNumberOf(g)!)).toMatchObject({ ok: true }); // o chip não bloqueia mais
  });
  it('só o número do seu chip recebe o código; o código chega por SMS e libera o app', () => {
    let g = withChip();
    expect(requestCode(g, 'banco', '(11) 90000-0000')).toMatchObject({ ok: false });
    expect(requestCode(g, 'banco', '123')).toMatchObject({ ok: false });
    const r = requestCode(g, 'banco', chipNumberOf(g)!);
    if (!r.ok) throw new Error(r.error);
    g = r.state;
    const sms = smsOf(g)[0];
    expect(sms.code).toMatch(/^\d{6}$/);
    expect(phoneOf(g).notifications[0].app).toBe('sms');
    expect(confirmCode(g, 'banco', '000000')).toMatchObject({ ok: false });
    expect(confirmCode(g, 'linstagra', sms.code!)).toMatchObject({ ok: false }); // código é de outro app
    const c = confirmCode(g, 'banco', sms.code!);
    if (!c.ok) throw new Error(c.error);
    expect(isVerified(c.state, 'banco')).toBe(true);
    expect(isVerified(c.state, 'cassino')).toBe(false);
  });
  it('saves antigos têm todas as contas liberadas', () => {
    const g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 6);
    expect(needsAccount(g, 'banco')).toBe(false);
  });
});

describe('digital no lugar da senha do banco', () => {
  const bankG = (): GameState => { const rb = registerBank(withChip(), 'A B', 'segredo1', 'segredo1'); if (!rb.ok) throw new Error(); return { ...rb.state, coachMoney: 100_000 }; };
  it('só vale com a digital ativada nas Configurações', () => {
    let g = bankG();
    expect(checkPassword(g, FINGER)).toBe(false);
    g = updatePhoneSettings(g, { fingerprint: true });
    expect(checkPassword(g, FINGER)).toBe(true);
    expect(checkPassword(g, 'errada')).toBe(false);
  });
  it('paga Pix com a digital, sem digitar a senha', () => {
    let g = updatePhoneSettings(bankG(), { fingerprint: true });
    const b = buyPlan(g); if (!b.ok) throw new Error(b.error);
    const cash = balanceOf(b.state);
    const r = payPix(b.state, b.charge.key, FINGER); if (!r.ok) throw new Error(r.error);
    expect(balanceOf(r.state)).toBeLessThan(cash);
    void playNext; void g;
  });
});
