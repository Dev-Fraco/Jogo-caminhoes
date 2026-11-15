import { makeRng } from './rng';
import type { Fixture } from './types';

/** Pontos corridos, ida e volta (método do círculo). 20 clubes => 38 rodadas. */
export function buildFixtures(clubIds: string[], divisionId = ''): { fixtures: Fixture[]; totalRounds: number } {
  const ids = [...clubIds];
  if (ids.length % 2) ids.push('__bye__');
  const n = ids.length;
  const half = n - 1;
  const first: Fixture[] = [];
  const arr = [...ids];
  for (let r = 0; r < half; r++) {
    for (let i = 0; i < n / 2; i++) {
      let home = arr[i], away = arr[n - 1 - i];
      if (home === '__bye__' || away === '__bye__') continue;
      // alterna mando para equilibrar casa/fora
      if ((r + i) % 2 === 1) [home, away] = [away, home];
      first.push({ divisionId, round: r + 1, homeId: home, awayId: away });
    }
    arr.splice(1, 0, arr.pop()!); // gira todos menos o primeiro
  }
  balanceHomeAway(first, true);
  const second = first.map((f) => ({ divisionId, round: f.round + half, homeId: f.awayId, awayId: f.homeId }));
  return { fixtures: [...first, ...second], totalRounds: half * 2 };
}

/** Custo de uma sequência de mandos (true = em casa): 3 iguais seguidos pesam muito; alternar é o ideal; casa e fora devem ficar equilibrados. */
function seqCost(flags: boolean[], mirror: boolean): number {
  const s = mirror ? [...flags, ...flags.map((x) => !x)] : flags;
  let c = 0, h = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i]) h++;
    if (i > 0 && s[i] === s[i - 1]) c += 1;
    if (i > 1 && s[i] === s[i - 1] && s[i] === s[i - 2]) c += 1000;
  }
  const imb = Math.abs(h - (s.length - h));
  return c + (imb > 1 ? 50 * (imb - 1) : 0);
}

/**
 * Reequilibra o mando de campo do primeiro turno (troca casa/fora de alguns jogos) para que ninguém jogue mais de 2 jogos
 * seguidos em casa ou fora, alternando sempre que der. Com `mirror`, o returno é o espelho do primeiro turno (também é considerado).
 * Determinístico: o mesmo calendário sempre dá o mesmo resultado.
 */
export function balanceHomeAway(first: Fixture[], mirror: boolean): void {
  const byTeam = new Map<string, number[]>();
  first.forEach((f, i) => { for (const id of [f.homeId, f.awayId]) { const l = byTeam.get(id); if (l) l.push(i); else byTeam.set(id, [i]); } });
  for (const l of byTeam.values()) l.sort((a, b) => first[a].round - first[b].round);
  const cost = (id: string) => seqCost(byTeam.get(id)!.map((i) => first[i].homeId === id), mirror);
  const total = () => { let c = 0; for (const id of byTeam.keys()) c += cost(id); return c; };
  const flip = (f: Fixture) => { const h = f.homeId; f.homeId = f.awayId; f.awayId = h; };
  const climb = () => {
    for (let pass = 0; pass < 40; pass++) {
      let changed = false;
      for (const f of first) {
        const before = cost(f.homeId) + cost(f.awayId);
        flip(f);
        if (cost(f.homeId) + cost(f.awayId) < before) changed = true; else flip(f);
      }
      if (!changed) break;
    }
  };
  climb();
  let best = total();
  if (best < 1000) return;
  let bestHome = first.map((f) => f.homeId);
  for (let k = 1; k <= 40 && best >= 1000; k++) { // ainda há 3 seguidos: recomeça com alguns jogos trocados ao acaso
    const rng = makeRng(7919 * k + first.length);
    for (const f of first) if (rng() < 0.15) flip(f);
    climb();
    const t = total();
    if (t < best) { best = t; bestHome = first.map((f) => f.homeId); }
  }
  first.forEach((f, i) => { if (f.homeId !== bestHome[i]) flip(f); });
}
