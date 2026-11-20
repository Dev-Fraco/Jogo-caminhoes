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
  if (!pack) { if (!(await gate())) throw new Error('premium-required'); pack = await import('./season'); }
  return pack;
}

/**
 * Portão do Premium. Hoje sempre aberto (nenhuma trava ainda): a etapa de cobrança troca esta função pela verificação da Play Billing.
 * Tudo que é Premium passa por aqui: se o portão fecha, o jogo cai para a versão grátis (partida em 2D, sem virada de temporada).
 */
let gate: () => Promise<boolean> = async () => true;
export const setPremiumGate = (fn: () => Promise<boolean>): void => { gate = fn; };
export const premiumAllowed = (): Promise<boolean> => gate();

/** Carrega o desenhista 3D da partida (three.js, campo, estádio, torcida, cerimônia). Faz parte do pacote Premium. */
export async function loadScene3D(): Promise<typeof import('../ui/pitch3d/three/scene')> {
  if (!(await gate())) throw new Error('premium-required');
  return import('../ui/pitch3d/three/scene');
}
