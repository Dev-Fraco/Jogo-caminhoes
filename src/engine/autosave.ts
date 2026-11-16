import { saveGame, type SaveOutcome } from './save';
import type { GameState } from './types';

/* =====================================================================
   Quando salvar. A tela avisa cada mudança do jogo; este controle decide:
   - momento importante (partida jogada, temporada virou, transferência, decisão de contrato, mudança no elenco, troca de clube): salva já;
   - mudança pequena (escalação, telas): espera um pouco e junta tudo numa gravação só;
   - o aplicativo indo para segundo plano ou fechando: salva na hora o que estiver pendente.
   Nunca grava duas vezes o mesmo estado.
   ===================================================================== */

export type SaveReason = 'partida' | 'temporada' | 'transferencia' | 'contrato' | 'elenco' | 'carreira' | 'rotina';

const sig = (g: GameState) => ({
  season: g.season, round: g.round, hist: g.history.length, club: g.userClubId, jobless: !!g.unemployed,
  transfers: g.transfers.length, deals: g.dealLog?.length ?? 0, contracts: g.contractLog?.length ?? 0, loans: g.loanLog?.length ?? 0,
  squad: g.teams[g.userClubId]?.players.length ?? 0, lists: g.transferList.length + g.loanList.length,
});
export type Sig = ReturnType<typeof sig>;

/** Por que este estado merece ser salvo já em relação ao anterior (null = mudança pequena). */
export function importantReason(prev: GameState | null, next: GameState): SaveReason | null {
  if (!prev) return null;
  const a = sig(prev), b = sig(next);
  if (a.hist !== b.hist || a.season !== b.season) return 'temporada';
  if (a.club !== b.club || a.jobless !== b.jobless) return 'carreira';
  if (a.round !== b.round) return 'partida';
  if (a.transfers !== b.transfers || a.deals !== b.deals || a.loans !== b.loans) return 'transferencia';
  if (a.contracts !== b.contracts) return 'contrato';
  if (a.squad !== b.squad || a.lists !== b.lists) return 'elenco';
  return null;
}

export interface AutosaveDeps { save?: (g: GameState, o: { urgent?: boolean; endOfSeason?: boolean }) => SaveOutcome; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void; debounceMs?: number }

export class Autosaver {
  private pending: GameState | null = null;
  private last: GameState | null = null;
  private timer: unknown = null;
  private urgentReason: SaveReason | null = null;
  saves = 0;
  private save: NonNullable<AutosaveDeps['save']>;
  private setTimer: NonNullable<AutosaveDeps['setTimer']>;
  private clearTimer: NonNullable<AutosaveDeps['clearTimer']>;
  private debounceMs: number;
  constructor(d: AutosaveDeps = {}) {
    this.save = d.save ?? ((g, o) => saveGame(g, o));
    this.setTimer = d.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = d.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.debounceMs = d.debounceMs ?? 1500;
  }
  /** O jogo mudou. */
  update(g: GameState): SaveReason | null {
    if (g === this.last) return null;
    const reason = importantReason(this.last, g);
    this.last = g;
    this.pending = g;
    if (reason) this.urgentReason = this.urgentReason === 'temporada' ? 'temporada' : reason;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => { this.timer = null; this.flush(); }, reason ? 0 : this.debounceMs);
    return reason;
  }
  /** Grava agora o que estiver pendente (usado quando o aplicativo vai para segundo plano ou fecha). */
  flush(): SaveOutcome | null {
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    const g = this.pending;
    if (!g) return null;
    const reason = this.urgentReason;
    this.pending = null; this.urgentReason = null;
    this.saves++;
    return this.save(g, { urgent: reason === 'temporada' || reason === 'carreira', endOfSeason: reason === 'temporada' }); // as cópias de segurança são renovadas por tempo, e na hora só na virada ou ao trocar de clube
  }
  get hasPending() { return this.pending !== null; }
}
