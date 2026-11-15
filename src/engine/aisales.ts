import { avgXI, clubProfile, type ClubProfile, type ProfileCtx, profileCtx } from './aiprofile';
import { RETIRING_AGE } from './aineeds';
import { inflate } from './economy';
import { baseWage } from './finance';
import { hashString } from './rng';
import { autoLineup } from './squad';
import { divisionIndexOf, MIN_BY_POS, playerValue } from './transfers';
import type { GameState, Player } from './types';

/* =====================================================================
   Vendas da IA: o clube que RECEBE uma proposta avalia se vende, e por quanto.
   Pesa a importância do atleta, a qualidade do substituto, a posição no elenco, o valor recebido, o impacto esportivo e a situação financeira.
   Motivos para vender: sem espaço, salário alto, quer um clube maior, fim de contrato, fora dos planos, contas apertadas.
   Peça fundamental sem substituto à altura NÃO sai, por mais dinheiro que ofereçam (salvo clube desesperado).
   ===================================================================== */

export type SaleReason = 'sem-espaco' | 'salario-alto' | 'quer-sair' | 'fim-contrato' | 'fora-dos-planos' | 'financas' | 'veterano';
export type RefusalReason = 'fundamental' | 'sem-reposicao' | 'titular-sem-substituto' | 'nao-quer-descer' | 'limite-de-titulares';
export type Role = 'craque' | 'titular' | 'reserva' | 'excedente';

export interface Stance {
  willing: boolean;
  /** Preço pedido em relação ao valor de mercado (1 = valor de mercado). */
  ask: number;
  role: Role; reasons: SaleReason[];
  refusal?: RefusalReason;
  /** Quanto a saída pioraria o time: força do titular menos a do melhor substituto (0 para quem não é titular). */
  gap: number;
}

/** Quantos titulares um clube aceita vender por janela, conforme o porte (a IA não desmonta o time). */
export const MAX_STARTER_SALES = { gigante: 1, medio: 1, pequeno: 2 } as const;
const COMFORT_EXTRA = 1;

/** Interesse "estável" do jogador em sair nesta temporada (o mesmo jogador responde sempre igual na temporada). */
const itchingToLeave = (g: Pick<GameState, 'season'>, p: Player) => hashString(`${p.id}:${g.season}`) % 100 < 30;

/** Papel do jogador no elenco: craque (peça fundamental), titular, reserva ou excedente (gente demais na posição). */
const SQUADS = new WeakMap<ProfileCtx, Map<string, { xi: Set<string>; rank: Map<string, number> }>>();
/** Titulares e ranking de força do elenco, guardados por contexto (esquecidos com `forgetClub` quando o elenco muda). */
const squadInfo = (g: GameState, clubId: string, ctx: ProfileCtx) => {
  let m = SQUADS.get(ctx); if (!m) SQUADS.set(ctx, (m = new Map()));
  let v = m.get(clubId);
  if (!v) {
    const team = g.teams[clubId];
    v = { xi: new Set(autoLineup(team.players, team.formation)), rank: new Map([...team.players].sort((a, b) => b.strength - a.strength).map((q, i) => [q.id, i])) };
    m.set(clubId, v);
  }
  return v;
};
/** Esquece o que foi guardado de um clube (chame depois que o elenco dele mudou). */
export const forgetClub = (ctx: ProfileCtx, clubId: string) => { PROFS.get(ctx)?.delete(clubId); SQUADS.get(ctx)?.delete(clubId); };

/** Papel do jogador no elenco: craque (peça fundamental), titular, reserva ou excedente (gente demais na posição). */
export function roleOf(g: GameState, clubId: string, p: Player, ctx: ProfileCtx = profileCtx(g)): { role: Role; starter: boolean; rank: number; gap: number; depth: number } {
  const team = g.teams[clubId];
  const level = ctx.xi.get(clubId) ?? avgXI(team);
  const { xi, rank: ranks } = squadInfo(g, clubId, ctx);
  const starter = xi.has(p.id);
  const rank = ranks.get(p.id) ?? 99;
  let sub: Player | undefined, depth = 0;
  for (const q of team.players) { if (q.pos !== p.pos || q.id === p.id) continue; depth++; if (!xi.has(q.id) && (!sub || q.strength > sub.strength)) sub = q; }
  const gap = starter ? p.strength - (sub?.strength ?? 25) : 0;
  const key = starter && (rank < 3 || p.strength >= level + 8);
  const surplus = !starter && depth >= MIN_BY_POS[p.pos] + 4;
  return { role: key ? 'craque' : starter ? 'titular' : surplus ? 'excedente' : 'reserva', starter, rank, gap, depth };
}

