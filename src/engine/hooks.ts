import type { Rng } from './rng';
import type { GameState, MatchResult, RegionalKey, SuperState } from './types';

/* =====================================================================
   Ganchos dos recursos EXTRAS (pacote Premium): ligas do mundo, vendas ao exterior, Copa do Nordeste, Copa Verde e Super Mundial.
   O jogo base só conhece esta tabela, com versões "vazias" (não fazem nada). O pacote Premium (src/premium/extras.ts) é carregado sob demanda e
   troca as versões vazias pelas verdadeiras. Sem o pacote (jogo grátis depois da 1ª temporada), esses recursos simplesmente não existem.
   ===================================================================== */

type Step = { state: GameState; results: MatchResult[] };
type Match = { homeId: string; awayId: string } | undefined;
export interface ExtrasHooks {
  installed: boolean;
  ensureWorld(g: GameState): GameState;
  worldTick(g: GameState): GameState;
  worldStartSeason(g: GameState): GameState;
  foreignSalesTick(g: GameState, rng: Rng): GameState;
  createRegionals(g: GameState, prev?: GameState): GameState;
  regionalAfterLeagueRound(g: GameState): GameState;
  playRegionalStep(g: GameState, key: RegionalKey): Step;
  regionalMatchDue(g: GameState, key: RegionalKey): boolean;
  regionalUserMatch(g: GameState, key: RegionalKey): Match;
  regionalLabel(g: GameState, key: RegionalKey): string;
  superAfterLeagueRound(g: GameState): GameState;
  playSuperStep(g: GameState): Step;
  superMatchDue(g: GameState): boolean;
  superUserMatch(g: GameState): Match;
  superStepName(sm: SuperState): string;
}

const same = <T,>(g: T): T => g;
const none: Step = { state: undefined as never, results: [] };
const DEFAULTS: ExtrasHooks = {
  installed: false,
  ensureWorld: same, worldTick: same, worldStartSeason: same,
  foreignSalesTick: (g) => g,
  createRegionals: (g) => ({ ...g, regionais: undefined }),
  regionalAfterLeagueRound: same,
  playRegionalStep: (g) => ({ ...none, state: { ...g, regionais: undefined } }), // sem o pacote as copas especiais somem (e a temporada não trava)
  regionalMatchDue: () => false, regionalUserMatch: () => undefined, regionalLabel: () => '',
  superAfterLeagueRound: same,
  playSuperStep: (g) => ({ ...none, state: { ...g, superMundial: undefined } }),
  superMatchDue: () => false, superUserMatch: () => undefined, superStepName: () => '',
};

/** Os ganchos em vigor. Use sempre `hooks.x(...)` (nunca guarde a função), pois o pacote os troca quando carrega. */
export const hooks: ExtrasHooks = { ...DEFAULTS };
export const installHooks = (h: Partial<ExtrasHooks>): void => { Object.assign(hooks, h, { installed: true }); };
/** Volta ao jogo sem os extras (jogo grátis; também usado nos testes). */
export const resetHooks = (): void => { Object.assign(hooks, DEFAULTS); };

/** As duas copas regionais (lista fixa e leve; o conteúdo delas vem do pacote). */
export const REGIONAL_KEYS: RegionalKey[] = ['nordeste', 'verde', 'sulsudeste'];
export const regionalDueAny = (g: GameState): boolean => REGIONAL_KEYS.some((k) => g.regionais?.[k]?.due);

/** Propostas de clubes do exterior abertas agora (só leitura do estado; quem aceita/recusa é o pacote). */
export const openForeignSales = (g: GameState) => (g.foreignSales ?? []).filter((o) => o.season === g.season && o.expires >= g.round);
