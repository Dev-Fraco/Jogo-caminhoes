import { clamp, type Rng } from './rng';
import { teamRatings } from './squad';
import type { MatchEvent, Player, TeamState } from './types';

export interface SimOutput { homeGoals: number; awayGoals: number; events: MatchEvent[] }

/**
 * Simulação minuto a minuto.
 * Cada minuto pode virar um ataque; o meio-campo decide quem ataca,
 * ataque x defesa decide se vira finalização, e ataque x (defesa+goleiro) se vira gol.
 * Calibrado para ~2,6 gols por jogo entre times iguais, com leve vantagem de jogar em casa.
 */
export function simulateMatch(home: TeamState, away: TeamState, rng: Rng): SimOutput {
  const H = teamRatings(home);
  const A = teamRatings(away);
  const homeAdv = 1.08;
  const events: MatchEvent[] = [];
  let hg = 0, ag = 0;

  const lineupOf = (t: TeamState) => t.lineup.map((id) => t.players.find((p) => p.id === id)!);
  const hl = lineupOf(home), al = lineupOf(away);
  const redCards = { home: 0, away: 0 };

  const scorer = (list: Player[]): Player => {
    // atacantes marcam mais, depois meias, depois defensores
    const w = list.map((p) => (p.pos === 'ATT' ? 6 : p.pos === 'MID' ? 3 : p.pos === 'DEF' ? 1 : 0) * (p.strength / 60));
    const total = w.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  };

  for (let minute = 1; minute <= 90; minute++) {
    if (rng() > 0.3) {
      // cartões (raros), independentes de ataques
      if (rng() < 0.012) {
        const side = rng() < 0.5 ? 'home' : 'away';
        const p = (side === 'home' ? hl : al).filter((x) => x.pos !== 'GK');
        const who = p[Math.floor(rng() * p.length)];
        const red = rng() < 0.08 && redCards[side] < 2;
        if (red) redCards[side]++;
        events.push({ minute, type: red ? 'red' : 'yellow', side, text: `${red ? 'Cartão vermelho' : 'Cartão amarelo'} para ${who.name}` });
      }
      continue;
    }
    // penalidade por expulsões
    const hMid = H.mid * homeAdv * (1 - 0.08 * redCards.home);
    const aMid = A.mid * (1 - 0.08 * redCards.away);
    const k = 1;
    const pHome = hMid ** k / (hMid ** k + aMid ** k);
    const homeAttacks = rng() < pHome;
    const atk = homeAttacks ? H : A;
    const dfn = homeAttacks ? A : H;
    const side = homeAttacks ? 'home' : 'away';
    const atkList = homeAttacks ? hl : al;

    const pShot = clamp(0.5 * (atk.att / dfn.def) ** 0.6, 0.25, 0.8);
    if (rng() > pShot) continue;
    const pGoal = clamp(0.2 * (atk.att / (dfn.def * 0.4 + dfn.gk * 0.6)) ** 0.8, 0.06, 0.45);
    const who = scorer(atkList);
    if (rng() < pGoal) {
      if (homeAttacks) hg++; else ag++;
      events.push({ minute, type: 'goal', side, text: `GOL! ${who.name} (${homeAttacks ? hg : ag})` });
    } else if (rng() < 0.35) {
      events.push({ minute, type: 'chance', side, text: `${who.name} chuta e o goleiro defende` });
    }
  }
  return { homeGoals: hg, awayGoals: ag, events };
}
