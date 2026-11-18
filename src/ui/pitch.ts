import type { FormationId, MatchEvent } from '../engine/types';
import { FORMATION_SLOTS, SPOT_LINE } from '../engine/types';

/** Campo em 100 x 64. O mandante defende o gol da esquerda e ataca para a direita; o visitante, o contrário. */
export const PITCH_W = 100, PITCH_H = 64;
export interface Pt { x: number; y: number }
export type Side = 'home' | 'away';

/** Posição base de cada um dos 11 jogadores (goleiro + linhas), do ponto de vista de quem ataca para a direita. */
export function baseShape(formation: FormationId): Pt[] {
  const slots = FORMATION_SLOTS[formation];
  const rowX = { GK: 4, DEF: 19, MID: 35, ATT: 48 } as const;
  const line = (pos: 'DEF' | 'MID' | 'ATT'): Pt[] => {
    const sl = slots.filter((sp) => SPOT_LINE[sp] === pos);
    return sl.map((sp, i) => ({ x: rowX[pos] + (sp === 'LD' || sp === 'LE' ? 3 : sp === 'PD' || sp === 'PE' ? 2 : sp === 'MD' || sp === 'ME' ? 1 : 0), y: ((i + 1) * PITCH_H) / (sl.length + 1) })); // laterais e pontas mais abertos e adiantados
  };
  return [{ x: rowX.GK, y: PITCH_H / 2 }, ...line('DEF'), ...line('MID'), ...line('ATT')];
}
const mirror = (p: Pt): Pt => ({ x: PITCH_W - p.x, y: PITCH_H - p.y });
const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };

export interface PlayState { possession: Side | 'none'; push: number; ball: Pt; goalNow: Side | null; carrier: number }

/** Lance que "dá a bola" a um lado: quem finaliza/cobra escanteio ataca; quem faz a falta perde a bola. */
const owner = (e: MatchEvent): Side | 'none' => (e.side === 'none' ? 'none' : e.type === 'foul' || e.type === 'yellow' || e.type === 'red' ? (e.side === 'home' ? 'away' : 'home') : e.side);

/**
 * Estado do jogo num instante (`tick` = meio minuto): de quem é a bola, o quanto o time "empurra" para frente e onde está a bola.
 * Os lances da narração mandam: gol (bola no gol), defesa e chute (perto do gol), escanteio (bandeirinha). Entre lances, a bola circula entre os jogadores de ataque.
 */
export function playState(events: MatchEvent[], minute: number, tick: number): PlayState {
  let last: MatchEvent | undefined;
  for (const e of events) if (e.minute <= minute && e.type !== 'halftime' && e.type !== 'fulltime' && e.type !== 'kickoff') last = e;
  if (!last || minute < 1) return { possession: 'none', push: 0, ball: { x: 50, y: 32 }, goalNow: null, carrier: 0 };
  const side = owner(last);
  const age = minute - last.minute; // minutos desde o lance
  const goalNow = last.type === 'goal' && age < 1 ? (last.side as Side) : null;
  const push = Math.max(0, 1 - age / 4); // a pressão diminui depois do lance
  const dir = side === 'home' ? 1 : -1;
  const jitterY = 10 + hash(tick * 7 + 3) * 44;
  let ball: Pt;
  if (side === 'none') ball = { x: 50, y: 32 };
  else if (last.type === 'goal') ball = age < 1 ? { x: side === 'home' ? 98 : 2, y: 32 } : { x: 50, y: 32 }; // depois do gol, bola ao centro
  else if (last.type === 'corner') ball = age < 1.5 ? { x: side === 'home' ? 99 : 1, y: hash(tick) < 0.5 ? 1 : PITCH_H - 1 } : { x: 50 + dir * 30, y: jitterY };
  else if (last.type === 'save' || last.type === 'miss') ball = { x: side === 'home' ? 92 - 8 * (1 - push) : 8 + 8 * (1 - push), y: 24 + hash(tick) * 16 };
  else ball = { x: 50 + dir * (14 + 24 * push) + (hash(tick * 3) - 0.5) * 8, y: jitterY }; // falta/cartão: jogo em campo de ataque de quem ficou com a bola
  return { possession: side, push, ball, goalNow, carrier: Math.floor(hash(tick * 11 + 1) * 10) + 1 };
}

/** Posições dos 11 jogadores de um lado, já deslocadas pelo que está acontecendo (quem ataca sobe, quem defende recua e todos tendem à bola). */
export function positionsOf(side: Side, formation: FormationId, st: PlayState, tick: number): Pt[] {
  const base = baseShape(formation);
  const sgn = side === 'home' ? 1 : -1;
  const has = st.possession === side, lose = st.possession !== 'none' && !has;
  const shift = has ? 14 * st.push : lose ? -5 * st.push : 0;
  const pts = base.map((p, i) => {
    if (i === 0) { // goleiro: fica no gol do SEU time (o visitante defende o gol da direita) e acompanha a bola um pouco
      const gx = p.x + (has ? 2 * st.push : 0), gy = (side === 'home' ? p.y : PITCH_H - p.y) + (st.ball.y - (side === 'home' ? p.y : PITCH_H - p.y)) * 0.08;
      return { x: side === 'home' ? gx : PITCH_W - gx, y: gy };
    }
    const wobble = (hash(tick * 17 + i + (side === 'home' ? 0 : 99)) - 0.5) * 3;
    const baseX = side === 'home' ? p.x : PITCH_W - p.x; // espelhado para o visitante
    let x = baseX + sgn * shift * (p.x / 48) + wobble;
    let y = (side === 'home' ? p.y : PITCH_H - p.y) + wobble;
    const d = Math.hypot(st.ball.x - x, st.ball.y - y);
    if (d < 28) { const k = (1 - d / 28) * (has ? 0.5 : 0.35); x += (st.ball.x - x) * k; y += (st.ball.y - y) * k; } // quem está perto vai na bola
    return { x: Math.max(1.5, Math.min(PITCH_W - 1.5, x)), y: Math.max(2, Math.min(PITCH_H - 2, y)) };
  });
  // o portador da bola fica junto dela
  if (has && st.carrier > 0 && st.carrier < pts.length && !st.goalNow) pts[st.carrier] = { x: Math.max(1.5, Math.min(PITCH_W - 1.5, st.ball.x - sgn * 1.4)), y: st.ball.y };
  return pts;
}

/** Cor do time no campo: a principal; se as duas forem parecidas, o visitante usa a secundária. */
export function kitColors(home: { primaryColor: string; secondaryColor: string }, away: { primaryColor: string; secondaryColor: string }): [string, string] {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  const dist = (a: string, b: string) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  return [home.primaryColor, dist(home.primaryColor, away.primaryColor) < 90 ? away.secondaryColor : away.primaryColor];
}

export { mirror };
