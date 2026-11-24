import { clamp, hashString, makeRng, type Rng } from './rng';
import { autoLineup, spotOf, teamRatings } from './squad';
import { MAX_INJURIES_PER_MATCH, rollInjury, rollMatchInjuries, spanLabel, type InjuryHit } from './injuries';
import { FORMATIONS, type FormationId, type MatchEvent, type Player, type Stance, type TeamState } from './types';

/** Mudança tática feita pelo treinador durante a partida: vale a partir do minuto seguinte. */
export interface Tactic { minute: number; formation: FormationId; lineup: string[]; /** nova postura (opcional) */ stance?: Stance }

/**
 * Postura do time: muda cada decisão da partida. `mid` = controle do jogo (quem ataca mais minutos), `att` = qualidade das finalizações,
 * `def` = solidez para evitar as do rival, `foul` = faltas cometidas e `card` = cartões por falta. Equilibrado = 1 em tudo (o resultado de sempre).
 * Todas as posturas têm custo: quem ataca mais se expõe, quem se fecha cria menos.
 */
export const STANCES: Record<Stance, { label: string; icon: string; desc: string; mid: number; att: number; def: number; foul: number; card: number }> = {
  equilibrado: { label: 'Equilibrado', icon: '⚖️', desc: 'Sem exagero: joga o jogo normal.', mid: 1, att: 1, def: 1, foul: 1, card: 1 },
  posse: { label: 'Posse de bola', icon: '🎯', desc: 'Foca na bola: domina o meio e ataca mais minutos, com poucas faltas, mas chuta com menos veneno.', mid: 1.09, att: 0.97, def: 1, foul: 0.85, card: 0.9 },
  contra: { label: 'Recuado no contra-ataque', icon: '🛡️', desc: 'Fica atrás esperando o erro do rival: defende bem e ataca pouco, mas os contra-ataques saem perigosos.', mid: 0.92, att: 1.07, def: 1.07, foul: 1, card: 1 },
  agressivo: { label: 'Agressivo: ataque o tempo todo', icon: '🔥', desc: 'Pressiona sem parar: cria muito, mas deixa a defesa aberta, comete mais faltas e leva mais cartões.', mid: 1.05, att: 1.1, def: 0.9, foul: 1.25, card: 1.2 },
  cauteloso: { label: 'Cauteloso', icon: '🧱', desc: 'Joga para não sofrer: defesa mais firme, ataque mais tímido e poucas faltas.', mid: 0.98, att: 0.95, def: 1.09, foul: 0.85, card: 0.85 },
};
export const STANCE_LIST = Object.keys(STANCES) as Stance[];
export const MAX_TACTIC_CHANGES = 5;
/** Quanto a formação "ataca" (0 = 4-4-2; positivo ataca mais, negativo defende mais). */
export const attackBias = (f: FormationId) => { const x = FORMATIONS[f]; return (x.ATT - 2) + (x.MID - 4) * 0.5 - (x.DEF - 4) * 0.5; };
/** Efeito de uma troca na hora certa/errada: quem perde deve atacar, quem ganha deve fechar. Positivo = acertou. */
export function tacticQuality(diff: number, minute: number, fromBias: number, toBias: number): number {
  const want = diff < 0 ? 1 : diff > 0 ? -1 : 0; // perdendo: atacar; ganhando: fechar
  if (!want) return 0;
  return want * (toBias - fromBias) * (minute >= 70 ? 1.3 : 1);
}

/** VAR: chance de cada decisão (todas saem de um número fixo do lance, sem favorecer ninguém). */
export const VAR_GOAL_OFFSIDE = 0.035, VAR_GOAL_FOUL = 0.015, VAR_PEN_CANCEL = 0.10, VAR_RED_DOWNGRADE = 0.25, VAR_ID_FIX = 0.03;
/** Pênalti convertido: ~76% (o real). Fora do pênalti, o fator ajusta a chance de gol (medido em 10 mil jogos) para repor os gols que o VAR anula e os pênaltis convertidos a mais: a média da liga fica igual (~2,96 gols por jogo). */
export const PEN_CONVERT = 0.76, VAR_GOAL_COMP = 0.995;
const unit = (key: string) => (hashString(key) % 10000) / 10000;

