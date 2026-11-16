import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CLUBS_DATA } from '../src/data/clubs';
import { isSeasonOver, playRound, seasonIncome, startNextSeason } from '../src/engine/game';
import { isValidSave, loadGame, migrateSave } from '../src/engine/save';
import { BUY_BLOCK_TEXT, buyPlayer, checkBuy, divisionIndexOf, marketEntries, MAX_SQUAD, MIN_BY_POS, MIN_SQUAD, playerValue } from '../src/engine/transfers';
import type { GameState, Player } from '../src/engine/types';
import { makeCareer } from './helpers';

const p = (strength: number, age: number): Player => ({ id: 'x', name: 'X', pos: 'MID', age, strength });
/** Joga a temporada inteira mantendo a diretoria satisfeita (sem demissão), para testar o resto. */
const playSeason = (g: GameState) => { while (!isSeasonOver(g)) { g = playRound(g).state; g = { ...g, morale: { ...g.morale, board: 60 } }; } return g; };

describe('valor de mercado', () => {
  it('sobe com o overall e cai com a idade', () => {
    expect(playerValue(p(70, 26))).toBeGreaterThan(playerValue(p(60, 26)));
    expect(playerValue(p(80, 26))).toBeGreaterThan(playerValue(p(70, 26)));
    expect(playerValue(p(75, 20))).toBeGreaterThan(playerValue(p(75, 26)));
    expect(playerValue(p(75, 26))).toBeGreaterThan(playerValue(p(75, 33)));
  });
  it('valores baixos (Série A, 25–28 anos): 60 ≈ R$ 0,6 mi, 70 ≈ 2,6 mi, 80 ≈ 11 mi, 90 ≈ 47 mi', () => {
    expect(playerValue(p(60, 26))).toBeGreaterThan(550_000); expect(playerValue(p(60, 26))).toBeLessThan(700_000);
    expect(playerValue(p(70, 26))).toBeGreaterThan(2_000_000); expect(playerValue(p(70, 26))).toBeLessThan(3_000_000);
    expect(playerValue(p(80, 26))).toBeGreaterThan(9_000_000); expect(playerValue(p(80, 26))).toBeLessThan(13_000_000);
    expect(playerValue(p(90, 26))).toBeGreaterThan(40_000_000); expect(playerValue(p(90, 26))).toBeLessThan(55_000_000);
    expect(playerValue(p(25, 38), 3)).toBe(10_000); // piso
  });
  it('o mesmo jogador vale mais na Série A do que nas divisões de baixo', () => {
    const v = [0, 1, 2, 3].map((d) => playerValue(p(70, 26), d));
    expect(v[0]).toBeGreaterThan(v[1]); expect(v[1]).toBeGreaterThan(v[2]); expect(v[2]).toBeGreaterThan(v[3]);
    expect(v[3]).toBeLessThan(v[0] / 5);
  });
  it('elencos da Série D valem pouco; da Série A, muito mais', () => {
    const g = makeCareer('flamengo');
    const avg = (clubId: string) => { const di = divisionIndexOf(g, clubId); const ps = g.teams[clubId].players; return ps.reduce((s, x) => s + playerValue(x, di), 0) / ps.length; };
    expect(avg('abc')).toBeLessThan(200_000); // Série D
    expect(avg('flamengo')).toBeGreaterThan(avg('abc') * 30);
    expect(avg('palmeiras')).toBeGreaterThan(avg('sport')); // A > B
    expect(avg('sport')).toBeGreaterThan(avg('guarani')); // B > C
    expect(avg('guarani')).toBeGreaterThan(avg('abc')); // C > D
  });
});

describe('mercado', () => {
  it('lista os jogadores dos outros 155 clubes, nunca os do próprio', () => {
    const g = makeCareer('palmeiras');
    const m = marketEntries(g);
    expect(m).toHaveLength(155 * 24);
    expect(m.some((e) => e.clubId === 'palmeiras')).toBe(false);
    expect(m.every((e) => e.price === playerValue(e.player, divisionIndexOf(g, e.clubId)))).toBe(true);
  });
});

