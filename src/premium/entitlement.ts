import type { GameState } from '../engine/types';

/* =====================================================================
   Quem tem acesso a quê.
   - Premium: tudo liberado, sem anúncios.
   - Grátis: tudo liberado na 1ª temporada da carreira (FREE_SEASONS); depois, só a liga do clube (sem as outras divisões, as copas, os
     continentais, o Mundo, as copas especiais e o Super Mundial). O save nunca é apagado e o jogo continua.
   Até a cobrança existir (etapa 4), todos contam como Premium: o modo grátis só aparece no "Teste do modo grátis" (Opções).
   ===================================================================== */

/** Temporadas grátis com tudo liberado. */
export const FREE_SEASONS = 1;
const KEY = 'vr-free-preview';

let premium = true;                       // enquanto não há cobrança, todos são Premium
let preview = false;                      // teste do dono: finge ser um jogador do grátis
try { preview = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch { /* sem armazenamento */ }

export const setPremium = (v: boolean): void => { premium = v; };
export const isPremium = (): boolean => premium && !preview;
export const isFreePreview = (): boolean => preview;
export function setFreePreview(on: boolean): void { preview = on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sem armazenamento */ } }

/** Mods e pacotes de elencos/escudos fazem parte do Premium. */
export const modsAllowed = (): boolean => isPremium();

/** Quantas temporadas da carreira já terminaram (a 1ª é a grátis). */
export const seasonsPlayed = (g: Pick<GameState, 'season' | 'freeStart'>): number => Math.max(0, g.season - (g.freeStart ?? g.season));
/** A carreira ainda está na temporada grátis (tudo liberado)? */
export const inTrial = (g: Pick<GameState, 'season' | 'freeStart'>): boolean => seasonsPlayed(g) < FREE_SEASONS;
/** O jogador do grátis já passou da temporada grátis: só a liga do clube? */
export const freeLimited = (g: Pick<GameState, 'season' | 'freeStart'>): boolean => !isPremium() && !inTrial(g);
/** Esta temporada (a que começa) será limitada? Usada na virada de temporada. */
export const limitedAt = (g: Pick<GameState, 'freeStart'>, season: number): boolean => !isPremium() && season - (g.freeStart ?? season) >= FREE_SEASONS;

/** Carreira em andamento (para o portão dos extras saber se está na temporada grátis). */
let trial = true;
export const setActiveGame = (g: Pick<GameState, 'season' | 'freeStart'> | null): void => { trial = g ? inTrial(g) : true; };
export const extrasOpen = (): boolean => isPremium() || trial;
