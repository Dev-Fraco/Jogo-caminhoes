import { describe, expect, it } from 'vitest';
import { isSeasonOver, playNext, startNextSeason } from '../src/engine/game';
import { ensureWorld, simulateWorldMatch, worldDivisions, worldRound, worldTable, worldTick, worldTotalRounds } from '../src/engine/wleagues';
import { migrateGame } from '../src/engine/migrate';
import { makeCareer } from './helpers';

const playSeason = (g0: ReturnType<typeof makeCareer>) => { let g = g0, guard = 0; while (!isSeasonOver(g) && guard++ < 400) g = playNext(g).state; return g; };

describe('ligas do mundo', () => {
  it('todas as divisões do jogo fora da sua pirâmide são simuladas (América e Europa), e as do Brasil ficam com o jogo principal', () => {
    const g = makeCareer('palmeiras', 3); const divs = worldDivisions(g);
    expect(divs.length).toBe(23);
    const countries = new Set(divs.map((d) => d.countryId)); for (const c of ['AR', 'EN', 'ES', 'IT', 'DE', 'FR', 'PT', 'CL', 'CO', 'UY', 'EC', 'PY', 'PE', 'BO', 'VE']) expect(countries.has(c), c).toBe(true);
    expect(countries.has('BR')).toBe(false);
    expect(divs.map((d) => d.id)).toEqual(expect.arrayContaining(['premier', 'championship', 'league-one', 'es-primera', 'bundesliga', 'ar-nacional', 've-primera']));
  });

  it('a cada rodada as ligas jogam a parte delas e todas terminam junto com a sua temporada, com tabelas e placares coerentes', () => {
    let g = ensureWorld(makeCareer('palmeiras', 3));
    for (let i = 0; i < 5; i++) g = playNext(g).state;
    const w = g.world!; const early = w.played.premier; expect(early).toBeGreaterThan(0); expect(early).toBeLessThan(worldTotalRounds(g, 'premier'));
    g = playSeason(g);
    for (const d of worldDivisions(g)) {
      expect(g.world!.played[d.id], d.id).toBe(worldTotalRounds(g, d.id));
      const t = worldTable(g, d.id); const n = t.length; expect(n).toBeGreaterThan(10);
      for (const r of t) { expect(r.played, d.id).toBe(2 * (n - 1)); expect(r.won + r.drawn + r.lost).toBe(r.played); expect(r.points).toBe(3 * r.won + r.drawn); }
      expect(t.reduce((a, r) => a + r.gf, 0)).toBe(t.reduce((a, r) => a + r.ga, 0));
      expect(worldRound(g, d.id, 1).length).toBe(Math.floor(n / 2));
    }
  });

  it('o modelo de jogo: ~2,7 gols por jogo, mandante ganha mais, o mais forte ganha mais e é determinístico', () => {
    let goals = 0, hw = 0, aw = 0, strongW = 0, weakW = 0; const N = 4000;
    for (let i = 0; i < N; i++) { const [h, a] = simulateWorldMatch(60, 60, `t${i}`); goals += h + a; if (h > a) hw++; else if (a > h) aw++; const [s1, s2] = simulateWorldMatch(72, 58, `u${i}`); if (s1 > s2) strongW++; else if (s2 > s1) weakW++; }
    expect(goals / N).toBeGreaterThan(2.4); expect(goals / N).toBeLessThan(3.1); expect(hw).toBeGreaterThan(aw); expect(strongW).toBeGreaterThan(weakW * 2);
    expect(simulateWorldMatch(60, 55, 'x')).toEqual(simulateWorldMatch(60, 55, 'x'));
  });

  it('os mais fortes tendem a terminar no alto da tabela (campeão da Premier tem força acima da média)', () => {
    let g = playSeason(ensureWorld(makeCareer('palmeiras', 3)));
    const str = g.world!.str; const t = worldTable(g, 'premier'); const mean = t.reduce((a, r) => a + str[r.clubId], 0) / t.length;
    expect(str[t[0].clubId]).toBeGreaterThan(mean); expect(str[t[t.length - 1].clubId]).toBeLessThan(str[t[0].clubId]);
    void g;
  });

  it('virada de temporada: campeões registrados, acessos e rebaixamentos entre as divisões do mesmo país e tudo recomeça', () => {
    const g0 = playSeason(ensureWorld(makeCareer('palmeiras', 5)));
    const champ = worldTable(g0, 'premier')[0].clubId, down = worldTable(g0, 'premier').slice(-3).map((r) => r.clubId), up = worldTable(g0, 'championship').slice(0, 3).map((r) => r.clubId);
    const g1 = startNextSeason(g0); const w = g1.world!;
    expect(w.season).toBe(g1.season); expect(w.champs.some((c) => c.div === 'premier' && c.club === champ)).toBe(true);
    for (const id of up) expect(w.members.premier).toContain(id); for (const id of down) expect(w.members.championship).toContain(id);
    expect(w.members.premier).toHaveLength(20); expect(w.members.championship).toHaveLength(24);
    expect(Object.values(w.played).every((n) => n === 0)).toBe(true); expect(Object.keys(w.str).length).toBeGreaterThan(300);
  });

  it('save antigo (sem as ligas do mundo): a migração cria e coloca em dia, sem mexer em nada que existia', () => {
    const g = makeCareer('palmeiras', 7); let s = g; for (let i = 0; i < 6; i++) s = playNext(s).state;
    const old = { ...s, world: undefined, schema: 12 }; const { game, report } = migrateGame(old as never);
    expect(report.rejected, report.violations.join(';')).toBe(false); expect(game.world).toBeTruthy(); expect(game.world!.played.premier).toBeGreaterThan(0);
    expect(migrateGame(game).game).toBe(game);
  });

  it('o tamanho do save continua razoável com 23 ligas simuladas (resultados compactos)', () => {
    const g = playSeason(ensureWorld(makeCareer('palmeiras', 3))); const bytes = JSON.stringify(g.world).length;
    expect(bytes).toBeLessThan(450_000);
    void worldTick;
  });
});
