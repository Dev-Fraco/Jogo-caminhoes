import { describe, expect, it } from 'vitest';
import { simulateMatch } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { matchStats, consistent } from '../src/engine/matchstats';
import { buildPlays, checkPlays, onField, playerMap } from '../src/engine/plays';
import { createDriver, createWorld, drive, replayView, stepWorld, type World } from '../src/ui/pitch3d/world';
import type { MatchEvent, Position } from '../src/engine/types';
import { makeCareer } from './helpers';

describe('VAR no motor', () => {
  const g = makeCareer('palmeiras', 8); const ids = Object.keys(g.clubs);
  const sims = Array.from({ length: 1500 }, (_, i) => { const h = g.teams[ids[i % ids.length]], a = g.teams[ids[(i * 7 + 3) % ids.length]]; return h.clubId === a.clubId ? null : { h, a, out: simulateMatch(h, a, makeRng(300 + i), {}, { home: 'A', away: 'B' }) }; }).filter((x): x is NonNullable<typeof x> => !!x);

  it('o placar vale só os gols confirmados; cada gol anulado vem seguido da decisão do VAR com o placar certo', () => {
    let goals = 0, ann = 0; const kinds = new Set<string>();
    for (const { out } of sims) {
      let h = 0, a = 0;
      out.events.forEach((e, i) => {
        if (e.type === 'goal' && !e.annulled) { if (e.side === 'home') h++; else a++; goals++; expect(e.score).toEqual([h, a]); }
        if (e.type === 'goal' && e.annulled) { ann++; const v = out.events[i + 1]; expect(v.type).toBe('var'); expect(['goal-offside', 'goal-foul']).toContain(v.var?.kind); expect(v.score).toEqual([h, a]); expect(v.side).toBe(e.side); expect(e.pen).toBeUndefined(); }
        if (e.type === 'var' && e.var) kinds.add(e.var.kind);
      });
      expect([h, a]).toEqual([out.homeGoals, out.awayGoals]);
      expect(consistent(out)).toBe(true);
      const st = matchStats(out.events); expect([st.home.goals, st.away.goals]).toEqual([out.homeGoals, out.awayGoals]);
    }
    const share = ann / (goals + ann);
    expect(share).toBeGreaterThan(0.03); expect(share).toBeLessThan(0.075);   // ~5% dos gols
    expect([...kinds].sort()).toEqual(['goal-foul', 'goal-offside', 'id-fix', 'pen-cancel', 'red-downgrade']);
  });

  it('não favorece mandante nem visitante: a parte de cada lado entre os gols anulados é a parte dele entre os gols', () => {
    let gh = 0, ga = 0, ah = 0, aa = 0;
    for (const { out } of sims) for (const e of out.events) if (e.type === 'goal') { if (e.annulled) { if (e.side === 'home') ah++; else aa++; } else if (e.side === 'home') gh++; else ga++; }
    expect(Math.abs(ah / (ah + aa) - gh / (gh + ga))).toBeLessThan(0.1);
  });

  it('pênalti cancelado não tem cobrança; cartões revistos: o vermelho vira amarelo e o cartão do jogador errado passa ao certo', () => {
    let canc = 0, down = 0, fix = 0;
    for (const { out } of sims) out.events.forEach((e, i) => {
      if (e.type === 'foul' && e.pen) { const nx = out.events[i + 1]; if (nx.type === 'var') { canc++; expect(nx.var?.kind).toBe('pen-cancel'); expect(nx.side).not.toBe(e.side); } }
      if (e.type === 'red' && e.annulled) { down++; expect(out.events[i + 1].var?.kind).toBe('red-downgrade'); const y = out.events[i + 2]; expect(y.type).toBe('yellow'); expect(y.pid).toBe(e.pid); expect(y.annulled).toBeUndefined(); expect(onField(out.events, i + 3).home.concat(onField(out.events, i + 3).away)).toContain(e.pid!); }
      if (e.type === 'yellow' && e.annulled) { fix++; const v = out.events[i + 1]; expect(v.var?.kind).toBe('id-fix'); const y = out.events[i + 2]; expect(y.type).toBe('yellow'); expect(y.pid).toBe(v.var?.target); expect(y.pid).not.toBe(e.pid); }
    });
    expect(canc).toBeGreaterThan(0); expect(down).toBeGreaterThan(0); expect(fix).toBeGreaterThan(0);
  });

  it('as estatísticas contam revisões do VAR; gol anulado conta como finalização, não como gol, e a sequência de lances confere', () => {
    let reviews = 0;
    for (const { h, a, out } of sims.slice(0, 300)) {
      const st = matchStats(out.events); reviews += st.home.varReviews + st.away.varReviews;
      expect(checkPlays(buildPlays(out.events, playerMap(h, a), 'v'), out.events, out.homeGoals, out.awayGoals)).toEqual([]);
    }
    expect(reviews).toBeGreaterThan(20);
  });

  it('calibração: com o VAR a média de gols e a vantagem de casa continuam as de antes (~2,96 gols; ~41% de vitórias do mandante)', () => {
    let goals = 0, hw = 0; for (const { out } of sims) { goals += out.homeGoals + out.awayGoals; if (out.homeGoals > out.awayGoals) hw++; }
    const avg = goals / sims.length, hwr = hw / sims.length;
    expect(avg).toBeGreaterThan(2.75); expect(avg).toBeLessThan(3.2); expect(hwr).toBeGreaterThan(0.36); expect(hwr).toBeLessThan(0.47);
  });

  it('é determinístico: mesma partida, mesmas decisões', () => {
    const { h, a } = sims[0]; const x = simulateMatch(h, a, makeRng(4242), {}, { home: 'A', away: 'B' }), y = simulateMatch(h, a, makeRng(4242), {}, { home: 'A', away: 'B' });
    expect(x.events).toEqual(y.events);
  });
});

