import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { checkPassword, FINGER, payPix, registerBank, balanceOf } from '../src/engine/bank';
import { buyPlan } from '../src/engine/dataplan';
import { coachMoneyOf } from '../src/engine/finance';
import { confirmCode, isVerified, needsAccount, requestCode, smsOf } from '../src/engine/accounts';
import { newCareer, playNext } from '../src/engine/game';
import { chipBlocked, chipLeft, chipNumberOf, chipOf, CHIP_PRICE, DEFAULT_PHONE, netState, phoneOf, toggleConn, updatePhoneSettings } from '../src/engine/phone';
import { buyChip, buyPhoneCash, chipTick } from '../src/engine/shop';
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
  it('custa R$ 2.000, vem com número (DD) 9XXXX-XXXX e vale 1 ano', () => {
    const a = buyPhoneCash(start(), 'zap'); if (!a.ok) throw new Error();
    const cash = coachMoneyOf(a.state);
    const g = withChip();
    expect(coachMoneyOf(g)).toBe(cash - CHIP_PRICE);
    expect(chipNumberOf(g)).toMatch(/^\(\d{2}\) 9\d{4}-\d{4}$/);
    expect(chipLeft(g)).toBe(g.totalRounds);
    expect(phoneOf(g).notifications.some((n) => n.text.includes(chipNumberOf(g)!))).toBe(true);
  });
  it('depois de 1 ano o chip bloqueia: os dados morrem e um chip novo traz outro número', () => {
    let g = toggleConn(withChip(), 'mobileData');
    g = { ...g, phone: { ...phoneOf(g), plan: { until: g.season * 200 + g.round + 999 } } };
    expect(netState(g).kind).toBe('5g');
    const old = chipNumberOf(g)!;
    g = { ...g, season: g.season + 1 };
    expect(chipBlocked(g)).toBe(true);
    expect(chipOf(g)).toBeUndefined();
    expect(netState(g)).toMatchObject({ speed: 'none', label: 'Chip bloqueado' });
    const t = chipTick(g);
    expect(phoneOf(t).notifications[0].text).toMatch(/bloqueado/);
    expect(chipTick(t)).toEqual(t); // só avisa uma vez
    const again = buyChip({ ...g, coachMoney: 50_000 }, 'morto'); if (!again.ok) throw new Error(again.error);
    expect(chipBlocked(again.state)).toBe(false);
    expect(chipNumberOf(again.state)).not.toBe(old);
    expect(netState(again.state).kind).toBe('5g');
  });
  it('avisa antes de bloquear', () => {
    let g = withChip();
    g = { ...g, phone: { ...phoneOf(g), chipUntil: g.season * 200 + g.round + 2 } };
    expect(phoneOf(chipTick(g)).notifications[0].text).toMatch(/vai bloquear/);
  });
});

describe('conta nos apps com código por SMS', () => {
  it('app novo pede conta; sem chip (ou bloqueado) o código não chega', () => {
    const a = buyPhoneCash(start(), 'zap'); if (!a.ok) throw new Error();
    expect(needsAccount(a.state, 'banco')).toBe(true);
    expect(needsAccount(a.state, 'noticias')).toBe(false);
    expect(requestCode(a.state, 'banco', '(11) 91234-5678')).toMatchObject({ ok: false });
    const g = withChip();
    const blocked = { ...g, season: g.season + 1 };
    expect(requestCode(blocked, 'banco', chipNumberOf(g)!)).toMatchObject({ ok: false });
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
