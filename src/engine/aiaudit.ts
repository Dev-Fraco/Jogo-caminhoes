import { rosterOk } from './roster';
import { managed } from './lookup';
import type { GameState } from './types';

/**
 * Auditoria do universo (para testes e diagnóstico): devolve os problemas de integridade encontrados.
 * Cada jogador existe em um único lugar; clubes da IA têm elenco válido e treinador único; o dinheiro é um número real.
 */
export function auditUniverse(g: GameState): string[] {
  const problems: string[] = [];
  const where = new Map<string, string>();
  const put = (id: string, at: string) => { const prev = where.get(id); if (prev) problems.push(`jogador ${id} em dois lugares: ${prev} e ${at}`); else where.set(id, at); };
  for (const [cid, t] of Object.entries(g.teams)) {
    for (const p of t.players) put(p.id, cid);
    if (!managed(g, cid) && !rosterOk(t.players)) problems.push(`elenco inválido: ${cid}`);
    for (const id of t.lineup) if (!t.players.some((p) => p.id === id)) problems.push(`escalação com jogador de fora: ${cid}/${id}`);
  }
  for (const p of g.freeAgents ?? []) put(p.id, 'livres');
  for (const [cid, list] of Object.entries(g.aiYouth ?? {})) for (const p of list) put(p.id, `base:${cid}`);
  for (const [id, v] of Object.entries(g.budgets)) if (!Number.isFinite(v)) problems.push(`caixa inválido: ${id}`);
  const holders = new Map<string, string>();
  for (const [cid, coachId] of Object.entries(g.clubCoach ?? {})) {
    const c = g.aiCoaches?.[coachId];
    if (!c || c.clubId !== cid) problems.push(`treinador mal associado: ${cid}`);
    if (holders.has(coachId)) problems.push(`treinador ${coachId} em dois clubes`); else holders.set(coachId, cid);
  }
  for (const l of g.aiLoans ?? []) if (!g.teams[l.hostId]?.players.some((p) => p.id === l.playerId)) problems.push(`empréstimo sem jogador no clube que recebeu: ${l.playerId}`);
  return problems;
}
