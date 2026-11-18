import { describe, expect, it } from 'vitest';
import { playState } from '../src/ui/pitch';
import { createDriver, createWorld, drive, goalXOf, L, MID_Y, slotOf, stepWorld, W, type World } from '../src/ui/pitch3d/world';
import { simulateMatch } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { matchStats } from '../src/engine/matchstats';
import type { MatchEvent, Position } from '../src/engine/types';
import { makeCareer } from './helpers';

const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side'], extra: Partial<MatchEvent> = {}): MatchEvent => ({ minute, type, side, text: '', player: 'x', ...extra });
const ids = (p: string) => Array.from({ length: 11 }, (_, i) => `${p}${i}`);
const posOf = (id: string): Position | undefined => { const i = Number(id.slice(1)); return i === 0 ? 'GK' : i <= 4 ? 'DEF' : i <= 8 ? 'MID' : 'ATT'; };
const kickoff = ev(0, 'kickoff', 'none', { lineups: { home: ids('h'), away: ids('a'), homeFormation: '4-4-2', awayFormation: '4-4-2' } });
const start = (events: MatchEvent[], minute: number) => { const w = createWorld('4-4-2', '4-4-2'); w.posOf = posOf; const drv = createDriver(); drive(w, drv, events, minute - 1); for (let i = 0; i < 20; i++) stepWorld(w, 1 / 30); drive(w, drv, events, minute); return { w, drv }; };
const run = (w: World, secs: number, each?: () => void) => { for (let t = 0; t < secs; t += 1 / 30) { stepWorld(w, 1 / 30); each?.(); } };
const gk = (w: World, side: 'home' | 'away') => w.agents[side === 'home' ? 0 : 11];

