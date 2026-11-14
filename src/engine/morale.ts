import type { ClubInfo, Morale } from './types';

export const MORALE_START: Morale = { team: 60, board: 60, fans: 60 };
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Influência do humor da equipe na força do time em campo: de 0,96 (humor 0) a 1,04 (humor 100). */
export const moraleFactor = (team: number) => 0.96 + 0.08 * (team / 100);

export type MoodLabel = 'Excelente' | 'Bom' | 'Regular' | 'Ruim' | 'Crítico';
export function moodLabel(v: number): MoodLabel {
  return v >= 80 ? 'Excelente' : v >= 60 ? 'Bom' : v >= 40 ? 'Regular' : v >= 20 ? 'Ruim' : 'Crítico';
}

/** Posição máxima que a diretoria aceita (1 = campeão) para cada meta, numa divisão de `size` clubes. */
export function targetPosition(expectation: ClubInfo['boardExpectation'], size: number): number {
  return expectation === 'title' ? 3 : expectation === 'top4' ? 6 : expectation === 'mid' ? size - 6 : size - 4;
}

export interface RoundInfo {
  gf: number; ga: number; home: boolean;
  /** posição atual do clube na tabela (1 = líder) e quantos clubes tem a divisão */
  position: number; size: number; round: number;
  expectation: ClubInfo['boardExpectation'];
}

/**
 * Atualiza o humor depois de um jogo do clube do jogador.
 * - Equipe: sobe com vitória, cai com derrota e volta aos poucos para 60.
 * - Torcida: parecido, mas mais sensível (e gosta de vitória em casa).
 * - Dirigentes: olham a posição na tabela contra a meta (a partir da rodada 4) e o resultado.
 */
export function updateMorale(m: Morale, r: RoundInfo): Morale {
  const win = r.gf > r.ga, loss = r.gf < r.ga;
  const team = m.team + (60 - m.team) * 0.08 + (win ? 6 : loss ? -7 : 0);
  const fans = m.fans + (60 - m.fans) * 0.05 + (win ? (r.home ? 6 : 4) : loss ? -6 : -1);
  const inside = r.position <= targetPosition(r.expectation, r.size);
  const board = m.board + (r.round >= 4 ? (inside ? 1.5 : -2.5) : 0) + (win ? 1 : loss ? -1 : 0);
  return { team: clamp(team), board: clamp(board), fans: clamp(fans) };
}
