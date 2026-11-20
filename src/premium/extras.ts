import { installHooks } from '../engine/hooks';
import { foreignSalesTick } from '../engine/forsales';
import { createRegionals, playRegionalStep, regionalAfterLeagueRound, regionalMatchDue, regionalUserMatch, regionalStepName, REGIONALS } from '../engine/regional';
import { playSuperStep, superAfterLeagueRound, superMatchDue, superStepName, superUserMatch } from '../engine/supermundial';
import { ensureWorld, worldStartSeason, worldTick } from '../engine/wleagues';
import type { GameState, RegionalKey } from '../engine/types';

/* =====================================================================
   PACOTE DOS EXTRAS (Premium): ligas do mundo, vendas ao exterior, Copa do Nordeste, Copa Verde e Super Mundial.
   Carregado sob demanda pelo carregador (loader.ts); ao carregar, troca os ganchos vazios do jogo base pelos verdadeiros.
   ===================================================================== */

export function installExtras(): void {
  installHooks({
    ensureWorld, worldTick, worldStartSeason, foreignSalesTick,
    createRegionals, regionalAfterLeagueRound, playRegionalStep, regionalMatchDue, regionalUserMatch,
    regionalLabel: (g: GameState, key: RegionalKey) => { const r = g.regionais?.[key]; return r ? `${REGIONALS[key].icon} ${r.name} · ${regionalStepName(key, r)}` : ''; },
    superAfterLeagueRound, playSuperStep, superMatchDue, superUserMatch, superStepName,
  });
}