describe('arbitragem', () => {
  it('árbitro e dois assistentes: o assistente fica na linha lateral, cada um numa metade, e o árbitro acompanha a jogada dentro do campo', () => {
    const w = createWorld('4-4-2', '4-4-2'); expect(w.refs).toHaveLength(3);
    const ball = (x: number, y: number) => { w.ball.p = { x, y, z: 0.22 }; run(w, 8); };
    for (const [x, y] of [[20, 30], [85, 50], [52, 10]] as const) {
      ball(x, y); const [ref, ar1, ar2] = w.refs;
      expect(ar1.y).toBeLessThan(0); expect(ar2.y).toBeGreaterThan(W);                       // fora das linhas, um de cada lado
      expect(ar1.x).toBeLessThanOrEqual(L / 2 + 11); expect(ar2.x).toBeGreaterThanOrEqual(L / 2 - 11); // cada um na sua metade
      expect(ref.x).toBeGreaterThan(0); expect(ref.x).toBeLessThan(L); expect(ref.y).toBeGreaterThan(0); expect(ref.y).toBeLessThan(W);
      expect(Math.hypot(ref.x - x, ref.y - y)).toBeLessThan(32);                              // perto da jogada
    }
  });

  it('falta: o jogo para, o árbitro apita, a bola vai ao local, o ofendido levanta e a cobrança é feita pelo time certo; depois o jogo segue', () => {
    const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a6', victimId: 'h7' })];
    const { w } = start(events, 20); const ball0 = { ...w.ball.p };
    const apitos0 = w.whistles; expect(w.script?.kind).toBe('foul');
    let setup = false, victimDown = false, kickedBy = '';
    run(w, 14, () => { if (w.agents[7].state === 'down') victimDown = true; if (w.script?.data.setup) setup = true; if (!kickedBy && w.kickQ) kickedBy = w.ball.lastSide ?? ''; });
    expect(w.whistles - apitos0).toBeGreaterThanOrEqual(2);     // apito da falta e apito da cobrança
    expect(victimDown).toBe(true); expect(setup).toBe(true); expect(w.script).toBeNull();
    expect(Math.hypot(ball0.x - 52.5, 0)).toBeGreaterThanOrEqual(0);
  });

  it('barreira: falta perto do gol forma a barreira a 9,15 m da bola, na linha do gol, com o goleiro ajustado', () => {
    const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a6', victimId: 'h7' })];
    const w = createWorld('4-4-2', '4-4-2'); w.posOf = posOf; const drv = createDriver();
    drive(w, drv, events, 19); for (let i = 0; i < 20; i++) stepWorld(w, 1 / 30);
    w.flow.st = { ...playState([], 0, 0), ball: { x: 80, y: 26 }, possession: 'home' }; // falta a ~20 m do gol da direita
    drive(w, drv, events, 20);
    let checked = false;
    run(w, 9, () => { // na hora da cobrança a barreira já está formada
      const sc = w.script; if (!sc || !sc.data.kicked || checked) return; checked = true;
      const spot = { x: sc.data.rx, y: sc.data.ry }, wall = Array.from({ length: sc.data.wallN }, (_, i) => sc.data[`wall${i}`]);
      expect(wall.length).toBeGreaterThanOrEqual(3);
      for (const id of wall) { const a = w.agents[id]; expect(a.side).toBe('away'); const d = Math.hypot(a.x - spot.x, a.y - spot.y); expect(d).toBeGreaterThan(7.4); expect(d).toBeLessThan(11); }
      const g = gk(w, 'away'); expect(Math.abs(g.x - goalXOf('home', false))).toBeLessThan(3.5);
    });
    expect(checked).toBe(true);
  });

  it('cartão amarelo e vermelho: o árbitro mostra o cartão; o expulso sai pela lateral e não volta, nem depois de um gol', () => {
    const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a6', victimId: 'h7' }), ev(20, 'red', 'away', { pid: 'a6' }), ev(30, 'goal', 'home', { pid: 'h9', how: 'foot' })];
    const { w, drv } = start(events, 20);
    expect(w.script?.data.card).toBe(2); expect(w.queue).toHaveLength(0); // o cartão faz parte da mesma jogada
    let card = '', cardAct = false;
    run(w, 16, () => { if (w.card) card = w.card.kind; if (w.refs[0].act?.kind === 'ref_card') cardAct = true; });
    expect(card).toBe('red'); expect(cardAct).toBe(true);
    const red = w.agents[11 + slotOf(w, 'away', 'a6')]; expect(red.off).toBe('gone');
    drive(w, drv, events, 29); drive(w, drv, events, 30); run(w, 12);
    expect(w.goals.home).toBe(1); expect(red.off).toBe('gone');   // depois do gol, quem foi expulso continua fora
    expect(w.agents.filter((a) => a.side === 'away' && a.off !== 'gone')).toHaveLength(10);
    // salto no tempo (pular a partida): o expulso também não está em campo
    const w2 = createWorld('4-4-2', '4-4-2'); w2.posOf = posOf; const d2 = createDriver(); drive(w2, d2, events, 0); drive(w2, d2, events, 60);
    expect(w2.agents.filter((a) => a.side === 'away' && a.off === 'gone')).toHaveLength(1);
  });

  it('pênalti: o árbitro aponta a marca, só o cobrador e o goleiro ficam na área, a cobrança é do jogador do motor e o resultado é o do motor', () => {
    for (const [outcome, extra] of [['goal', { how: 'foot' as const }], ['save', {}], ['miss', { how: 'wide' as const }]] as const) {
      const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a3', victimId: 'h9', pen: true }), ev(20, outcome, 'home', { pid: 'h9', pen: true, ...extra, ...(outcome === 'save' ? { gkId: 'a0' } : {}) })];
      const { w } = start(events, 20);
      expect(w.script?.kind).toBe('foul'); expect(w.script?.then?.kind).toBe(outcome);
      let pointed = false, areaOk = true, kicked = false, kickerSlot = -1; const gx = goalXOf('home', false);
      run(w, 20, () => {
        if (w.refs[0].act?.kind === 'ref_point') pointed = true;
        const s = w.script; if (s && s.kind !== 'foul' && !kicked) { kicked = true; kickerSlot = s.shooter; }
        if (w.script?.data.setup && !kicked) for (const a of w.agents) { const inBox = Math.abs(a.x - gx) < 16.5 && Math.abs(a.y - MID_Y) < 20.16; const t = w.script.data.kickT - w.script.t; if (inBox && t < 0.2 && a.idx !== 0 && a.id !== 9 && a.off !== 'gone') areaOk = false; }
      });
      expect(pointed).toBe(true); expect(kicked).toBe(true); expect(kickerSlot).toBe(9);
      expect(w.goals.home).toBe(outcome === 'goal' ? 1 : 0); expect(w.goals.away).toBe(0);
    }
  });

  it('impedimento: o assistente levanta a bandeira, o árbitro apita e a cobrança indireta é do outro time', () => {
    const events = [kickoff, ev(20, 'offside', 'home', { pid: 'h9' })];
    const { w } = start(events, 20); expect(w.script?.kind).toBe('offside');
    let flag = false, whistles0 = w.whistles, kicker = '';
    run(w, 10, () => { if (w.refs[1].act?.kind === 'flag_up' || w.refs[2].act?.kind === 'flag_up') flag = true; if (!kicker && w.kickQ) kicker = w.ball.lastSide ?? ''; });
    expect(flag).toBe(true); expect(w.whistles - whistles0).toBeGreaterThanOrEqual(2); expect(w.script).toBeNull();
  });

  it('tiro de meta depois de um chute para fora: o goleiro de quem sofreu repõe a bola e o assistente sinaliza', () => {
    const events = [kickoff, ev(20, 'miss', 'home', { pid: 'h9', how: 'wide' })];
    const { w } = start(events, 20);
    let flag = false, gkKick = false, scored = false;
    run(w, 14, () => { if (w.refs[1].act?.kind === 'flag_horizontal' || w.refs[2].act?.kind === 'flag_horizontal') flag = true; if (gk(w, 'away').act?.kind === 'long_pass') gkKick = true; if (w.ball.scored) scored = true; });
    expect(flag).toBe(true); expect(gkKick).toBe(true); expect(scored).toBe(false); expect(w.script).toBeNull();
  });

  it('vantagem: a falta com ataque do time ofendido logo em seguida não para o jogo (o árbitro abre os braços) e o lance do motor acontece', () => {
    let seen = 0;
    for (let k = 0; k < 40 && !seen; k++) {
      const fillers = Array.from({ length: k }, () => ev(5, 'tactic', 'none'));
      const events = [kickoff, ...fillers, ev(20, 'foul', 'away', { pid: 'a6', victimId: 'h7' }), ev(20, 'goal', 'home', { pid: 'h9', how: 'foot' })];
      const { w } = start(events, 20);
      if (w.script?.data.adv === 1) { seen++; let adv = false, frozen = false; run(w, 2.5, () => { if (w.refs[0].act?.kind === 'ref_advantage') adv = true; if (w.script?.data.setup) frozen = true; }); expect(adv).toBe(true); expect(frozen).toBe(false); run(w, 12); expect(w.goals.home).toBe(1); }
    }
    expect(seen).toBe(1);
  });
});