describe('contratação', () => {
  // clube rico contratando um jogador barato de um clube que tem elenco de sobra
  const pick = (g: GameState, clubId: string) => g.teams[clubId].players.filter((x) => x.pos === 'MID').sort((a, b) => a.strength - b.strength)[0];

  it('compra: dinheiro vai ao vendedor, jogador muda de elenco e entra como reserva; histórico registrado', () => {
    const g = makeCareer('flamengo');
    const target = pick(g, 'palmeiras');
    const total = Object.values(g.budgets).reduce((s, v) => s + v, 0);
    const r = buyPlayer(g, target.id);
    expect(r.check.ok).toBe(true);
    const s = r.state, price = playerValue(target, 0);
    expect(s.teams.flamengo.players.some((x) => x.id === target.id)).toBe(true);
    expect(s.teams.palmeiras.players.some((x) => x.id === target.id)).toBe(false);
    expect(s.teams.flamengo.players).toHaveLength(25); expect(s.teams.palmeiras.players).toHaveLength(23);
    expect(s.teams.flamengo.lineup).toEqual(g.teams.flamengo.lineup); // chega como reserva
    expect(s.budgets.flamengo).toBe(g.budgets.flamengo - price);
    expect(s.budgets.palmeiras).toBe(g.budgets.palmeiras + price);
    expect(Object.values(s.budgets).reduce((a, v) => a + v, 0)).toBe(total); // dinheiro conservado
    expect(s.transfers).toEqual([{ kind: 'buy', season: 2026, round: 1, playerId: target.id, playerName: target.name, pos: 'MID', strength: target.strength, fromClubId: 'palmeiras', toClubId: 'flamengo', fee: price }]);
    expect(g.teams.palmeiras.players).toHaveLength(24); // estado antigo intocado (imutável)
  });

  it('o vendedor mantém 11 titulares válidos (escalação refeita se vendeu um titular)', () => {
    const g = makeCareer('flamengo');
    const star = g.teams.palmeiras.players.filter((x) => x.pos === 'ATT').sort((a, b) => b.strength - a.strength)[0];
    const s = buyPlayer(g, star.id).state;
    expect(s.teams.palmeiras.lineup).toHaveLength(11);
    expect(s.teams.palmeiras.lineup).not.toContain(star.id);
  });

  it('bloqueios: orçamento, elenco cheio, vendedor sem reposição, próprio jogador, inexistente', () => {
    const g = makeCareer('abc'); // Série D, orçamento pequeno
    const star = g.teams.flamengo.players.sort((a, b) => b.strength - a.strength)[0];
    expect(checkBuy(g, star.id)).toMatchObject({ ok: false, reason: 'budget' });
    expect(buyPlayer(g, star.id).state).toBe(g);
    expect(checkBuy(g, g.teams.abc.players[0].id)).toMatchObject({ ok: false, reason: 'own-player' });
    expect(checkBuy(g, 'nao-existe')).toMatchObject({ ok: false, reason: 'not-found' });

    const rich = { ...makeCareer('flamengo'), };
    const full = { ...rich, teams: { ...rich.teams, flamengo: { ...rich.teams.flamengo, players: [...rich.teams.flamengo.players, ...rich.teams.santos.players.slice(0, MAX_SQUAD - 24)] } } };
    expect(full.teams.flamengo.players).toHaveLength(MAX_SQUAD);
    expect(checkBuy(full, rich.teams.palmeiras.players[5].id)).toMatchObject({ ok: false, reason: 'squad-full' });

    // vendedor no mínimo de goleiros
    const gk = rich.teams.palmeiras.players.filter((x) => x.pos === 'GK');
    const thin = { ...rich, teams: { ...rich.teams, palmeiras: { ...rich.teams.palmeiras, players: rich.teams.palmeiras.players.filter((x) => x.pos !== 'GK' || x.id === gk[0].id || x.id === gk[1].id) } } };
    expect(checkBuy(thin, gk[0].id)).toMatchObject({ ok: false, reason: 'seller-short' });
    expect(Object.keys(BUY_BLOCK_TEXT)).toEqual(['window', 'ban', 'not-found', 'own-player', 'budget', 'squad-full', 'seller-short']);
  });

  it('um clube vendedor nunca fica abaixo do mínimo de elenco/posições', () => {
    let g = makeCareer('flamengo');
    const ids = g.teams.santos.players.map((x) => x.id);
    for (const id of ids) {
      if (g.teams.flamengo.players.length >= MAX_SQUAD) break;
      g = { ...g, budgets: { ...g.budgets, flamengo: 1e12 } };
      g = buyPlayer(g, id).state;
    }
    const left = g.teams.santos.players;
    expect(left.length).toBeGreaterThanOrEqual(MIN_SQUAD);
    for (const pos of Object.keys(MIN_BY_POS) as (keyof typeof MIN_BY_POS)[]) expect(left.filter((x) => x.pos === pos).length).toBeGreaterThanOrEqual(MIN_BY_POS[pos]);
  });

  it('a temporada segue funcionando com o elenco novo', () => {
    let g = makeCareer('flamengo', 5);
    g = buyPlayer(g, pick(g, 'palmeiras').id).state;
    g = playSeason(g);
    expect(g.results).toHaveLength(3 * 380 + 16 * 30 + 31);
    expect(startNextSeason(g).teams.flamengo.players.length).toBeLessThanOrEqual(25); // veteranos podem se aposentar
  });
});

