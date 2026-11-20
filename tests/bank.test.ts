import { describe, expect, it } from 'vitest';
import { balanceOf, boletoTotal, checkPassword, clubCharge, createBoleto, createCharge, creditAccount, hasBank, myPixKey, openBoletos, payBoleto, payPix, quotePix, registerBank, registerPurpose, setAutoDebit, tickBoletos } from '../src/engine/bank';
import { phoneOf } from '../src/engine/phone';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const withBank = (g = makeCareer('csa'), money = 500_000): GameState => {
  const r = registerBank(g, 'Carlos Almeida', 'segredo1', 'segredo1');
  if (!r.ok) throw new Error(r.error);
  return { ...r.state, coachMoney: money };
};

describe('banco', () => {
  it('cadastro valida nome, senha e confirmação; senha não fica em texto puro', () => {
    const g = makeCareer();
    expect(registerBank(g, 'A', 'segredo1', 'segredo1').ok).toBe(false);
    expect(registerBank(g, 'Carlos', '123', '123').ok).toBe(false);
    expect(registerBank(g, 'Carlos', 'segredo1', 'segredo2').ok).toBe(false);
    const b = withBank(g);
    expect(hasBank(b)).toBe(true);
    expect(JSON.stringify(b.bank)).not.toContain('segredo1');
    expect(checkPassword(b, 'segredo1')).toBe(true);
    expect(checkPassword(b, 'errada')).toBe(false);
    expect(registerBank(b, 'Outro', 'segredo9', 'segredo9').ok).toBe(false);
  });
  it('o saldo é o dinheiro pessoal do treinador, não o caixa do clube', () => {
    const g = withBank(makeCareer('csa'), 123_456);
    expect(balanceOf(g)).toBe(123_456);
    expect(balanceOf(g)).not.toBe(g.budgets.csa);
  });
  it('Pix: precisa da chave certa, da senha e de saldo; desconta, gera comprovante e aplica o efeito', () => {
    let g = withBank();
    const { state, charge } = createCharge(g, { merchant: 'Cassino', description: 'Depósito', amount: 30_000, purpose: { type: 'teste-credito' } });
    g = state;
    let credited = 0;
    registerPurpose('teste-credito', (s, amount) => { credited += amount; return s; });
    expect(quotePix(g, '').ok).toBe(false);
    expect(quotePix(g, 'chave-errada').ok).toBe(false);
    expect(quotePix(g, myPixKey(g)).ok).toBe(false);
    expect(quotePix(g, charge.key)).toMatchObject({ ok: true });
    expect(payPix(g, charge.key, 'senha errada').ok).toBe(false);
    expect(balanceOf(g)).toBe(500_000);
    const poor = { ...g, coachMoney: 1_000 };
    expect(payPix(poor, charge.key, 'segredo1')).toMatchObject({ ok: false, error: 'Saldo insuficiente.' });
    const r = payPix(g, charge.key, 'segredo1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(balanceOf(r.state)).toBe(470_000);
    expect(credited).toBe(30_000);
    expect(r.tx.amount).toBe(-30_000);
    expect(r.state.bank!.txs[0].id).toBe(r.tx.id);
    expect(quotePix(r.state, charge.key)).toMatchObject({ ok: false, error: 'Essa cobrança já foi paga.' });
    expect(payPix(r.state, charge.key, 'segredo1').ok).toBe(false); // sem pagar duas vezes
  });
  it('ajudar o clube: Pix do bolso para o caixa', () => {
    const g = withBank();
    expect(clubCharge(g, 5).ok).toBe(false);
    const c = clubCharge(g, 100_000);
    if (!c.ok) throw new Error(c.error);
    const r = payPix(c.state, c.charge.key, 'segredo1');
    if (!r.ok) throw new Error(r.error);
    expect(r.state.budgets.csa).toBe(g.budgets.csa + 100_000);
    expect(balanceOf(r.state)).toBe(400_000);
  });
  it('não paga cobrança antes de abrir conta', () => {
    const g = makeCareer();
    const { state, charge } = createCharge(g, { merchant: 'X', description: 'Y', amount: 10, purpose: { type: 'club' } });
    expect(hasBank(state)).toBe(false);
    expect(quotePix(state, charge.key)).toMatchObject({ ok: false });
    const r = registerBank(state, 'Carlos', 'segredo1', 'segredo1');
    expect(r.ok && r.state.bank!.charges.length).toBe(1); // cobrança feita antes continua valendo
  });
  it('débito automático: o boleto é pago sozinho no dia do vencimento (se há saldo); sem saldo, segue em aberto e vence com multa', () => {
    let g = withBank();
    const cash = balanceOf(g);
    g = createBoleto(g, { merchant: 'Concessionária', description: 'Parcela 1/12', amount: 10_000, dueInRounds: 3, purpose: { type: 'teste-boleto' } });
    const due = g.bank!.boletos[0];
    g = tickBoletos({ ...g, round: g.round + 1 });
    expect(openBoletos(g).length).toBe(1); // ainda não venceu: nada sai da conta
    g = tickBoletos({ ...g, round: due.dueRound });
    expect(openBoletos(g).length).toBe(0); expect(balanceOf(g)).toBe(cash - 10_000);
    expect(g.bank!.txs[0].title).toMatch(/Débito automático/);
    expect(phoneOf(g).notifications.some((n) => /Débito automático: boleto/.test(n.text))).toBe(true);
    // sem saldo: recusa uma vez e o boleto vence com multa
    let h = createBoleto({ ...withBank(), coachMoney: 100 }, { merchant: 'X', description: 'y', amount: 10_000, dueInRounds: 1, purpose: { type: 'teste-boleto' } });
    const d2 = h.bank!.boletos[0];
    h = tickBoletos({ ...h, round: d2.dueRound });
    expect(openBoletos(h).length).toBe(1);
    expect(phoneOf(h).notifications.some((n) => /Débito automático recusado/.test(n.text))).toBe(true);
    h = tickBoletos({ ...h, round: d2.dueRound + 1 });
    expect(h.bank!.boletos[0].status).toBe('late');
  });
  it('boletos: notificam perto do vencimento, ganham multa de 5% quando vencidos e são pagos com senha', () => {
    let g = setAutoDebit(withBank(), false); // (com o débito automático ligado o boleto é pago sozinho no vencimento)
    g = createBoleto(g, { merchant: 'Concessionária', description: 'Parcela 1/12', amount: 10_000, dueInRounds: 3, purpose: { type: 'teste-boleto' } });
    expect(phoneOf(g).notifications[0].app).toBe('banco');
    expect(openBoletos(g).length).toBe(1);
    const due = g.bank!.boletos[0];
    expect(due.dueRound).toBe(g.round + 3);
    g = tickBoletos({ ...g, round: g.round + 1 });
    expect(g.bank!.boletos[0].notified).toBe(true);
    const n = phoneOf(g).notifications.length;
    g = tickBoletos({ ...g, round: g.round }); // não repete o aviso
    expect(phoneOf(g).notifications.length).toBe(n);
    g = tickBoletos({ ...g, round: due.dueRound + 1 });
    const late = g.bank!.boletos[0];
    expect(late.status).toBe('late');
    expect(late.fine).toBe(500);
    expect(boletoTotal(late)).toBe(10_500);
    expect(payBoleto(g, late.id, 'x').ok).toBe(false);
    const r = payBoleto(g, late.id, 'segredo1');
    if (!r.ok) throw new Error(r.error);
    expect(balanceOf(r.state)).toBe(500_000 - 10_500);
    expect(openBoletos(r.state).length).toBe(0);
    expect(payBoleto(r.state, late.id, 'segredo1').ok).toBe(false);
  });
  it('recebimentos entram no saldo e no extrato', () => {
    const g = creditAccount(withBank(), 'Prêmio', 'Aposta', 60_000);
    expect(balanceOf(g)).toBe(560_000);
    expect(g.bank!.txs[0]).toMatchObject({ kind: 'income', amount: 60_000 });
  });
});