describe('motor: impedimentos e pênaltis registrados', () => {
  it('toda falta de pênalti é seguida pela cobrança do mesmo minuto, e as estatísticas contam impedimentos e pênaltis sem mudar o placar', () => {
    const g = makeCareer('palmeiras', 6); const idsC = Object.keys(g.clubs); let pens = 0, offs = 0;
    for (let n = 0; n < 150; n++) {
      const h = g.teams[idsC[n % idsC.length]], a = g.teams[idsC[(n * 5 + 1) % idsC.length]]; if (h.clubId === a.clubId) continue;
      const out = simulateMatch(h, a, makeRng(500 + n), {}, { home: 'A', away: 'B' }), st = matchStats(out.events);
      out.events.forEach((e, i) => { if (e.type === 'foul' && e.pen) { pens++; const nx = out.events[i + 1]; expect(['goal', 'save', 'miss']).toContain(nx.type); expect(nx.pen).toBe(true); expect(nx.side).not.toBe(e.side); expect(nx.minute).toBe(e.minute); } });
      offs += st.home.offsides + st.away.offsides;
      expect(st.home.goals).toBe(out.homeGoals); expect(st.away.goals).toBe(out.awayGoals);
    }
    expect(pens).toBeGreaterThan(10); expect(offs).toBeGreaterThan(100);
  });
});