describe('receita de fim de temporada', () => {
  it('maior em divisões altas, com reputação e com a posição final', () => {
    expect(seasonIncome(0, 4, 10, 20)).toBeGreaterThan(seasonIncome(1, 4, 10, 20));
    expect(seasonIncome(1, 4, 10, 20)).toBeGreaterThan(seasonIncome(3, 4, 10, 20));
    expect(seasonIncome(0, 5, 10, 20)).toBeGreaterThan(seasonIncome(0, 2, 10, 20));
    expect(seasonIncome(0, 4, 1, 20)).toBeGreaterThan(seasonIncome(0, 4, 20, 20));
  });
  it('o seu clube recebe a receita ao virar a temporada (a IA não mexe no seu caixa) e o total do jogo cresce', () => {
    const end = playSeason(makeCareer('flamengo', 3));
    const next = startNextSeason(end);
    expect(next.budgets.flamengo).toBeGreaterThan(end.budgets.flamengo);
    const sum = (b: Record<string, number>) => Object.values(b).reduce((a, v) => a + v, 0);
    expect(sum(next.budgets)).toBeGreaterThan(sum(end.budgets));
  });
});

describe('saves', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  });
  it('save da versão 2 é migrado (orçamentos iniciais dos clubes, sem histórico)', () => {
    const g3 = makeCareer('palmeiras');
    const { budgets: _b, transfers: _t, ...rest } = g3;
    const v2 = { ...rest, version: 2 } as unknown as GameState;
    expect(isValidSave(v2)).toBe(true);
    localStorage.setItem('caminhoes-save-v1', JSON.stringify(v2));
    const loaded = loadGame()!;
    expect(loaded.version).toBe(5);
    expect(loaded.transfers).toEqual([]);
    expect(loaded.budgets.palmeiras).toBe(CLUBS_DATA['serie-a'].find((c) => c.id === 'palmeiras')!.budget);
    expect(Object.keys(loaded.budgets)).toHaveLength(156);
    expect(migrateSave(g3)).toBe(g3);
  });
  it('save v1 ou lixo continua sendo ignorado', () => {
    localStorage.setItem('caminhoes-save-v1', JSON.stringify({ version: 1, userClubId: 'fla', clubs: [], round: 1 }));
    expect(loadGame()).toBeNull();
  });
});
