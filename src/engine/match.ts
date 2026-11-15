import { clamp, makeRng, type Rng } from './rng';
import { autoLineup, teamRatings } from './squad';
import { FORMATIONS, type FormationId, type MatchEvent, type Player, type TeamState } from './types';

/** Mudança tática feita pelo treinador durante a partida: vale a partir do minuto seguinte. */
export interface Tactic { minute: number; formation: FormationId; lineup: string[] }
export const MAX_TACTIC_CHANGES = 5;
/** Quanto a formação "ataca" (0 = 4-4-2; positivo ataca mais, negativo defende mais). */
export const attackBias = (f: FormationId) => { const x = FORMATIONS[f]; return (x.ATT - 2) + (x.MID - 4) * 0.5 - (x.DEF - 4) * 0.5; };
/** Efeito de uma troca na hora certa/errada: quem perde deve atacar, quem ganha deve fechar. Positivo = acertou. */
export function tacticQuality(diff: number, minute: number, fromBias: number, toBias: number): number {
  const want = diff < 0 ? 1 : diff > 0 ? -1 : 0; // perdendo: atacar; ganhando: fechar
  if (!want) return 0;
  return want * (toBias - fromBias) * (minute >= 70 ? 1.3 : 1);
}

let ACTIVE: { clubId: string; list: Tactic[] } | null = null;
/** Executa `fn` com mudanças táticas do seu clube valendo nas partidas simuladas dentro dela. */
export function withTactics<T>(clubId: string, list: Tactic[] | undefined, fn: () => T): T {
  if (!list?.length) return fn();
  ACTIVE = { clubId, list: [...list].sort((a, b) => a.minute - b.minute).slice(0, MAX_TACTIC_CHANGES) };
  try { return fn(); } finally { ACTIVE = null; }
}

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
export function simulateMatch(home: TeamState, away: TeamState, rngOuter: Rng, mods: Mods = {}, names: MatchNames = { home: 'Mandante', away: 'Visitante' }): SimOutput {
  // um único sorteio do gerador geral decide a partida inteira (assim dá para refazer a partida a partir de um minuto com a mesma "sorte")
  const rng = makeRng(Math.floor(rngOuter() * 2 ** 31));
  const scale = (r: ReturnType<typeof teamRatings>, k: number, att = 1, def = 1) => ({ ...r, gk: r.gk * k, def: r.def * k * def, mid: r.mid * k, att: r.att * k * att });
  const mineSide: 'home' | 'away' | null = ACTIVE ? (home.clubId === ACTIVE.clubId ? 'home' : away.clubId === ACTIVE.clubId ? 'away' : null) : null;
  const tactics = mineSide && ACTIVE ? ACTIVE.list : [];
  let tIdx = 0, changes = 0, lastChange = -99;
  const origBias = attackBias(mineSide === 'home' ? home.formation : away.formation);
  let curBias = origBias;
  const fx = { start: 0, bonus: 0, confUntil: 0 };
  let hTeam = home, aTeam = away;
  let hR = teamRatings(home), aR = teamRatings(away);
  const ratings = (side: 'home' | 'away', minute: number) => {
    const r = side === 'home' ? hR : aR, k = (side === 'home' ? mods.home : mods.away) ?? 1;
    if (side !== mineSide) return scale(r, k);
    const fade = Math.max(0, 1 - (minute - fx.start) / 25), all = 1 + fx.bonus * fade + (minute < fx.confUntil ? -0.03 : 0), st = curBias - origBias;
    return scale({ ...r, mid: r.mid * all }, k, all * (1 + 0.08 * st), all * (1 - 0.08 * st));
  };
  const homeAdv = 1.08;
  const events: MatchEvent[] = [];
  let hg = 0, ag = 0;

  const lineupOf = (t: TeamState) => t.lineup.map((id) => t.players.find((p) => p.id === id)!);
  let hl = lineupOf(home), al = lineupOf(away);
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
    // mudanças táticas do treinador (valem a partir deste minuto)
    while (tIdx < tactics.length && tactics[tIdx].minute < minute) {
      const t = tactics[tIdx++];
      const side = mineSide!;
      const team = side === 'home' ? hTeam : aTeam;
      const ok = t.lineup.length === 11 && new Set(t.lineup).size === 11 && t.lineup.every((id) => team.players.some((p) => p.id === id)) && t.lineup.filter((id) => team.players.find((p) => p.id === id)!.pos === 'GK').length === 1;
      const next: TeamState = { ...team, formation: t.formation, lineup: ok ? t.lineup : autoLineup(team.players, t.formation) };
      const oldR = side === 'home' ? hR : aR, newR = teamRatings(next);
      const diff = side === 'home' ? hg - ag : ag - hg;
      const q = tacticQuality(diff, minute, curBias, attackBias(t.formation));
      fx.bonus = clamp(0.1 * q + 0.01 * (newR.overall - oldR.overall), -0.2, 0.15); fx.start = minute;
      fx.confUntil = minute - lastChange < 10 ? minute + 10 : 0; // mexer toda hora desorganiza
      lastChange = minute; changes++;
      curBias = attackBias(t.formation);
      if (side === 'home') { hTeam = next; hR = newR; hl = lineupOf(next); } else { aTeam = next; aR = newR; al = lineupOf(next); }
      const c = club(side);
      const text = q >= 0.75 ? (diff < 0 ? `${c} mexeu bem: ${t.formation} e o time sobe, pressionando atrás do resultado!` : `${c} mexeu bem: ${t.formation} fecha o time e protege o resultado.`)
        : q <= -0.75 ? (diff < 0 ? `${c} mexeu mal: ${t.formation} fecha demais quando precisa do gol!` : `${c} mexeu mal: ${t.formation} abre espaços na defesa!`)
        : fx.confUntil ? `${c}: mais uma mudança em pouco tempo (${t.formation}); o time se perde um pouco.`
        : `${c} muda para ${t.formation}.`;
      push(minute - 1, 'tactic', side, text);
    }
    const H = ratings('home', minute), A = ratings('away', minute);
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

/** Taxa de empate de um jogo normal (medida no simulador) e o aumento de empates nas copas: +47% (de ~21% para ~31%), então mais jogos vão aos pênaltis. */
export const BASE_DRAW_RATE = 0.21;
export const CUP_DRAW_BOOST = 0.47;
/** Chance de sortear o jogo de novo quando não deu empate, para que a taxa de empates suba CUP_DRAW_BOOST. */
export const CUP_REROLL = CUP_DRAW_BOOST / (1 - BASE_DRAW_RATE);

/** Jogo de copa (mata-mata): como o normal, mas com mais empates (e, portanto, mais pênaltis). */
export function simulateCupMatch(home: TeamState, away: TeamState, rng: Rng, mods: Mods = {}, names: MatchNames = { home: 'Mandante', away: 'Visitante' }): SimOutput {
  const first = simulateMatch(home, away, rng, mods, names);
  if (first.homeGoals === first.awayGoals || rng() >= CUP_REROLL) return first;
  return simulateMatch(home, away, rng, mods, names); // segunda chance de empatar
}