let ACTIVE: { clubId: string; list: Tactic[] } | null = null;
let UNAVAILABLE: Set<string> | null = null;
/** Executa `fn` sabendo quem já está lesionado: a substituição por lesão em campo nunca usa um desses jogadores. */
export function withInjured<T>(injured: Set<string>, fn: () => T): T {
  UNAVAILABLE = injured;
  try { return fn(); } finally { UNAVAILABLE = null; }
}
/** Executa `fn` com mudanças táticas do seu clube valendo nas partidas simuladas dentro dela. */
export function withTactics<T>(clubId: string, list: Tactic[] | undefined, fn: () => T): T {
  if (!list?.length) return fn();
  ACTIVE = { clubId, list: [...list].sort((a, b) => a.minute - b.minute).slice(0, MAX_TACTIC_CHANGES) };
  try { return fn(); } finally { ACTIVE = null; }
}

export interface SimOutput { homeGoals: number; awayGoals: number; events: MatchEvent[]; /** lesões que aconteceram na partida (para o jogo registrar) */ injured?: InjuryHit[] }
export interface Mods { home?: number; away?: number }
export interface MatchNames { home: string; away: string }

/**
 * Simulação minuto a minuto, com narração.
 * Cada minuto pode virar um ataque; o meio-campo decide quem ataca, ataque x defesa decide se vira finalização,
 * e ataque x (defesa+goleiro) se vira gol. Calibrado para ~2,6 gols por jogo entre times iguais, com leve vantagem de casa.
 * Além dos gols, gera faltas, cartões, escanteios, defesas e chutes para fora, sempre com o nome do jogador.
 * `mods` multiplica a força do time (ex.: humor da equipe: 0,96 a 1,04); `names` traz os nomes dos clubes para o texto.
 */
