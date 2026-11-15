import { brl, createCharge, registerPurpose } from './bank';
import { FIBRA_ENTRY, FIBRA_MONTHLY, fibraLeft, notifyPhone, phoneOf, PLAN_ROUNDS, updatePhoneSettings } from './phone';
import { makeRng } from './rng';
import type { GameState, PixCharge } from './types';

const ABS = 200;
const nowAbs = (g: Pick<GameState, 'season' | 'round'>) => g.season * ABS + g.round;

/** Valor da próxima cobrança: a 1ª vez soma a entrada (instalação) à mensalidade. */
export const fibraBill = (g: GameState) => FIBRA_MONTHLY + (phoneOf(g).fibra?.entryPaid ? 0 : FIBRA_ENTRY);

/** Cobrança Pix: entrada de R$ 50.000 (só na contratação) + mensalidade de R$ 100.000. */
export function buyFibra(g: GameState): { ok: true; state: GameState; charge: PixCharge } | { ok: false; error: string } {
  if (!g.bank?.passHash) return { ok: false, error: 'Abra sua conta no app Banco para pagar a NetFibra.' };
  const first = !phoneOf(g).fibra?.entryPaid;
  const { state, charge } = createCharge(g, {
    merchant: 'NetFibra', description: first ? `Contratação: entrada ${brl(FIBRA_ENTRY)} + 1ª mensalidade ${brl(FIBRA_MONTHLY)}` : `Mensalidade (${PLAN_ROUNDS} rodadas)`,
    amount: fibraBill(g), purpose: { type: 'netfibra' },
  });
  return { ok: true, state, charge };
}

registerPurpose('netfibra', (g) => {
  const p = phoneOf(g);
  const f = p.fibra;
  const until = Math.max(f?.until ?? 0, nowAbs(g)) + PLAN_ROUNDS;
  const s: GameState = { ...g, phone: { ...p, fibra: { ...(f ?? {}), entryPaid: true, until, warned: false, expiredNotified: false, down: undefined } } };
  return notifyPhone(s, 'netfibra', f?.ssid ? `NetFibra renovada por ${PLAN_ROUNDS} rodadas.` : 'NetFibra contratada! Abra o app para escolher o nome e a senha da sua rede.');
});

/** Nome e senha da rede (pedidos logo depois de contratar). Conecta o celular nela. */
export function setupWifi(g: GameState, ssid: string, password: string): { ok: true; state: GameState } | { ok: false; error: string } {
  const f = phoneOf(g).fibra;
  if (!f?.entryPaid) return { ok: false, error: 'Contrate o plano primeiro.' };
  const name = ssid.trim();
  if (name.length < 3 || name.length > 24) return { ok: false, error: 'O nome da rede deve ter de 3 a 24 caracteres.' };
  if (password.length < 8) return { ok: false, error: 'A senha deve ter pelo menos 8 caracteres.' };
  let s: GameState = { ...g, phone: { ...phoneOf(g), fibra: { ...f, ssid: name, password } } };
  s = updatePhoneSettings(s, { airplane: false, wifi: true, wifiNet: name });
  return { ok: true, state: notifyPhone(s, 'netfibra', `Rede "${name}" criada e conectada.`) };
}

/** Chance de a NetFibra cair a cada rodada (a conexão volta sozinha em 1 a 2 rodadas). */
export const OUTAGE_CHANCE = 0.2;

/** A cada rodada: a rede cai de vez em quando (e volta), e avisa quando a mensalidade está para vencer ou venceu. */
export function fibraTick(g: GameState): GameState {
  const f = phoneOf(g).fibra;
  if (!f?.ssid || g.phone?.noPhone) return g;
  const now = nowAbs(g);
  const left = fibraLeft(g);
  let s = g;
  const set = (patch: Partial<NonNullable<typeof f>>) => { s = { ...s, phone: { ...phoneOf(s), fibra: { ...phoneOf(s).fibra!, ...patch } } }; };
  if (left === 0) {
    if (!f.expiredNotified) { set({ expiredNotified: true, down: undefined }); s = notifyPhone(s, 'netfibra', 'A mensalidade da NetFibra venceu: o Wi-Fi ficou sem internet. Renove no app.'); }
    return s;
  }
  if (f.down !== undefined && f.down > 0 && f.down <= now) { set({ down: undefined }); return notifyPhone(s, 'netfibra', 'A NetFibra voltou ao normal.'); }
  if (left === 1 && !f.warned) { set({ warned: true }); s = notifyPhone(s, 'netfibra', 'A mensalidade da NetFibra vence na próxima rodada.'); }
  if (!(f.down && f.down > now)) {
    const rng = makeRng(g.seed * 83 + g.season * 29 + g.round * 7 + 5);
    if (rng() < OUTAGE_CHANCE) {
      const len = 1 + Math.floor(rng() * 2);
      set({ down: now + len });
      s = notifyPhone(s, 'netfibra', `A NetFibra caiu! Use os dados móveis (5G) por ${len === 1 ? 'uma rodada' : 'duas rodadas'}.`);
    }
  }
  return s;
}
