import { chipNumberOf, chipOf, notifyPhone, phoneOf } from './phone';
import { makeRng } from './rng';
import type { GameState } from './types';

/** Apps que pedem uma conta: o número do chip recebe um código por SMS para liberar o app. */
export const ACCOUNT_APPS = ['banco', 'linstagra', 'tikiteko', 'cassino', 'concessionaria', 'corretor', 'internetchip'];
const isLegacy = (g: Pick<GameState, 'phone'>) => { const p = phoneOf(g); return !p.model && !p.noPhone; }; // saves de antes da loja: contas já existiam
export const isVerified = (g: Pick<GameState, 'phone'>, app: string) => !ACCOUNT_APPS.includes(app) || isLegacy(g) || (phoneOf(g).verified ?? []).includes(app);
export const needsAccount = (g: Pick<GameState, 'phone'>, app: string) => !isVerified(g, app);
export const smsOf = (g: Pick<GameState, 'phone'>) => phoneOf(g).sms ?? [];

type R = { ok: true; state: GameState } | { ok: false; error: string };
const digits = (v: string) => v.replace(/\D/g, '');

/** Envia o código de confirmação por SMS para o número informado. Só chega se for o número de um chip ativo do seu celular. */
export function requestCode(g: GameState, app: string, number: string): R {
  if (!ACCOUNT_APPS.includes(app)) return { ok: false, error: 'Este app não pede conta.' };
  if (!chipNumberOf(g)) return { ok: false, error: 'Você precisa de um chip para receber o código. Compre um na Mega-zona Luiz.' };
  if (!chipOf(g)) return { ok: false, error: 'Seu chip está bloqueado e não recebe SMS. Compre um novo na Mega-zona Luiz.' };
  if (digits(number).length < 10) return { ok: false, error: 'Digite o número completo com DDD.' };
  if (digits(number) !== digits(chipNumberOf(g)!)) return { ok: false, error: 'Esse não é o número do seu chip: o código não vai chegar.' };
  const p = phoneOf(g);
  const rng = makeRng(g.seed * 331 + g.season * 17 + g.round * 5 + (p.sms?.length ?? 0) * 101 + app.length);
  const code = String(100000 + Math.floor(rng() * 900000));
  const name = app === 'internetchip' ? 'Internet de Chip' : app.charAt(0).toUpperCase() + app.slice(1);
  const sms = { id: `S${(p.sms?.length ?? 0) + 1}-${g.season}-${g.round}`, text: `${name}: seu código de confirmação é ${code}. Não compartilhe.`, code, season: g.season, round: g.round };
  const s: GameState = { ...g, phone: { ...p, pendingCode: { app, code, number: chipNumberOf(g)! }, sms: [sms, ...(p.sms ?? [])].slice(0, 20) } };
  return { ok: true, state: notifyPhone(s, 'sms', `SMS: ${sms.text}`) };
}

/** Confirma o código recebido e libera o app. */
export function confirmCode(g: GameState, app: string, code: string): R {
  const p = phoneOf(g);
  if (!p.pendingCode || p.pendingCode.app !== app) return { ok: false, error: 'Peça um código primeiro.' };
  if (digits(code) !== p.pendingCode.code) return { ok: false, error: 'Código incorreto.' };
  const verified = [...(p.verified ?? []), app];
  return { ok: true, state: { ...g, phone: { ...p, verified, pendingCode: undefined } } };
}
