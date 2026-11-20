import { resetHooks } from '../engine/hooks';
import { extrasOpen } from './entitlement';
import { ensurePack } from './pack';

/* =====================================================================
   Carregador do pacote Premium (2ª temporada em diante).
   Hoje o pacote é um pedaço (chunk) do próprio app, carregado só quando o jogador chega ao fim da 1ª temporada.
   Na versão da loja, é aqui que entra a verificação da compra (Play Billing) e o download do pacote (Play Asset Delivery):
   sem a compra, `loadSeasonPack()` recusa e o jogo mostra a tela do Premium.
   ===================================================================== */

export type SeasonPack = typeof import('./season');
let pack: SeasonPack | null = null;

/** O pacote já foi carregado nesta sessão? */
export const seasonPackReady = (): boolean => pack !== null;

/** Carrega (uma vez) o pacote da virada de temporada e do resto do jogo depois da 1ª temporada. */
export async function loadSeasonPack(): Promise<SeasonPack> {
  if (!pack) pack = await import('./season'); // (o jogador do grátis continua jogando depois da 1ª temporada, só com a liga do clube; quem limita é a virada de temporada)
  return pack;
}

/**
 * Portão do Premium. Hoje sempre aberto (nenhuma trava ainda): a etapa de cobrança troca esta função pela verificação da Play Billing.
 * Tudo que é Premium passa por aqui: se o portão fecha, o jogo cai para a versão grátis (partida em 2D, sem virada de temporada).
 */
let gate: () => Promise<boolean> = async () => extrasOpen(); // Premium, ou ainda na temporada grátis
export const setPremiumGate = (fn: () => Promise<boolean>): void => { gate = fn; };
export const premiumAllowed = (): Promise<boolean> => gate();

let extrasInstalled = false;
/** Carrega (uma vez) o pacote dos extras (mundo, copas especiais, Super Mundial) e ativa os recursos no jogo. Cada chamada confere o portão de novo. */
export async function loadExtras(): Promise<void> {
  if (!(await gate())) { resetHooks(); extrasInstalled = false; throw new Error('premium-required'); }
  if (!extrasInstalled) { await ensurePack(); (await import('./extras')).installExtras(); extrasInstalled = true; }
}

/** Para telas Premium carregadas sob demanda (`lazy`): confere o portão e baixa o pacote Premium (build da loja) antes de importar o arquivo. */
export const premiumChunk = <T>(load: () => Promise<T>) => async (): Promise<T> => {
  if (!(await gate())) throw new Error('premium-required');
  await ensurePack();
  return load();
};
