import { hashString, makeRng } from './rng';
import { spotOf } from './squad';
import type { MatchEvent, Player } from './types';

/* =====================================================================
   Sequência de lances da partida (a base do campo 3D, da simulação e do VAR).
   Sai SÓ da lista de lances do motor: cada lance vira uma cadeia (passes até a finalização, falta e cartão, escanteio, substituição...).
   Nada é sorteado do gerador da partida (o resultado não muda) e nada é guardado: a mesma lista de lances gera sempre a mesma sequência,
   então "simular" e "assistir" mostram a mesma partida. Quem aparece nos lances é quem estava em campo naquele minuto.
   ===================================================================== */

export type PlayType = 'kickoff' | 'pass' | 'cross' | 'longball' | 'shot' | 'header' | 'goal' | 'save' | 'post' | 'wide' | 'corner' | 'offside' | 'var' | 'foul' | 'yellow' | 'red' | 'injury' | 'sub' | 'tactic' | 'halftime' | 'fulltime';
export interface Play {
  /** posição do lance (evento do motor) na lista; os passes de uma cadeia compartilham o mesmo `ix` */
  ix: number;
  /** segundos desde o início do jogo (relógio do 1º ao 90º minuto) */
  sec: number;
  type: PlayType;
  side: 'home' | 'away' | 'none';
  /** quem faz a ação, e para quem (passe/cruzamento/falta: o outro jogador) */
  pid?: string; to?: string;
  /** o motor confirmou este gol (só o lance final de uma cadeia de gol) */
  decisive?: boolean;
  /** o VAR desfez o lance (gol anulado) */
  annulled?: boolean;
}

export interface FieldState { home: string[]; away: string[] }

const line = (p: Player) => (p.pos === 'GK' ? 0 : p.pos === 'DEF' ? 1 : p.pos === 'MID' ? 2 : 3);

/** Quem está em campo em cada instante: começa com os 11 do apito inicial e muda com lesões (entra o reserva), mudanças táticas e expulsões. */
export function onField(events: MatchEvent[], upTo: number, keepRed = false): FieldState {
  const k = events.find((e) => e.type === 'kickoff')?.lineups;
  const st: FieldState = { home: k ? [...k.home] : [], away: k ? [...k.away] : [] };
  for (let i = 0; i < upTo && i < events.length; i++) {
    const e = events[i];
    if (e.side === 'none') continue;
    const set = st[e.side];
    if (e.type === 'tactic' && e.lineup) st[e.side] = [...e.lineup];
    else if (e.type === 'injury' && e.pid) { const ix = set.indexOf(e.pid); if (ix >= 0) { if (e.inId) set[ix] = e.inId; else set.splice(ix, 1); } }
    else if (e.type === 'red' && e.pid && !keepRed && !e.annulled) { const ix = set.indexOf(e.pid); if (ix >= 0) set.splice(ix, 1); }
  }
  return st;
}

