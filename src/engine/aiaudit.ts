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
  // empréstimos: cada um tem o jogador no clube que o recebeu, em uma única lista, e nenhum jogador está em dois empréstimos
  const seen = new Set<string>();
  for (const l of g.loanDeals ?? []) {
    if (l.closed) continue;
    if (seen.has(l.playerId)) problems.push(`jogador em dois empréstimos: ${l.playerId}`); seen.add(l.playerId);
    if (!g.teams[l.hostId]?.players.some((p) => p.id === l.playerId)) problems.push(`empréstimo sem jogador no destino: ${l.playerId}`);
    if (g.teams[l.originId]?.players.some((p) => p.id === l.playerId)) problems.push(`emprestado ainda no elenco de origem: ${l.playerId}`);
    if (!(l.untilDay > l.fromDay)) problems.push(`empréstimo com datas inválidas: ${l.dealId}`);
    const lists = (g.loans.some((x) => x.playerId === l.playerId) ? 1 : 0) + ((g.loansIn ?? []).some((x) => x.playerId === l.playerId) ? 1 : 0) + ((g.aiLoans ?? []).some((x) => x.playerId === l.playerId) ? 1 : 0);
    if (lists !== 1) problems.push(`empréstimo fora das listas de devolução (ou em duas): ${l.playerId}`);
  }
  // contratos válidos
  const onLoan = new Set((g.loanDeals ?? []).filter((l) => !l.closed).map((l) => l.playerId));
  for (const [cid, t] of Object.entries(g.teams)) for (const p of t.players) {
    // salário nunca é negativo; só o emprestido pode ter salário zero no clube que o recebe (o clube de origem paga tudo)
    if (p.contract && (!(p.contract.wage > 0 || (p.contract.wage === 0 && onLoan.has(p.id))) || !Number.isFinite(p.contract.until))) problems.push(`contrato inválido: ${p.id} em ${cid}`);
    if (p.contract && p.contract.until < g.season - 1) problems.push(`contrato vencido há tempo: ${p.id} em ${cid}`);
  }
  for (const p of g.freeAgents ?? []) if (p.contract) problems.push(`jogador livre com contrato: ${p.id}`);
  return problems;
}