/** Motivos (fora a proposta) pelos quais o clube toparia se desfazer do jogador. */
export function saleReasons(g: GameState, clubId: string, p: Player, prof: ClubProfile, ctx: ProfileCtx = profileCtx(g)): SaleReason[] {
  const r = roleOf(g, clubId, p, ctx), out: SaleReason[] = [];
  const level = ctx.xi.get(clubId) ?? avgXI(g.teams[clubId]);
  if (!r.starter && p.strength >= level - 6) out.push('sem-espaco'); // bom o bastante para jogar e sem lugar no time
  if (!r.starter && r.role !== 'excedente' && p.strength < level - 12) out.push('fora-dos-planos');
  if (r.role === 'excedente') out.push('fora-dos-planos');
  if (baseWage(g, clubId, p) > prof.revenue * 0.06 && r.role !== 'craque') out.push('salario-alto');
  if (p.contract && p.contract.until <= g.season) out.push('fim-contrato'); // (contratos só existem para quem foi contratado por contrato)
  if (p.age >= RETIRING_AGE - 2) out.push('veterano');
  if (prof.sellPressure >= 0.5) out.push('financas');
  if (r.starter && p.strength >= level + 3 && itchingToLeave(g, p)) out.push('quer-sair');
  return out;
}

/**
 * Postura do clube diante de uma proposta pelo jogador (de `buyerId`, se informado): quer vender? por quanto (em relação ao valor de mercado)?
 * `startersSold` = quantos titulares o clube já vendeu nesta janela.
 */
const PROFS = new WeakMap<ProfileCtx, Map<string, ClubProfile>>();
/** Perfil do vendedor guardado por contexto (uma janela inteira usa o mesmo): evita recalcular a cada proposta. */
const profOf = (g: GameState, clubId: string, ctx: ProfileCtx) => { let m = PROFS.get(ctx); if (!m) PROFS.set(ctx, (m = new Map())); let p = m.get(clubId); if (!p) m.set(clubId, (p = clubProfile(g, clubId, ctx))); return p; };

export function stance(g: GameState, clubId: string, p: Player, buyerId?: string, ctx: ProfileCtx = profileCtx(g), startersSold = 0): Stance {
  const prof = profOf(g, clubId, ctx);
  const r = roleOf(g, clubId, p, ctx);
  const reasons = saleReasons(g, clubId, p, prof, ctx);
  const desperate = prof.financial === 'crise' && prof.sellPressure >= 0.8;
  const sdi = divisionIndexOf(g, clubId), bdi = buyerId ? divisionIndexOf(g, buyerId) : sdi;
  const base = (refusal?: RefusalReason): Stance => ({ willing: !refusal, ask: 1, role: r.role, reasons, refusal, gap: r.gap });

  // recusas que dinheiro nenhum resolve (salvo clube desesperado)
  if (r.depth < MIN_BY_POS[p.pos] + COMFORT_EXTRA) return base('sem-reposicao'); // depois da venda a posição ficaria sem o mínimo e sem folga
  if (r.starter) {
    if (r.role === 'craque' && r.gap > 6 && !desperate) return base('fundamental'); // peça fundamental sem substituto à altura
    if (r.gap > 10 && !desperate && (prof.objective === 'titulo' || prof.objective === 'vaga-continental')) return base('titular-sem-substituto');
    if (bdi > sdi && !desperate) return base('nao-quer-descer'); // titular não vai para divisão inferior
    if (startersSold >= MAX_STARTER_SALES[prof.tier] + (desperate ? 1 : 0)) return base('limite-de-titulares');
  }
  // preço pedido: craque custa caro, titular um pouco acima, reserva no valor, excedente com desconto
  let ask = r.role === 'craque' ? 1.6 : r.role === 'titular' ? 1.25 : r.role === 'excedente' ? 0.8 : 0.95;
  // quanto mais substituto à altura, mais barato deixar ir; sem substituto, mais caro
  if (r.starter) ask *= r.gap <= 3 ? 0.9 : r.gap > 8 ? 1.2 : 1;
  const has = (x: SaleReason) => reasons.includes(x);
  if (has('financas')) ask *= 1 - 0.3 * prof.sellPressure;
  if (has('salario-alto')) ask *= 0.92;
  if (has('sem-espaco') || has('fora-dos-planos')) ask *= 0.9;
  if (has('quer-sair') || (bdi < sdi && r.starter)) ask *= 0.92; // quer um clube maior
  if (has('fim-contrato')) ask *= 0.7;
  if (has('veterano')) ask *= 0.85;
  if (r.role === 'craque') ask = Math.max(ask, 1.4); // peça-chave nunca sai barato, nem para o clube sem dinheiro
  return { willing: true, ask: Math.max(0.5, ask), role: r.role, reasons, gap: r.gap };
}

/** Valor de mercado do jogador no clube que o vende (R$). */
export const marketValue = (g: GameState, clubId: string, p: Player) => inflate(g, playerValue(p, divisionIndexOf(g, clubId)));

/** Resposta a uma proposta concreta: aceita se o valor chega ao preço pedido e o clube não tem motivo para recusar. */
export function evaluateOffer(g: GameState, clubId: string, p: Player, fee: number, buyerId?: string, ctx?: ProfileCtx, startersSold = 0): { accept: boolean; stance: Stance; ask: number } {
  const st = stance(g, clubId, p, buyerId, ctx, startersSold);
  const ask = Math.round(marketValue(g, clubId, p) * st.ask);
  return { accept: st.willing && fee >= ask, stance: st, ask };
}
