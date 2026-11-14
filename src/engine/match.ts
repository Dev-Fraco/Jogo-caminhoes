import { clamp, type Rng } from './rng';
import { teamRatings } from './squad';
import type { MatchEvent, Player, TeamState } from './types';

export interface SimOutput { homeGoals: number; awayGoals: number; events: MatchEvent[] }
export interface Mods { home?: number; away?: number }
export interface MatchNames { home: string; away: string }

/**
 * Simulação minuto a minuto, com narração.
 * Cada minuto pode virar um ataque; o meio-campo decide quem ataca, ataque x defesa decide se vira finalização,
 * e ataque x (defesa+goleiro) se vira gol. Calibrado para ~2,6 gols por jogo entre times iguais, com leve vantagem de casa.
 * Além dos gols, gera faltas, cartões, escanteios, defesas e chutes para fora, sempre com o nome do jogador.
 * `mods` multiplica a força do time (ex.: humor da equipe: 0,96 a 1,04); `names` traz os nomes dos clubes para o texto.
 */
export function simulateMatch(home: TeamState, away: TeamState, rng: Rng, mods: Mods = {}, names: MatchNames = { home: 'Mandante', away: 'Visitante' }): SimOutput {
  const scale = (r: ReturnType<typeof teamRatings>, k: number) => ({ ...r, gk: r.gk * k, def: r.def * k, mid: r.mid * k, att: r.att * k });
  const H = scale(teamRatings(home), mods.home ?? 1);
  const A = scale(teamRatings(away), mods.away ?? 1);
  const homeAdv = 1.08;
  const events: MatchEvent[] = [];
  let hg = 0, ag = 0;

  const lineupOf = (t: TeamState) => t.lineup.map((id) => t.players.find((p) => p.id === id)!);
  const hl = lineupOf(home), al = lineupOf(away);
  const redCards = { home: 0, away: 0 };
  const yellows = new Set<string>();
  const out = new Set<string>(); // expulsos
  const club = (side: 'home' | 'away') => (side === 'home' ? names.home : names.away);
  const lineup = (side: 'home' | 'away') => (side === 'home' ? hl : al);
  const pickOf = (list: Player[]) => list[Math.floor(rng() * list.length)];
  const field = (side: 'home' | 'away') => lineup(side).filter((p) => p.pos !== 'GK' && !out.has(p.id));
  const keeper = (side: 'home' | 'away') => lineup(side).find((p) => p.pos === 'GK') ?? lineup(side)[0];
  const push = (minute: number, type: MatchEvent['type'], side: MatchEvent['side'], text: string, extra: Partial<MatchEvent> = {}) => events.push({ minute, type, side, text, ...extra });

  const weighted = (list: Player[], weight: (p: Player) => number): Player => {
    const w = list.map(weight);
    const total = w.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  };
  // atacantes marcam mais, depois meias, depois defensores
  const scorer = (list: Player[]) => weighted(list, (p) => (p.pos === 'ATT' ? 6 : p.pos === 'MID' ? 3 : p.pos === 'DEF' ? 1 : 0) * (p.strength / 60));
  const assister = (list: Player[], not: Player) => weighted(list.filter((p) => p !== not && p.pos !== 'GK'), (p) => (p.pos === 'MID' ? 5 : p.pos === 'ATT' ? 4 : 1));

  push(0, 'kickoff', 'none', `Começa o jogo! ${names.home} x ${names.away}.`);

  for (let minute = 1; minute <= 90; minute++) {
    if (minute === 46) push(45, 'halftime', 'none', `Fim do primeiro tempo: ${names.home} ${hg} x ${ag} ${names.away}.`, { score: [hg, ag] });

    // falta (e cartão), independente dos ataques
    if (rng() < 0.11) {
      const fs = rng() < 0.5 ? 'home' : 'away';
      const vs = fs === 'home' ? 'away' : 'home';
      const offender = pickOf(field(fs)), victim = pickOf(field(vs));
      push(minute, 'foul', fs, `Falta de ${offender.name} (${club(fs)}) em ${victim.name} (${club(vs)}).`, { player: offender.name });
      const r = rng();
      if (r < 0.012 && redCards[fs] < 2) {
        redCards[fs]++; out.add(offender.id);
        push(minute, 'red', fs, `Cartão vermelho! ${offender.name} (${club(fs)}) é expulso.`, { player: offender.name });
      } else if (r < 0.3) {
        if (yellows.has(offender.id) && redCards[fs] < 2) {
          redCards[fs]++; out.add(offender.id);
          push(minute, 'red', fs, `Segundo amarelo! ${offender.name} (${club(fs)}) é expulso.`, { player: offender.name });
        } else {
          yellows.add(offender.id);
          push(minute, 'yellow', fs, `Cartão amarelo para ${offender.name} (${club(fs)}).`, { player: offender.name });
        }
      }
    }

    if (rng() > 0.3) continue; // sem ataque neste minuto

    // penalidade por expulsões
    const hMid = H.mid * homeAdv * (1 - 0.08 * redCards.home);
    const aMid = A.mid * (1 - 0.08 * redCards.away);
    const homeAttacks = rng() < hMid / (hMid + aMid);
    const atk = homeAttacks ? H : A;
    const dfn = homeAttacks ? A : H;
    const side = homeAttacks ? 'home' : 'away';
    const other = homeAttacks ? 'away' : 'home';

    const pShot = clamp(0.5 * (atk.att / dfn.def) ** 0.6, 0.25, 0.8);
    if (rng() > pShot) {
      if (rng() < 0.2) { // ataque sem finalização: pode terminar em escanteio
        const taker = weighted(field(side), (p) => (p.pos === 'MID' ? 5 : p.pos === 'ATT' ? 2 : 0.5));
        push(minute, 'corner', side, `Escanteio para o ${club(side)}, cobrança de ${taker.name}.`, { player: taker.name });
      }
      continue;
    }
    const pGoal = clamp(0.2 * (atk.att / (dfn.def * 0.4 + dfn.gk * 0.6)) ** 0.8, 0.06, 0.45);
    const shooter = scorer(field(side).length ? field(side) : lineup(side));
    if (rng() < pGoal) {
      if (homeAttacks) hg++; else ag++;
      const helper = rng() < 0.7 ? assister(field(side), shooter) : null;
      push(minute, 'goal', side, `GOOOL! ${shooter.name} marca para o ${club(side)}${helper ? ` (assistência de ${helper.name})` : ''}. ${names.home} ${hg} x ${ag} ${names.away}.`, { player: shooter.name, score: [hg, ag] });
    } else {
      const gk = keeper(other);
      const r = rng();
      if (r < 0.5) push(minute, 'save', side, `${shooter.name} (${club(side)}) finaliza e ${gk.name} defende.`, { player: shooter.name });
      else if (r < 0.62) push(minute, 'miss', side, `${shooter.name} (${club(side)}) acerta a trave!`, { player: shooter.name });
      else push(minute, 'miss', side, `${shooter.name} (${club(side)}) chuta para fora.`, { player: shooter.name });
    }
  }
  push(90, 'fulltime', 'none', `Fim de jogo! ${names.home} ${hg} x ${ag} ${names.away}.`, { score: [hg, ag] });
  return { homeGoals: hg, awayGoals: ag, events };
}
