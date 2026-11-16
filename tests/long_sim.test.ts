import { describe, expect, it } from 'vitest';
import { auditUniverse } from '../src/engine/aiaudit';
import { simulateToEnd, startNextSeason } from '../src/engine/game';
import { loadGame, saveGame } from '../src/engine/save';
import { newObserverWorld } from '../src/engine/sim';
import { managed } from '../src/engine/lookup';
import type { GameState } from '../src/engine/types';
import { auditCompetitions, auditSeasonEnd } from './audit_lib';

function useStorage() {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0 } as unknown as Storage;
}

describe('ETAPA 9 — Teste E: 8 temporadas seguidas, sem jogador, com salvar e carregar a cada virada', () => {
  it('campeonatos, mercado, treinadores, títulos, promoções, históricos e saves seguem funcionando sem erros acumulados', () => {
    useStorage();
    let g: GameState = newObserverWorld('BR' as never, 'brasileirao', 2026);
    const problems: string[] = [];
    const champs = new Set<string>(), cupChamps = new Set<string>();
    let moved = 0, coachChanges = 0, dealsTotal = 0, promoted = 0, relegated = 0;
    const perSeasonDeals: number[] = [], seenDeals = new Set<string>();
    for (let t = 0; t < 8; t++) {
      const coachesBefore = { ...(g.clubCoach ?? {}) };
      const e = simulateToEnd(g);
      problems.push(...auditSeasonEnd(e).map((x) => `T${e.season}: ${x}`), ...auditCompetitions(e, 'fim').map((x) => `T${e.season}: ${x}`));
      g = startNextSeason(e);
      // histórico registrado
      if (g.history.length !== t + 1) problems.push(`T${e.season}: histórico com ${g.history.length} temporadas (esperado ${t + 1})`);
      const sum = g.history[g.history.length - 1];
      for (const d of sum.divisions) { champs.add(d.championId); promoted += d.promoted.length; relegated += d.relegated.length; }
      if (sum.cupChampionId) cupChamps.add(sum.cupChampionId);
      if (!sum.cupChampionId) problems.push(`T${e.season}: copa sem campeão no histórico`);
      // mercado e treinadores movimentados
      const fresh = (g.dealLog ?? []).filter((r) => r.state === 'concluida' && !seenDeals.has(r.id));
      for (const r of fresh) seenDeals.add(r.id);
      perSeasonDeals.push(fresh.length); dealsTotal += fresh.length;
      coachChanges += Object.keys(coachesBefore).filter((id) => g.clubCoach?.[id] !== coachesBefore[id]).length;
      for (const id of Object.keys(g.teams)) if (!managed(g, id)) { if (!Number.isFinite(g.budgets[id] ?? 0)) problems.push(`T${e.season}: caixa inválido ${id}`); if (g.teams[id].players.length < 16 || g.teams[id].players.length > 36) problems.push(`T${e.season}: ${id} com ${g.teams[id].players.length} jogadores`); }
      problems.push(...auditUniverse(g).map((x) => `T${g.season}: ${x}`));
      // salvar e carregar (caminho real, comprimido): idêntico
      saveGame(g);
      const l = loadGame();
      if (!l) problems.push(`T${g.season}: save não carregou`);
      else if (JSON.stringify(l) !== JSON.stringify(g)) problems.push(`T${g.season}: carregar mudou o estado`);
      moved += 1;
    }
    expect(problems).toEqual([]);
    expect(champs.size).toBeGreaterThan(8);             // vários campeões nas divisões ao longo dos anos
    expect(cupChamps.size).toBeGreaterThan(3);           // a copa não é sempre do mesmo clube
    expect(promoted).toBeGreaterThan(50); expect(relegated).toBeGreaterThan(50);
    expect(coachChanges).toBeGreaterThan(30);            // treinadores continuam mudando de clube
    expect(perSeasonDeals, perSeasonDeals.join()).not.toContain(0);
    expect(perSeasonDeals.every((n) => n > 20), perSeasonDeals.join()).toBe(true); // o mercado nunca para
    expect(moved).toBe(8);
  }, 1_800_000);
});
