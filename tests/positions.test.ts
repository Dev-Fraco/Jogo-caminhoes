import { describe, expect, it } from 'vitest';
import { aiWindow } from '../src/engine/ai';
import { clubProfile } from '../src/engine/aiprofile';
import { squadNeeds } from '../src/engine/aineeds';
import { applyPack, validatePack } from '../src/data/playerpack';
import { CLUBS_DATA } from '../src/data/clubs';
import { simulateMatch } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { assignSlots, autoLineup, pickSpot, slotsOfLine, spotFit, spotOf, teamRatings, withSpots } from '../src/engine/squad';
import { FORMATION_SLOTS, FORMATIONS, SPOT_LINE, type FormationId, type GameState, type Player, type Spot } from '../src/engine/types';
import { makeCareer } from './helpers';

const g0 = makeCareer('flamengo', 4);
const club = g0.divisions[1].clubIds[4];
const setPlayers = (g: GameState, id: string, f: (ps: Player[]) => Player[]): GameState => ({ ...g, teams: { ...g.teams, [id]: { ...g.teams[id], players: f(g.teams[id].players) } } });

describe('funções (laterais, meias abertos, pontas, centroavante)', () => {
  it('as formações têm as funções certas e a contagem por linha bate com FORMATIONS', () => {
    for (const f of Object.keys(FORMATIONS) as FormationId[]) {
      const slots = FORMATION_SLOTS[f];
      expect(slots).toHaveLength(11);
      for (const pos of ['DEF', 'MID', 'ATT'] as const) expect(slots.filter((s) => SPOT_LINE[s] === pos).length, `${f} ${pos}`).toBe(FORMATIONS[f][pos]);
    }
    expect(FORMATION_SLOTS['4-4-2']).toEqual(expect.arrayContaining(['LD', 'LE', 'MD', 'ME', 'CA']));
    expect(FORMATION_SLOTS['4-3-3']).toEqual(expect.arrayContaining(['PD', 'PE', 'CA']));
  });
  it('todo elenco gerado tem laterais direito e esquerdo, meias aberto dos dois lados, pontas e centroavantes; a função combina com a linha', () => {
    for (const id of Object.keys(g0.teams).slice(0, 40)) {
      const ps = g0.teams[id].players;
      for (const p of ps) expect(SPOT_LINE[spotOf(p)], p.id).toBe(p.pos);
      const has = (sp: Spot) => ps.filter((p) => spotOf(p) === sp).length;
      for (const sp of ['LD', 'LE', 'ZAG', 'MC', 'MD', 'ME', 'CA', 'PD', 'PE', 'GK'] as Spot[]) expect(has(sp), `${id} ${sp}`).toBeGreaterThan(0);
    }
  });
  it('jogador de save antigo (sem função) recebe sempre a mesma função, coerente com a posição', () => {
    const p = { id: 'velho-1', pos: 'DEF' as const, name: 'X', age: 25, strength: 60 };
    expect(spotOf(p)).toBe(spotOf({ ...p })); expect(SPOT_LINE[spotOf(p)]).toBe('DEF');
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => spotOf({ ...p, id: `v-${i}` })));
    expect(kinds).toEqual(new Set(['ZAG', 'LD', 'LE']));
  });
  it('a escalação automática põe cada um na sua função, em qualquer formação', () => {
    for (const f of Object.keys(FORMATIONS) as FormationId[]) {
      const team = { clubId: 'x', players: g0.teams.palmeiras.players, formation: f, lineup: autoLineup(g0.teams.palmeiras.players, f) };
      expect(team.lineup).toHaveLength(11); expect(new Set(team.lineup).size).toBe(11);
      const placed = assignSlots(team);
      expect(placed).toHaveLength(11);
      expect(placed.filter((x) => x.fit === 1).length, f).toBeGreaterThanOrEqual(8); // quase todos na função exata
      for (const pos of ['DEF', 'MID', 'ATT'] as const) expect(placed.filter((x) => x.player.pos === pos).length).toBe(FORMATIONS[f][pos]);
      expect(slotsOfLine(f, 'DEF').length).toBe(FORMATIONS[f].DEF);
    }
  });
  it('jogar fora da função rende menos: sem lateral direito, o time perde força', () => {
    const base = g0.teams.palmeiras;
    const lineup = autoLineup(base.players, base.formation);
    const full = teamRatings({ ...base, lineup }).def;
    const noLD = base.players.filter((p) => spotOf(p) !== 'LD');
    const lineup2 = autoLineup(noLD, base.formation);
    const without = teamRatings({ ...base, players: noLD, lineup: lineup2 }).def;
    expect(without).toBeLessThan(full);
    expect(spotFit('LD', 'LE')).toBeLessThan(1); expect(spotFit('ZAG', 'LD')).toBeLessThan(1); expect(spotFit('CA', 'CA')).toBe(1);
  });
  it('pickSpot completa o que falta no elenco (ex.: sem lateral esquerdo, a base vem de lateral esquerdo)', () => {
    const ps = g0.teams[club].players.filter((p) => !(p.pos === 'DEF' && spotOf(p) === 'LE'));
    expect(pickSpot(ps, 'DEF')).toBe('LE');
  });
});