/** Monta a sequência de lances. `players`: todos os jogadores dos dois times (por id). `seed`: identifica a partida (ex.: `${season}-${round}-${homeId}`). */
export function buildPlays(events: MatchEvent[], players: Map<string, Player>, seed: string): Play[] {
  const out: Play[] = [];
  events.forEach((e, ix) => {
    const rng = makeRng(hashString(`${seed}:${ix}:${e.minute}:${e.type}`));
    const sec0 = e.minute * 60 + Math.floor(rng() * 50);
    const field = onField(events, ix); // a escalação ANTES deste lance
    const add = (sec: number, type: PlayType, extra: Partial<Play> = {}) => out.push({ ix, sec, type, side: e.side, ...extra });
    const mine = e.side === 'none' ? [] : field[e.side].map((id) => players.get(id)).filter((p): p is Player => !!p);
    const pick = (list: Player[], w: (p: Player) => number, not: Set<string>): Player | undefined => {
      const c = list.filter((p) => !not.has(p.id)); if (!c.length) return undefined;
      const ws = c.map((p) => Math.max(0.01, w(p))); let r = rng() * ws.reduce((a, b) => a + b, 0);
      for (let i = 0; i < c.length; i++) { r -= ws[i]; if (r <= 0) return c[i]; }
      return c[c.length - 1];
    };
    switch (e.type) {
      case 'kickoff': add(0, 'kickoff'); break;
      case 'halftime': add(2700, 'halftime'); break;
      case 'fulltime': add(5400, 'fulltime'); break;
      case 'tactic': add(sec0, 'tactic'); break;
      case 'foul': add(sec0, 'foul', { pid: e.pid, to: e.victimId }); break;
      case 'yellow': add(sec0 + 6, 'yellow', { pid: e.pid }); break;
      case 'red': add(sec0 + 6, 'red', { pid: e.pid }); break;
      case 'injury': add(sec0, 'injury', { pid: e.pid }); if (e.inId) add(sec0 + 40, 'sub', { pid: e.inId, to: e.pid }); break;
      case 'corner': add(sec0, 'corner', { pid: e.pid }); break;
      case 'offside': add(sec0, 'offside', { pid: e.pid }); break;
      case 'var': add(sec0 + 20, 'var', { pid: e.pid }); break;
      case 'goal': case 'save': case 'miss': {
        // cadeia de ataque: sai de trás e chega ao finalizador (e a quem deu o passe, nos gols com assistência)
        const shooter = e.pid ? players.get(e.pid) : undefined;
        if (!shooter || !mine.length) { add(sec0, e.type === 'goal' ? 'goal' : 'wide', { pid: e.pid, ...(e.type === 'goal' ? (e.annulled ? { annulled: true } : { decisive: true }) : {}) }); break; }
        const used = new Set<string>([shooter.id]);
        const passers: Player[] = [];
        const assist = e.assistId ? players.get(e.assistId) : undefined;
        const steps = 2 + Math.floor(rng() * 3);
        const keeper = mine.find((p) => p.pos === 'GK');
        let from = pick(mine.filter((p) => p.pos !== 'GK'), (p) => (line(p) === 1 ? 3 : 1) * p.strength, used);
        if (keeper && rng() < 0.35) from = keeper;
        if (from) { passers.push(from); used.add(from.id); }
        for (let i = 1; i < steps; i++) {
          const prev = passers[passers.length - 1]; if (!prev) break;
          const nxt = pick(mine.filter((p) => p.pos !== 'GK' && line(p) >= line(prev)), (p) => (line(p) === 2 ? 3 : 1.5) * p.strength, used);
          if (!nxt) break; passers.push(nxt); used.add(nxt.id);
        }
        if (assist && !passers.includes(assist)) passers.push(assist);
        let t = sec0 - (passers.length) * 3.2;
        passers.forEach((p, i) => {
          const next = passers[i + 1] ?? shooter, last = i === passers.length - 1;
          const wide = last && !!assist && p.id === assist.id && ['LD', 'LE', 'MD', 'ME', 'PD', 'PE'].includes(spotOf(p));
          add(t, wide ? 'cross' : last && line(p) <= 1 && line(next) >= 2 && rng() < 0.4 ? 'longball' : 'pass', { pid: p.id, to: next.id });
          t += 2.2 + rng() * 1.8;
        });
        const how = e.how;
        add(sec0, e.type === 'goal' ? (how === 'header' ? 'header' : 'shot') : e.type === 'save' ? 'shot' : how === 'post' ? 'shot' : 'shot', { pid: shooter.id });
        add(sec0 + 1.2, e.type === 'goal' ? 'goal' : e.type === 'save' ? 'save' : how === 'post' ? 'post' : 'wide', { pid: e.type === 'save' ? e.gkId : shooter.id, ...(e.type === 'goal' ? (e.annulled ? { annulled: true } : { decisive: true }) : {}) });
        break;
      }
    }
  });
  return out.sort((a, b) => a.sec - b.sec || a.ix - b.ix);
}

/** Mapa de jogadores (por id) dos dois times de uma partida. */
export const playerMap = (...teams: { players: Player[] }[]): Map<string, Player> => new Map(teams.flatMap((t) => t.players).map((p) => [p.id, p]));

/** A sequência confere com o que o motor registrou? Devolve os problemas encontrados (vazio = tudo certo). */
export function checkPlays(plays: Play[], events: MatchEvent[], homeGoals: number, awayGoals: number): string[] {
  const bad: string[] = [];
  const goals = plays.filter((p) => p.type === 'goal' && p.decisive);
  if (goals.filter((g) => g.side === 'home').length !== homeGoals) bad.push('gols do mandante não conferem');
  if (goals.filter((g) => g.side === 'away').length !== awayGoals) bad.push('gols do visitante não conferem');
  for (const g of goals) { const e = events[g.ix]; if (!e || e.type !== 'goal' || e.pid !== g.pid) bad.push(`autor do gol errado no lance ${g.ix}`); }
  for (let i = 1; i < plays.length; i++) if (plays[i].sec < plays[i - 1].sec) bad.push('fora de ordem');
  for (const p of plays) {
    if (!p.pid || p.side === 'none' || p.type === 'sub') continue;
    const f = onField(events, p.ix)[p.type === 'save' ? (p.side === 'home' ? 'away' : 'home') : p.side];
    if (!f.includes(p.pid)) bad.push(`${p.type} de quem não estava em campo (${p.pid})`);
    if (p.to && p.type !== 'foul' && !f.includes(p.to)) bad.push(`passe para quem não estava em campo (${p.to})`);
  }
  return bad;
}
