import { inflate } from './economy';
import { afterSigning, fairplayBlock } from './fairplay';
import { baseWage } from './finance';
import { hashString } from './rng';
import { autoLineup } from './squad';
import { transferBlock } from './windows';
import { divisionIndexOf, MAX_SQUAD, MIN_BY_POS, MIN_SQUAD, playerValue } from './transfers';
import type { GameState, NewsItem, Player, Position } from './types';

/** Taxa do empréstimo: parte do valor de mercado paga ao clube dono. */
export const LOAN_IN_RATE = 0.1;
/** Os 11 melhores de cada elenco (titulares) nunca entram na lista de empréstimo; dos demais, cerca de 20% são oferecidos. */
const PROTECTED = 11;
const LISTED_PCT = 20;

export interface LoanEntry { player: Player; clubId: string; fee: number; wage: number }

const loanedIn = (g: GameState) => new Set((g.loansIn ?? []).map((l) => l.playerId));

/** Jogadores de outros clubes disponíveis para empréstimo (a lista é sorteada por temporada e é sempre a mesma na temporada). */
export function loanMarket(g: GameState): LoanEntry[] {
  const taken = loanedIn(g);
  const aiLoaned = new Set((g.aiLoans ?? []).map((l) => l.playerId));
  const out: LoanEntry[] = [];
  for (const [clubId, team] of Object.entries(g.teams)) {
    if (clubId === g.userClubId) continue;
    const di = divisionIndexOf(g, clubId);
    const ranked = [...team.players].sort((a, b) => b.strength - a.strength);
    ranked.forEach((p, i) => {
      if (i < PROTECTED || taken.has(p.id) || aiLoaned.has(p.id) || hashString(`${g.seed}:${g.season}:${p.id}`) % 100 >= LISTED_PCT) return;
      const fee = Math.max(10_000, Math.round((inflate(g, playerValue(p, di)) * LOAN_IN_RATE) / 10_000) * 10_000);
      out.push({ player: p, clubId, fee, wage: Math.round((baseWage(g, g.userClubId, p) * 0.5) / 1_000) * 1_000 });
    });
  }
  return out;
}

export type LoanCheck = { ok: true; entry: LoanEntry } | { ok: false; reason: string };

export function checkLoanIn(g: GameState, playerId: string): LoanCheck {
  const ban = fairplayBlock(g);
  if (g.unemployed) return { ok: false, reason: 'Você está sem clube.' };
  if (ban) return { ok: false, reason: ban };
  const closed = transferBlock(g, 'emprestimo');
  if (closed) return { ok: false, reason: closed };
  const entry = loanMarket(g).find((e) => e.player.id === playerId);
  if (!entry) return { ok: false, reason: 'Este jogador não está na lista de empréstimo.' };
  const me = g.teams[g.userClubId];
  if (me.players.length >= MAX_SQUAD) return { ok: false, reason: `Elenco cheio (máximo de ${MAX_SQUAD} jogadores).` };
  if ((g.budgets[g.userClubId] ?? 0) < entry.fee) return { ok: false, reason: 'Orçamento insuficiente para o empréstimo.' };
  const left = g.teams[entry.clubId].players.filter((p) => p.id !== playerId);
  if (left.length < MIN_SQUAD || (Object.keys(MIN_BY_POS) as Position[]).some((pos) => left.filter((p) => p.pos === pos).length < MIN_BY_POS[pos])) return { ok: false, reason: 'O clube dono não pode ficar com elenco menor que o mínimo.' };
  return { ok: true, entry };
}

/** Pega o jogador emprestado até o fim da temporada: taxa ao dono, contrato até o fim do ano e conta como contratação no fair play. */
export function loanIn(g: GameState, playerId: string): { state: GameState; check: LoanCheck } {
  const check = checkLoanIn(g, playerId);
  if (!check.ok) return { state: g, check };
  const { entry } = check;
  const owner = g.teams[entry.clubId];
  const left = owner.players.filter((p) => p.id !== playerId);
  const me = g.teams[g.userClubId];
  const player: Player = { ...entry.player, contract: { wage: entry.wage, until: g.season } };
  const note: NewsItem = { season: g.season, round: g.round, text: `🤝 Emprestado: ${player.name} (overall ${player.strength}) do ${g.clubs[entry.clubId].name} até o fim da temporada (taxa de R$ ${entry.fee.toLocaleString('pt-BR')}).`, tone: 'good' };
  let s: GameState = {
    ...g,
    teams: { ...g.teams, [entry.clubId]: { ...owner, players: left, lineup: autoLineup(left, owner.formation) }, [g.userClubId]: { ...me, players: [...me.players, player] } },
    budgets: { ...g.budgets, [g.userClubId]: g.budgets[g.userClubId] - entry.fee, [entry.clubId]: (g.budgets[entry.clubId] ?? 0) + entry.fee },
    loansIn: [...(g.loansIn ?? []), { playerId, ownerClubId: entry.clubId, season: g.season }],
    transfers: [...g.transfers, { kind: 'loanin', season: g.season, round: g.round, playerId, playerName: player.name, pos: player.pos, strength: player.strength, fromClubId: entry.clubId, toClubId: g.userClubId, fee: entry.fee }],
    news: [note, ...g.news].slice(0, 80),
  };
  s = afterSigning(s);
  return { state: s, check };
}
