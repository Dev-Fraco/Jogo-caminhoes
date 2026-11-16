import { ensureAiCoaches } from './aicoaches';
import { ensureAiContracts } from './aicontracts';
import { freezeGoals } from './aigoals';
import { ensureAiYouth } from './aiyouth';
import { ensureMarketState, ensureYouthLoanState } from './aistate';
import { computeTable } from './table';
import { makeRng } from './rng';
import { SAVE_SCHEMA } from './schema';
import { migrateSave, withSpotsAll } from './save';
import type { GameState, Player } from './types';

/* =====================================================================
   Migração de saves. Cada atualização do jogo ganha um número de "schema". Um save mais antigo passa por passos pequenos, cada um:
   - só CRIA o que falta (nunca troca um dado que já existe por um valor padrão);
   - é idempotente (rodar de novo não muda nada);
   - é isolado: se um passo falhar, os outros seguem e o save continua abrindo (o passo é tentado de novo na próxima abertura).
   Depois de migrar, uma conferência compara os dados que NÃO podem mudar (histórico, resultados, caixas, elencos, contratos, transferências,
   classificações, saldo do banco...). Se algo tiver mudado, a migração é descartada e o save original continua valendo.
   ===================================================================== */

export { SAVE_SCHEMA };
export const SCHEMA_NOTE: Record<number, string> = {
  1: 'versão original', 2: 'IA dos clubes (contratos, treinadores, base, objetivos)', 3: 'mercado avançado (propostas, janelas de transferência)',
  4: 'potencial dos jovens, empréstimos e histórico de contratos', 5: 'estado atual do jogo',
};

/** Que geração de save é esta? Usa o registro (`schema`) quando existe; senão deduz pelos campos que cada geração introduziu. */
export function detectSchema(g: GameState): number {
  if (typeof g.schema === 'number' && g.schema >= 1) return g.schema;
  const anyPot = Object.values(g.teams).some((t) => t.players.some((p) => p.pot !== undefined));
  if (g.apps || g.loanLog || g.contractLog || g.renewTalks || anyPot) return 4;
  if (g.windowState || g.deals || g.dealLog || g.debts || g.clauses) return 3;
  if (g.aiCoaches || g.aiGoals || g.aiYouth || g.freeAgents || g.aiLoans) return 2;
  return 1;
}

export interface MigrationStep { id: string; label: string; run: (g: GameState) => GameState }
export interface MigrationReport {
  migrated: boolean; fromSchema: number; toSchema: number;
  /** Passos que mudaram alguma coisa. */
  applied: { id: string; label: string }[];
  /** Passos que falharam (o save abre mesmo assim e eles são tentados de novo na próxima abertura). */
  failed: { id: string; error: string }[];
  /** Conferência dos dados protegidos: vazio = nada foi alterado indevidamente. */
  violations: string[];
  warnings: string[];
  /** A migração foi descartada por violar a conferência (o save original foi mantido). */
  rejected: boolean;
}

const rngFor = (s: GameState, tag: number) => makeRng(s.seed * 67 + s.season * 11 + tag);

/** Os passos, na ordem. Todos só completam o que falta. */
export const STEPS: MigrationStep[] = [
  { id: 'formato-antigo', label: 'formato antigo (orçamentos, humor, listas, propostas)', run: (g) => ((g.version as number) === 5 ? g : migrateSave(g)) },
  { id: 'funcoes', label: 'funções dos jogadores (lateral, ponta, centroavante...)', run: (g) => (Object.values(g.teams).every((t) => t.players.every((p) => p.spot)) && (!g.foreign || Object.values(g.foreign.teams).every((t) => t.players.every((p) => p.spot))) ? g : withSpotsAll(g)) },
  { id: 'contratos-ia', label: 'contratos dos jogadores dos clubes da IA', run: (g) => ensureAiContracts(g) },
  { id: 'treinadores-ia', label: 'treinadores dos clubes da IA', run: (g) => ensureAiCoaches(g) },
  { id: 'base-ia', label: 'categorias de base dos clubes', run: (g) => (g.aiYouth ? g : ensureAiYouth(g, rngFor(g, 3))) },
  { id: 'objetivos', label: 'objetivos de cada clube na temporada', run: (g) => freezeGoals(g) },
  { id: 'mercado', label: 'janelas de transferência e propostas (as propostas antigas viram negociações)', run: (g) => ensureMarketState(g) },
  { id: 'jovens-emprestimos', label: 'potencial dos jovens, minutos jogados e empréstimos', run: (g) => ensureYouthLoanState(g) },
];

const strip = (p: Player) => ({ id: p.id, name: p.name, pos: p.pos, spot: p.spot, age: p.age, strength: p.strength, contract: p.contract ? { wage: p.contract.wage, until: p.contract.until } : undefined });

/**
 * Compara o que existia antes com o que existe depois e lista tudo que mudou e NÃO podia mudar. Campos novos podem ser acrescentados, nada mais.
 * (nomes, idades, overall, posições e contratos que já existiam; todos os jogadores e clubes; histórico; resultados; caixas; saldo; transferências...)
 */