describe('VAR no campo', () => {
  const ev = (minute: number, type: MatchEvent['type'], side: MatchEvent['side'], extra: Partial<MatchEvent> = {}): MatchEvent => ({ minute, type, side, text: '', player: 'x', ...extra });
  const hid = (p: string) => Array.from({ length: 11 }, (_, i) => `${p}${i}`);
  const posOf = (id: string): Position | undefined => { const i = Number(id.slice(1)); return i === 0 ? 'GK' : i <= 4 ? 'DEF' : i <= 8 ? 'MID' : 'ATT'; };
  const kickoff = ev(0, 'kickoff', 'none', { lineups: { home: hid('h'), away: hid('a'), homeFormation: '4-4-2', awayFormation: '4-4-2' } });
  const start = (events: MatchEvent[], minute: number) => { const w = createWorld('4-4-2', '4-4-2'); w.posOf = posOf; const drv = createDriver(); drive(w, drv, events, minute - 1); for (let i = 0; i < 20; i++) stepWorld(w, 1 / 30); drive(w, drv, events, minute); return { w, drv }; };
  /** Anda até o VAR começar; devolve o estado. */
  const untilVar = (w: World, maxS = 14) => { for (let t = 0; t < maxS; t += 1 / 30) { stepWorld(w, 1 / 30); if (w.var) return w.var; } return null; };
  const runVar = (w: World, chunk = 1 / 30) => { const seen: string[] = []; let guard = 0; const t0 = w.t; while (w.var && guard++ < 4000) { if (!seen.includes(w.var.stage)) seen.push(w.var.stage); stepWorld(w, chunk); } return { seen, frozen: w.t === t0 }; };
  const goalAnn = (kind: 'goal-offside' | 'goal-foul') => [kickoff, ev(20, 'goal', 'home', { pid: 'h9', annulled: true, how: 'foot' }), ev(20, 'var', 'home', { pid: 'h9', var: { kind, target: kind === 'goal-foul' ? 'h7' : 'h9' } })];

  it('gol anulado por impedimento: a bola entra, o VAR confere, repete com as linhas, anula e o jogo recomeça com cobrança dos defensores', () => {
    const events = goalAnn('goal-offside'); const { w } = start(events, 20);
    const v = untilVar(w)!; expect(v).not.toBeNull(); expect(v.kind).toBe('goal-offside'); expect(v.annul).toBe(true);
    expect(w.ball.scored).toBe('home'); expect(w.agents.some((a) => a.state === 'celebrate')).toBe(false); // sem comemoração antes da decisão
    expect(v.line!.att).toBeGreaterThan(v.line!.def);                                                   // o atacante está à frente do último defensor (ataca para a direita)
    const t0 = w.t, ballX = w.ball.p.x, pos = w.agents.map((a) => a.x);
    expect(v.frames.length).toBeGreaterThan(60);
    const { seen } = runVar(w);
    expect(seen).toEqual(['check', 'review', 'decision']);
    expect(w.t).toBe(t0); expect(w.ball.p.x).toBe(ballX); expect(w.agents.map((a) => a.x)).toEqual(pos); // o jogo ficou parado durante a revisão
    expect(w.goals.home).toBe(0); expect(w.agents.some((a) => a.state === 'celebrate')).toBe(false);
    let freeKickBy = '', restarted = false; for (let t = 0; t < 14; t += 1 / 30) { stepWorld(w, 1 / 30); if (w.kickQ && !freeKickBy) freeKickBy = w.ball.lastSide ?? ''; if (!w.script) { restarted = true; break; } }
    expect(restarted).toBe(true); expect(freeKickBy).toBe('away'); expect(w.goals.home).toBe(0);
  });

  it('gol anulado por falta no início: o atacante derruba um defensor na jogada, a repetição usa câmeras de perto e a cobrança é dos defensores', () => {
    const { w } = start(goalAnn('goal-foul'), 20);
    let downSeen = false, duel = false; const v = (() => { for (let t = 0; t < 14; t += 1 / 30) { stepWorld(w, 1 / 30); if (w.agents.some((a) => a.side === 'away' && a.state === 'down')) downSeen = true; if (w.agents.some((a) => a.act?.kind === 'duel')) duel = true; if (w.var) return w.var; } return null; })()!;
    expect(v.kind).toBe('goal-foul'); expect(downSeen).toBe(true); expect(duel).toBe(true); expect(v.camList).toEqual(['close', 'tv']);
    runVar(w); expect(w.goals.home).toBe(0);
    for (let t = 0; t < 14 && w.script; t += 1 / 30) stepWorld(w, 1 / 30); expect(w.script).toBeNull();
  });

  it('gol confirmado: o VAR confere sem repetição e só então vem a comemoração; o placar sobe uma vez', () => {
    const events = [kickoff, ev(20, 'goal', 'home', { pid: 'h9', how: 'foot' })]; const { w } = start(events, 20);
    const v = untilVar(w)!; expect(v.kind).toBe('goal'); expect(v.annul).toBe(false); expect(v.review).toBe(false);
    expect(w.agents.some((a) => a.state === 'celebrate')).toBe(false);
    const { seen } = runVar(w); expect(seen).toEqual(['check', 'decision']);
    let celebrated = false; for (let t = 0; t < 8; t += 1 / 30) { stepWorld(w, 1 / 30); if (w.agents.some((a) => a.state === 'celebrate')) celebrated = true; }
    expect(celebrated).toBe(true); expect(w.goals.home).toBe(1);
  });

  it('pênalti cancelado: o árbitro marca, o VAR revê com repetição, decide "sem pênalti" e o jogo recomeça com a bola para os defensores', () => {
    const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a3', victimId: 'h9', pen: true }), ev(20, 'var', 'home', { pid: 'h9', pen: true, var: { kind: 'pen-cancel', target: 'a3' } })];
    const { w } = start(events, 20); expect(w.script?.data.cancel).toBe(1);
    let pointed = false; const v = (() => { for (let t = 0; t < 12; t += 1 / 30) { stepWorld(w, 1 / 30); if (w.refs[0].act?.kind === 'ref_point') pointed = true; if (w.var) return w.var; } return null; })()!;
    expect(pointed).toBe(true); expect(v.kind).toBe('pen-cancel'); expect(v.camList.length).toBe(2); expect(v.decision).toContain('SEM PÊNALTI');
    const { seen } = runVar(w); expect(seen).toEqual(['check', 'review', 'decision']);
    let by = ''; for (let t = 0; t < 14 && w.script; t += 1 / 30) { stepWorld(w, 1 / 30); if (w.kickQ && !by) by = w.ball.lastSide ?? ''; }
    expect(by).toBe('away'); expect(w.goals.home).toBe(0); expect(w.script).toBeNull();
  });

  it('pênalti confirmado: o VAR confirma antes da cobrança e o resultado é o do motor', () => {
    const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a3', victimId: 'h9', pen: true }), ev(20, 'goal', 'home', { pid: 'h9', pen: true, how: 'foot' })];
    const { w } = start(events, 20); const kinds: string[] = [];
    for (let t = 0; t < 40 && (w.script || w.var); t += 1 / 30) { stepWorld(w, 1 / 30); if (w.var && kinds[kinds.length - 1] !== w.var.kind) kinds.push(w.var.kind); }
    expect(kinds).toEqual(['pen', 'goal']); expect(w.goals.home).toBe(1);
  });

  it('vermelho revisto vira amarelo: o árbitro mostra os dois cartões em ordem e o jogador não sai do campo', () => {
    const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a6', victimId: 'h7' }), ev(20, 'red', 'away', { pid: 'a6', annulled: true }), ev(20, 'var', 'away', { pid: 'a6', var: { kind: 'red-downgrade', target: 'a6' } }), ev(20, 'yellow', 'away', { pid: 'a6' })];
    const { w } = start(events, 20); expect(w.script?.data.varCard).toBe(1); expect(w.queue).toHaveLength(0);
    const cards: string[] = []; let vk = '';
    for (let t = 0; t < 30 && (w.script || w.var); t += 1 / 30) { stepWorld(w, 1 / 30); if (w.var) vk = w.var.kind; if (w.card && cards[cards.length - 1] !== w.card.kind + w.card.until) cards.push(w.card.kind + w.card.until); }
    expect(cards.map((c) => c.replace(/[\d.]+$/, ''))).toEqual(['red', 'yellow']); expect(vk).toBe('red-downgrade');
    expect(w.agents.every((a) => a.off === undefined)).toBe(true);
  });

  it('erro de identificação: o cartão vai para o jogador errado, o VAR corrige e o cartão é do jogador certo', () => {
    const events = [kickoff, ev(20, 'foul', 'away', { pid: 'a6', victimId: 'h7' }), ev(20, 'yellow', 'away', { pid: 'a2', annulled: true }), ev(20, 'var', 'away', { pid: 'a6', var: { kind: 'id-fix', target: 'a6' } }), ev(20, 'yellow', 'away', { pid: 'a6' })];
    const { w } = start(events, 20); const who: number[] = [];
    for (let t = 0; t < 30 && (w.script || w.var); t += 1 / 30) { stepWorld(w, 1 / 30); if (w.card && who[who.length - 1] !== w.card.agent) who.push(w.card.agent); }
    expect(who).toEqual([11 + 2, 11 + 6]);                 // primeiro o jogador errado (a2), depois o certo (a6)
  });

  it('velocidade 1x a 4x: a revisão tem as mesmas etapas, na mesma ordem, e o resultado é o mesmo', () => {
    const run = (chunk: number) => { const { w } = start(goalAnn('goal-offside'), 20); for (let t = 0; t < 14 && !w.var; t += chunk) stepWorld(w, chunk); const r = runVar(w, chunk); for (let t = 0; t < 14 && w.script; t += chunk) stepWorld(w, chunk); return { seen: r.seen, goals: w.goals.home }; };
    expect(run(4 / 60)).toEqual(run(1 / 60));
  });

  it('pular a revisão encerra mais cedo, sem perder a decisão', () => {
    const { w } = start(goalAnn('goal-offside'), 20); untilVar(w);
    let steps = 0; while (w.var && steps++ < 4000) { if (steps === 20) w.var.skip = true; if (steps === 60 && w.var) w.var.skip = true; stepWorld(w, 1 / 30); }
    expect(steps).toBeLessThan(300); expect(w.goals.home).toBe(0);
  });

  it('a repetição reproduz o lance gravado (a bola entra na rede no fim) e volta no tempo', () => {
    const { w } = start(goalAnn('goal-offside'), 20); const v = untilVar(w)!;
    v.stage = 'review'; v.rt = 0; const first = replayView(w); const x0 = first.ball.p.x, t0 = first.t;
    v.rt = 99; const last = replayView(w);
    expect(last.t).toBeGreaterThan(t0); expect(last.ball.p.x).toBeGreaterThan(x0);            // a bola vai em direção ao gol do mandante (à direita)
    expect(Math.abs(last.ball.p.x - w.ball.p.x)).toBeLessThan(1.5);                           // e termina onde o lance terminou
    expect(w.t).toBeGreaterThan(last.t - 0.1);                                                 // o jogo real não andou
  });
});