/** Quanto a diferença de overall entre os times é ampliada na partida (1 = sem ampliar). */
/** Expoentes do ataque conforme a razão de overall: quem tem overall menor rende menos (DOWN); quem tem maior rende um pouco mais (UP). */
export const UPSET_DOWN = 5, UPSET_UP = 1;
export function simulateMatch(home: TeamState, away: TeamState, rngOuter: Rng, mods: Mods = {}, names: MatchNames = { home: 'Mandante', away: 'Visitante' }): SimOutput {
  // um único sorteio do gerador geral decide a partida inteira (assim dá para refazer a partida a partir de um minuto com a mesma "sorte")
  const rng = makeRng(Math.floor(rngOuter() * 2 ** 31));
  const injRng = makeRng(Math.floor(rngOuter() * 2 ** 31)); // lesões têm sorteio próprio: a chance (10% leve, 3% grave por time) não depende do resto da partida
  const injPlan = { home: rollMatchInjuries(injRng), away: rollMatchInjuries(injRng) };
  const scale = (r: ReturnType<typeof teamRatings>, k: number, att = 1, def = 1) => ({ ...r, gk: r.gk * k, def: r.def * k * def, mid: r.mid * k, att: r.att * k * att });
  const mineSide: 'home' | 'away' | null = ACTIVE ? (home.clubId === ACTIVE.clubId ? 'home' : away.clubId === ACTIVE.clubId ? 'away' : null) : null;
  const tactics = mineSide && ACTIVE ? ACTIVE.list : [];
  let tIdx = 0, changes = 0, lastChange = -99;
  const origBias = attackBias(mineSide === 'home' ? home.formation : away.formation);
  let curBias = origBias;
  const fx = { start: 0, bonus: 0, confUntil: 0 };
  let hTeam = home, aTeam = away;
  let hR = teamRatings(home), aR = teamRatings(away);
  const injured: InjuryHit[] = [];
  const handicap = { home: 1, away: 1 }; // sem reserva para repor o lesionado: joga com um a menos
  const injCount = { home: 0, away: 0 };
  const stance: Record<'home' | 'away', Stance> = { home: home.stance ?? 'equilibrado', away: away.stance ?? 'equilibrado' };
  // o favorito (overall maior) raramente perde para quem tem overall menor: quem tem overall menor rende menos que a diferença real
  const stretchOf = (side: 'home' | 'away'): number => { const o = (side === 'home' ? hR : aR).overall, q = (side === 'home' ? aR : hR).overall; return o > 0 && q > 0 ? (o / q) ** (o < q ? UPSET_DOWN : UPSET_UP) : 1; };
  const ratings = (side: 'home' | 'away', minute: number) => {
    const sf = STANCES[stance[side]];
    const r0 = side === 'home' ? hR : aR, r = sf === STANCES.equilibrado ? r0 : { ...r0, mid: r0.mid * sf.mid, att: r0.att * sf.att, def: r0.def * sf.def }, k = ((side === 'home' ? mods.home : mods.away) ?? 1) * handicap[side];
    const sx = stretchOf(side);
    if (side !== mineSide) return scale(r, k, sx);
    const fade = Math.max(0, 1 - (minute - fx.start) / 25), all = 1 + fx.bonus * fade + (minute < fx.confUntil ? -0.03 : 0), st = curBias - origBias;
    return scale({ ...r, mid: r.mid * all }, k, all * (1 + 0.08 * st) * sx, all * (1 - 0.08 * st));
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

  // lesões em campo: o jogador sai e um reserva da mesma linha entra (ou o time segue com um a menos)
  const hurtIds = new Set<string>();
  const hurt = (side: 'home' | 'away', minute: number, p: Player, severity: 'leve' | 'grave') => {
    const inj = rollInjury(injRng, p.age, severity);
    injCount[side]++; hurtIds.add(p.id);
    const team = side === 'home' ? hTeam : aTeam;
    injured.push({ playerId: p.id, clubId: team.clubId, rounds: inj.rounds, kind: inj.kind, days: inj.days, severity: inj.severity });
    const bench = team.players.filter((q) => q.pos === p.pos && !team.lineup.includes(q.id) && !UNAVAILABLE?.has(q.id) && !hurtIds.has(q.id)).sort((a, b) => b.strength - a.strength);
    let text: string;
    if (bench[0]) {
      const next: TeamState = { ...team, lineup: team.lineup.map((id) => (id === p.id ? bench[0].id : id)) };
      if (side === 'home') { hTeam = next; hR = teamRatings(next); hl = lineupOf(next); } else { aTeam = next; aR = teamRatings(next); al = lineupOf(next); }
      text = `${p.name} (${club(side)}) se lesiona (${inj.kind}${inj.severity === 'grave' ? ', lesão grave' : ''}) e sai de campo, fora por ${spanLabel(inj.days)}. Entra ${bench[0].name}.`;
    } else { handicap[side] *= 0.93; text = `${p.name} (${club(side)}) se lesiona (${inj.kind}${inj.severity === 'grave' ? ', lesão grave' : ''}), fora por ${spanLabel(inj.days)}, e o time segue com um a menos.`; }
    push(minute, 'injury', side, text, { player: p.name, pid: p.id, ...(bench[0] ? { inId: bench[0].id } : {}), injury: { playerId: p.id, rounds: inj.rounds, kind: inj.kind, days: inj.days, severity: inj.severity } });
  };

  const weighted = (list: Player[], weight: (p: Player) => number): Player => {
    const w = list.map(weight);
    const total = w.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  };
  // atacantes marcam mais (o centroavante mais que os pontas), depois meias, depois defensores (zagueiro de cabeça, lateral de vez em quando)
  const GOAL_SPOT = { CA: 1.25, PD: 1.05, PE: 1.05, MD: 0.95, ME: 0.95, MC: 1, LD: 0.85, LE: 0.85, ZAG: 0.8, GK: 0 } as const;
  const scorer = (list: Player[]) => weighted(list, (p) => (p.pos === 'ATT' ? 6 : p.pos === 'MID' ? 3 : p.pos === 'DEF' ? 1 : 0) * GOAL_SPOT[spotOf(p)] * (p.strength / 60));
  // assistências vêm mais de meias e pontas abertos e dos laterais (cruzamentos)
  const ASSIST_SPOT = { MD: 1.3, ME: 1.3, PD: 1.25, PE: 1.25, LD: 1.5, LE: 1.5, MC: 1, CA: 0.8, ZAG: 0.6, GK: 0 } as const;
  const assister = (list: Player[], not: Player) => weighted(list.filter((p) => p !== not && p.pos !== 'GK'), (p) => (p.pos === 'MID' ? 5 : p.pos === 'ATT' ? 4 : 1) * ASSIST_SPOT[spotOf(p)]);
  const WIDE = new Set(['LD', 'LE', 'MD', 'ME', 'PD', 'PE']);

  push(0, 'kickoff', 'none', `Começa o jogo! ${names.home} x ${names.away}.`, { lineups: { home: [...home.lineup], away: [...away.lineup], homeFormation: home.formation, awayFormation: away.formation } });

  for (let minute = 1; minute <= 90; minute++) {
    // mudanças táticas do treinador (valem a partir deste minuto)
    while (tIdx < tactics.length && tactics[tIdx].minute < minute) {
      const t = tactics[tIdx++];
      const side = mineSide!;
      const team = side === 'home' ? hTeam : aTeam;
      const ok = t.lineup.length === 11 && new Set(t.lineup).size === 11 && t.lineup.every((id) => team.players.some((p) => p.id === id)) && t.lineup.filter((id) => team.players.find((p) => p.id === id)!.pos === 'GK').length === 1;
      const next: TeamState = { ...team, formation: t.formation, lineup: ok ? t.lineup : autoLineup(team.players, t.formation) };
      const oldStance = stance[side];
      if (t.stance && STANCES[t.stance]) stance[side] = t.stance;
      if (t.formation === team.formation && next.lineup.every((id, i) => id === team.lineup[i])) { // só a postura mudou: sem bônus nem confusão da formação
        if (stance[side] === oldStance) continue;
        lastChange = minute; changes++;
        push(minute - 1, 'tactic', side, `${club(side)} muda a postura: ${STANCES[stance[side]].icon} ${STANCES[stance[side]].label}.`, { lineup: [...team.lineup], formation: team.formation });
        continue;
      }
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
      push(minute - 1, 'tactic', side, text, { lineup: [...next.lineup], formation: next.formation });
    }
    for (const side of ['home', 'away'] as const) { // lesões sorteadas para esta partida (10% leve, 3% grave por time): acontecem no minuto sorteado, mais comuns em veteranos
      for (const plan of injPlan[side]) {
        if (plan.minute !== minute || injCount[side] >= MAX_INJURIES_PER_MATCH) continue;
        const cands = lineup(side).filter((p) => !out.has(p.id) && !hurtIds.has(p.id));
        if (cands.length) hurt(side, minute, weighted(cands, (p) => (p.pos === 'GK' ? 0.3 : 1) * (p.age >= 31 ? 1.5 : p.age <= 21 ? 0.8 : 1)), plan.severity);
      }
    }
    const H = ratings('home', minute), A = ratings('away', minute);
    if (minute === 46) push(45, 'halftime', 'none', `Fim do primeiro tempo: ${names.home} ${hg} x ${ag} ${names.away}.`, { score: [hg, ag] });

    // falta (e cartão), independente dos ataques
    if (rng() < 0.11) {
      const fh = STANCES[stance.home].foul, fa = STANCES[stance.away].foul;
      const fs = rng() < fh / (fh + fa) ? 'home' : 'away';
      const vs = fs === 'home' ? 'away' : 'home';
      const offender = pickOf(field(fs)), victim = pickOf(field(vs));
      push(minute, 'foul', fs, `Falta de ${offender.name} (${club(fs)}) em ${victim.name} (${club(vs)}).`, { player: offender.name, pid: offender.id, victimId: victim.id });
      const r = rng();
      if (r < 0.012 && redCards[fs] < 2) {
        if (unit(`${minute}:${offender.id}:${hg}:${ag}:reddown`) < VAR_RED_DOWNGRADE) { // o VAR revê o vermelho direto e ele vira amarelo
          yellows.add(offender.id);
          push(minute, 'red', fs, `Cartão vermelho para ${offender.name} (${club(fs)})! O VAR analisa a jogada.`, { player: offender.name, pid: offender.id, annulled: true });
          push(minute, 'var', fs, `VAR: a falta de ${offender.name} (${club(fs)}) não é para expulsão. O vermelho vira cartão amarelo.`, { player: offender.name, pid: offender.id, var: { kind: 'red-downgrade', target: offender.id } });
          push(minute, 'yellow', fs, `Cartão amarelo para ${offender.name} (${club(fs)}).`, { player: offender.name, pid: offender.id });
        } else {
          redCards[fs]++; out.add(offender.id);
          push(minute, 'red', fs, `Cartão vermelho! ${offender.name} (${club(fs)}) é expulso.`, { player: offender.name, pid: offender.id });
        }
      } else if (r < 0.3 * STANCES[stance[fs]].card) {
        if (yellows.has(offender.id) && redCards[fs] < 2) {
          redCards[fs]++; out.add(offender.id);
          push(minute, 'red', fs, `Segundo amarelo! ${offender.name} (${club(fs)}) é expulso.`, { player: offender.name, pid: offender.id });
        } else {
          yellows.add(offender.id);
          const others = field(fs).filter((p) => p.id !== offender.id);
          if (others.length && unit(`${minute}:${offender.id}:${hg}:${ag}:idfix`) < VAR_ID_FIX) { // o árbitro mostra o cartão ao jogador errado: o VAR corrige
            const wrong = others[hashString(`${minute}:${offender.id}:wrong`) % others.length];
            push(minute, 'yellow', fs, `Cartão amarelo para ${wrong.name} (${club(fs)}).`, { player: wrong.name, pid: wrong.id, annulled: true });
            push(minute, 'var', fs, `VAR: o cartão foi para o jogador errado. A falta foi de ${offender.name} (${club(fs)}), que leva o amarelo.`, { player: offender.name, pid: offender.id, var: { kind: 'id-fix', target: offender.id } });
          }
          push(minute, 'yellow', fs, `Cartão amarelo para ${offender.name} (${club(fs)}).`, { player: offender.name, pid: offender.id });
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
        push(minute, 'corner', side, `Escanteio para o ${club(side)}, cobrança de ${taker.name}.`, { player: taker.name, pid: taker.id });
      } else if (hashString(`${minute}:${side}:${hg}:${ag}:ofs`) % 1000 < 230) { // ataque que morre em impedimento (só um rótulo para lances sem finalização: não muda o placar nem o sorteio)
        const fw = field(side).filter((p) => p.pos === 'ATT'), pool = fw.length ? fw : field(side), who = pool[hashString(`${minute}:${side}:who`) % pool.length];
        if (who) push(minute, 'offside', side, `Impedimento de ${who.name} (${club(side)}). A bandeira do assistente sobe.`, { player: who.name, pid: who.id });
      }
      continue;
    }
    const pGoal = clamp(0.2 * (atk.att / (dfn.def * 0.4 + dfn.gk * 0.6)) ** 0.8, 0.06, 0.45);
    const shooter = scorer(field(side).length ? field(side) : lineup(side));
    // pênalti: parte das finalizações (4%) é registrada como cobrança de pênalti, com a falta na área antes; o resultado do lance é o mesmo que já foi sorteado
    const isPen = shooter.pos !== 'DEF' && hashString(`${minute}:${shooter.id}:${hg}:${ag}:pen`) % 1000 < 30;
    if (isPen) {
      const defs = field(other), off = defs.length ? defs[hashString(`${minute}:${shooter.id}:off`) % defs.length] : undefined;
      if (off) push(minute, 'foul', other, `Pênalti! ${off.name} (${club(other)}) derruba ${shooter.name} (${club(side)}) na área.`, { player: off.name, pid: off.id, victimId: shooter.id, pen: true });
    }
    if (isPen && unit(`${minute}:${shooter.id}:${hg}:${ag}:pencancel`) < VAR_PEN_CANCEL) { // o VAR revê o pênalti e cancela: não houve falta
      const defs2 = field(other), off2 = defs2.length ? defs2[hashString(`${minute}:${shooter.id}:off`) % defs2.length] : undefined;
      push(minute, 'var', side, `VAR: sem pênalti! ${shooter.name} (${club(side)}) simulou a queda; o lance recomeça com bola ao ${club(other)}.`, { player: shooter.name, pid: shooter.id, pen: true, var: { kind: 'pen-cancel', target: off2?.id } });
      continue;
    }
    const goalProb = isPen ? PEN_CONVERT : clamp(pGoal * VAR_GOAL_COMP, 0.06, 0.5);
    if (rng() < goalProb) {
      const u = isPen ? 1 : unit(`${minute}:${shooter.id}:${hg}:${ag}:var`);
      const annul: 'goal-offside' | 'goal-foul' | null = u < VAR_GOAL_OFFSIDE ? 'goal-offside' : u < VAR_GOAL_OFFSIDE + VAR_GOAL_FOUL ? 'goal-foul' : null;
      const nh = hg + (homeAttacks ? 1 : 0), na = ag + (homeAttacks ? 0 : 1);
      if (!annul) { if (homeAttacks) hg++; else ag++; }
      const drawn = rng() < 0.7 ? assister(field(side), shooter) : null; // (sempre sorteado: o gerador anda igual com ou sem pênalti)
      const helper = isPen ? null : drawn;
      if (isPen) push(minute, 'goal', side, `GOOOL! ${shooter.name} converte o pênalti para o ${club(side)}. ${names.home} ${hg} x ${ag} ${names.away}.`, { player: shooter.name, pid: shooter.id, how: 'foot', pen: true, score: [hg, ag] });
      else {
        const lead = annul ? `Bola na rede! ${shooter.name} marca para o ${club(side)}${helper ? ` (passe de ${helper.name})` : ''}. O VAR analisa o lance.` : `GOOOL! ${shooter.name} marca para o ${club(side)}${helper ? (WIDE.has(spotOf(helper)) ? ` (cruzamento de ${helper.name})` : ` (assistência de ${helper.name})`) : ''}. ${names.home} ${hg} x ${ag} ${names.away}.`;
        push(minute, 'goal', side, lead, { player: shooter.name, pid: shooter.id, ...(helper ? { assistId: helper.id } : {}), how: ((helper && WIDE.has(spotOf(helper)) && (shooter.pos === 'DEF' || spotOf(shooter) === 'CA') ? 0.55 : shooter.pos === 'DEF' ? 0.4 : 0.06) > (hashString(`${shooter.id}:${minute}:${hg}:${ag}`) % 1000) / 1000 ? 'header' : 'foot') as 'header' | 'foot', score: [annul ? nh : hg, annul ? na : ag], ...(annul ? { annulled: true } : {}) });
        if (annul) {
          const fouler = annul === 'goal-foul' ? (field(side).filter((p) => p.id !== shooter.id)[hashString(`${minute}:${shooter.id}:fouler`) % Math.max(1, field(side).length - 1)] ?? shooter) : shooter;
          push(minute, 'var', side, annul === 'goal-offside' ? `VAR: gol anulado! ${shooter.name} (${club(side)}) estava em impedimento. ${names.home} ${hg} x ${ag} ${names.away}.` : `VAR: gol anulado! Falta de ${fouler.name} (${club(side)}) no início da jogada. ${names.home} ${hg} x ${ag} ${names.away}.`, { player: fouler.name, pid: fouler.id, score: [hg, ag], var: { kind: annul, target: fouler.id } });
        }
      }
    } else {
      const gk = keeper(other);
      const r = rng();
      const pn = isPen ? { pen: true as const } : {}, verb = isPen ? 'bate o pênalti e ' : 'finaliza e ';
      if (r < 0.5) push(minute, 'save', side, `${shooter.name} (${club(side)}) ${verb}${gk.name} defende.`, { player: shooter.name, pid: shooter.id, gkId: gk.id, ...pn });
      else if (r < 0.62) push(minute, 'miss', side, `${shooter.name} (${club(side)}) ${isPen ? 'bate o pênalti e ' : ''}acerta a trave!`, { player: shooter.name, pid: shooter.id, how: 'post', ...pn });
      else push(minute, 'miss', side, `${shooter.name} (${club(side)}) ${isPen ? 'bate o pênalti e ' : ''}chuta para fora.`, { player: shooter.name, pid: shooter.id, how: 'wide', ...pn });
    }
  }
  push(90, 'fulltime', 'none', `Fim de jogo! ${names.home} ${hg} x ${ag} ${names.away}.`, { score: [hg, ag] });
  return { homeGoals: hg, awayGoals: ag, events, injured };
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