/** `b` contém tudo o que `a` tem, com os mesmos valores (pode ter campos a mais): completar registros antigos com campos novos é permitido, mudar o que existia não. */
export function covers(a: unknown, b: unknown): boolean {
  if (a === undefined) return true;
  if (a === null || typeof a !== 'object') return a === b;
  if (b === null || typeof b !== 'object') return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => covers(x, b[i]));
  return Object.keys(a as object).every((k) => covers((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function verifyPreserved(before: GameState, after: GameState): string[] {
  const p: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of ['history', 'results', 'budgets', 'transfers', 'news', 'morale', 'titles', 'userClubId', 'coach', 'season', 'round', 'totalRounds', 'jobs', 'bank', 'phone', 'coachMoney', 'transferList', 'loanList', 'loans', 'loansIn', 'played', 'cup', 'lib', 'sula', 'ucl', 'estadual', 'mundial', 'fixtures', 'divisions', 'foreignDeals'] as const) {
    if (!covers((before as unknown as Record<string, unknown>)[k], (after as unknown as Record<string, unknown>)[k])) p.push(`campo alterado: ${k}`);
  }
  if (!same(Object.keys(before.clubs).sort(), Object.keys(after.clubs).sort())) p.push('clubes mudaram');
  for (const [id, c] of Object.entries(before.clubs)) if (!covers(c, after.clubs[id])) p.push(`clube ${id}: dados alterados`);
  for (const [id, t] of Object.entries(before.teams)) {
    const a = after.teams[id];
    if (!a) { p.push(`elenco perdido: ${id}`); continue; }
    if (t.players.length !== a.players.length) p.push(`${id}: ${t.players.length} → ${a.players.length} jogadores`);
    const bef = new Map(t.players.map((x) => [x.id, x]));
    for (const y of a.players) {
      const x = bef.get(y.id);
      if (!x) { p.push(`${id}: jogador novo ${y.id}`); continue; }
      const sx = strip(x), sy = strip(y);
      // spot e contrato podem ser COMPLETADOS (só se não existiam); o resto nunca muda
      if (sx.spot !== undefined && sx.spot !== sy.spot) p.push(`${y.id}: função alterada`);
      if (sx.contract !== undefined && !same(sx.contract, sy.contract)) p.push(`${y.id}: contrato alterado`);
      if (sx.name !== sy.name || sx.age !== sy.age || sx.strength !== sy.strength || sx.pos !== sy.pos) p.push(`${y.id}: dados do jogador alterados`);
    }
    if (!same(t.lineup, a.lineup) || t.formation !== a.formation) p.push(`${id}: escalação/formação alterada`);
  }
  // classificação de cada divisão: derivada dos resultados (iguais), mas conferimos de ponta a ponta
  for (const d of before.divisions) if (d.format !== 'groups' && d.format !== 'outside') {
    const t = (g: GameState) => computeTable(d.clubIds.map((id) => ({ id, name: id })), g.results.filter((r) => r.divisionId === d.id)).map((r) => `${r.clubId}:${r.points}:${r.gf}:${r.ga}`).join('|');
    if (t(before) !== t(after)) p.push(`classificação alterada: ${d.id}`);
  }
  return p;
}

/** Jogadores que aparecem em mais de um clube (save já corrompido): não são apagados, só avisados. */
function duplicateWarnings(g: GameState): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const [id, t] of Object.entries(g.teams)) for (const pl of t.players) { const prev = seen.get(pl.id); if (prev && prev !== id) out.push(`jogador ${pl.id} aparece em ${prev} e ${id}`); else seen.set(pl.id, id); }
  return out.slice(0, 10);
}

/** Leva o save à geração atual, sem apagar nem trocar dados existentes. Se o save já é atual e completo, devolve o MESMO objeto. */
export function migrateGame(g: GameState): { game: GameState; report: MigrationReport } {
  const from = detectSchema(g);
  const report: MigrationReport = { migrated: false, fromSchema: from, toSchema: SAVE_SCHEMA, applied: [], failed: [], violations: [], warnings: duplicateWarnings(g), rejected: false };
  let s = g;
  for (const step of STEPS) {
    try { const out = step.run(s); if (out !== s) { report.applied.push({ id: step.id, label: step.label }); s = out; } }
    catch (e) { report.failed.push({ id: step.id, error: (e as Error).message ?? String(e) }); }
  }
  if (report.applied.length === 0 && report.failed.length === 0 && from >= SAVE_SCHEMA && g.schema === SAVE_SCHEMA) return { game: g, report };
  report.violations = verifyPreserved(g, s);
  if (report.violations.length) { report.rejected = true; report.migrated = false; return { game: g, report }; } // mantém o save como estava
  report.migrated = report.applied.length > 0;                                                // só conta como migração se algo foi realmente completado
  if (report.failed.length === 0 && s.schema !== SAVE_SCHEMA) s = { ...s, schema: SAVE_SCHEMA };   // só carimba quando todos os passos deram certo
  return { game: s, report };
}

/** Texto para o jogador (português simples). */
export function migrationNotice(r: MigrationReport): string | null {
  if (r.rejected) return '⚠️ O save abriu, mas a atualização automática dele foi cancelada por segurança (ela alteraria dados antigos). Seus dados estão intactos; o jogo completa o que falta aos poucos.';
  if (!r.migrated) return r.failed.length ? `⚠️ O save abriu, mas ${r.failed.length} item(ns) da atualização não puderam ser aplicados agora e serão tentados de novo na próxima abertura.` : null;
  const items = r.applied.map((a) => a.label).slice(0, 4).join('; ');
  return `ℹ️ Seu save foi atualizado para a versão nova do jogo (de "${SCHEMA_NOTE[r.fromSchema] ?? r.fromSchema}" para "${SCHEMA_NOTE[r.toSchema]}"). Foi acrescentado: ${items || 'ajustes internos'}. Nada do que você já tinha foi alterado, e uma cópia do save original foi guardada.${r.failed.length ? ` (${r.failed.length} item(ns) serão tentados de novo na próxima abertura.)` : ''}`;
}