describe('saves antigos', () => {
  it('quem não tem função ganha uma balanceada (laterais dos dois lados, meias abertos, pontas e centroavante) e quem tem não muda', () => {
    const old = g0.teams.palmeiras.players.map(({ spot: _s, ...p }) => p as Player);
    const fixed = withSpots(old);
    for (const p of fixed) expect(p.spot).toBeTruthy();
    for (const sp of ['LD', 'LE', 'ZAG', 'MC', 'MD', 'ME', 'CA', 'PD', 'PE'] as Spot[]) expect(fixed.filter((p) => p.spot === sp).length, sp).toBeGreaterThan(0);
    const mixed = [{ ...old[1], spot: 'LE' as const }, ...old.slice(2)];
    expect(withSpots(mixed)[0].spot).toBe('LE');
    expect(withSpots(g0.teams.palmeiras.players)).toBe(g0.teams.palmeiras.players);
  });
});

describe('IA e funções', () => {
  it('8 defensores e nenhum lateral direito: a necessidade é de lateral direito (e o reforço também), não outro goleiro nem zagueiro', () => {
    let g = setPlayers(g0, club, (ps) => ps.map((p) => (p.pos === 'DEF' && spotOf(p) === 'LD' ? { ...p, spot: 'ZAG' as const } : p)));
    expect(g.teams[club].players.filter((p) => p.pos === 'DEF' && spotOf(p) === 'LD')).toHaveLength(0);
    const need = squadNeeds(g, club, clubProfile(g, club)).find((n) => n.spot === 'LD');
    expect(need).toBeTruthy(); expect(need!.reasons).toContain('falta-funcao');
    expect(squadNeeds(g, club, clubProfile(g, club)).some((n) => n.pos === 'GK')).toBe(false);
    g = { ...g, budgets: { ...g.budgets, [club]: 90_000_000 } };
    const before = new Set(g.teams[club].players.map((p) => p.id));
    const s = aiWindow(g, makeRng(4), 1, [club]);
    const bought = s.teams[club].players.filter((p) => !before.has(p.id));
    if (bought.length) expect(spotOf(bought[0])).toBe('LD');
    expect(bought.length).toBeLessThanOrEqual(1);
  });
  it('o pacote pode trazer a função (LD, LE, PD, PE, CA...) e ela vale no jogo', () => {
    const c = Object.values(CLUBS_DATA).flat()[0];
    const orig = c.squad;
    const players = ['GK', 'LD', 'LE', 'ZAG', 'ZAG', 'MC', 'MD', 'ME', 'PD', 'PE', 'CA', 'CA', 'ZAG', 'MC'].map((pos, i) => ({ name: `Teste ${i}`, pos }));
    const r = validatePack(JSON.stringify({ name: 'F', clubs: [{ id: c.id, jogadores: players }] }));
    if (!r.ok) throw new Error(r.error);
    applyPack(r.pack);
    const got = c.squad.filter((p) => p.name.startsWith('Teste'));
    expect(got.find((p) => p.name === 'Teste 1')).toMatchObject({ pos: 'DEF', spot: 'LD' });
    expect(got.find((p) => p.name === 'Teste 9')).toMatchObject({ pos: 'ATT', spot: 'PE' });
    expect(got.find((p) => p.name === 'Teste 10')).toMatchObject({ pos: 'ATT', spot: 'CA' });
    applyPack(null); expect(c.squad).toBe(orig);
  });
});

describe('partida e funções', () => {
  it('gols e assistências saem dos jogadores certos: centroavante marca mais que lateral; cruzamentos de laterais e pontas aparecem na narração', () => {
    const t = g0.teams.palmeiras, a = g0.teams.santos;
    const goals: Record<string, number> = {}; let crosses = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const r = simulateMatch(t, a, makeRng(seed));
      for (const e of r.events) if (e.type === 'goal' && e.side === 'home' && e.player) { const p = t.players.find((x) => x.name === e.player)!; const sp = spotOf(p); goals[sp] = (goals[sp] ?? 0) + 1; if (/cruzamento de/.test(e.text)) crosses++; }
    }
    expect(goals.CA ?? 0).toBeGreaterThan(goals.LD ?? 0);
    expect(crosses).toBeGreaterThan(0);
  });
});
