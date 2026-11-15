import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { balanceOf, payPix, registerBank } from '../src/engine/bank';
import { buyFibra, fibraBill, fibraTick, OUTAGE_CHANCE, setupWifi } from '../src/engine/netfibra';
import { connectHome, connectWifi, downloadMs, FIBRA_ENTRY, FIBRA_MONTHLY, FREE_WIFI, fibraActive, fibraDown, fibraReady, netState, openDelayMs, phoneOf, PLAN_ROUNDS, toggleConn, updatePhoneSettings } from '../src/engine/phone';
import { newCareer } from '../src/engine/game';
import type { GameState } from '../src/engine/types';

const mk = (): GameState => {
  let g = newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 3);
  const r = registerBank(g, 'A B', 'segredo1', 'segredo1'); if (r.ok) g = r.state;
  return { ...g, coachMoney: 1_000_000 };
};
const pay = (g: GameState) => { const b = buyFibra(g); if (!b.ok) throw new Error(b.error); const r = payPix(b.state, b.charge.key, 'segredo1'); if (!r.ok) throw new Error(r.error); return r.state; };
const set = (g: GameState) => { const r = setupWifi(g, 'Casa do Mister', 'senha1234'); if (!r.ok) throw new Error(r.error); return r.state; };
const longFibra = (g: GameState): GameState => ({ ...g, phone: { ...phoneOf(g), fibra: { ...phoneOf(g).fibra!, until: g.season * 200 + 5_000 } } });
const withPlan = (g: GameState) => ({ ...g, phone: { ...phoneOf(g), plan: { until: g.season * 200 + g.round + 99 }, chip: 'morto', chipNumber: '(11) 91111-2222', chipUntil: g.season * 200 + g.round + 99 } });

describe('NetFibra', () => {
  it('1ª contratação: entrada de R$ 50 mil + mensalidade de R$ 100 mil, por Pix; renovação só a mensalidade', () => {
    let g = mk();
    expect(fibraBill(g)).toBe(FIBRA_ENTRY + FIBRA_MONTHLY);
    const cash = balanceOf(g);
    g = pay(g);
    expect(balanceOf(g)).toBe(cash - 150_000);
    expect(fibraActive(g)).toBe(true);
    expect(phoneOf(g).fibra!.until - (g.season * 200 + g.round)).toBe(PLAN_ROUNDS);
    expect(fibraBill(g)).toBe(FIBRA_MONTHLY);
    const c2 = balanceOf(g);
    g = pay(g);
    expect(balanceOf(g)).toBe(c2 - 100_000);
    expect(phoneOf(g).fibra!.until - (g.season * 200 + g.round)).toBe(PLAN_ROUNDS * 2);
  });
  it('sem conta no banco não contrata', () => {
    expect(buyFibra({ ...mk(), bank: undefined }).ok).toBe(false);
  });
  it('pede nome e senha da rede, valida e conecta o celular nela', () => {
    let g = pay(mk());
    expect(setupWifi(mk(), 'Casa', 'senha1234').ok).toBe(false); // sem contratar
    expect(setupWifi(g, 'ab', 'senha1234').ok).toBe(false);
    expect(setupWifi(g, 'Casa do Mister', '123').ok).toBe(false);
    g = set(g);
    expect(phoneOf(g).fibra).toMatchObject({ ssid: 'Casa do Mister', password: 'senha1234' });
    expect(phoneOf(g).settings.wifiNet).toBe('Casa do Mister');
    expect(netState(g)).toMatchObject({ kind: 'fibra', speed: 'fast' });
  });
  it('é 2x mais rápida que o 5G (abrir e baixar)', () => {
    let g = withPlan(toggleConn(mk(), 'mobileData'));
    const fast5 = { open: openDelayMs(g), dl: downloadMs(g) };
    expect(netState(g).kind).toBe('5g');
    g = toggleConn(set(pay(g)), 'wifi'); // set() já ligou o wifi; toggle desliga, liga de novo abaixo
    g = connectHome(g, 'senha1234').ok ? (connectHome(g, 'senha1234') as { state: GameState }).state : g;
    expect(netState(g).kind).toBe('fibra');
    expect(openDelayMs(g) * 2).toBeLessThanOrEqual(fast5.open + 1);
    expect(downloadMs(g) * 2).toBeLessThanOrEqual(fast5.dl + 1);
  });
  it('conectar na rede de casa exige a senha certa; rede grátis continua ruim', () => {
    let g = set(pay(mk()));
    g = updatePhoneSettings(g, { wifiNet: undefined });
    expect(connectHome(g, 'errada')).toMatchObject({ ok: false });
    const ok = connectHome(g, 'senha1234'); if (!ok.ok) throw new Error();
    expect(netState(ok.state).kind).toBe('fibra');
    expect(netState(connectWifi(g, FREE_WIFI[0].name)).kind).toBe('wifi');
  });
  it('de vez em quando a rede cai e o celular cai para o 5G (ou fica sem internet); depois volta', () => {
    let g = longFibra(withPlan(toggleConn(set(pay(mk())), 'mobileData')));
    expect(netState(g).kind).toBe('fibra'); // com os dois ligados, a NetFibra (mais rápida) é a usada
    let dropped: GameState | undefined;
    for (let r = 1; r < 200 && !dropped; r++) {
      const t = fibraTick({ ...g, round: r });
      if (fibraDown({ ...t, round: r })) dropped = { ...t, round: r };
    }
    expect(dropped).toBeTruthy();
    const d = dropped!;
    expect(phoneOf(d).notifications[0].text).toMatch(/caiu/);
    expect(fibraReady(d)).toBe(false);
    // sem dados móveis: fica sem internet; com 5G: usa o 5G
    const only = updatePhoneSettings(d, { mobileData: false });
    expect(netState(only)).toMatchObject({ kind: 'none', speed: 'none' });
    expect(netState(only).label).toMatch(/sem internet/i);
    expect(netState(d).kind).toBe('5g');
    // volta sozinha
    const back = fibraTick({ ...d, round: d.round + 3 });
    expect(fibraDown(back)).toBe(false);
    expect(phoneOf(back).notifications[0].text).toMatch(/voltou/);
  });
  it('quedas acontecem com frequência razoável (cerca de 1 em 5 rodadas)', () => {
    const g = longFibra(set(pay(mk())));
    let n = 0, trials = 0;
    for (let r = 1; r <= 300; r += 3) { trials++; if (fibraDown(fibraTick({ ...g, round: r % 38 + 1, season: g.season + Math.floor(r / 40) }))) n++; }
    expect(n / trials).toBeGreaterThan(OUTAGE_CHANCE / 3);
    expect(n / trials).toBeLessThan(OUTAGE_CHANCE * 2.5);
  });
  it('mensalidade vencida deixa o Wi-Fi sem internet e avisa', () => {
    let g = set(pay(mk()));
    g = { ...g, round: g.round + PLAN_ROUNDS + 1 };
    expect(fibraActive(g)).toBe(false);
    expect(netState(g).kind).toBe('none');
    const t = fibraTick(g);
    expect(phoneOf(t).notifications[0].text).toMatch(/venceu/);
    expect(fibraTick(t)).toEqual(t);
  });
});
